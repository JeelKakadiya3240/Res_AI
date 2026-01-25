const supabase = require('../config/supabase');

/**
 * Get all unique categories from menu
 */
async function getMenuCategories() {
  const { data, error } = await supabase
    .from('menu_items')
    .select('category')
    .eq('is_available', true);

  if (error) {
    console.error('Error fetching categories:', error);
    return [];
  }

  // Get unique categories
  const categories = [...new Set(data.map(item => item.category))];
  return categories;
}

/**
 * Get menu items by category
 */
async function getMenuItemsByCategory(category) {
  const { data, error } = await supabase
    .from('menu_items')
    .select('name, description, price, category')
    .eq('is_available', true)
    .eq('category', category);

  if (error) {
    console.error('Error fetching menu items by category:', error);
    return [];
  }

  return data || [];
}

/**
 * Format categories for AI response
 */
function formatCategoriesForAI(categories) {
  return categories.join(', ');
}

/**
 * Format menu items by category for AI
 */
function formatMenuByCategoryForAI(items) {
  if (items.length === 0) return 'No items found in this category.';
  
  return items.map(item => 
    `${item.name} - $${item.price}`
  ).join(', ');
}

module.exports = {
  getMenuCategories,
  getMenuItemsByCategory,
  formatCategoriesForAI,
  formatMenuByCategoryForAI
};
