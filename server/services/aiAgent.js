const OpenAI = require('openai');
const supabase = require('../config/supabase');
const { getMenuCategories, getMenuItemsByCategory, formatCategoriesForAI, formatMenuByCategoryForAI } = require('./menuCategories');
require('dotenv').config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Get menu items for context
async function getMenuContext() {
  const { data, error } = await supabase
    .from('menu_items')
    .select('name, description, ingredients, spice_level, price, category')
    .eq('is_available', true);

  if (error) {
    console.error('Error fetching menu:', error);
    return [];
  }
  return data || [];
}

// Format menu items for AI context
function formatMenuForAI(menuItems) {
  return menuItems.map(item => ({
    name: item.name,
    description: item.description,
    ingredients: Array.isArray(item.ingredients) ? item.ingredients.join(', ') : item.ingredients,
    spiceLevel: item.spice_level,
    price: `$${item.price}`,
    category: item.category
  }));
}

// Detect user intent from query
async function detectIntent(query, conversationHistory = []) {
  try {
    const intentPrompt = `Analyze the user's message and determine their intent. Consider the conversation context carefully.

Return ONLY a JSON object with this structure:
{
  "intent": "menu_inquiry" | "category_inquiry" | "item_inquiry" | "order_item" | "confirm_order" | "provide_info" | "general_question" | "order_status" | "angry_complaint",
  "confidence": 0.0-1.0
}

Intent meanings:
- "menu_inquiry": User wants to know what's on the menu (e.g., "what's on the menu", "show me menu", "what categories do you have")
- "category_inquiry": User wants to know items in a specific category (e.g., "what do you have in beverages?", "what's in lunch?", "show me soft drinks")
- "item_inquiry": User wants details about a specific item (ingredients, spice level, price)
- "order_item": User wants to add an item to their order (e.g., "I want vegetable samosa", "order butter chicken", "vegetable samosa")
- "provide_info": User is providing their name or phone number (e.g., "My name is John", "John Doe", "My number is 1234567890", "It's 555-1234")
- "confirm_order": User wants to confirm/place their order. ONLY use this if:
  * AI just asked "Is that correct?" or "correct?" AND user says "yes", "correct", "right", "sure", "okay", "yeah"
  * AI just asked "So your order is: [items]. Is that correct?" AND user says "yes"
  * User explicitly says "confirm order", "place order", "yes confirm"
  * DO NOT use for "No" when AI asks "Anything else?" - that's general_question
- "order_status": User wants to know their order ID or order status (e.g., "what's my order ID")
- "angry_complaint": User is angry, frustrated, or complaining (e.g., "this is terrible", "I'm so angry", "this is ridiculous", "I hate this")
- "general_question": General questions, "No" to "Anything else?", or other responses

CRITICAL RULES - ORDER FLOW:
1. When AI asks "Anything else?" and user says "No" → intent = general_question (AI should summarize order)
2. When AI asks "Is that correct?" or "So your order is: [items]. Is that correct?" and user says "Yes" → intent = confirm_order (create order)
3. When AI asks "Anything else?" and user says "Yes" → intent = order_item (they want to add more)
4. "No" when AI asks "correct?" = confirm_order (means "No changes, confirm it")

User message: "${query}"

Recent conversation context:
${conversationHistory.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n')}

Return ONLY valid JSON, no other text.`;

    const messages = [
      { role: 'system', content: intentPrompt },
      ...conversationHistory.slice(-3), // Last 3 messages for context
      { role: 'user', content: query }
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: messages,
      temperature: 0.3,
      max_tokens: 100,
      response_format: { type: 'json_object' }
    });

    const intentData = JSON.parse(completion.choices[0].message.content);
    return intentData.intent || 'general_question';
  } catch (error) {
    console.error('Intent detection error:', error);
    return 'general_question';
  }
}

