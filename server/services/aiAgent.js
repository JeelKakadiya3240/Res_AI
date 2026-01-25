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

    const systemPrompt = `You are a friendly AI assistant for a restaurant. Your role is to:
1. Provide information about menu items, their ingredients, spice levels (0-5), and prices
2. Help customers understand what dishes are available
3. Assist with order placement
4. Answer questions about the restaurant's offerings

Menu Items:
${JSON.stringify(formattedMenu, null, 2)}

Spice Level Guide:
- 0: No spice
- 1: Mild
- 2: Medium
- 3: Medium-Hot
- 4: Hot
- 5: Very Hot

Be conversational, helpful, and accurate. If asked about ordering, guide them through the process.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: query }
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: messages,
      temperature: 0.7,
      max_tokens: 500
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

    const systemPrompt = `Extract order details from the conversation. Return a JSON object with this structure:
{
  "items": [
    {
      "menu_item_name": "exact name from menu",
      "quantity": number
    }
  ],
  "customer_name": "name if mentioned",
  "customer_phone": "phone if mentioned"
}

Available menu items:
${JSON.stringify(formattedMenu.map(item => ({ name: item.name })), null, 2)}

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
    
    // Map menu item names to IDs
    const itemsWithIds = [];
    for (const item of orderData.items || []) {
      const menuItem = menuItems.find(m => 
        m.name.toLowerCase() === item.menu_item_name.toLowerCase()
      );
      if (menuItem) {
        itemsWithIds.push({
          menu_item_id: menuItem.id,
          quantity: item.quantity || 1
        });
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
