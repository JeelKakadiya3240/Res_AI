const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { handleCustomerQuery, extractOrderFromConversation, detectIntent } = require('../services/aiAgent');
const { lookupMenuItem, validateMenuItemById } = require('../services/menuLookup');
const { extractCustomerInfo } = require('../services/customerInfoExtractor');
const { 
  getCart, 
  addItemToCart, 
  getCartSummary, 
  updateCartStatus, 
  clearCart, 
  getCartItemsForOrder, 
  validateCartItems,
  setCustomerInfo,
  getCustomerInfo,
  isCustomerInfoComplete,
  CartStatus 
} = require('../services/cartState');
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
    .replace(/\.\.\./g, '<break time="400ms"/>') // Natural pause for ellipsis
    .replace(/\. /g, '. <break time="300ms"/>') // Natural pause after sentences
    .replace(/\? /g, '? <break time="350ms"/>') // Pause after questions
    .replace(/! /g, '! <break time="300ms"/>') // Pause after exclamations
    .replace(/, /g, ', <break time="200ms"/>'); // Brief pause after commas
  
  // Wrap in SSML with prosody for natural speech (warmer, mature tone)
  return `<speak>
    <prosody rate="medium" pitch="low" volume="medium">
      ${formatted}
    </prosody>
  </speak>`;
}

