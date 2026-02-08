const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { handleCustomerQuery, extractOrderFromConversation, detectIntent, getMenuContext } = require('../services/aiAgent');
const { lookupMenuItem, validateMenuItemById } = require('../services/menuLookup');
const { extractCustomerInfo } = require('../services/customerInfoExtractor');
const { formatCategoriesForAI } = require('../services/menuCategories');
const { 
  getCart, 
  addItemToCart, 
  removeLastItemFromCart,
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
const { isConfigured: isElevenLabsConfigured, generateAndStoreAudio, getAudioBuffer, prewarmCache } = require('../services/elevenlabsTts');
require('dotenv').config();

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || ''; // e.g. https://your-ngrok.ngrok.io - required for ElevenLabs Play

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

// Prewarm ElevenLabs cache with fixed phrases (greeting, menu response, etc.) so first use = 0ms
async function prewarmFixedPhrases() {
  if (!isElevenLabsConfigured() || !PUBLIC_BASE_URL) return;
  const fixed = [
    'I am an AI assistant of the restaurant. Tell me what you would like to order.',
    "I didn't catch that. Could you please repeat?",
    'Let me check that for you.',
    'Great! Before I confirm your order, may I have your name, please?',
    'I apologize, but there was an error processing your order. Please try again or call back.',
    'I apologize, but I encountered an error. Please try again.'
  ];
  try {
    const menuItems = await getMenuContext();
    const categories = [...new Set(menuItems.map(item => item.category))];
    const categoriesText = formatCategoriesForAI(categories);
    fixed.push(`We have ${categoriesText}. Which category would you like to see?`);
  } catch (e) {
    console.warn('[ElevenLabs] Prewarm: could not build menu phrase', e.message);
  }
  const n = await prewarmCache(fixed);
  if (n > 0) console.log(`✅ ElevenLabs prewarmed ${n} fixed phrases (0ms on first use)`);
}

if (isElevenLabsConfigured()) {
  if (PUBLIC_BASE_URL) {
    console.log('✅ ElevenLabs TTS enabled (voice will use ElevenLabs)');
    prewarmFixedPhrases().catch(err => console.warn('[ElevenLabs] Prewarm failed:', err.message));
  } else {
    console.log('ℹ️  ElevenLabs API key set but PUBLIC_BASE_URL missing - using Twilio/Polly. Set PUBLIC_BASE_URL (e.g. ngrok URL) to use ElevenLabs.');
  }
}

// Store conversation history (in production, use Redis or database)
const conversations = new Map();

// Helper function to save/update conversation in database (async, non-blocking)
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

// Helper function to save message to database (async, non-blocking)
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

// Fire-and-forget wrapper for database operations (non-blocking)
function saveConversationToDBAsync(callSid, data) {
  // Trigger async operation but don't wait for it
  saveConversationToDB(callSid, data).catch(err => {
    console.error('Async conversation save error:', err);
  });
}

// Fire-and-forget wrapper for message saving (non-blocking)
function saveMessageToDBAsync(conversationId, role, content) {
  // Trigger async operation but don't wait for it
  saveMessageToDB(conversationId, role, content).catch(err => {
    console.error('Async message save error:', err);
  });
}

// Non-blocking helper to get conversation ID (returns promise, doesn't block)
function getConversationIdAsync(callSid) {
  return supabase
    .from('conversations')
    .select('id')
    .eq('call_sid', callSid)
    .single()
    .then(({ data: conv, error }) => {
      if (error) {
        console.error('Error getting conversation ID:', error);
        return null;
      }
      return conv;
    })
    .catch(err => {
      console.error('Error in getConversationIdAsync:', err);
      return null;
    });
}

// Non-blocking helper to save message (gets conversation ID and saves message async)
function saveMessageToDBByCallSidAsync(callSid, role, content) {
  getConversationIdAsync(callSid).then(conv => {
    if (conv) {
      saveMessageToDBAsync(conv.id, role, content);
    }
  });
}

// Helper function to format text for natural human-like speech with SSML
function formatNaturalSpeech(text) {
  if (!text) return '';
  
  // First, replace [[PAUSE_SHORT]] tokens with SSML breaks
  let formatted = text.replace(/\[\[PAUSE_SHORT\]\]/g, '<break time="300ms"/>');
  
  // Add natural pauses after punctuation for more human-like rhythm (longer pauses for slower pace)
  formatted = formatted
    .replace(/\.\.\./g, '<break time="500ms"/>') // Natural pause for ellipsis
    .replace(/\. /g, '. <break time="400ms"/>') // Natural pause after sentences
    .replace(/\? /g, '? <break time="450ms"/>') // Pause after questions
    .replace(/! /g, '! <break time="400ms"/>') // Pause after exclamations
    .replace(/, /g, ', <break time="300ms"/>'); // Brief pause after commas
  
  // Final check: remove duplicate breaks that are too close together
  // If two breaks are within 500ms worth of content, remove the second
  formatted = formatted.replace(/(<break time="\d+ms"\/>)\s*(?:\w+\s*){0,5}\1/g, '$1');
  
  // Wrap in SSML with prosody for natural speech (slower rate for clarity)
  // Using percentage rate: 20% = 80% slower than normal (100%)
  // Options: x-slow, slow, medium, fast, x-fast (presets)
  // Or percentage: 20-200% (100% = normal speed)
  // Note: SSML prosody only works with Amazon Polly voices, not built-in Twilio voices
  return `<speak>
    <prosody rate="20%">
      ${formatted}
    </prosody>
  </speak>`;
}

// Serve cached ElevenLabs audio for Twilio <Play> (Twilio fetches this URL)
router.get('/audio/:token', (req, res) => {
  const buffer = getAudioBuffer(req.params.token);
  if (!buffer) {
    res.status(404).send('Audio not found or expired');
    return;
  }
  res.set({ 'Content-Type': 'audio/mpeg' });
  res.send(buffer);
});

/**
 * Say text using ElevenLabs (if configured + PUBLIC_BASE_URL) or fallback to Polly.
 * Async: use await sayNatural(twiml, text, options).
 */
async function sayNatural(twiml, text, options = {}) {
  const useElevenLabs = isElevenLabsConfigured() && PUBLIC_BASE_URL;
  if (useElevenLabs) {
    const token = await generateAndStoreAudio(text);
    if (token) {
      if (options.addPauseBefore !== false) {
        twiml.pause({ length: 0.25 }); // 0.25s = snappier, same quality
      }
      const audioUrl = `${PUBLIC_BASE_URL.replace(/\/$/, '')}/api/voice/audio/${token}`;
      twiml.play(audioUrl);
      return;
    }
    console.warn('[Voice] ElevenLabs TTS failed, using Polly fallback');
  }
  // Polly path (original behavior)
  const voice = options.voice || 'polly.Joanna';
  const language = options.language || 'en-US';
  if (options.addPauseBefore !== false) {
    twiml.pause({ length: 0.25 });
  }
  twiml.say({ voice, language }, formatNaturalSpeech(text));
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
  
  // Save conversation start to database (non-blocking)
  saveConversationToDBAsync(callSid, {
    customer_phone: fromNumber,
    call_status: 'ringing',
    conversation_data: { messages: [] }
  });
  
  const twiml = new twilio.twiml.VoiceResponse();
  
  // Use natural human-like voice
  await sayNatural(twiml, 'I am an AI assistant of the restaurant. Tell me what you would like to order.');
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
  // Performance tracking - start overall timer
  const overallStart = Date.now();
  const timings = {
    request_received: Date.now(),
    transcription_received: null,
    db_operations: null,
    intent_detection: null,
    ai_response: null,
    total: null
  };

  if (!twilio) {
    return res.status(503).json({ error: 'Twilio is not configured. Please set up Twilio credentials in your .env file.' });
  }
  
  const twiml = new twilio.twiml.VoiceResponse();
  const speechResult = req.body.SpeechResult;
  const callSid = req.body.CallSid;

  // Track when transcription is received
  timings.transcription_received = Date.now();
  console.log(`⏱️  [PERF] Transcription received: ${timings.transcription_received - timings.request_received}ms after request`);

  if (!speechResult) {
    await sayNatural(twiml, 'I didn\'t catch that. Could you please repeat?');
    twiml.redirect('/api/voice/incoming-call');
    res.type('text/xml');
    return res.send(twiml.toString());
  }

  // Get or create conversation history
  const dbStart = Date.now();
  if (!conversations.has(callSid)) {
    conversations.set(callSid, []);
    // Initialize conversation in DB if not exists (non-blocking)
    saveConversationToDBAsync(callSid, {
      customer_phone: req.body.From,
      call_status: 'in-progress',
      conversation_data: { messages: [] }
    });
  }
  const conversationHistory = conversations.get(callSid);

  // Add user message to history
  conversationHistory.push({ role: 'user', content: speechResult });
  
  // Get conversation ID and save message to DB (non-blocking)
  // Start the lookup but don't wait - save message when ID is available
  getConversationIdAsync(callSid).then(conv => {
    if (conv) {
      saveMessageToDBAsync(conv.id, 'user', speechResult);
    }
  });
  
  timings.db_operations = Date.now();
  console.log(`⏱️  [PERF] Database operations: ${timings.db_operations - dbStart}ms`);

  try {
    // Detect user intent first to determine if we need to say "Let me check"
    console.log('🔍 Detecting user intent for:', speechResult);
    const intentStart = Date.now();
    const userIntent = await detectIntent(speechResult, conversationHistory);
    timings.intent_detection = Date.now();
    console.log(`⏱️  [PERF] Intent detection: ${timings.intent_detection - intentStart}ms`);
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
    
    // Only say "Let me check" for intents that require SLOW processing (GPT-4 AI response)
    // Skip for fast paths (menu lookup, state transitions, etc.):
    const cartItems = getCartItemsForOrder(callSid);
    const shouldSkipLetMeCheck = 
      (userIntent === 'order_item') || // Fast menu lookup (~200ms) - no need to say "Let me check"
      (userIntent === 'menu_inquiry') || // Fast path - direct category listing
      (userIntent === 'item_inquiry') || // Fast path - direct menu lookup
      (userIntent === 'category_inquiry') || // Fast path - category items lookup
      (userIntent === 'general_question' && cart.status === CartStatus.ADDING_ITEMS) || // "No" to "Anything else?" - just ask for name
      (userIntent === 'provide_info') || // Providing name/phone - just update state
      (userIntent === 'confirm_order' && cart.status === CartStatus.CONFIRMATION) || // "Yes" to "Is that correct?" - just create order
      (userIntent === 'confirm_order' && (!cartItems || cartItems.length === 0)); // "Yes" but cart is empty - just ask what to order
    
    // Only say "Let me check" for intents that need GPT-4 AI processing (slow, ~850ms+)
    // Fast paths (menu lookup, etc.) don't need it
    if (!shouldSkipLetMeCheck) {
      // Say "Let me check" only for slow AI responses (general_question, angry_complaint, etc.)
      // No pause before "Let me check" - it should be immediate
      const immediateResponseStart = Date.now();
      await sayNatural(twiml, 'Let me check that for you.', { addPauseBefore: false });
      console.log(`⏱️  [PERF] "Let me check" said at: ${immediateResponseStart - overallStart}ms from request start`);
    }
    
    // STATE MACHINE: Handle different intents with proper flow
    if (userIntent === 'order_item') {
      // STATE: ADDING_ITEMS - Parse → Normalize → Lookup → Validate → Add to Cart
      console.log('🛒 Processing order_item intent...');
      
      // Check if this is a correction (user saying "No, just X" or "Not Y, I said X")
      const isCorrection = /^(no|not|wrong|that's not|that is not|i said|i meant|just)\s+/i.test(speechResult) ||
                          /\b(not|wrong|incorrect|no)\s+[^,]+,\s*(i\s+said|i\s+meant|just)\s+/i.test(speechResult);
      
      // If correction, remove last item from cart
      if (isCorrection && cart.items.length > 0) {
        const removed = removeLastItemFromCart(callSid);
        console.log(`🔄 Correction detected - removed: ${removed ? removed.menu_name : 'last item'}`);
      }
      
      // Extract quantity and item name from user input
      // Support both numeric (1, 2, 3) and word numbers (one, two, three, etc.)
      // Also handle speech recognition errors (T00, TO, too → two)
      const qtyMatch = speechResult.match(/\b(one|1|two|2|three|3|four|4|five|5|six|6|seven|7|eight|8|nine|9|ten|10|\d+|t00|to|too|tree|for|fife)\b/i);
      
      // Normalize speech recognition errors to correct number words
      const normalizeNumberWord = (text) => {
        const normalized = text.toLowerCase().trim();
        // Handle common speech recognition errors
        const errorMap = {
          't00': 'two',    // "T00" → "two"
          'to': 'two',     // "TO" → "two" (when it's clearly a number, not preposition)
          'too': 'two',    // "too" → "two" (homophone)
          'tree': 'three', // "tree" → "three"
          'for': 'four',   // "for" → "four" (homophone)
          'fore': 'four',  // "fore" → "four"
          'fife': 'five',  // "fife" → "five"
          'ate': 'eight',  // "ate" → "eight" (homophone)
          'ate': 'eight',  // "8" → "eight"
        };
        return errorMap[normalized] || normalized;
      };
      
      // Convert word numbers to integers
      const wordToNumber = {
        'one': 1, '1': 1,
        'two': 2, '2': 2,
        'three': 3, '3': 3,
        'four': 4, '4': 4,
        'five': 5, '5': 5,
        'six': 6, '6': 6,
        'seven': 7, '7': 7,
        'eight': 8, '8': 8,
        'nine': 9, '9': 9,
        'ten': 10, '10': 10
      };
      
      let quantity = 1; // Default to 1 if no quantity specified
      if (qtyMatch) {
        let qtyText = qtyMatch[1].toLowerCase();
        const originalQtyText = qtyText;
        
        // Normalize speech recognition errors
        qtyText = normalizeNumberWord(qtyText);
        
        // Try to parse as integer first (handles "2", "10", etc.)
        const parsedInt = parseInt(qtyText);
        if (!isNaN(parsedInt) && qtyText.match(/^\d+$/)) {
          quantity = parsedInt;
        } else if (wordToNumber[qtyText]) {
          // Use word-to-number mapping
          quantity = wordToNumber[qtyText];
        } else {
          // If normalization didn't work, try original text
          const originalParsed = parseInt(originalQtyText);
          if (!isNaN(originalParsed)) {
            quantity = originalParsed;
          }
        }
        
        console.log(`🔢 [QUANTITY] Extracted quantity: "${originalQtyText}" → normalized: "${qtyText}" → ${quantity}`);
      } else {
        // Try fuzzy matching for common speech errors that might not match the regex
        // Only match unambiguous patterns: "T00" (clearly a speech error) or "too" (less ambiguous than "to")
        // Check at the start of the sentence or after removing ordering phrases
        const cleanedForFuzzy = speechResult
          .replace(/\b(yes|yeah|yep|sure|okay|ok|please|can you|could you|will you|i want|i'd like|i would like|i need|i'll have|give me|get me|order|add|put)\s+/gi, '')
          .trim();
        
        // Only match "t00" or "too" at the start (not "to" which is too ambiguous)
        const fuzzyQtyMatch = cleanedForFuzzy.match(/^(t00|too)\s+/i);
        if (fuzzyQtyMatch) {
          const normalized = normalizeNumberWord(fuzzyQtyMatch[1]);
          if (wordToNumber[normalized]) {
            quantity = wordToNumber[normalized];
            console.log(`🔢 [QUANTITY] Fuzzy matched: "${fuzzyQtyMatch[1]}" → normalized: "${normalized}" → ${quantity}`);
          } else {
            console.log(`🔢 [QUANTITY] No quantity found, defaulting to 1`);
          }
        } else {
          console.log(`🔢 [QUANTITY] No quantity found, defaulting to 1`);
        }
      }
      
      // Remove quantity, correction phrases, and common ordering phrases from text to get item name
      // This fixes issues like "Yes, can you order 2 chocolate milkshake" → should extract "chocolate milkshake"
      // Also handles speech recognition errors like "T00 chocolate" → "chocolate"
      let itemText = speechResult
        .replace(/\b(no|not|wrong|that's not|that is not|i said|i meant|just)\s+/gi, '')
        .replace(/\b(yes|yeah|yep|sure|okay|ok|please|can you|could you|will you|i want|i'd like|i would like|i need|i'll have|give me|get me|order|add|put)\s+/gi, '')
        .trim();
      
      // Remove quantities - be careful with "to" (only remove if it's clearly a quantity at start)
      // First remove unambiguous numbers and number words
      itemText = itemText
        .replace(/\b(one|1|two|2|three|3|four|4|five|5|six|6|seven|7|eight|8|nine|9|ten|10|\d+)\b/gi, '')
        .replace(/^(t00|too)\s+/i, '') // Remove "t00" or "too" only at the start (clearly quantity indicators)
        .replace(/\b(tree|for|fife)\b/gi, '') // Remove other unambiguous speech errors
        .replace(/^[^a-z]*/i, '') // Remove leading non-alphabetic chars
        .replace(/\s+/g, ' ') // Normalize multiple spaces
        .trim();
      
      // Log extracted item text for debugging
      console.log(`🔍 [ORDER_ITEM] Original: "${speechResult}" → Extracted: "${itemText}" (quantity: ${quantity})`);
      
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
        
        saveMessageToDBByCallSidAsync(callSid, 'assistant', response);
        
        await sayNatural(twiml, response);
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
        
        saveMessageToDBByCallSidAsync(callSid, 'assistant', response);
        
        await sayNatural(twiml, response);
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
        
        saveMessageToDBByCallSidAsync(callSid, 'assistant', response);
        
        await sayNatural(twiml, response);
        twiml.gather({
          input: 'speech',
          action: '/api/voice/handle-speech',
          method: 'POST',
          speechTimeout: 'auto',
          bargeIn: true,
          bargeInOnSpeech: true
        });
      }
      
      // Update conversation data (non-blocking)
      saveConversationToDBAsync(callSid, {
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
        
        saveMessageToDBByCallSidAsync(callSid, 'assistant', response);
        
        await sayNatural(twiml, response);
        twiml.gather({
          input: 'speech',
          action: '/api/voice/handle-speech',
          method: 'POST',
          speechTimeout: 'auto',
          bargeIn: true,
          bargeInOnSpeech: true
        });
        
        saveConversationToDBAsync(callSid, {
          conversation_data: { messages: conversationHistory }
        });
      } else {
        // No items in cart - ask what they want
        const response = 'What would you like to order?';
        conversationHistory.push({ role: 'assistant', content: response });
        
        saveMessageToDBByCallSidAsync(callSid, 'assistant', response);
        
        await sayNatural(twiml, response);
        twiml.gather({
          input: 'speech',
          action: '/api/voice/handle-speech',
          method: 'POST',
          speechTimeout: 'auto',
          bargeIn: true,
          bargeInOnSpeech: true
        });
        
        saveConversationToDBAsync(callSid, {
          conversation_data: { messages: conversationHistory }
        });
      }
      
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
        
        saveMessageToDBByCallSidAsync(callSid, 'assistant', response);
        
        await sayNatural(twiml, response);
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
        
        saveMessageToDBByCallSidAsync(callSid, 'assistant', response);
        
        await sayNatural(twiml, response);
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
        
        saveMessageToDBByCallSidAsync(callSid, 'assistant', response);
        
        await sayNatural(twiml, response);
        twiml.gather({
          input: 'speech',
          action: '/api/voice/handle-speech',
          method: 'POST',
          speechTimeout: 'auto',
          bargeIn: true,
          bargeInOnSpeech: true
        });
      }
      
      saveConversationToDBAsync(callSid, {
        conversation_data: { messages: conversationHistory }
      });
      
    } else if (userIntent === 'confirm_order') {
      // STATE: Handle order confirmation - check cart status first
      console.log('🔔 Order confirmation intent detected');
      
      // Check if cart is empty first
      if (!cartItems || cartItems.length === 0) {
        console.error('❌ No items in cart');
        
        // Check if last message was asking about ordering a specific item (from item_inquiry)
        const lastAssistantMessage = conversationHistory.filter(m => m.role === 'assistant').pop();
        if (lastAssistantMessage && lastAssistantMessage.content && 
            lastAssistantMessage.content.toLowerCase().includes('would you like to order') &&
            lastAssistantMessage.item_name) {
          // User said "Yes" to "Would you like to order it?" - treat as order_item instead
          console.log('🔄 Converting confirm_order to order_item - user wants to order the item from inquiry');
          // Use stored item info from item_inquiry
          addItemToCart(callSid, {
            raw_text: lastAssistantMessage.item_name,
            normalized_text: lastAssistantMessage.item_name,
            menu_id: lastAssistantMessage.item_id,
            menu_name: lastAssistantMessage.item_name,
            price: lastAssistantMessage.item_price,
            quantity: 1,
            match_confidence: 1.0
          });
          updateCartStatus(callSid, CartStatus.ADDING_ITEMS);
          const response = `Got it, ${lastAssistantMessage.item_name}. Anything else?`;
          conversationHistory.push({ role: 'assistant', content: response, intent: 'order_item_added' });
          saveMessageToDBByCallSidAsync(callSid, 'assistant', response);
          await sayNatural(twiml, response);
          twiml.gather({
            input: 'speech',
            action: '/api/voice/handle-speech',
            method: 'POST',
            speechTimeout: 'auto',
            bargeIn: true,
            bargeInOnSpeech: true
          });
          saveConversationToDBAsync(callSid, {
            conversation_data: { messages: conversationHistory }
          });
          res.type('text/xml');
          return res.send(twiml.toString());
        }
        
        // Fallback: cart is empty and not from item inquiry
        const errorMessage = 'I don\'t see any items in your order. What would you like to order?';
        conversationHistory.push({ role: 'assistant', content: errorMessage, intent: 'empty_cart' });
        
        saveMessageToDBByCallSidAsync(callSid, 'assistant', errorMessage);
        
        await sayNatural(twiml, errorMessage);
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
      
      // Check cart status - if already in CONFIRMATION, user said "yes" to "Is that correct?"
      if (cart.status === CartStatus.CONFIRMATION) {
        // User confirmed the order summary - create the order
        console.log('🔔 Order confirmation - user confirmed, creating order');
        updateCartStatus(callSid, CartStatus.PLACING_ORDER);
      
      console.log('🛒 Cart items for order:', JSON.stringify(cartItems, null, 2));
      
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
        
        saveMessageToDBByCallSidAsync(callSid, 'assistant', errorMessage);
        
        await sayNatural(twiml, errorMessage);
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
        await sayNatural(twiml, 'I apologize, but there was an error processing your order. Please try again or call back.');
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
        await sayNatural(twiml, confirmationMessage);
        
        // Update conversation with order info (non-blocking)
        saveConversationToDBAsync(callSid, {
          order_id: order.order_id,
          order_placed: true,
          customer_name: null
        });
        
        // Save order confirmation message (non-blocking)
        saveMessageToDBByCallSidAsync(callSid, 'assistant', confirmationMessage);
        
        // Update conversation data with final confirmation (non-blocking)
        saveConversationToDBAsync(callSid, {
          conversation_data: { messages: conversationHistory }
        });
        
        // Clear cart and conversation
        clearCart(callSid);
        conversations.delete(callSid);
      }
      } else {
        // Cart status is not CONFIRMATION - need to collect customer info and show summary
        console.log('📝 Collecting customer info before showing order summary');
        
        // Check if customer info is complete
        const customerInfo = getCustomerInfo(callSid);
        const infoComplete = isCustomerInfoComplete(callSid);
        
        if (!infoComplete) {
          // Customer info not complete - collect it first
          updateCartStatus(callSid, CartStatus.COLLECTING_INFO);
          
          if (!customerInfo.name) {
            // Ask for name first
            const response = 'Great! Before I confirm your order, may I have your name, please?';
            conversationHistory.push({ role: 'assistant', content: response, intent: 'asking_name' });
            
            saveMessageToDBByCallSidAsync(callSid, 'assistant', response);
            
            await sayNatural(twiml, response);
            twiml.gather({
              input: 'speech',
              action: '/api/voice/handle-speech',
              method: 'POST',
              speechTimeout: 'auto',
              bargeIn: true,
              bargeInOnSpeech: true
            });
            
            saveConversationToDBAsync(callSid, {
              conversation_data: { messages: conversationHistory }
            });
            
            res.type('text/xml');
            return res.send(twiml.toString());
          } else if (!customerInfo.phone) {
            // Have name, need phone
            const response = `Thank you, ${customerInfo.name}. What's your phone number?`;
            conversationHistory.push({ role: 'assistant', content: response, intent: 'asking_phone' });
            
            saveMessageToDBByCallSidAsync(callSid, 'assistant', response);
            
            await sayNatural(twiml, response);
            twiml.gather({
              input: 'speech',
              action: '/api/voice/handle-speech',
              method: 'POST',
              speechTimeout: 'auto',
              bargeIn: true,
              bargeInOnSpeech: true
            });
            
            saveConversationToDBAsync(callSid, {
              conversation_data: { messages: conversationHistory }
            });
            
            res.type('text/xml');
            return res.send(twiml.toString());
          }
        }
        
        // Customer info is complete - show order summary and ask for confirmation
        console.log('✅ Customer info complete - showing order summary');
        const summary = getCartSummary(callSid);
        updateCartStatus(callSid, CartStatus.CONFIRMATION);
        
        const response = `Perfect! So your order is: ${summary.items_text}. Is that correct?`;
        conversationHistory.push({ role: 'assistant', content: response, intent: 'order_summary' });
        
        saveMessageToDBByCallSidAsync(callSid, 'assistant', response);
        
        await sayNatural(twiml, response);
        twiml.gather({
          input: 'speech',
          action: '/api/voice/handle-speech',
          method: 'POST',
          speechTimeout: 'auto',
          bargeIn: true,
          bargeInOnSpeech: true
        });
        
        saveConversationToDBAsync(callSid, {
          conversation_data: { messages: conversationHistory }
        });
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
        
        saveMessageToDBByCallSidAsync(callSid, 'assistant', response);
        
        await sayNatural(twiml, response);
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
        // "Let me check" already said above, now generate the actual response
        const aiStart = Date.now();
        const aiResponse = await handleCustomerQuery(speechResult, conversationHistory);
        timings.ai_response = Date.now();
        console.log(`⏱️  [PERF] AI response generated: ${timings.ai_response - aiStart}ms`);
        conversationHistory.push({ role: 'assistant', content: aiResponse, intent: userIntent });
        
        saveMessageToDBByCallSidAsync(callSid, 'assistant', aiResponse);
        
        await sayNatural(twiml, aiResponse);
        twiml.gather({
          input: 'speech',
          action: '/api/voice/handle-speech',
          method: 'POST',
          speechTimeout: 'auto',
          bargeIn: true,
          bargeInOnSpeech: true
        });
      }
      
      saveConversationToDBAsync(callSid, {
        conversation_data: { messages: conversationHistory }
      });
      
    } else if (userIntent === 'menu_inquiry') {
      // FAST PATH: Menu inquiry - generate response directly without GPT-4 (much faster!)
      // This avoids the 3+ second GPT-4 API call for simple menu category questions
      const aiStart = Date.now();
      const menuItems = await getMenuContext();
      const categories = [...new Set(menuItems.map(item => item.category))];
      const categoriesText = formatCategoriesForAI(categories);
      
      // Generate natural response directly (no GPT-4 needed for simple category listing)
      const aiResponse = `We have ${categoriesText}. Which category would you like to see?`;
      timings.ai_response = Date.now();
      console.log(`⏱️  [PERF] AI response generated (fast path): ${timings.ai_response - aiStart}ms`);
      
      // Create response object with intent
      const aiResponseWithIntent = {
        role: 'assistant',
        content: aiResponse,
        intent: userIntent
      };
      
      // Add AI response to history
      conversationHistory.push(aiResponseWithIntent);
      
      // Save AI response to DB (non-blocking)
      saveMessageToDBByCallSidAsync(callSid, 'assistant', aiResponse);
      
      // Update conversation data in DB (non-blocking)
      saveConversationToDBAsync(callSid, {
        conversation_data: { messages: conversationHistory }
      });
      
      // Continue conversation with natural voice
      await sayNatural(twiml, aiResponse);
      twiml.gather({
        input: 'speech',
        action: '/api/voice/handle-speech',
        method: 'POST',
        speechTimeout: 'auto',
        bargeIn: true,
        bargeInOnSpeech: true
      });
      
    } else if (userIntent === 'item_inquiry') {
      // FAST PATH: Item inquiry - check if specific item exists and give direct answer
      // Handles queries like "do you have coffee?", "is coffee available?", "what's in coffee?"
      console.log('🔍 Processing item_inquiry intent...');
      const aiStart = Date.now();
      
      // Extract item name from query (remove common inquiry phrases)
      const itemText = speechResult
        .replace(/\b(do you have|do you serve|is|are|what|tell me about|tell me|details about|information about|what's|what is|what are)\b/gi, '')
        .replace(/\b(available|on the menu|in your menu|you have|you serve)\b/gi, '')
        .trim()
        .replace(/[?.,!]/g, '')
        .trim();
      
      console.log(`🔍 Extracted item name: "${itemText}"`);
      
      // Lookup menu item
      const lookupResult = await lookupMenuItem(itemText, 1);
      
      if (lookupResult.success && lookupResult.action === 'auto_match') {
        // Item found - give direct answer
        const response = `Yes, we have ${lookupResult.menu_name}. It's $${lookupResult.price}. Would you like to order it?`;
        // Store item info in conversation for later retrieval if user says "Yes"
        conversationHistory.push({ 
          role: 'assistant', 
          content: response, 
          intent: 'item_inquiry',
          item_name: lookupResult.menu_name,
          item_id: lookupResult.menu_id,
          item_price: lookupResult.price
        });
        
        saveMessageToDBByCallSidAsync(callSid, 'assistant', response);
        
        await sayNatural(twiml, response);
        twiml.gather({
          input: 'speech',
          action: '/api/voice/handle-speech',
          method: 'POST',
          speechTimeout: 'auto',
          bargeIn: true,
          bargeInOnSpeech: true
        });
      } else if (lookupResult.action === 'ask_clarification') {
        // Ambiguous match - ask for clarification
        const options = lookupResult.candidates.slice(0, 2).map(c => c.menu_name).join(' or ');
        const response = `Did you mean ${options}?`;
        conversationHistory.push({ role: 'assistant', content: response, intent: 'item_inquiry' });
        
        saveMessageToDBByCallSidAsync(callSid, 'assistant', response);
        
        await sayNatural(twiml, response);
        twiml.gather({
          input: 'speech',
          action: '/api/voice/handle-speech',
          method: 'POST',
          speechTimeout: 'auto',
          bargeIn: true,
          bargeInOnSpeech: true
        });
      } else {
        // Item not found - give helpful response
        const topItems = lookupResult.candidates && lookupResult.candidates.length > 0
          ? lookupResult.candidates.slice(0, 3).map(c => c.menu_name).join(', ')
          : 'some items from our menu';
        
        const response = `I don't see "${itemText}" on our menu. Did you mean ${topItems}? Or would you like to hear our menu?`;
        conversationHistory.push({ role: 'assistant', content: response, intent: 'item_inquiry' });
        
        saveMessageToDBByCallSidAsync(callSid, 'assistant', response);
        
        await sayNatural(twiml, response);
        twiml.gather({
          input: 'speech',
          action: '/api/voice/handle-speech',
          method: 'POST',
          speechTimeout: 'auto',
          bargeIn: true,
          bargeInOnSpeech: true
        });
      }
      
      timings.ai_response = Date.now();
      console.log(`⏱️  [PERF] AI response generated (item inquiry fast path): ${timings.ai_response - aiStart}ms`);
      
      saveConversationToDBAsync(callSid, {
        conversation_data: { messages: conversationHistory }
      });
      
    } else {
      // Continue normal conversation (handles general_question, angry_complaint, etc. that need GPT-4)
      // "Let me check" already said above for these slow AI responses, now generate the actual response
      const aiStart = Date.now();
      const aiResponse = await handleCustomerQuery(speechResult, conversationHistory);
      timings.ai_response = Date.now();
      console.log(`⏱️  [PERF] AI response generated: ${timings.ai_response - aiStart}ms`);
      
      // Create response object with intent
      const aiResponseWithIntent = {
        role: 'assistant',
        content: aiResponse,
        intent: userIntent
      };
      
      // Add AI response to history
      conversationHistory.push(aiResponseWithIntent);
      
      // Save AI response to DB (non-blocking)
      saveMessageToDBByCallSidAsync(callSid, 'assistant', aiResponse);
      
      // Update conversation data in DB (non-blocking)
      saveConversationToDBAsync(callSid, {
        conversation_data: { messages: conversationHistory }
      });
      
      // Continue conversation with natural voice
      await sayNatural(twiml, aiResponse);
      twiml.gather({
        input: 'speech',
        action: '/api/voice/handle-speech',
        method: 'POST',
        speechTimeout: 'auto',
        bargeIn: true,
        bargeInOnSpeech: true
      });
    }
    
    // Log total performance summary
    timings.total = Date.now();
    console.log(`\n📊 [PERF SUMMARY] Total time breakdown for "${speechResult.substring(0, 50)}..."`);
    console.log(`   Request → Transcription: ${timings.transcription_received - timings.request_received}ms`);
    console.log(`   Database operations: ${timings.db_operations - (timings.transcription_received || timings.request_received)}ms`);
    console.log(`   Intent detection: ${timings.intent_detection ? timings.intent_detection - (timings.db_operations || timings.request_received) : 'N/A'}ms`);
    console.log(`   AI response: ${timings.ai_response ? timings.ai_response - (timings.intent_detection || timings.db_operations || timings.request_received) : 'N/A'}ms`);
    console.log(`   (TTS: see "ElevenLabs TTS" line above for voice generation time)`);
    console.log(`   ⏱️  TOTAL TIME: ${timings.total - timings.request_received}ms\n`);
    
  } catch (error) {
    console.error('Voice handler error:', error);
    timings.total = Date.now();
    console.log(`\n❌ [PERF SUMMARY] Error occurred after ${timings.total - timings.request_received}ms\n`);
    await sayNatural(twiml, 'I apologize, but I encountered an error. Please try again.');
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
    
    saveConversationToDBAsync(callSid, updateData);
  }
  
  res.status(200).send('OK');
});

module.exports = router;
