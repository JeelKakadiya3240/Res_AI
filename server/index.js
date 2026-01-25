const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
const menuRoutes = require('./routes/menu');
const orderRoutes = require('./routes/orders');
const voiceRoutes = require('./routes/voice');
const conversationRoutes = require('./routes/conversations');

app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/voice', voiceRoutes);
app.use('/api/conversations', conversationRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Restaurant AI Agent API is running' });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Restaurant AI Agent API',
    endpoints: {
      menu: '/api/menu',
      orders: '/api/orders',
      voice: '/api/voice',
      conversations: '/api/conversations'
    }
  });
});

// Export for Vercel serverless
module.exports = app;

// Only listen if not in Vercel environment
if (process.env.VERCEL !== '1' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📱 Health check: http://localhost:${PORT}/health`);
  });
}
