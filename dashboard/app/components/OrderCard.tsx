'use client';

import { format } from 'date-fns';
import { useState } from 'react';

interface OrderCardProps {
  order: {
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
  };
  onStatusUpdate: (orderId: string, newStatus: string) => void;
}

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  preparing: 'bg-purple-100 text-purple-800',
  ready: 'bg-green-100 text-green-800',
  completed: 'bg-gray-100 text-gray-800',
  cancelled: 'bg-red-100 text-red-800',
};

const statusOptions = ['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'];

export default function OrderCard({ order, onStatusUpdate }: OrderCardProps) {
  const [isUpdating, setIsUpdating] = useState(false);

  const handleStatusChange = async (newStatus: string) => {
    setIsUpdating(true);
    await onStatusUpdate(order.id, newStatus);
    setIsUpdating(false);
  };

  const getOrderItems = () => {
    if (order.order_items && order.order_items.length > 0) {
      return order.order_items;
    }
    // Fallback to items if order_items not available
    if (Array.isArray(order.items)) {
      return order.items;
    }
    return [];
  };

  const items = getOrderItems();

  return (
    <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Order #{order.order_id}</h3>
          <p className="text-sm text-gray-500 mt-1">
            {format(new Date(order.order_date), 'MMM dd, yyyy HH:mm')}
          </p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[order.status as keyof typeof statusColors] || statusColors.pending}`}>
          {order.status.toUpperCase()}
        </span>
      </div>

      <div className="mb-4">
        <p className="text-sm text-gray-600">
          <span className="font-medium">Customer:</span> {order.customer_name}
        </p>
        {order.customer_phone && (
          <p className="text-sm text-gray-600 mt-1">
            <span className="font-medium">Phone:</span> {order.customer_phone}
          </p>
        )}
      </div>

      <div className="mb-4 border-t pt-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Items:</h4>
        <ul className="space-y-2">
          {items.map((item: any, index: number) => (
            <li key={item.id || index} className="text-sm text-gray-600">
              <div className="flex justify-between">
                <span>
                  {item.menu_items?.name || item.name || 'Unknown Item'} 
                  <span className="text-gray-400 ml-2">x{item.quantity}</span>
                </span>
                <span className="font-medium">
                  ${(parseFloat(item.price || '0') * item.quantity).toFixed(2)}
                </span>
              </div>
              {item.special_instructions && (
                <p className="text-xs text-gray-500 italic mt-1">
                  Note: {item.special_instructions}
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex justify-between items-center mb-4 pt-4 border-t">
        <span className="text-sm font-medium text-gray-700">Total:</span>
        <span className="text-lg font-bold text-primary-600">
          ${parseFloat(order.total_amount).toFixed(2)}
        </span>
      </div>

      <div className="mt-4">
        <label className="block text-xs font-medium text-gray-700 mb-2">
          Update Status:
        </label>
        <select
          value={order.status}
          onChange={(e) => handleStatusChange(e.target.value)}
          disabled={isUpdating}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
        >
          {statusOptions.map((status) => (
            <option key={status} value={status}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
