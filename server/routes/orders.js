const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');

// Create a new order
router.post('/create', async (req, res) => {
  try {
    const { customer_name, customer_phone, items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Items are required' });
    }

    // Calculate total amount
    let totalAmount = 0;
    const orderItems = [];

    for (const item of items) {
      const { data: menuItem, error: menuError } = await supabase
        .from('menu_items')
        .select('price, name')
        .eq('id', item.menu_item_id)
        .single();

      if (menuError || !menuItem) {
        return res.status(400).json({ success: false, error: `Menu item ${item.menu_item_id} not found` });
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

    // Generate unique order ID
    const orderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

    // Create order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_id: orderId,
        customer_name: customer_name || 'Guest',
        customer_phone: customer_phone || null,
        items: orderItems,
        total_amount: totalAmount.toFixed(2),
        status: 'pending'
      })
      .select()
      .single();

    if (orderError) throw orderError;

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

    if (itemsError) throw itemsError;

    res.json({ 
      success: true, 
      data: {
        ...order,
        order_items: orderItems
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all orders
router.get('/all', async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;
    
    let query = supabase
      .from('orders')
      .select(`
        *,
        order_items (
          id,
          quantity,
          price,
          special_instructions,
          menu_items (
            name,
            description
          )
        )
      `)
      .order('order_date', { ascending: false })
      .limit(parseInt(limit));

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get order by ID
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (
          id,
          quantity,
          price,
          special_instructions,
          menu_items (
            id,
            name,
            description,
            ingredients,
            spice_level
          )
        )
      `)
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get order by order_id (string)
router.get('/order-id/:orderId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (
          id,
          quantity,
          price,
          special_instructions,
          menu_items (
            id,
            name,
            description,
            ingredients,
            spice_level
          )
        )
      `)
      .eq('order_id', req.params.orderId)
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update order status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const { data, error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
