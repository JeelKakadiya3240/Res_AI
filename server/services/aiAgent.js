const OpenAI = require('openai');
const supabase = require('../config/supabase');
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

// AI Agent function to handle customer queries
async function handleCustomerQuery(query, conversationHistory = []) {
  try {
    const menuItems = await getMenuContext();
    const formattedMenu = formatMenuForAI(menuItems);

    const systemPrompt = `You are a friendly restaurant staff member taking phone orders. Be natural, concise, and human-like. 

IMPORTANT RULES:
1. When asked about the menu, mention 3-4 popular items briefly, then ask what they'd like. DON'T list all items.
2. Speak naturally - like a real person, not a robot reading a list.
3. Keep responses SHORT and conversational (2-3 sentences max).
4. When customer mentions an item, confirm it and ask if they want anything else.
5. When customer says they don't want anything else, ask: "Just to confirm, you want to place the order for [items], correct?" 
6. DO NOT say the order is confirmed or give an order ID until the customer says "yes" to your confirmation question.
7. Wait for explicit confirmation before saying the order is placed.

Menu Items:
${JSON.stringify(formattedMenu, null, 2)}

Spice Level Guide:
- 0: No spice
- 1: Mild  
- 2: Medium
- 3: Medium-Hot
- 4: Hot
- 5: Very Hot

Example responses:
- "What's on the menu?" → "We have Butter Chicken, Chicken Biryani, Paneer Tikka, and Dal Makhani. What would you like?"
- "I want vegetable samosa" → "Got it, one Vegetable Samosa. Anything else?"
- "Confirm order" → "Perfect! Your order is confirmed. Your order ID is..."

Be friendly, brief, and natural.`;

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

    const systemPrompt = `Extract order details from the ENTIRE conversation history. Look for ALL items mentioned throughout the conversation, not just the last message.

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
1. Look through the ENTIRE conversation for items mentioned
2. Match item names to the exact menu item names below
3. Handle common typos:
   - "simosa" or "samos" = "Vegetable Samosa"
   - "biriyani" = "Chicken Biryani"
   - "butter chicken" = "Butter Chicken"
4. If customer said "vegetable samosa" or "samosa", use "Vegetable Samosa"
5. If quantity is not mentioned, default to 1
6. Use the EXACT menu item name from the list below

Available menu items:
${JSON.stringify(formattedMenu.map(item => ({ name: item.name })), null, 2)}

Example: If conversation mentions "I want vegetable samosa" earlier, extract it even if the last message is just "confirm order".

Return ONLY valid JSON, no other text.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: 'Extract the order details from our conversation.' }
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: messages,
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: 'json_object' }
    });

    const orderData = JSON.parse(completion.choices[0].message.content);
    
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

    return {
      items: itemsWithIds,
      customer_name: orderData.customer_name || null,
      customer_phone: orderData.customer_phone || null
    };
  } catch (error) {
    console.error('Order Extraction Error:', error);
    return null;
  }
}

module.exports = {
  handleCustomerQuery,
  extractOrderFromConversation,
  getMenuContext
};
