# Quick Setup Guide

Follow these steps to get your Restaurant AI Agent up and running:

## Step 1: Install Dependencies

```bash
npm run install:all
```

This will install dependencies for both the backend server and the dashboard.

## Step 2: Set Up Supabase

1. **Create a Supabase Project**
   - Go to [supabase.com](https://supabase.com) and create a new project
   - Wait for the project to be fully provisioned

2. **Run the Database Schema**
   - In Supabase dashboard, go to SQL Editor
   - Open `supabase/schema.sql` and copy all its contents
   - Paste into SQL Editor and click "Run"
   - This creates the `menu_items`, `orders`, and `order_items` tables

3. **Add Sample Menu Items**
   - In SQL Editor, open `supabase/seed_data.sql` and copy all its contents
   - Paste into SQL Editor and click "Run"
   - This adds 12 sample menu items to your database

4. **Get Your Supabase Credentials**
   - Go to Project Settings > API
   - Copy the "Project URL" (this is your `SUPABASE_URL`)
   - Copy the "anon public" key (this is your `SUPABASE_ANON_KEY`)
   - Copy the "service_role" key (this is your `SUPABASE_SERVICE_KEY`)

## Step 3: Configure Environment Variables

1. **Backend Environment Variables**
   - Copy `env.example` to `.env` in the root directory
   - Fill in your Supabase credentials
   - Add your OpenAI API key (get from [platform.openai.com](https://platform.openai.com))
   - Add your Twilio credentials (see Step 4)

2. **Dashboard Environment Variables**
   - Create `.env.local` in the `dashboard` folder
   - Copy from `dashboard/.env.local.example` (if it exists) or create with:
   ```
   NEXT_PUBLIC_API_URL=http://localhost:3001
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

## Step 4: Set Up Twilio (Optional - for Voice Calls)

1. **Create a Twilio Account**
   - Sign up at [twilio.com](https://www.twilio.com)
   - Get a phone number with voice capabilities

2. **Get Twilio Credentials**
   - From Twilio Console, get:
     - Account SID
     - Auth Token
     - Your Twilio Phone Number

3. **Configure Webhooks**
   - For local development, use [ngrok](https://ngrok.com):
     ```bash
     ngrok http 3001
     ```
   - In Twilio Console, configure your phone number:
     - Voice URL: `https://your-ngrok-url.ngrok.io/api/voice/incoming-call`
     - Status Callback: `https://your-ngrok-url.ngrok.io/api/voice/status-callback`

4. **Add to .env**
   - Add your Twilio credentials to the `.env` file

## Step 5: Run the Application

```bash
npm run dev
```

This starts both:
- Backend API server on http://localhost:3001
- Admin Dashboard on http://localhost:3000

## Step 6: Test the System

1. **Test the API**
   - Visit http://localhost:3001/health to check if server is running
   - Visit http://localhost:3001/api/menu/items to see menu items

2. **Test the Dashboard**
   - Open http://localhost:3000 in your browser
   - You should see the admin dashboard (empty until orders are created)

3. **Test Order Creation** (via API)
   ```bash
   curl -X POST http://localhost:3001/api/orders/create \
     -H "Content-Type: application/json" \
     -d '{
       "customer_name": "Test Customer",
       "customer_phone": "+1234567890",
       "items": [
         {
           "menu_item_id": "YOUR_MENU_ITEM_ID",
           "quantity": 2
         }
       ]
     }'
   ```

4. **Test Voice Calls** (if Twilio is configured)
   - Call your Twilio phone number
   - The AI agent should greet you and help with your order

## Troubleshooting

### Database Connection Issues
- Verify your Supabase URL and keys are correct
- Check that the schema was run successfully
- Ensure your Supabase project is active

### Dashboard Not Loading
- Make sure the backend server is running on port 3001
- Check browser console for errors
- Verify `.env.local` in dashboard folder is configured

### Voice Calls Not Working
- Verify Twilio credentials in `.env`
- Check that ngrok is running and webhook URLs are correct
- Ensure your Twilio phone number has voice capabilities enabled

### AI Agent Not Responding
- Verify OpenAI API key is correct
- Check that you have credits in your OpenAI account
- Look at server logs for error messages

## Next Steps

- Customize menu items in Supabase
- Modify AI agent responses in `server/services/aiAgent.js`
- Customize dashboard styling in `dashboard/app/`
- Deploy to production (Vercel for dashboard, Railway/Render for backend)
