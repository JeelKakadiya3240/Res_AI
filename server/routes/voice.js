const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { handleCustomerQuery, extractOrderFromConversation, detectIntent } = require('../services/aiAgent');
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

// Helper function to save/update conversation in database
async function saveConversationToDB(callSid, data) {
  try {
    // Check if conversation exists
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('call_sid', callSid)
      .single();

    if (existing) {
      // Update existing conversation
      const { error } = await supabase
        .from('conversations')
        .update(data)
        .eq('call_sid', callSid);
      if (error) console.error('Error updating conversation:', error);
    } else {
      // Create new conversation
      const { error } = await supabase
        .from('conversations')
        .insert({
          call_sid: callSid,
          ...data
        });
      if (error) console.error('Error creating conversation:', error);
    }
  } catch (error) {
    console.error('Error saving conversation to DB:', error);
  }
}

// Helper function to save message to database
async function saveMessageToDB(conversationId, role, content) {
  try {
    const { error } = await supabase
      .from('conversation_messages')
      .insert({
        conversation_id: conversationId,
        role: role,
        content: content
      });
    if (error) console.error('Error saving message:', error);
  } catch (error) {
    console.error('Error saving message to DB:', error);
  }
}

// Helper function to format text for natural human-like speech with SSML
function formatNaturalSpeech(text) {
  // Add natural pauses after punctuation for more human-like rhythm
  let formatted = text
    .replace(/\. /g, '. <break time="300ms"/>')
    .replace(/\? /g, '? <break time="400ms"/>')
    .replace(/! /g, '! <break time="300ms"/>')
    .replace(/, /g, ', <break time="200ms"/>');
  
  // Wrap in SSML with prosody for natural speech (rate and pitch adjustments)
  return `<speak>
    <prosody rate="medium" pitch="medium">
      ${formatted}
    </prosody>
  </speak>`;
}

// Helper function to say text with human-like voice
function sayNatural(twiml, text, options = {}) {
  // Use Amazon Polly neural voice - sounds very natural and human-like
  // Options: polly.Joanna (female), polly.Matthew (male), polly.Amy, polly.Brian
  const voice = options.voice || 'polly.Joanna';
  const language = options.language || 'en-US';
  
  // Use SSML for more natural speech with pauses and prosody
  twiml.say({
    voice: voice,
    language: language
  }, formatNaturalSpeech(text));
}

