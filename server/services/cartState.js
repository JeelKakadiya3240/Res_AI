/**
 * Cart State Management
 * Stores canonical menu IDs and manages order state
 */

// In-memory cart storage (in production, use Redis or database)
const carts = new Map();

/**
 * Cart state structure:
 * {
 *   items: [
 *     {
 *       raw_text: "simosa",
 *       normalized_text: "samosa",
 *       matched_menu_id: "uuid",
 *       menu_name: "Vegetable Samosa",
 *       quantity: 1,
 *       price: 4.99,
 *       match_confidence: 0.92,
 *       matched_at: "2026-01-24T08:12:34Z"
 *     }
 *   ],
 *   status: "ADDING_ITEMS" | "AWAITING_MORE" | "CONFIRMATION" | "PLACING_ORDER",
 *   created_at: "2026-01-24T08:12:34Z",
 *   updated_at: "2026-01-24T08:12:34Z"
 * }
 */

const CartStatus = {
  EMPTY: 'EMPTY',
  ADDING_ITEMS: 'ADDING_ITEMS',
  AWAITING_MORE: 'AWAITING_MORE',
  CONFIRMATION: 'CONFIRMATION',
  PLACING_ORDER: 'PLACING_ORDER'
};

/**
 * Get or create cart for a call
 */
function getCart(callSid) {
  if (!carts.has(callSid)) {
    carts.set(callSid, {
      items: [],
      status: CartStatus.EMPTY,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }
  return carts.get(callSid);
}

/**
 * Add item to cart (with validated menu ID)
 */
function addItemToCart(callSid, itemData) {
  const cart = getCart(callSid);
  
  const cartItem = {
    raw_text: itemData.raw_text,
    normalized_text: itemData.normalized_text || itemData.raw_text,
    matched_menu_id: itemData.menu_id,
    menu_name: itemData.menu_name,
    quantity: itemData.quantity || 1,
    price: itemData.price,
    match_confidence: itemData.match_confidence || 1.0,
    matched_at: new Date().toISOString()
  };
  
  cart.items.push(cartItem);
  cart.status = CartStatus.ADDING_ITEMS;
  cart.updated_at = new Date().toISOString();
  
  console.log(`🛒 Added to cart: ${cartItem.quantity}x ${cartItem.menu_name} (ID: ${cartItem.matched_menu_id})`);
  
  return cart;
}

/**
 * Get cart summary (for confirmation message)
 */
function getCartSummary(callSid) {
  const cart = getCart(callSid);
  
  if (cart.items.length === 0) {
    return null;
  }
  
  const items = cart.items.map(item => 
    `${item.quantity} ${item.menu_name}`
  ).join(', ');
  
  const total = cart.items.reduce((sum, item) => 
    sum + (parseFloat(item.price) * item.quantity), 0
  );
  
  return {
    items_text: items,
    items: cart.items,
    total: total.toFixed(2),
    item_count: cart.items.length
  };
}

/**
 * Update cart status
 */
function updateCartStatus(callSid, status) {
  const cart = getCart(callSid);
  cart.status = status;
  cart.updated_at = new Date().toISOString();
  console.log(`📊 Cart status updated: ${callSid} → ${status}`);
  return cart;
}

/**
 * Clear cart
 */
function clearCart(callSid) {
  carts.delete(callSid);
  console.log(`🗑️ Cart cleared: ${callSid}`);
}

/**
 * Get cart items with menu IDs (for order placement)
 */
function getCartItemsForOrder(callSid) {
  const cart = getCart(callSid);
  return cart.items.map(item => ({
    menu_item_id: item.matched_menu_id,
    quantity: item.quantity,
    price: item.price,
    menu_name: item.menu_name
  }));
}

/**
 * Validate all items in cart (for final placement)
 */
async function validateCartItems(callSid, validateMenuItemById) {
  const cart = getCart(callSid);
  const validationResults = [];
  
  for (const item of cart.items) {
    const validation = await validateMenuItemById(item.matched_menu_id);
    validationResults.push({
      item: item,
      validation: validation
    });
  }
  
  return validationResults;
}

module.exports = {
  getCart,
  addItemToCart,
  getCartSummary,
  updateCartStatus,
  clearCart,
  getCartItemsForOrder,
  validateCartItems,
  CartStatus
};
