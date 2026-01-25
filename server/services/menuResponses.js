const { getMenuCategories, getMenuItemsByCategory } = require('./menuCategories');

/**
 * Generate instant, cached response for menu category inquiry
 * NO LLM CALL - uses database directly
 */
async function getMenuCategoriesResponse() {
  const categories = await getMenuCategories();
  
  if (categories.length === 0) {
    return "I'm sorry, but we don't have any items available right now.";
  }
  
  // Format categories for voice (short, clear, natural)
  const categoriesList = categories.join(', ');
  return `We have ${categoriesList}. Which category would you like to see?`;
}

/**
 * Generate instant, cached response for specific category inquiry
 * NO LLM CALL - uses database directly
 */
async function getCategoryItemsResponse(categoryName) {
  // Normalize category name (handle variations)
  const categoryMap = {
    'beverage': 'Beverages',
    'beverages': 'Beverages',
    'drink': 'Beverages',
    'drinks': 'Beverages',
    'soft drink': 'Beverages',
    'soft drinks': 'Beverages',
    'appetizer': 'Appetizers',
    'appetizers': 'Appetizers',
    'starter': 'Appetizers',
    'starters': 'Appetizers',
    'main course': 'Main Course',
    'main': 'Main Course',
    'mains': 'Main Course',
    'entree': 'Main Course',
    'entrees': 'Main Course',
    'dessert': 'Desserts',
    'desserts': 'Desserts',
    'bread': 'Bread',
    'breads': 'Bread',
    'side': 'Sides',
    'sides': 'Sides'
  };
  
  const normalizedCategory = categoryMap[categoryName.toLowerCase()] || categoryName;
  
  const items = await getMenuItemsByCategory(normalizedCategory);
  
  if (items.length === 0) {
    return `I don't see any items in ${normalizedCategory} right now. Would you like to see another category?`;
  }
  
  // Format items for voice (short, clear list)
  // Limit to 5-6 items max for voice (too many is overwhelming)
  const displayItems = items.slice(0, 6);
  const itemsList = displayItems.map(item => `${item.name}`).join(', ');
  
  const moreItems = items.length > 6 ? ` and ${items.length - 6} more` : '';
  
  return `In ${normalizedCategory}, we have ${itemsList}${moreItems}. Would you like to order any of these?`;
}

/**
 * Generate instant, cached response for full menu inquiry
 * NO LLM CALL - uses database directly
 */
async function getFullMenuResponse() {
  const categories = await getMenuCategories();
  
  if (categories.length === 0) {
    return "I'm sorry, but we don't have any items available right now.";
  }
  
  // For full menu, just list categories (don't list all items - too long for voice)
  const categoriesList = categories.join(', ');
  return `We serve ${categoriesList}. Which category would you like to explore?`;
}

/**
 * Check if a query is asking about menu/categories (lightweight check)
 * Returns category name if found, null otherwise
 */
function extractCategoryFromQuery(query) {
  const categoryPatterns = {
    'beverages': /(?:what|show|tell|have|do you have).*(?:in|for|under|with).*(?:beverages?|drinks?|soft drinks?)/i,
    'appetizers': /(?:what|show|tell|have|do you have).*(?:in|for|under|with).*(?:appetizers?|starters?)/i,
    'main course': /(?:what|show|tell|have|do you have).*(?:in|for|under|with).*(?:main course|mains?|entrees?)/i,
    'desserts': /(?:what|show|tell|have|do you have).*(?:in|for|under|with).*(?:desserts?)/i,
    'bread': /(?:what|show|tell|have|do you have).*(?:in|for|under|with).*(?:bread|breads?)/i
  };
  
  for (const [category, pattern] of Object.entries(categoryPatterns)) {
    if (pattern.test(query)) {
      return category;
    }
  }
  
  return null;
}

module.exports = {
  getMenuCategoriesResponse,
  getCategoryItemsResponse,
  getFullMenuResponse,
  extractCategoryFromQuery
};
