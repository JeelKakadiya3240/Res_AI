const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { handleCustomerQuery, extractOrderFromConversation } = require('../services/aiAgent');
require('dotenv').config();

// Optional Twilio setup - only initialize if credentials are provided
let twilio = null;
let twilioClient = null;
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

// Only initialize Twilio if credentials are provided
if (accountSid && authToken && accountSid.startsWith('AC') && !accountSid.includes('your_twilio')) {
  try {
    twilio = require('twilio');
    twilioClient = twilio(accountSid, authToken);
    console.log('✅ Twilio initialized successfully');
  } catch (error) {
    console.warn('⚠️  Twilio initialization failed:', error.message);
  }
} else {
  console.log('ℹ️  Twilio not configured - voice call features will be disabled');
}

// Store conversation history (in production, use Redis or database)
const conversations = new Map();

// Handle incoming call
router.post('/incoming-call', (req, res) => {
  if (!twilio) {
    return res.status(503).json({ error: 'Twilio is not configured. Please set up Twilio credentials in your .env file.' });
  }
  
  const twiml = new twilio.twiml.VoiceResponse();
  
  twiml.say('Welcome to our restaurant AI assistant. How can I help you today?');
  twiml.gather({
    input: 'speech',
    action: '/api/voice/handle-speech',
    method: 'POST',
    speechTimeout: 'auto',
    language: 'en-US'
  });

  res.type('text/xml');
  res.send(twiml.toString());
});

// Handle speech input
router.post('/handle-speech', async (req, res) => {
  if (!twilio) {
    return res.status(503).json({ error: 'Twilio is not configured. Please set up Twilio credentials in your .env file.' });
  }
  
  const twiml = new twilio.twiml.VoiceResponse();
  const speechResult = req.body.SpeechResult;
  const callSid = req.body.CallSid;

  if (!speechResult) {
    twiml.say('I didn\'t catch that. Could you please repeat?');
    twiml.redirect('/api/voice/incoming-call');
    res.type('text/xml');
    return res.send(twiml.toString());
  }

  // Get or create conversation history
  if (!conversations.has(callSid)) {
    conversations.set(callSid, []);
  }
  const conversationHistory = conversations.get(callSid);

  // Add user message to history
  conversationHistory.push({ role: 'user', content: speechResult });

  try {
    // Get AI response
    const aiResponse = await handleCustomerQuery(speechResult, conversationHistory);
    
    // Add AI response to history
    conversationHistory.push({ role: 'assistant', content: aiResponse });

    // Check if user wants to place an order
    const lowerResponse = speechResult.toLowerCase();
    if (lowerResponse.includes('place order') || lowerResponse.includes('confirm order') || 
        lowerResponse.includes('order') && (lowerResponse.includes('yes') || lowerResponse.includes('confirm'))) {
      
      // Extract order details
      const orderData = await extractOrderFromConversation(conversationHistory);
      
      if (orderData && orderData.items.length > 0) {
        // Calculate total amount and prepare order items
        let totalAmount = 0;
        const orderItems = [];

        for (const item of orderData.items) {
          const { data: menuItem, error: menuError } = await supabase
            .from('menu_items')
            .select('price, name')
            .eq('id', item.menu_item_id)
            .single();

          if (menuError || !menuItem) {
            continue; // Skip invalid items
          }

          const itemTotal = parseFloat(menuItem.price) * item.quantity;
          totalAmount += itemTotal;

          orderItems.push({
            menu_item_id: item.menu_item_id,
            quantity: item.quantity,
            price: menuItem.price,
            special_instructions: item.special_instructions || null
          });
        }

        if (orderItems.length === 0) {
          twiml.say('I couldn\'t find the items you mentioned. Could you please try again?');
          twiml.gather({
            input: 'speech',
            action: '/api/voice/handle-speech',
            method: 'POST',
            speechTimeout: 'auto'
          });
          res.type('text/xml');
          return res.send(twiml.toString());
        }

        // Generate unique order ID
        const orderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

        // Create order
        const { data: order, error: orderError } = await supabase
          .from('orders')
          .insert({
            order_id: orderId,
            customer_name: orderData.customer_name || 'Guest',
            customer_phone: req.body.From || null,
            items: orderItems,
            total_amount: totalAmount.toFixed(2),
            status: 'pending'
          })
          .select()
          .single();

        if (orderError || !order) {
          console.error('Order creation error:', orderError);
          twiml.say('I apologize, but there was an error processing your order. Please try again.');
        } else {
          // Create order items
          const orderItemsData = orderItems.map(oi => ({
            order_id: order.id,
            menu_item_id: oi.menu_item_id,
            quantity: oi.quantity,
            price: oi.price,
            special_instructions: oi.special_instructions
          }));

          const { error: itemsError } = await supabase
            .from('order_items')
            .insert(orderItemsData);

          if (itemsError) {
            console.error('Order items creation error:', itemsError);
          }

          // Read order ID character by character for better voice clarity
          const orderIdSpoken = order.order_id.split('').join(' ');
          twiml.say(`Great! Your order has been confirmed. Your order ID is ${orderIdSpoken}. The total amount is ${totalAmount.toFixed(2)} dollars. Thank you for your order!`);
          conversations.delete(callSid);
        }
      } else {
        twiml.say('I couldn\'t extract your order details. Could you please tell me what you would like to order?');
        twiml.gather({
          input: 'speech',
          action: '/api/voice/handle-speech',
          method: 'POST',
          speechTimeout: 'auto'
        });
      }
    } else {
      // Continue conversation
      twiml.say(aiResponse);
      twiml.gather({
        input: 'speech',
        action: '/api/voice/handle-speech',
        method: 'POST',
        speechTimeout: 'auto'
      });
    }
  } catch (error) {
    console.error('Voice handler error:', error);
    twiml.say('I apologize, but I encountered an error. Please try again.');
    twiml.gather({
      input: 'speech',
      action: '/api/voice/handle-speech',
      method: 'POST',
      speechTimeout: 'auto'
    });
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// Webhook status callback
router.post('/status-callback', (req, res) => {
  console.log('Call status:', req.body.CallStatus);
  res.status(200).send('OK');
});

module.exports = router;
