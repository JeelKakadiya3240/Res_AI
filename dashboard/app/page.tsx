'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import OrderCard from './components/OrderCard';
import StatusFilter from './components/StatusFilter';

interface Order {
  id: string;
  order_id: string;
  customer_name: string;
  customer_phone: string | null;
  items: any;
  total_amount: string;
  status: string;
  order_date: string;
  order_items?: Array<{
    id: string;
    quantity: number;
    price: string;
    special_instructions: string | null;
    menu_items: {
      name: string;
      description: string;
    };
  }>;
}

export default function Home() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/orders/all`);
      const result = await response.json();
      
      if (result.success) {
        setOrders(result.data);
        setFilteredOrders(result.data);
      } else {
        setError(result.error || 'Failed to fetch orders');
      }
    } catch (err) {
      setError('Failed to connect to server');
      console.error('Error fetching orders:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    // Poll for new orders every 5 seconds
    const interval = setInterval(fetchOrders, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedStatus === 'all') {
      setFilteredOrders(orders);
    } else {
      setFilteredOrders(orders.filter(order => order.status === selectedStatus));
    }
  }, [selectedStatus, orders]);

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const response = await fetch(`${API_URL}/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });

      const result = await response.json();
      if (result.success) {
        fetchOrders(); // Refresh orders
      } else {
        alert('Failed to update order status');
      }
    } catch (err) {
      console.error('Error updating order status:', err);
      alert('Failed to update order status');
    }
  };

  if (loading && orders.length === 0) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading orders...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Restaurant Order Dashboard</h1>
              <p className="mt-1 text-sm text-gray-500">
                Manage and track all incoming orders
              </p>
            </div>
            <button
              onClick={fetchOrders}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <StatusFilter
          selectedStatus={selectedStatus}
          onStatusChange={setSelectedStatus}
        />

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {filteredOrders.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">No orders found</p>
            <p className="text-gray-400 text-sm mt-2">
              {selectedStatus !== 'all' ? 'Try selecting a different status filter' : 'Orders will appear here when customers place them'}
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onStatusUpdate={updateOrderStatus}
              />
            ))}
          </div>
        )}

        <div className="mt-8 text-center text-sm text-gray-500">
          Total Orders: {filteredOrders.length} | 
          Last updated: {format(new Date(), 'HH:mm:ss')}
        </div>
      </div>
    </main>
  );
}
