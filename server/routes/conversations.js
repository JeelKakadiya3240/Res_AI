const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

// Get all conversations
router.get('/all', async (req, res) => {
  try {
    const { limit = 50, offset = 0, order_id, customer_phone } = req.query;
    
    let query = supabase
      .from('conversations')
      .select(`
        *,
        conversation_messages (
          id,
          role,
          content,
          timestamp
        )
      `)
      .order('started_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (order_id) {
      query = query.eq('order_id', order_id);
    }

    if (customer_phone) {
      query = query.eq('customer_phone', customer_phone);
    }

    const { data, error } = await query;

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get conversation by call SID
router.get('/call/:callSid', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('conversations')
      .select(`
        *,
        conversation_messages (
          id,
          role,
          content,
          timestamp
        )
      `)
      .eq('call_sid', req.params.callSid)
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get conversation by order ID
router.get('/order/:orderId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('conversations')
      .select(`
        *,
        conversation_messages (
          id,
          role,
          content,
          timestamp
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

// Get conversations by customer phone
router.get('/customer/:phone', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('conversations')
      .select(`
        *,
        conversation_messages (
          id,
          role,
          content,
          timestamp
        )
      `)
      .eq('customer_phone', req.params.phone)
      .order('started_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