// Handle incoming call
router.post('/incoming-call', async (req, res) => {
  if (!twilio) {
    return res.status(503).json({ error: 'Twilio is not configured. Please set up Twilio credentials in your .env file.' });
  }
  
  const callSid = req.body.CallSid;
  const fromNumber = req.body.From;
  
  // Initialize conversation in memory
  if (!conversations.has(callSid)) {
    conversations.set(callSid, []);
  }
  
  // Save conversation start to database
  await saveConversationToDB(callSid, {
    customer_phone: fromNumber,
    call_status: 'ringing',
    conversation_data: { messages: [] }
  });
  
  const twiml = new twilio.twiml.VoiceResponse();
  
  // Use natural human-like voice
  sayNatural(twiml, 'Welcome to our restaurant. How can I help you today?');
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
    sayNatural(twiml, 'I didn\'t catch that. Could you please repeat?');
    twiml.redirect('/api/voice/incoming-call');
    res.type('text/xml');
    return res.send(twiml.toString());
  }

  // Get or create conversation history
  if (!conversations.has(callSid)) {
    conversations.set(callSid, []);
    // Initialize conversation in DB if not exists
    await saveConversationToDB(callSid, {
      customer_phone: req.body.From,
      call_status: 'in-progress',
      conversation_data: { messages: [] }
    });
  }
  const conversationHistory = conversations.get(callSid);

  // Add user message to history
  conversationHistory.push({ role: 'user', content: speechResult });
  
  // Get conversation ID and save message to DB
  const { data: conv } = await supabase
    .from('conversations')
    .select('id')
    .eq('call_sid', callSid)
    .single();
  
  if (conv) {
    await saveMessageToDB(conv.id, 'user', speechResult);
  }

  try {
    // Detect user intent FIRST (before generating AI response)
    console.log('🔍 Detecting user intent for:', speechResult);
    const userIntent = await detectIntent(speechResult, conversationHistory);
    console.log('🎯 Detected intent:', userIntent);
    
    // Add user message with intent to history
    const userMessageWithIntent = {
      role: 'user',
      content: speechResult,
      intent: userIntent
    };
    conversationHistory[conversationHistory.length - 1] = userMessageWithIntent;
    
    // If intent is to confirm/place order, process order creation
    if (userIntent === 'confirm_order') {
      console.log('🔔 Order confirmation intent detected - processing order creation');
      console.log('📝 Full conversation history:', JSON.stringify(conversationHistory, null, 2));
      
      // Extract order details from ENTIRE conversation
      console.log('📦 Extracting order from conversation...');
      const orderData = await extractOrderFromConversation(conversationHistory);
      console.log('📦 Extracted order data:', JSON.stringify(orderData, null, 2));
      
      if (orderData && orderData.items && orderData.items.length > 0) {
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
          console.error('❌ No valid items found after extraction');
          console.error('Extracted order data:', JSON.stringify(orderData, null, 2));
          
          // Add AI response asking for clarification (don't overwrite user message)
          const clarificationMessage = 'I couldn\'t find those items in our menu. Could you please tell me the exact name of what you\'d like to order?';
          const clarificationWithIntent = {
            role: 'assistant',
            content: clarificationMessage,
            intent: 'order_extraction_failed'
          };
          conversationHistory.push(clarificationWithIntent);
          
          if (conv) {
            await saveMessageToDB(conv.id, 'assistant', clarificationMessage);
          }
          
          // Update conversation data in DB
          await saveConversationToDB(callSid, {
            conversation_data: { messages: conversationHistory }
          });
          
          sayNatural(twiml, clarificationMessage);
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
        console.log('💾 Creating order in database...', {
          order_id: orderId,
          items: orderItems.length,
          total: totalAmount
        });
        
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
          console.error('❌ Order creation error:', orderError);
          console.error('Order data attempted:', {
            order_id: orderId,
            items: orderItems,
            total: totalAmount
          });
          sayNatural(twiml, 'I apologize, but there was an error processing your order. Please try again or call back.');
        } else {
          console.log('✅ Order created successfully:', order.order_id);
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
            console.error('❌ Order items creation error:', itemsError);
          } else {
            console.log('✅ Order items created successfully');
          }

          // Read order ID character by character for better voice clarity
          const orderIdSpoken = order.order_id.split('').join(' ');
          const confirmationMessage = `Great! Your order has been confirmed. Your order ID is ${orderIdSpoken}. The total amount is ${totalAmount.toFixed(2)} dollars. Thank you for your order!`;
          
          // Create confirmation message with intent and order info
          const confirmationMessageWithIntent = {
            role: 'assistant',
            content: confirmationMessage,
            intent: 'order_placed',
            order_id: order.order_id,
            order_created: true,
            total_amount: totalAmount.toFixed(2)
          };
          
          // Add confirmation message to conversation history
          conversationHistory.push(confirmationMessageWithIntent);
          
          // Use natural voice for confirmation
          sayNatural(twiml, confirmationMessage);
          
          // Update conversation with order info
          await saveConversationToDB(callSid, {
            order_id: order.order_id,
            order_placed: true,
            customer_name: orderData.customer_name || null
          });
          
          // Save order confirmation message
          if (conv) {
            await saveMessageToDB(conv.id, 'assistant', confirmationMessage);
          }
          
          // Update conversation data with final confirmation
          await saveConversationToDB(callSid, {
            conversation_data: { messages: conversationHistory }
          });
          
          conversations.delete(callSid);
        }
      } else {
        console.error('❌ Order extraction failed - no items found');
        const errorMessage = 'I couldn\'t extract your order details. Could you please tell me what you would like to order?';
        conversationHistory.push({ role: 'assistant', content: errorMessage });
        
        if (conv) {
          await saveMessageToDB(conv.id, 'assistant', errorMessage);
        }
        
        sayNatural(twiml, errorMessage);
        twiml.gather({
          input: 'speech',
          action: '/api/voice/handle-speech',
          method: 'POST',
          speechTimeout: 'auto'
        });
        res.type('text/xml');
        return res.send(twiml.toString());
      }
    } else {
      // Continue normal conversation (NOT an order confirmation)
      const aiResponse = await handleCustomerQuery(speechResult, conversationHistory);
      
      // Create response object with intent
      const aiResponseWithIntent = {
        role: 'assistant',
        content: aiResponse,
        intent: userIntent
      };
      
      // Add AI response to history
      conversationHistory.push(aiResponseWithIntent);
      
      // Save AI response to DB
      if (conv) {
        await saveMessageToDB(conv.id, 'assistant', aiResponse);
      }
      
      // Update conversation data in DB
      await saveConversationToDB(callSid, {
        conversation_data: { messages: conversationHistory }
      });
      
      // Continue conversation with natural voice
      sayNatural(twiml, aiResponse);
      twiml.gather({
        input: 'speech',
        action: '/api/voice/handle-speech',
        method: 'POST',
        speechTimeout: 'auto'
      });
    }
  } catch (error) {
    console.error('Voice handler error:', error);
    sayNatural(twiml, 'I apologize, but I encountered an error. Please try again.');
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
router.post('/status-callback', async (req, res) => {
  const callSid = req.body.CallSid;
  const callStatus = req.body.CallStatus;
  const callDuration = req.body.CallDuration;
  
  console.log('Call status:', callStatus, 'Call SID:', callSid);
  
  // Update conversation status in database
  if (callSid) {
    const updateData = {
      call_status: callStatus
    };
    
    if (callStatus === 'completed' || callStatus === 'failed' || callStatus === 'busy' || callStatus === 'no-answer') {
      updateData.ended_at = new Date().toISOString();
      if (callDuration) {
        updateData.call_duration = parseInt(callDuration);
      }
    }
    
    await saveConversationToDB(callSid, updateData);
  }
  
  res.status(200).send('OK');
});

module.exports = router;