// AI Agent function to handle customer queries
async function handleCustomerQuery(query, conversationHistory = []) {
  try {
    const menuItems = await getMenuContext();
    const formattedMenu = formatMenuForAI(menuItems);
    const categories = await getMenuCategories();
    const categoriesText = formatCategoriesForAI(categories);

    const systemPrompt = `You are a friendly, empathetic restaurant staff member taking phone orders. Be natural, concise, and human-like. ALWAYS listen and respond to interruptions - if customer speaks while you're explaining, STOP and address what they said.

CRITICAL RULES - HANDLING ANGRY/FRUSTRATED CUSTOMERS:
- If customer sounds angry, frustrated, or upset, respond with empathy FIRST
- Say things like: "I completely understand your frustration. Don't worry, I'm here to help and I'll take care of this for you."
- Acknowledge their feelings: "I'm sorry you're experiencing this. Let me help resolve this right away."
- Be patient, calm, and solution-oriented
- NEVER get defensive or dismissive
- After acknowledging, ask: "What can I do to make this right for you?"

CRITICAL RULES - INTERRUPTIONS:
- If customer interrupts you while you're speaking, IMMEDIATELY stop and listen
- Respond to what they just said, not what you were saying
- Example: If you're listing menu items and they say "I want a burger", STOP listing and say "Got it, one burger. Anything else?"
- Always prioritize customer's current input over your ongoing explanation

CRITICAL RULES - MENU INQUIRIES:
- When asked "What's on the menu?" or "What do you have?", list CATEGORIES only: "We have [list categories]. Which category would you like to see?"
- When asked about a specific category (e.g., "What do you have in beverages?"), list items in THAT category only
- Keep category lists SHORT - mention 3-4 items max, then ask if they want to see more
- Add natural pauses between items: "We have burgers... [pause]... pizza... [pause]... and fries." 

CRITICAL RULES - ORDER FLOW:
1. When customer says "I want to order X" or "I want X" → This is ADDING to their order (cart), NOT confirming. Say: "Got it, [item]. Anything else?"
2. When customer says "No" to "Anything else?" → Summarize their FULL order and ask: "So your order is: [list all items]. Is that correct?"
3. When customer says "Yes" to "Is that correct?" → This is confirmation. DO NOT say "order confirmed" yet - the system will handle that.
4. NEVER say "order confirmed" or give an order ID unless you are explicitly told the order was saved to the database.
5. Track ALL items mentioned throughout the conversation - they're building their order.

CONVERSATION FLOW:
- Customer orders item → "Got it, [item]. Anything else?"
- Customer says "No" (nothing else) → "So your order is: [list all items with quantities]. Is that correct?"
- Customer says "Yes" (to confirmation) → "Perfect! Let me process your order..." (system will confirm)

OTHER RULES:
- Speak naturally - like a real person, not a robot reading a list
- Keep responses SHORT and conversational (2-3 sentences max)
- Add natural pauses in your speech (use "..." to indicate pauses)
- If customer asks for order ID before order is placed, say: "Your order hasn't been confirmed yet. Would you like to confirm your order?"

Available Categories:
${categoriesText}

Menu Items (by category):
${JSON.stringify(formattedMenu.reduce((acc, item) => {
  if (!acc[item.category]) acc[item.category] = [];
  acc[item.category].push(item);
  return acc;
}, {}), null, 2)}

Spice Level Guide:
- 0: No spice
- 1: Mild  
- 2: Medium
- 3: Medium-Hot
- 4: Hot
- 5: Very Hot

Example responses (vary phrasing naturally):
- "What's on the menu?" → "We have Main Course, Appetizers, Beverages, Desserts, and Bread. Which category would you like to see?" OR "Okay, we've got Main Course, Appetizers, Beverages, Desserts, and Bread. What interests you?"
- "What do you have in beverages?" → "In beverages, we have Cola, Lemonade, Iced Tea, and Coffee. Would you like to order any of these?" OR "Right—we've got Cola, Lemonade, Iced Tea, and Coffee. Which one sounds good?"
- "This is terrible!" → "I completely understand your frustration. Don't worry, I'm here to help. What can I do to make this right for you?"
- "I want a burger" (while you're listing menu) → "Got it, one burger. Anything else?" (STOP listing, respond immediately)
- "I want a burger" → "Okay, one burger. Anything else?" OR "Got it, one burger. What else can I get you?"
- "No" (to "Anything else?") → "So your order is: one burger. Is that correct?" OR "Right—so that's one burger. Sound good?"
- "Yes" (to confirmation) → "Perfect! Let me process your order..." (DO NOT say confirmed yet - system handles it)

Remember: Use contractions, vary phrasing, keep it natural and conversational. Ordering items = adding to cart, only "Yes" to confirmation = place order.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: query }
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: messages,
      temperature: 0.8,
      max_tokens: 150  // Shorter responses for more natural conversation
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('AI Agent Error:', error);
    return "I'm sorry, I'm having trouble processing your request right now. Please try again later.";
  }
}

// Extract order from conversation
async function extractOrderFromConversation(conversationHistory) {
  try {
    const menuItems = await getMenuContext();
    const formattedMenu = formatMenuForAI(menuItems);

    // Clean conversation history - only keep role and content for extraction
    const cleanHistory = conversationHistory.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    const systemPrompt = `Extract order details from the ENTIRE conversation history. Look for ALL items mentioned throughout the conversation, including items confirmed by the assistant.

Return a JSON object with this structure:
{
  "items": [
    {
      "menu_item_name": "exact name from menu (match to available items below)",
      "quantity": number
    }
  ],
  "customer_name": "name if mentioned",
  "customer_phone": "phone if mentioned"
}

IMPORTANT RULES:
1. Look through the ENTIRE conversation for items mentioned by the USER or confirmed by the ASSISTANT
2. If assistant says "Got it, one Vegetable Samosa" or "one Vegetable Samosa", extract that item
3. Match item names to the exact menu item names below
4. Handle common typos:
   - "simosa" or "samos" = "Vegetable Samosa"
   - "biriyani" = "Chicken Biryani"
   - "butter chicken" = "Butter Chicken"
5. If customer said "vegetable samosa" or "samosa", use "Vegetable Samosa"
6. If quantity is not mentioned, default to 1
7. Use the EXACT menu item name from the list below
8. Look at assistant messages too - they often confirm items like "Got it, one Vegetable Samosa"

Available menu items:
${JSON.stringify(formattedMenu.map(item => ({ name: item.name })), null, 2)}

Example conversations:
- User: "I want vegetable samosa" → Extract: {"menu_item_name": "Vegetable Samosa", "quantity": 1}
- Assistant: "Got it, one Vegetable Samosa" → Extract: {"menu_item_name": "Vegetable Samosa", "quantity": 1}
- User: "I want 1 simosa" → Extract: {"menu_item_name": "Vegetable Samosa", "quantity": 1}

Return ONLY valid JSON, no other text.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...cleanHistory,
      { role: 'user', content: 'Extract the order details from our conversation. Return JSON with items array.' }
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: messages,
      temperature: 0.1, // Lower temperature for more consistent extraction
      max_tokens: 500,
      response_format: { type: 'json_object' }
    });

    const responseContent = completion.choices[0].message.content;
    console.log('📦 Raw extraction response:', responseContent);
    
    const orderData = JSON.parse(responseContent);
    console.log('📦 Parsed order data:', JSON.stringify(orderData, null, 2));
    
    // Map menu item names to IDs (with improved fuzzy matching)
    const itemsWithIds = [];
    for (const item of orderData.items || []) {
      const itemNameLower = item.menu_item_name.toLowerCase().trim();
      
      // Try exact match first
      let menuItem = menuItems.find(m => 
        m.name.toLowerCase() === itemNameLower
      );
      
      // Try partial match if exact match fails
      if (!menuItem) {
        menuItem = menuItems.find(m => 
          m.name.toLowerCase().includes(itemNameLower) || 
          itemNameLower.includes(m.name.toLowerCase())
        );
      }
      
      // Try matching key words (handles typos like "simosa" -> "samosa")
      if (!menuItem) {
        const itemWords = itemNameLower.split(/\s+/).filter(w => w.length > 2);
        menuItem = menuItems.find(m => {
          const menuWords = m.name.toLowerCase().split(/\s+/);
          // Check if key words match (handles typos)
          return itemWords.some(itemWord => {
            return menuWords.some(menuWord => {
              // Exact word match
              if (menuWord === itemWord) return true;
              // Similar word match (handles common typos)
              if (menuWord.includes(itemWord) || itemWord.includes(menuWord)) return true;
              // Handle common typos
              const typoMap = {
                'simosa': 'samosa',
                'samos': 'samosa',
                'samosa': 'samosa',
                'biryani': 'biryani',
                'biriyani': 'biryani',
                'butter': 'butter',
                'chicken': 'chicken',
                'paneer': 'paneer',
                'tikka': 'tikka'
              };
              const normalizedItem = typoMap[itemWord] || itemWord;
              const normalizedMenu = typoMap[menuWord] || menuWord;
              return normalizedItem === normalizedMenu || 
                     normalizedMenu.includes(normalizedItem) ||
                     normalizedItem.includes(normalizedMenu);
            });
          });
        });
      }
      
      // Try matching by removing common words and checking remaining words
      if (!menuItem) {
        const commonWords = ['vegetable', 'chicken', 'one', 'two', 'three', '1', '2', '3'];
        const itemWords = itemNameLower.split(/\s+/).filter(w => !commonWords.includes(w) && w.length > 2);
        menuItem = menuItems.find(m => {
          const menuWords = m.name.toLowerCase().split(/\s+/).filter(w => !commonWords.includes(w));
          return itemWords.length > 0 && itemWords.some(iw => 
            menuWords.some(mw => mw.includes(iw) || iw.includes(mw))
          );
        });
      }
      
      if (menuItem) {
        itemsWithIds.push({
          menu_item_id: menuItem.id,
          quantity: item.quantity || 1
        });
        console.log(`✅ Matched "${item.menu_item_name}" to "${menuItem.name}"`);
      } else {
        console.warn(`⚠️ Could not match menu item: "${item.menu_item_name}"`);
        console.warn(`Available items: ${menuItems.map(m => m.name).join(', ')}`);
      }
    }

    // If no items found, try fallback: extract from assistant confirmation messages
    if (itemsWithIds.length === 0) {
      console.log('🔄 No items found in AI extraction, trying fallback extraction from assistant messages...');
      
      // Prioritize the most recent assistant message (likely the summary)
      const assistantMessages = cleanHistory.filter(msg => msg.role === 'assistant').reverse();
      
      // Look for assistant messages that confirm items or summarize orders (most recent first)
      for (const msg of assistantMessages) {
        if (msg.role === 'assistant' && msg.content) {
          const content = msg.content;
          const contentLower = content.toLowerCase();
          
          // Pattern 1: "So your order is: [items]. Is that correct?"
          // More flexible pattern to catch variations
          const summaryPatterns = [
            /so your order is:?\s*(.+?)(?:\.|,|\?|is that correct|correct\?)/i,
            /your order is:?\s*(.+?)(?:\.|,|\?|is that correct|correct\?)/i,
            /order is:?\s*(.+?)(?:\.|,|\?|is that correct|correct\?)/i
          ];
          
          let orderSummary = null;
          for (const pattern of summaryPatterns) {
            const match = content.match(pattern);
            if (match) {
              orderSummary = match[1].trim();
              console.log(`🔍 Found order summary with pattern: "${orderSummary}"`);
              break;
            }
          }
          
          if (orderSummary) {
            // Clean up the summary - remove trailing punctuation
            orderSummary = orderSummary.replace(/[\.\?\!]+$/, '').trim();
            console.log(`🔍 Cleaned order summary: "${orderSummary}"`);
            
            // Parse items from summary (e.g., "one Vegetable Samosa, two Butter Chicken")
            // Try multiple patterns to catch different formats
            const itemPatterns = [
              // Pattern: "one Vegetable Samosa" or "1 Vegetable Samosa"
              /(?:one|1)\s+([^,\.!?]+?)(?:\s*[,\.]|\s*$|$)/gi,
              /(?:two|2)\s+([^,\.!?]+?)(?:\s*[,\.]|\s*$|$)/gi,
              /(?:three|3)\s+([^,\.!?]+?)(?:\s*[,\.]|\s*$|$)/gi,
              /(?:four|4)\s+([^,\.!?]+?)(?:\s*[,\.]|\s*$|$)/gi,
              /(?:five|5)\s+([^,\.!?]+?)(?:\s*[,\.]|\s*$|$)/gi,
              // Pattern: numeric quantity "2 Vegetable Samosa"
              /(\d+)\s+([^,\.!?]+?)(?:\s*[,\.]|\s*$|$)/gi
            ];
            
            const foundItems = [];
            
            for (const pattern of itemPatterns) {
              let match;
              // Reset regex lastIndex
              pattern.lastIndex = 0;
              while ((match = pattern.exec(orderSummary)) !== null) {
                let quantity = 1;
                let itemName = '';
                
                if (match[2]) {
                  // Pattern with number: "2 Vegetable Samosa"
                  quantity = parseInt(match[1]) || 1;
                  itemName = match[2].trim();
                } else {
                  // Pattern with word: "one Vegetable Samosa"
                  const fullMatch = match[0].toLowerCase();
                  if (fullMatch.includes('two') || fullMatch.includes('2')) quantity = 2;
                  else if (fullMatch.includes('three') || fullMatch.includes('3')) quantity = 3;
                  else if (fullMatch.includes('four') || fullMatch.includes('4')) quantity = 4;
                  else if (fullMatch.includes('five') || fullMatch.includes('5')) quantity = 5;
                  
                  itemName = match[1].trim();
                }
                
                // Clean item name
                itemName = itemName.replace(/[\.\?\!]+$/, '').trim();
                
                if (itemName) {
                  foundItems.push({ itemName, quantity });
                  console.log(`🔍 Extracted from summary: "${itemName}" (qty: ${quantity})`);
                }
              }
            }
            
            // Try to match extracted items to menu items
            for (const { itemName, quantity } of foundItems) {
              let matched = false;
              
              for (const menuItem of menuItems) {
                const menuNameLower = menuItem.name.toLowerCase();
                const itemNameLower = itemName.toLowerCase();
                
                // Check multiple matching strategies
                const matches = 
                  menuNameLower === itemNameLower || // Exact match
                  menuNameLower.includes(itemNameLower) || // Menu contains item
                  itemNameLower.includes(menuNameLower) || // Item contains menu
                  // Word-by-word matching for "vegetable samosa" vs "Vegetable Samosa"
                  itemNameLower.split(/\s+/).every(word => 
                    word.length > 2 && menuNameLower.includes(word)
                  );
                
                if (matches) {
                  // Check if already added (avoid duplicates)
                  const alreadyAdded = itemsWithIds.some(item => item.menu_item_id === menuItem.id);
                  if (!alreadyAdded) {
                    itemsWithIds.push({
                      menu_item_id: menuItem.id,
                      quantity: quantity
                    });
                    console.log(`✅ Fallback matched "${itemName}" to "${menuItem.name}" (qty: ${quantity})`);
                    matched = true;
                    break;
                  }
                }
              }
              
              if (!matched) {
                console.warn(`⚠️ Could not match extracted item: "${itemName}"`);
                console.warn(`Available menu items: ${menuItems.map(m => m.name).join(', ')}`);
              }
            }
          }
          
          // Pattern 2: "Got it, one [item]" or "one [item]" (if summary pattern didn't match)
          if (itemsWithIds.length === 0) {
            const patterns = [
              /got it,?\s*(?:one|1|two|2|three|3|four|4|five|5)\s+([^.!?]+)/i,
              /(?:one|1|two|2|three|3|four|4|five|5)\s+([^.!?]+?)(?:\s|,|\.|$)/i
            ];
            
            for (const pattern of patterns) {
              const match = content.match(pattern);
              if (match) {
                const mentionedItem = match[1].trim();
                console.log(`🔍 Found mentioned item in assistant message: "${mentionedItem}"`);
                
                // Try to match this to a menu item
                for (const menuItem of menuItems) {
                  const menuNameLower = menuItem.name.toLowerCase();
                  const mentionedLower = mentionedItem.toLowerCase();
                  
                  // Check if menu item name contains the mentioned item or vice versa
                  if (menuNameLower.includes(mentionedLower) || mentionedLower.includes(menuNameLower)) {
                    // Extract quantity if mentioned
                    const qtyMatch = content.match(/(?:one|1|two|2|three|3|four|4|five|5)/i);
                    let quantity = 1;
                    if (qtyMatch) {
                      const qtyText = qtyMatch[0].toLowerCase();
                      if (qtyText.includes('two') || qtyText === '2') quantity = 2;
                      else if (qtyText.includes('three') || qtyText === '3') quantity = 3;
                      else if (qtyText.includes('four') || qtyText === '4') quantity = 4;
                      else if (qtyText.includes('five') || qtyText === '5') quantity = 5;
                    }
                    
                    itemsWithIds.push({
                      menu_item_id: menuItem.id,
                      quantity: quantity
                    });
                    console.log(`✅ Fallback matched "${mentionedItem}" to "${menuItem.name}" (qty: ${quantity})`);
                    break; // Found a match, move to next message
                  }
                }
              }
            }
          }
        }
      }
    }

    // Last resort: Direct string matching from summary message
    if (itemsWithIds.length === 0) {
      console.log('🔄 Last resort: Trying direct string matching from summary...');
      
      // Find the most recent assistant message with "So your order is"
      const summaryMessage = assistantMessages.find(msg => 
        msg.content && msg.content.toLowerCase().includes('so your order is')
      );
      
      if (summaryMessage) {
        console.log(`🔍 Found summary message: "${summaryMessage.content}"`);
        
        // Direct matching: look for menu item names in the summary
        for (const menuItem of menuItems) {
          const menuNameLower = menuItem.name.toLowerCase();
          const summaryLower = summaryMessage.content.toLowerCase();
          
          // Check if menu item name appears in summary
          if (summaryLower.includes(menuNameLower)) {
            // Try to extract quantity
            let quantity = 1;
            const qtyPattern = new RegExp(`(?:one|1|two|2|three|3|four|4|five|5|\\d+)\\s+${menuNameLower.replace(/\s+/g, '\\s+')}`, 'i');
            const qtyMatch = summaryMessage.content.match(qtyPattern);
            
            if (qtyMatch) {
              const qtyText = qtyMatch[0].toLowerCase();
              if (qtyText.includes('two') || qtyText.match(/\b2\b/)) quantity = 2;
              else if (qtyText.includes('three') || qtyText.match(/\b3\b/)) quantity = 3;
              else if (qtyText.includes('four') || qtyText.match(/\b4\b/)) quantity = 4;
              else if (qtyText.includes('five') || qtyText.match(/\b5\b/)) quantity = 5;
              else {
                const numMatch = qtyText.match(/\b(\d+)\b/);
                if (numMatch) quantity = parseInt(numMatch[1]) || 1;
              }
            }
            
            itemsWithIds.push({
              menu_item_id: menuItem.id,
              quantity: quantity
            });
            console.log(`✅ Last resort matched "${menuItem.name}" (qty: ${quantity}) from summary`);
          }
        }
      }
    }

    if (itemsWithIds.length === 0) {
      console.error('❌ No items extracted after all attempts');
      console.error('📝 Conversation history:', JSON.stringify(cleanHistory, null, 2));
      console.error('📋 Available menu items:', menuItems.map(m => m.name).join(', '));
      return {
        items: [],
        customer_name: orderData?.customer_name || null,
        customer_phone: orderData?.customer_phone || null
      };
    }

    return {
      items: itemsWithIds,
      customer_name: orderData?.customer_name || null,
      customer_phone: orderData?.customer_phone || null
    };
  } catch (error) {
    console.error('Order Extraction Error:', error);
    console.error('Error stack:', error.stack);
    return null;
  }
}

module.exports = {
  handleCustomerQuery,
  extractOrderFromConversation,
  getMenuContext,
  detectIntent
};
