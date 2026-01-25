# Restaurant AI Agent - Customer Care Service

A comprehensive AI-powered customer care service for restaurants that allows customers to place orders via voice calls. The system includes an admin dashboard for restaurant staff to manage orders in real-time.

## Features

- 🤖 **AI Voice Agent**: Customers can call and interact with an AI agent to get menu information and place orders
- 📱 **Voice Ordering**: Place orders through phone calls using Twilio integration
- 🗄️ **Supabase Database**: All orders and menu items stored in Supabase
- 📊 **Admin Dashboard**: Real-time dashboard for restaurant staff to view and manage orders
- 🍽️ **Menu Management**: Complete menu with ingredients, spice levels, and prices
- 🔄 **Real-time Updates**: Dashboard automatically refreshes to show new orders

## Project Structure

```
Resturant AI/
├── server/                 # Backend API server
│   ├── config/            # Configuration files
│   ├── routes/            # API routes
│   ├── services/          # Business logic (AI agent)
│   └── index.js           # Server entry point
├── dashboard/             # Next.js admin dashboard
│   └── app/               # Next.js app directory
├── supabase/              # Database schema and seed data
│   ├── schema.sql         # Database schema
│   └── seed_data.sql      # Sample menu items
└── package.json           # Root package.json
```

## Setup Instructions

### 1. Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Supabase account
- Twilio account (for voice calls)
- OpenAI API key (for AI agent)

### 2. Install Dependencies

```bash
npm run install:all
```

### 3. Set Up Supabase

1. Create a new project in [Supabase](https://supabase.com)
2. Go to SQL Editor and run the schema file:
   - Copy and paste the contents of `supabase/schema.sql`
   - Execute the SQL
3. Run the seed data:
   - Copy and paste the contents of `supabase/seed_data.sql`
   - Execute the SQL

### 4. Configure Environment Variables

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Fill in your environment variables:
```env
# Supabase
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_key

# Twilio
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone_number

# OpenAI
OPENAI_API_KEY=your_openai_api_key

# Server
PORT=3001
```

3. Create `.env.local` in the `dashboard` folder:
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 5. Set Up Twilio Webhook

1. In your Twilio console, configure your phone number's webhook:
   - Voice URL: `https://your-domain.com/api/voice/incoming-call`
   - Status Callback: `https://your-domain.com/api/voice/status-callback`

2. For local development, use [ngrok](https://ngrok.com) to expose your local server:
```bash
ngrok http 3001
```
Then use the ngrok URL in your Twilio webhook configuration.

### 6. Run the Application

Start both the server and dashboard:
```bash
npm run dev
```

Or run them separately:
```bash
# Terminal 1 - Backend server
npm run dev:server

# Terminal 2 - Dashboard
npm run dev:dashboard
```

- Backend API: http://localhost:3001
- Admin Dashboard: http://localhost:3000

## API Endpoints

### Menu
- `GET /api/menu/items` - Get all menu items
- `GET /api/menu/items/:id` - Get menu item by ID
- `GET /api/menu/search?query=chicken` - Search menu items

### Orders
- `POST /api/orders/create` - Create a new order
- `GET /api/orders/all` - Get all orders
- `GET /api/orders/:id` - Get order by ID
- `GET /api/orders/order-id/:orderId` - Get order by order ID string
- `PATCH /api/orders/:id/status` - Update order status

### Voice
- `POST /api/voice/incoming-call` - Handle incoming Twilio call
- `POST /api/voice/handle-speech` - Process speech input

## Menu Items

The system comes pre-loaded with 12 sample menu items including:
- Butter Chicken
- Chicken Biryani
- Paneer Tikka
- Dal Makhani
- Chicken Vindaloo
- And more...

Each item includes:
- Name and description
- Ingredients list
- Spice level (0-5)
- Price
- Category

## Order Flow

1. Customer calls the Twilio phone number
2. AI agent greets and assists with menu queries
3. Customer places order through conversation
4. Order is created in Supabase with unique order ID
5. Order appears in admin dashboard in real-time
6. Restaurant staff can update order status

## Dashboard Features

- View all orders with unique order IDs
- Filter orders by status (pending, confirmed, preparing, ready, completed, cancelled)
- Update order status
- See customer details and order items
- Real-time updates (auto-refreshes every 5 seconds)

## Technologies Used

- **Backend**: Node.js, Express
- **Database**: Supabase (PostgreSQL)
- **Voice**: Twilio
- **AI**: OpenAI GPT-4
- **Frontend**: Next.js 14, React, TypeScript
- **Styling**: Tailwind CSS

## Development

### Adding New Menu Items

You can add menu items directly in Supabase or through the API:

```sql
INSERT INTO menu_items (name, description, ingredients, spice_level, price, category)
VALUES ('Dish Name', 'Description', ARRAY['Ingredient1', 'Ingredient2'], 2, 15.99, 'Main Course');
```

### Customizing the AI Agent

Modify the system prompt in `server/services/aiAgent.js` to change the AI's behavior and responses.

## License

ISC

## Support

For issues or questions, please check the documentation or contact support.
