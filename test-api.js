/**
 * Simple test script to verify API endpoints
 * Run with: node test-api.js
 */

const API_URL = process.env.API_URL || 'http://localhost:3001';

async function testAPI() {
  console.log('🧪 Testing Restaurant AI Agent API...\n');

  // Test 1: Health Check
  try {
    console.log('1. Testing health endpoint...');
    const healthRes = await fetch(`${API_URL}/health`);
    const healthData = await healthRes.json();
    console.log('✅ Health check:', healthData);
  } catch (error) {
    console.log('❌ Health check failed:', error.message);
    return;
  }

  // Test 2: Get Menu Items
  try {
    console.log('\n2. Testing menu items endpoint...');
    const menuRes = await fetch(`${API_URL}/api/menu/items`);
    const menuData = await menuRes.json();
    if (menuData.success) {
      console.log(`✅ Found ${menuData.data.length} menu items`);
      if (menuData.data.length > 0) {
        console.log(`   Sample: ${menuData.data[0].name} - $${menuData.data[0].price}`);
      }
    } else {
      console.log('❌ Failed to fetch menu items:', menuData.error);
    }
  } catch (error) {
    console.log('❌ Menu items test failed:', error.message);
  }

  // Test 3: Get Orders
  try {
    console.log('\n3. Testing orders endpoint...');
    const ordersRes = await fetch(`${API_URL}/api/orders/all`);
    const ordersData = await ordersRes.json();
    if (ordersData.success) {
      console.log(`✅ Found ${ordersData.data.length} orders`);
    } else {
      console.log('❌ Failed to fetch orders:', ordersData.error);
    }
  } catch (error) {
    console.log('❌ Orders test failed:', error.message);
  }

  // Test 4: Create Test Order (if menu items exist)
  try {
    console.log('\n4. Testing order creation...');
    const menuRes = await fetch(`${API_URL}/api/menu/items`);
    const menuData = await menuRes.json();
    
    if (menuData.success && menuData.data.length > 0) {
      const testOrder = {
        customer_name: 'Test Customer',
        customer_phone: '+1234567890',
        items: [
          {
            menu_item_id: menuData.data[0].id,
            quantity: 1
          }
        ]
      };

      const orderRes = await fetch(`${API_URL}/api/orders/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testOrder),
      });

      const orderData = await orderRes.json();
      if (orderData.success) {
        console.log(`✅ Test order created: ${orderData.data.order_id}`);
        console.log(`   Total: $${orderData.data.total_amount}`);
      } else {
        console.log('❌ Failed to create order:', orderData.error);
      }
    } else {
      console.log('⚠️  Skipping order creation test (no menu items found)');
    }
  } catch (error) {
    console.log('❌ Order creation test failed:', error.message);
  }

  console.log('\n✨ API testing complete!');
}

// Run tests
testAPI().catch(console.error);