// Helper function to say text with human-like voice
function sayNatural(twiml, text, options = {}) {
  // Use Twilio's built-in female voice (always available) or Amazon Polly
  // Built-in Twilio voices (always available):
  // - alice (female, US English) - DEFAULT - always works
  // - man (male, US English)
  // - woman (female, US English)
  // Amazon Polly voices (premium, may not be available in all regions):
  // - polly.Joanna (US English, female, neural)
  // - polly.Kendra (US English, female, neural)
  // - polly.Salli (US English, female, standard)
  const voice = options.voice || 'alice'; // Built-in female voice (always available)
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
    language: 'en-US',
    bargeIn: true, // Allow interruption while AI is speaking
    bargeInOnSpeech: true // Detect speech and interrupt
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
    
    // Get cart state
    const cart = getCart(callSid);
    
    // STATE MACHINE: Handle different intents with proper flow
    if (userIntent === 'order_item') {
      // STATE: ADDING_ITEMS - Parse → Normalize → Lookup → Validate → Add to Cart
      console.log('🛒 Processing order_item intent...');
      
      // Extract quantity and item name from user input
      const qtyMatch = speechResult.match(/\b(one|1|two|2|three|3|four|4|five|5|\d+)\b/i);
      const quantity = qtyMatch ? (parseInt(qtyMatch[1]) || (qtyMatch[1].toLowerCase().includes('one') ? 1 : 
        qtyMatch[1].toLowerCase().includes('two') ? 2 : 
        qtyMatch[1].toLowerCase().includes('three') ? 3 : 
        qtyMatch[1].toLowerCase().includes('four') ? 4 : 
        qtyMatch[1].toLowerCase().includes('five') ? 5 : 1)) : 1;
      
      // Remove quantity from text to get item name
      const itemText = speechResult.replace(/\b(one|1|two|2|three|3|four|4|five|5|\d+)\b/gi, '').trim();
      
      // Lookup menu item with fuzzy matching
      const lookupResult = await lookupMenuItem(itemText, quantity);
      
      // Log lookup result
      console.log('📊 Lookup result:', JSON.stringify({
        raw_text: itemText,
        success: lookupResult.success,
        action: lookupResult.action,
        menu_id: lookupResult.menu_id,
        menu_name: lookupResult.menu_name,
        confidence: lookupResult.match_confidence
      }, null, 2));
      
      if (lookupResult.success && lookupResult.action === 'auto_match') {
        // High confidence - auto-add to cart
        addItemToCart(callSid, {
          raw_text: itemText,
          normalized_text: lookupResult.normalized_text,
          menu_id: lookupResult.menu_id,
          menu_name: lookupResult.menu_name,
          price: lookupResult.price,
          quantity: quantity,
          match_confidence: lookupResult.match_confidence
        });
        
        updateCartStatus(callSid, CartStatus.ADDING_ITEMS);
        
        const response = `Got it, ${quantity} ${lookupResult.menu_name}. Anything else?`;
        conversationHistory.push({ role: 'assistant', content: response, intent: 'order_item_added' });
        
        if (conv) {
          await saveMessageToDB(conv.id, 'assistant', response);
        }
        
        sayNatural(twiml, response);
        twiml.gather({
          input: 'speech',
          action: '/api/voice/handle-speech',
          method: 'POST',
          speechTimeout: 'auto',
          bargeIn: true,
          bargeInOnSpeech: true
        });
      } else if (lookupResult.action === 'ask_clarification') {
        // Ambiguous - ask for clarification
        const options = lookupResult.candidates.slice(0, 2).map(c => c.menu_name).join(' or ');
        const response = `Did you mean ${options}?`;
        conversationHistory.push({ role: 'assistant', content: response, intent: 'clarification_needed' });
        
        if (conv) {
          await saveMessageToDB(conv.id, 'assistant', response);
        }
        
        sayNatural(twiml, response);
        twiml.gather({
          input: 'speech',
          action: '/api/voice/handle-speech',
          method: 'POST',
          speechTimeout: 'auto',
          bargeIn: true,
          bargeInOnSpeech: true
        });
      } else {
        // Low confidence - show menu or ask
        const topItems = lookupResult.candidates && lookupResult.candidates.length > 0
          ? lookupResult.candidates.slice(0, 3).map(c => c.menu_name).join(', ')
          : 'some items from our menu';
        
        const response = `I couldn't find "${itemText}" on our menu. Did you mean ${topItems}? Or would you like to hear our menu?`;
        conversationHistory.push({ role: 'assistant', content: response, intent: 'item_not_found' });
        
        if (conv) {
          await saveMessageToDB(conv.id, 'assistant', response);
        }
        
        sayNatural(twiml, response);
        twiml.gather({
          input: 'speech',
          action: '/api/voice/handle-speech',
          method: 'POST',
          speechTimeout: 'auto',
          bargeIn: true,
          bargeInOnSpeech: true
        });
      }
      
      // Update conversation data
      await saveConversationToDB(callSid, {
        conversation_data: { messages: conversationHistory }
      });
      
    } else if (userIntent === 'general_question' && cart.status === CartStatus.ADDING_ITEMS) {
      // User said "No" to "Anything else?" - move to COLLECTING_INFO
      const summary = getCartSummary(callSid);
      
      if (summary && summary.items.length > 0) {
        updateCartStatus(callSid, CartStatus.COLLECTING_INFO);
        
        // Ask for name first
        const response = 'Great! Before I confirm your order, may I have your name, please?';
        conversationHistory.push({ role: 'assistant', content: response, intent: 'asking_name' });
        
        if (conv) {
          await saveMessageToDB(conv.id, 'assistant', response);
        }
        
        sayNatural(twiml, response);
        twiml.gather({
          input: 'speech',
          action: '/api/voice/handle-speech',
          method: 'POST',
          speechTimeout: 'auto',
          bargeIn: true,
          bargeInOnSpeech: true
        });
      } else {
        // No items in cart - ask what they want
        const response = 'What would you like to order?';
        conversationHistory.push({ role: 'assistant', content: response });
        
        if (conv) {
          await saveMessageToDB(conv.id, 'assistant', response);
        }
        
        sayNatural(twiml, response);
        twiml.gather({
          input: 'speech',
          action: '/api/voice/handle-speech',
          method: 'POST',
          speechTimeout: 'auto',
          bargeIn: true,
          bargeInOnSpeech: true
        });
      }
      
      await saveConversationToDB(callSid, {
        conversation_data: { messages: conversationHistory }
      });
      
    } else if (userIntent === 'provide_info' && cart.status === CartStatus.COLLECTING_INFO) {
      // User is providing name or phone number
      const customerInfo = getCustomerInfo(callSid);
      
      // Use AI to extract name and phone
      const extracted = await extractCustomerInfo(speechResult);
      
      // Update customer info with extracted data
      if (extracted.name) {
        setCustomerInfo(callSid, extracted.name, customerInfo.phone);
        customerInfo.name = extracted.name;
      }
      if (extracted.phone) {
        setCustomerInfo(callSid, customerInfo.name, extracted.phone);
        customerInfo.phone = extracted.phone;
      }
      
      // Re-fetch to get updated info
      const updatedInfo = getCustomerInfo(callSid);
      console.log('📝 Updated customer info:', updatedInfo);
      
      // Check what we still need (use updated info)
      if (!updatedInfo.name) {
        // Still need name
        const response = 'I didn\'t catch your name. Could you please tell me your name?';
        conversationHistory.push({ role: 'assistant', content: response, intent: 'asking_name' });
        
        if (conv) {
          await saveMessageToDB(conv.id, 'assistant', response);
        }
        
        sayNatural(twiml, response);
        twiml.gather({
          input: 'speech',
          action: '/api/voice/handle-speech',
          method: 'POST',
          speechTimeout: 'auto',
          bargeIn: true,
          bargeInOnSpeech: true
        });
      } else if (!updatedInfo.phone) {
        // Have name, need phone
        const response = `Thank you, ${updatedInfo.name}. What's your phone number?`;
        conversationHistory.push({ role: 'assistant', content: response, intent: 'asking_phone' });
        
        if (conv) {
          await saveMessageToDB(conv.id, 'assistant', response);
        }
        
        sayNatural(twiml, response);
        twiml.gather({
          input: 'speech',
          action: '/api/voice/handle-speech',
          method: 'POST',
          speechTimeout: 'auto',
          bargeIn: true,
          bargeInOnSpeech: true
        });
      } else {
        // Have both - move to confirmation
        const summary = getCartSummary(callSid);
        updateCartStatus(callSid, CartStatus.CONFIRMATION);
        
        const response = `Perfect! So your order is: ${summary.items_text}. Is that correct?`;
        conversationHistory.push({ role: 'assistant', content: response, intent: 'order_summary' });
        
        if (conv) {
          await saveMessageToDB(conv.id, 'assistant', response);
        }
        
        sayNatural(twiml, response);
        twiml.gather({
          input: 'speech',
          action: '/api/voice/handle-speech',
          method: 'POST',
          speechTimeout: 'auto',
          bargeIn: true,
          bargeInOnSpeech: true
        });
      }
      
      await saveConversationToDB(callSid, {
        conversation_data: { messages: conversationHistory }
      });
      
    } else if (userIntent === 'confirm_order') {
      // STATE: PLACING_ORDER - Use stored cart items with canonical menu IDs
      console.log('🔔 Order confirmation intent detected - processing order creation');
      updateCartStatus(callSid, CartStatus.PLACING_ORDER);
      
      // Get cart items (already validated with canonical menu IDs)
      const cartItems = getCartItemsForOrder(callSid);
      console.log('🛒 Cart items for order:', JSON.stringify(cartItems, null, 2));
      
      if (!cartItems || cartItems.length === 0) {
        console.error('❌ No items in cart');
        const errorMessage = 'I don\'t see any items in your order. What would you like to order?';
        conversationHistory.push({ role: 'assistant', content: errorMessage, intent: 'empty_cart' });
        
        if (conv) {
          await saveMessageToDB(conv.id, 'assistant', errorMessage);
        }
        
        sayNatural(twiml, errorMessage);
        twiml.gather({
          input: 'speech',
          action: '/api/voice/handle-speech',
          method: 'POST',
          speechTimeout: 'auto',
          bargeIn: true,
          bargeInOnSpeech: true
        });
        res.type('text/xml');
        return res.send(twiml.toString());
      }
      
      // Re-validate all items using stored menu IDs (final check)
      const validationResults = [];
      for (const item of cartItems) {
        const validation = await validateMenuItemById(item.menu_item_id);
        validationResults.push({
          item: item,
          validation: validation
        });
      }
      const invalidItems = validationResults.filter(r => !r.validation.valid);
      
      if (invalidItems.length > 0) {
        console.error('❌ Some items are no longer available:', invalidItems);
        const unavailableNames = invalidItems.map(r => r.item.menu_name).join(', ');
        const errorMessage = `I'm sorry, but ${unavailableNames} ${invalidItems.length === 1 ? 'is' : 'are'} no longer available. Would you like to order something else?`;
        conversationHistory.push({ role: 'assistant', content: errorMessage, intent: 'items_unavailable' });
        
        if (conv) {
          await saveMessageToDB(conv.id, 'assistant', errorMessage);
        }
        
        sayNatural(twiml, errorMessage);
        twiml.gather({
          input: 'speech',
          action: '/api/voice/handle-speech',
          method: 'POST',
          speechTimeout: 'auto',
          bargeIn: true,
          bargeInOnSpeech: true
        });
        res.type('text/xml');
        return res.send(twiml.toString());
      }
      
      // All items valid - create order
      const validItems = validationResults.filter(r => r.validation.valid);
      let totalAmount = 0;
      const orderItems = [];
      
      for (const result of validItems) {
        const item = result.item;
        const itemTotal = parseFloat(item.price) * item.quantity;
        totalAmount += itemTotal;
        
        orderItems.push({
          menu_item_id: item.menu_item_id,
          quantity: item.quantity,
          price: item.price,
          special_instructions: null
        });
      }
      
      // Generate unique order ID
      const orderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
      
      console.log('💾 Creating order in database...', {
        order_id: orderId,
        items: orderItems.length,
        total: totalAmount,
        cart_items: cartItems
      });
      
        // Get customer info from cart
        const customerInfo = getCustomerInfo(callSid);
        
        const { data: order, error: orderError } = await supabase
          .from('orders')
          .insert({
            order_id: orderId,
            customer_name: customerInfo.name || 'Guest',
            customer_phone: customerInfo.phone || req.body.From || null,
            items: orderItems,
            total_amount: totalAmount.toFixed(2),
            status: 'pending'
          })
          .select()
          .single();
      
      if (orderError || !order) {
        console.error('❌ Order creation error:', orderError);
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
          customer_name: null
        });
        
        // Save order confirmation message
        if (conv) {
          await saveMessageToDB(conv.id, 'assistant', confirmationMessage);
        }
        
        // Update conversation data with final confirmation
        await saveConversationToDB(callSid, {
          conversation_data: { messages: conversationHistory }
        });
        
        // Clear cart and conversation
        clearCart(callSid);
        conversations.delete(callSid);
      }
    } else if (userIntent === 'category_inquiry') {
      // Handle category-specific inquiries
      const { getMenuItemsByCategory, formatMenuByCategoryForAI } = require('../services/menuCategories');
      
      // Extract category from user query
      const categoryMatch = speechResult.match(/(?:what|show|tell|have).*(?:in|for|under).*(beverages?|drinks?|soft drinks?|lunch|dinner|appetizers?|desserts?|main course|bread|sides?|burgers?|pizza)/i);
      
      if (categoryMatch) {
        const categoryName = categoryMatch[1];
        // Map common terms to actual category names
        const categoryMap = {
          'beverages': 'Beverage',
          'drinks': 'Beverage',
          'soft drinks': 'Beverage',
          'lunch': 'Main Course',
          'dinner': 'Main Course',
          'appetizers': 'Appetizer',
          'desserts': 'Dessert',
          'main course': 'Main Course',
          'bread': 'Bread',
          'sides': 'Appetizer',
          'burgers': 'Main Course',
          'pizza': 'Main Course'
        };
        
        const actualCategory = categoryMap[categoryName.toLowerCase()] || categoryName;
        const categoryItems = await getMenuItemsByCategory(actualCategory);
        const itemsText = formatMenuByCategoryForAI(categoryItems);
        
        const response = `In ${actualCategory}, we have... ${itemsText}. Would you like to order any of these?`;
        conversationHistory.push({ role: 'assistant', content: response, intent: 'category_inquiry' });
        
        if (conv) {
          await saveMessageToDB(conv.id, 'assistant', response);
        }
        
        sayNatural(twiml, response);
        twiml.gather({
          input: 'speech',
          action: '/api/voice/handle-speech',
          method: 'POST',
          speechTimeout: 'auto',
          bargeIn: true,
          bargeInOnSpeech: true
        });
      } else {
        // Fallback to normal AI response
        const aiResponse = await handleCustomerQuery(speechResult, conversationHistory);
        conversationHistory.push({ role: 'assistant', content: aiResponse, intent: userIntent });
        
        if (conv) {
          await saveMessageToDB(conv.id, 'assistant', aiResponse);
        }
        
        sayNatural(twiml, aiResponse);
        twiml.gather({
          input: 'speech',
          action: '/api/voice/handle-speech',
          method: 'POST',
          speechTimeout: 'auto',
          bargeIn: true,
          bargeInOnSpeech: true
        });
      }
      
      await saveConversationToDB(callSid, {
        conversation_data: { messages: conversationHistory }
      });
      
    } else {
      // Continue normal conversation (handles menu_inquiry, item_inquiry, angry_complaint, etc.)
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
        speechTimeout: 'auto',
        bargeIn: true,
        bargeInOnSpeech: true
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
