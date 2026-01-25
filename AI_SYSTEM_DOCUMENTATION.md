# Restaurant AI System - Complete Documentation

## Table of Contents
1. [System Architecture Overview](#system-architecture-overview)
2. [AI Agent Core System](#ai-agent-core-system)
3. [Intent Detection System](#intent-detection-system)
4. [Menu Lookup & Matching](#menu-lookup--matching)
5. [Order Flow & State Management](#order-flow--state-management)
6. [Voice Processing Pipeline](#voice-processing-pipeline)
7. [API Endpoints](#api-endpoints)
8. [Database Schema](#database-schema)
9. [Conversation Flow Examples](#conversation-flow-examples)
10. [Performance Optimizations](#performance-optimizations)
11. [Error Handling & Edge Cases](#error-handling--edge-cases)

---

## System Architecture Overview

### High-Level Architecture

```
┌─────────────────┐
│   Customer      │
│   (Phone Call)   │
└────────┬─────────┘
         │
         ▼
┌─────────────────┐
│   Twilio        │
│   Voice API     │
└────────┬─────────┘
         │
         ▼
┌─────────────────────────────────────┐
│   Express Server (Node.js)          │
│   ┌───────────────────────────────┐ │
│   │  Voice Route Handler          │ │
│   │  - Speech Recognition         │ │
│   │  - Intent Detection           │ │
│   │  - State Management           │ │
│   └───────────────────────────────┘ │
│   ┌───────────────────────────────┐ │
│   │  AI Agent Service             │ │
│   │  - GPT-4 for Conversations    │ │
│   │  - GPT-3.5 for Intent         │ │
│   └───────────────────────────────┘ │
│   ┌───────────────────────────────┐ │
│   │  Menu Lookup Service           │ │
│   │  - Fuzzy Matching (Fuse.js)   │ │
│   │  - Synonym Handling            │ │
│   └───────────────────────────────┘ │
│   ┌───────────────────────────────┐ │
│   │  Cart State Service            │ │
│   │  - In-Memory Cart Storage      │ │
│   │  - State Machine               │ │
│   └───────────────────────────────┘ │
└────────┬─────────────────────────────┘
         │
         ▼
┌─────────────────┐
│   Supabase      │
│   (PostgreSQL)  │
│   - Menu Items  │
│   - Orders      │
│   - Conversations│
└─────────────────┘
```

### Technology Stack

- **Backend**: Node.js + Express
- **AI Models**: 
  - GPT-4 Turbo (conversations, order extraction)
  - GPT-3.5 Turbo (intent detection - faster)
- **Voice**: Twilio Voice API with Amazon Polly (SSML support)
- **Database**: Supabase (PostgreSQL)
- **Fuzzy Matching**: Fuse.js
- **State Management**: In-memory Map (production: Redis recommended)

---

## AI Agent Core System

### Location
`server/services/aiAgent.js`

### Main Functions

#### 1. `handleCustomerQuery(query, conversationHistory)`
**Purpose**: Generates natural, conversational responses to customer queries.

**How it works**:
1. Fetches menu context (cached for 5 minutes)
2. Formats menu items for AI context
3. Sends conversation history + current query to GPT-4 Turbo
4. Uses system prompt with specific persona ("Maya")
5. Post-processes response to remove duplicate phrases
6. Returns natural, conversational text

**System Prompt Key Features**:
- **Persona**: Single, consistent assistant named "Maya"
- **Tone**: Natural, conversational English with contractions
- **Response Length**: 1-3 sentences (max 120 tokens)
- **No Repetition**: Explicit rules to avoid duplicate phrases
- **Interruption Handling**: Prioritizes customer input over ongoing explanations
- **Angry Customer Handling**: Empathy-first responses
- **Order Flow Rules**: Clear state transitions

**Model Configuration**:
```javascript
{
  model: 'gpt-4-turbo-preview',
  temperature: 0.55,        // Balanced for natural but controlled
  max_tokens: 120,          // Short responses
  frequency_penalty: 0.8,   // Reduces repeated phrases
  top_p: 0.9
}
```

**Performance**: ~1700ms average response time

#### 2. `detectIntent(query, conversationHistory)`
**Purpose**: Classifies user intent to route to appropriate handler.

**How it works**:
1. Uses GPT-3.5 Turbo (faster than GPT-4 for classification)
2. Returns JSON with intent and confidence
3. Considers last 3 conversation messages for context

**Supported Intents**:
- `menu_inquiry` - "What's on the menu?"
- `category_inquiry` - "What do you have in beverages?"
- `item_inquiry` - "Do you have coffee?" or "What's in coffee?"
- `order_item` - "I want a burger"
- `confirm_order` - "Yes" to "Is that correct?"
- `provide_info` - "My name is John"
- `general_question` - "No" to "Anything else?"
- `order_status` - "What's my order ID?"
- `angry_complaint` - Customer is frustrated

**Model Configuration**:
```javascript
{
  model: 'gpt-3.5-turbo',  // Faster for classification
  temperature: 0.3,        // Lower for consistency
  max_tokens: 100,
  response_format: { type: 'json_object' }
}
```

**Performance**: ~200-400ms (4-5x faster than GPT-4)

#### 3. `extractOrderFromConversation(conversationHistory)`
**Purpose**: Extracts order details from entire conversation history.

**How it works**:
1. Uses GPT-4 Turbo to analyze full conversation
2. Extracts items, quantities, customer name/phone
3. Maps item names to menu IDs with fuzzy matching
4. Has fallback extraction from assistant confirmation messages
5. Handles typos and variations

**Fallback Strategies**:
1. **Primary**: GPT-4 extraction from conversation
2. **Fallback 1**: Parse assistant summary messages ("So your order is: ...")
3. **Fallback 2**: Extract from "Got it, one [item]" patterns
4. **Last Resort**: Direct string matching from summary

**Performance**: ~2000ms (only used when needed)

#### 4. `getMenuContext()`
**Purpose**: Fetches menu items with 5-minute caching.

**Cache Strategy**:
- Cache TTL: 5 minutes
- Cache key: `menuContextCache`
- Reduces database queries significantly

**Performance**: 
- Cache hit: <1ms
- Cache miss: ~50-100ms (database query)

---

## Intent Detection System

### Intent Classification Flow

```
User Speech
    │
    ▼
Transcription (Twilio)
    │
    ▼
detectIntent() [GPT-3.5]
    │
    ├─► menu_inquiry ──────────► Fast Path (no GPT-4)
    ├─► category_inquiry ───────► Category Lookup
    ├─► item_inquiry ──────────► Fast Path (menu lookup)
    ├─► order_item ─────────────► Menu Lookup → Add to Cart
    ├─► confirm_order ──────────► Order Creation Flow
    ├─► provide_info ──────────► Extract Name/Phone
    ├─► general_question ────────► GPT-4 Response
    ├─► order_status ───────────► Database Query
    └─► angry_complaint ────────► Empathy Response (GPT-4)
```

### Intent-Specific Handling

#### `menu_inquiry` - Fast Path
- **No GPT-4 call** - Direct category listing
- Fetches categories from cached menu
- Response: "We have Main Course, Appetizers, Beverages, Desserts, and Bread. Which category would you like to see?"
- **Performance**: ~50ms (vs 1700ms with GPT-4)

#### `item_inquiry` - Fast Path
- Uses menu lookup service
- Direct answer: "Yes, we have Coffee. It's $2.99. Would you like to order it?"
- Stores item info for potential order
- **Performance**: ~200ms (menu lookup)

#### `order_item` - Full Flow
1. Extract quantity and item name
2. Detect corrections ("No, just X")
3. Menu lookup with fuzzy matching
4. Add to cart if high confidence
5. Ask for clarification if ambiguous
6. Show menu if low confidence

#### `confirm_order` - State-Aware
- Checks cart status first
- If `CONFIRMATION` state: Creates order
- If other state: Collects info → Shows summary → Asks confirmation

---

## Menu Lookup & Matching

### Location
`server/services/menuLookup.js`

### Matching Algorithm

#### 1. Text Normalization
```javascript
normalizeText("Lemmon Ade") → "lemmon ade"
```
- Lowercase
- Remove punctuation
- Normalize whitespace

#### 2. Multi-Stage Matching

**Stage 1: Exact Matches** (Highest Priority)
- Case-insensitive exact match
- Full phrase containment ("burger" in "Cheeseburger")
- Word-by-word exact match

**Stage 2: Fuse.js Fuzzy Search**
- Threshold: 0.5 (lenient for typos)
- Searches normalized text
- Returns scored candidates

**Stage 3: Synonym Matching**
- Uses `MENU_SYNONYMS` dictionary
- Handles: "coke" → "cola", "fries" → "french fries"

**Stage 4: Direct Word Matching**
- Partial word matching ("lemmon" → "lemon" in "lemonade")
- Similarity score calculation

#### 3. Confidence Scoring

```javascript
Confidence = 1 - FuseScore  // Convert to 0-1 scale
```

**Confidence Thresholds**:
- `HIGH_THRESHOLD (0.85)`: Auto-accept → Add to cart
- `AMBIGUOUS_THRESHOLD (0.6)`: Ask clarification
- `LOW_THRESHOLD (<0.6)`: Show menu or ask

#### 4. Response Actions

**Auto-Match** (confidence ≥ 0.85):
```javascript
{
  success: true,
  action: 'auto_match',
  menu_id: "...",
  menu_name: "Lemonade",
  price: 2.99
}
```

**Ask Clarification** (0.6 ≤ confidence < 0.85):
```javascript
{
  success: false,
  action: 'ask_clarification',
  candidates: [top 3 matches]
}
// Response: "Did you mean Lemonade or Lemon Tea?"
```

**Show Menu** (confidence < 0.6):
```javascript
{
  success: false,
  action: 'show_menu',
  candidates: [top 5 matches]
}
// Response: "I couldn't find that. Did you mean X, Y, or Z? Or would you like to hear our menu?"
```

### Synonym Dictionary

Located in `menuLookup.js`:
- Handles common typos: "lemmon" → "lemonade"
- Handles variations: "coke" → "cola", "fries" → "french fries"
- American food items with common aliases

### Caching
- Menu items cached for 5 minutes
- Reduces database queries
- Cache key: `menuItemsCache`

---

## Order Flow & State Management

### Location
`server/services/cartState.js`

### State Machine

```
EMPTY
  │
  ▼ (customer orders item)
ADDING_ITEMS ──────► (customer says "No" to "Anything else?")
  │                      │
  │                      ▼
  │              COLLECTING_INFO ────► (name & phone collected)
  │                      │                  │
  │                      │                  ▼
  │                      │            CONFIRMATION ────► (customer says "Yes")
  │                      │                  │              │
  │                      │                  │              ▼
  │                      │                  │         PLACING_ORDER
  │                      │                  │              │
  │                      │                  │              ▼
  │                      └──────────────────┴─────────► Order Created
  │                                                      Cart Cleared
  │
  └──► (customer orders more) ────► ADDING_ITEMS (loop)
```

### Cart State Structure

```javascript
{
  items: [
    {
      raw_text: "lemmon ade",           // Original user input
      normalized_text: "lemonade",      // Normalized text
      matched_menu_id: "uuid",          // Menu item UUID
      menu_name: "Lemonade",            // Display name
      quantity: 1,                      // Quantity
      price: 2.99,                      // Price per item
      match_confidence: 0.92,           // Match confidence
      matched_at: "2026-01-24T08:12:34Z"
    }
  ],
  customer_name: "John Doe" | null,
  customer_phone: "+1234567890" | null,
  status: "ADDING_ITEMS",
  created_at: "2026-01-24T08:12:34Z",
  updated_at: "2026-01-24T08:12:34Z"
}
```

### State Transitions

#### ADDING_ITEMS
- **Trigger**: Customer orders item
- **Action**: Add item to cart
- **Response**: "Got it, [item]. Anything else?"
- **Next States**: 
  - `ADDING_ITEMS` (if more items)
  - `COLLECTING_INFO` (if "No" to "Anything else?")

#### COLLECTING_INFO
- **Trigger**: Customer says "No" to "Anything else?"
- **Action**: Ask for name, then phone
- **Response**: "Great! Before I confirm your order, may I have your name, please?"
- **Next States**:
  - `COLLECTING_INFO` (if info incomplete)
  - `CONFIRMATION` (if info complete)

#### CONFIRMATION
- **Trigger**: Customer info complete
- **Action**: Show order summary
- **Response**: "Perfect! So your order is: [items]. Is that correct?"
- **Next States**:
  - `PLACING_ORDER` (if "Yes")
  - `COLLECTING_INFO` (if correction needed)

#### PLACING_ORDER
- **Trigger**: Customer confirms order
- **Action**: 
  1. Validate all items
  2. Create order in database
  3. Generate order ID
  4. Clear cart
- **Response**: "Great! Your order has been confirmed. Your order ID is [ID]. The total amount is $[total]."

### Cart Operations

#### `addItemToCart(callSid, itemData)`
- Adds item with validated menu ID
- Updates status to `ADDING_ITEMS`
- Logs addition

#### `removeLastItemFromCart(callSid)`
- Removes last item (for corrections)
- Used when customer says "No, just X"

#### `getCartSummary(callSid)`
- Formats items for confirmation message
- Calculates total
- Returns: `{ items_text: "1 Burger, 2 Fries", total: "15.98", items: [...] }`

#### `setCustomerInfo(callSid, name, phone)`
- Updates customer name/phone
- Used during `COLLECTING_INFO` state

#### `getCartItemsForOrder(callSid)`
- Returns items formatted for order creation
- Includes menu_item_id, quantity, price

---

## Voice Processing Pipeline

### Location
`server/routes/voice.js`

### Endpoints

#### 1. `POST /api/voice/incoming-call`
**Purpose**: Handles incoming Twilio call

**Flow**:
1. Receives call from Twilio
2. Initializes conversation in memory
3. Saves conversation start to database (async)
4. Greets customer: "I am an AI assistant of the restaurant. Tell me what you would like to order."
5. Sets up speech recognition with `gather()`

**Twilio Configuration**:
```javascript
twiml.gather({
  input: 'speech',
  action: '/api/voice/handle-speech',
  method: 'POST',
  speechTimeout: 'auto',
  language: 'en-US',
  bargeIn: true,              // Allow interruption
  bargeInOnSpeech: true       // Detect speech and interrupt
});
```

#### 2. `POST /api/voice/handle-speech`
**Purpose**: Processes each speech input

**Complete Flow**:

```
1. Receive Speech Result
   │
   ▼
2. Save to Conversation History (memory + DB async)
   │
   ▼
3. Detect Intent (GPT-3.5) ──► ~200-400ms
   │
   ▼
4. Get Cart State
   │
   ▼
5. Route by Intent:
   │
   ├─► order_item ──────────► Menu Lookup → Add to Cart
   ├─► menu_inquiry ─────────► Fast Path (categories)
   ├─► item_inquiry ─────────► Fast Path (menu lookup)
   ├─► category_inquiry ─────► Category Items
   ├─► confirm_order ────────► Order Creation Flow
   ├─► provide_info ─────────► Extract & Store Info
   └─► general_question ─────► GPT-4 Response
   │
   ▼
6. Generate Response (if needed)
   │
   ▼
7. Format for Natural Speech (SSML)
   │
   ▼
8. Send TwiML Response
```

### Speech Formatting

#### Natural Speech Function
`formatNaturalSpeech(text)` converts text to SSML:

**Features**:
- Adds pauses after punctuation
- Uses `[[PAUSE_SHORT]]` tokens
- Wraps in prosody for slower rate (25% = 65% slower)
- Uses Amazon Polly voice (`polly.Joanna`)

**SSML Output**:
```xml
<speak>
  <prosody rate="25%">
    Got it, one burger. <break time="300ms"/> Anything else?
  </prosody>
</speak>
```

**Voice Configuration**:
- Voice: `polly.Joanna` (Amazon Polly, supports SSML)
- Language: `en-US`
- Rate: 25% (slower for clarity)

### Performance Tracking

The system tracks performance at each stage:

```javascript
timings = {
  request_received: Date.now(),
  transcription_received: null,
  db_operations: null,
  intent_detection: null,
  ai_response: null,
  total: null
}
```

**Typical Performance**:
- Request → Transcription: ~100-300ms (Twilio)
- Database operations: ~10-50ms
- Intent detection: ~200-400ms (GPT-3.5)
- AI response: ~1700ms (GPT-4) or ~50ms (fast path)
- **Total**: ~2000-2500ms (with GPT-4) or ~300-500ms (fast path)

### Conversation Storage

#### In-Memory (Primary)
- `conversations` Map: `callSid → message[]`
- Fast access during call
- Cleared after order completion

#### Database (Persistent)
- `conversations` table: Call metadata
- `conversation_messages` table: Individual messages
- Saved asynchronously (non-blocking)
- Used for analytics and history

### Database Schema (Conversations)

```sql
conversations:
  - id (UUID)
  - call_sid (VARCHAR) - Twilio call identifier
  - customer_phone (VARCHAR)
  - call_status (VARCHAR) - ringing, in-progress, completed
  - order_id (VARCHAR) - If order placed
  - order_placed (BOOLEAN)
  - conversation_data (JSONB) - Full conversation
  - started_at (TIMESTAMP)
  - ended_at (TIMESTAMP)
  - call_duration (INTEGER)

conversation_messages:
  - id (UUID)
  - conversation_id (UUID) - FK to conversations
  - role (VARCHAR) - 'user' or 'assistant'
  - content (TEXT) - Message text
  - timestamp (TIMESTAMP)
```

---

## API Endpoints

### Voice Endpoints

#### `POST /api/voice/incoming-call`
**Purpose**: Handle incoming Twilio call

**Request** (from Twilio):
```javascript
{
  CallSid: "CA...",
  From: "+1234567890",
  To: "+0987654321"
}
```

**Response**: TwiML XML
```xml
<Response>
  <Say voice="polly.Joanna">I am an AI assistant...</Say>
  <Gather input="speech" action="/api/voice/handle-speech" ... />
</Response>
```

#### `POST /api/voice/handle-speech`
**Purpose**: Process speech input

**Request** (from Twilio):
```javascript
{
  CallSid: "CA...",
  SpeechResult: "I want a burger",
  From: "+1234567890"
}
```

**Response**: TwiML XML with response and next gather

#### `POST /api/voice/status-callback`
**Purpose**: Receive call status updates

**Request**:
```javascript
{
  CallSid: "CA...",
  CallStatus: "completed",
  CallDuration: "120"
}
```

**Response**: `200 OK`

### Menu Endpoints

#### `GET /api/menu/items`
**Response**: All available menu items
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Burger",
      "description": "...",
      "price": 9.99,
      "category": "Main Course",
      ...
    }
  ]
}
```

#### `GET /api/menu/items/:id`
**Response**: Single menu item

#### `GET /api/menu/search?query=burger`
**Response**: Search results

### Order Endpoints

#### `POST /api/orders/create`
**Request**:
```json
{
  "customer_name": "John Doe",
  "customer_phone": "+1234567890",
  "items": [
    {
      "menu_item_id": "uuid",
      "quantity": 2,
      "price": 9.99
    }
  ]
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "order_id": "ORD-1234567890-0001",
    "total_amount": "19.98",
    "status": "pending",
    ...
  }
}
```

#### `GET /api/orders/all?status=pending&limit=50`
**Response**: List of orders with items

#### `GET /api/orders/:id`
**Response**: Single order with full details

#### `GET /api/orders/order-id/:orderId`
**Response**: Order by order_id string

#### `PATCH /api/orders/:id/status`
**Request**:
```json
{
  "status": "confirmed"
}
```

### Conversation Endpoints

#### `GET /api/conversations/all?limit=50&offset=0`
**Response**: All conversations with messages

#### `GET /api/conversations/call/:callSid`
**Response**: Conversation by Twilio call SID

#### `GET /api/conversations/order/:orderId`
**Response**: Conversation by order ID

#### `GET /api/conversations/customer/:phone`
**Response**: All conversations for a phone number

---

## Database Schema

### Tables

#### `menu_items`
```sql
- id (UUID, PK)
- name (VARCHAR(255))
- description (TEXT)
- ingredients (TEXT[]) - Array of ingredients
- spice_level (INTEGER, 0-5)
- price (DECIMAL(10,2))
- category (VARCHAR(100))
- image_url (TEXT)
- is_available (BOOLEAN)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

#### `orders`
```sql
- id (UUID, PK)
- order_id (VARCHAR(50), UNIQUE) - Human-readable: "ORD-1234567890-0001"
- customer_name (VARCHAR(255))
- customer_phone (VARCHAR(20))
- items (JSONB) - Full item details
- total_amount (DECIMAL(10,2))
- status (VARCHAR(50)) - pending, confirmed, preparing, ready, completed, cancelled
- order_date (TIMESTAMP)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

#### `order_items`
```sql
- id (UUID, PK)
- order_id (UUID, FK → orders.id)
- menu_item_id (UUID, FK → menu_items.id)
- quantity (INTEGER)
- price (DECIMAL(10,2))
- special_instructions (TEXT)
- created_at (TIMESTAMP)
```

#### `conversations`
```sql
- id (UUID, PK)
- call_sid (VARCHAR) - Twilio call identifier
- customer_phone (VARCHAR)
- call_status (VARCHAR) - ringing, in-progress, completed, failed
- order_id (VARCHAR) - If order placed
- order_placed (BOOLEAN)
- conversation_data (JSONB) - Full conversation history
- started_at (TIMESTAMP)
- ended_at (TIMESTAMP)
- call_duration (INTEGER) - Seconds
```

#### `conversation_messages`
```sql
- id (UUID, PK)
- conversation_id (UUID, FK → conversations.id)
- role (VARCHAR) - 'user' or 'assistant'
- content (TEXT) - Message text
- timestamp (TIMESTAMP)
```

### Indexes
- `idx_orders_order_id` on `orders(order_id)`
- `idx_orders_status` on `orders(status)`
- `idx_orders_order_date` on `orders(order_date)`
- `idx_order_items_order_id` on `order_items(order_id)`
- `idx_menu_items_category` on `menu_items(category)`

---

## Conversation Flow Examples

### Example 1: Simple Order

```
Customer: "I want a burger"
  │
  ▼ Intent: order_item
  │
  ▼ Menu Lookup: "burger" → "Burger" (confidence: 0.95)
  │
  ▼ Add to Cart
  │
AI: "Got it, one Burger. Anything else?"
  │
  ▼ Customer: "No"
  │
  ▼ Intent: general_question
  │
  ▼ State: ADDING_ITEMS → COLLECTING_INFO
  │
AI: "Great! Before I confirm your order, may I have your name, please?"
  │
  ▼ Customer: "John Doe"
  │
  ▼ Intent: provide_info
  │
  ▼ Extract: name = "John Doe"
  │
AI: "Thank you, John Doe. What's your phone number?"
  │
  ▼ Customer: "555-1234"
  │
  ▼ Intent: provide_info
  │
  ▼ Extract: phone = "5551234"
  │
  ▼ State: COLLECTING_INFO → CONFIRMATION
  │
AI: "Perfect! So your order is: one Burger. Is that correct?"
  │
  ▼ Customer: "Yes"
  │
  ▼ Intent: confirm_order
  │
  ▼ State: CONFIRMATION → PLACING_ORDER
  │
  ▼ Create Order in Database
  │
AI: "Great! Your order has been confirmed. Your order ID is O R D dash 1 2 3 4 5 6 7 8 9 0 dash 0 0 0 1. The total amount is 9.99 dollars. Thank you for your order!"
```

### Example 2: Menu Inquiry → Order

```
Customer: "What's on the menu?"
  │
  ▼ Intent: menu_inquiry
  │
  ▼ Fast Path (no GPT-4)
  │
AI: "We have Main Course, Appetizers, Beverages, Desserts, and Bread. Which category would you like to see?"
  │
  ▼ Customer: "What do you have in beverages?"
  │
  ▼ Intent: category_inquiry
  │
  ▼ Category Lookup: "Beverage"
  │
AI: "In Beverage, we have... Cola - $2.99, Lemonade - $2.99, Iced Tea - $2.99, Coffee - $2.99. Would you like to order any of these?"
  │
  ▼ Customer: "I want lemonade"
  │
  ▼ Intent: order_item
  │
  ▼ Menu Lookup: "lemonade" → "Lemonade" (confidence: 0.98)
  │
  ▼ Add to Cart
  │
AI: "Got it, one Lemonade. Anything else?"
  │
  ▼ [Continues to order completion...]
```

### Example 3: Item Inquiry → Order

```
Customer: "Do you have coffee?"
  │
  ▼ Intent: item_inquiry
  │
  ▼ Fast Path: Menu Lookup
  │
AI: "Yes, we have Coffee. It's $2.99. Would you like to order it?"
  │
  ▼ Customer: "Yes"
  │
  ▼ Intent: confirm_order (but cart empty)
  │
  ▼ Special Handling: Convert to order_item
  │
  ▼ Add stored item (Coffee) to cart
  │
AI: "Got it, one Coffee. Anything else?"
```

### Example 4: Correction Flow

```
Customer: "I want a burger"
  │
  ▼ Add to Cart: Burger
  │
AI: "Got it, one Burger. Anything else?"
  │
  ▼ Customer: "No, just fries"
  │
  ▼ Intent: order_item
  │
  ▼ Correction Detected: "No, just" → Remove last item
  │
  ▼ Remove: Burger
  │
  ▼ Menu Lookup: "fries" → "French Fries"
  │
  ▼ Add to Cart: French Fries
  │
AI: "Got it, one French Fries. Anything else?"
```

### Example 5: Ambiguous Match

```
Customer: "I want lemon"
  │
  ▼ Intent: order_item
  │
  ▼ Menu Lookup: "lemon" → Ambiguous (confidence: 0.65)
  │
  ▼ Candidates: ["Lemonade", "Lemon Tea"]
  │
AI: "Did you mean Lemonade or Lemon Tea?"
  │
  ▼ Customer: "Lemonade"
  │
  ▼ Menu Lookup: "lemonade" → "Lemonade" (confidence: 0.98)
  │
  ▼ Add to Cart
  │
AI: "Got it, one Lemonade. Anything else?"
```

---

## Performance Optimizations

### 1. Intent Detection Speed
- **Optimization**: Use GPT-3.5 Turbo instead of GPT-4
- **Impact**: 4-5x faster (~200-400ms vs ~1700ms)
- **Trade-off**: Slightly less accurate, but sufficient for classification

### 2. Menu Context Caching
- **Optimization**: Cache menu items for 5 minutes
- **Impact**: Reduces database queries from ~50ms to <1ms
- **Location**: `aiAgent.js` - `menuContextCache`

### 3. Fast Paths for Common Intents
- **menu_inquiry**: Direct category listing (no GPT-4)
- **item_inquiry**: Direct menu lookup (no GPT-4)
- **Impact**: ~50-200ms vs ~1700ms for GPT-4 responses

### 4. Async Database Operations
- **Optimization**: Non-blocking conversation/message saves
- **Impact**: Doesn't delay voice response
- **Implementation**: Fire-and-forget async functions

### 5. Menu Lookup Caching
- **Optimization**: Cache menu items for 5 minutes
- **Impact**: Faster fuzzy matching
- **Location**: `menuLookup.js` - `menuItemsCache`

### 6. Response Length Limits
- **Optimization**: Max 120 tokens for GPT-4 responses
- **Impact**: Faster generation, more natural (shorter) responses

### 7. Frequency Penalty
- **Optimization**: `frequency_penalty: 0.8` reduces repetition
- **Impact**: Less post-processing needed

### Performance Metrics

**Typical Response Times**:
- Fast Path (menu/item inquiry): ~300-500ms
- Order Item (with lookup): ~400-600ms
- GPT-4 Response: ~2000-2500ms
- Order Creation: ~500-800ms

**Total Call Flow**:
- Simple order (3-4 exchanges): ~10-15 seconds
- Menu inquiry → Order: ~15-20 seconds
- Complex conversation: ~30-60 seconds

---

## Error Handling & Edge Cases

### 1. Speech Recognition Failures
**Scenario**: Twilio doesn't transcribe speech
**Handling**: 
```javascript
if (!speechResult) {
  sayNatural(twiml, "I didn't catch that. Could you please repeat?");
  twiml.redirect('/api/voice/incoming-call');
}
```

### 2. Menu Item Not Found
**Scenario**: Customer orders item not on menu
**Handling**:
- Show top 3-5 similar items
- Ask if they want to hear the menu
- Response: "I couldn't find '[item]' on our menu. Did you mean X, Y, or Z? Or would you like to hear our menu?"

### 3. Ambiguous Menu Match
**Scenario**: Multiple items match (confidence 0.6-0.85)
**Handling**:
- Ask for clarification
- Show top 2 candidates
- Response: "Did you mean X or Y?"

### 4. Cart Empty on Confirmation
**Scenario**: Customer says "Yes" but cart is empty
**Handling**:
- Check if last message was item inquiry
- If yes: Convert to order_item, add stored item
- If no: Ask what they want to order

### 5. Order Creation Failure
**Scenario**: Database error during order creation
**Handling**:
- Log error
- Apologize to customer
- Suggest calling back
- Response: "I apologize, but there was an error processing your order. Please try again or call back."

### 6. Item Unavailable During Order
**Scenario**: Item becomes unavailable between adding and confirming
**Handling**:
- Validate all items before order creation
- If unavailable: Remove from cart, inform customer
- Response: "I'm sorry, but [item] is no longer available. Would you like to order something else?"

### 7. Customer Info Extraction Failure
**Scenario**: AI can't extract name/phone
**Handling**:
- Ask again with clearer prompt
- Response: "I didn't catch your name. Could you please tell me your name?"

### 8. Intent Detection Failure
**Scenario**: GPT-3.5 returns invalid JSON or error
**Handling**:
- Default to `general_question`
- Log error
- Continue with GPT-4 response

### 9. Conversation History Overflow
**Scenario**: Very long conversation
**Handling**:
- Only use last 3 messages for intent detection
- Full history for GPT-4 (but limited by max_tokens)

### 10. Twilio Service Unavailable
**Scenario**: Twilio credentials not configured
**Handling**:
- Check on startup
- Return 503 error if not configured
- Log warning message

---

## Key Design Decisions

### 1. Why In-Memory Cart Storage?
- **Reason**: Fast access during call, no database latency
- **Trade-off**: Lost on server restart (acceptable for voice calls)
- **Production**: Should use Redis for persistence

### 2. Why Two AI Models?
- **GPT-3.5 for Intent**: Faster, cheaper, sufficient for classification
- **GPT-4 for Conversations**: Better quality, natural responses
- **Trade-off**: Slightly more complex, but better performance

### 3. Why Fast Paths?
- **Reason**: Common intents don't need GPT-4's power
- **Impact**: 10-15x faster for menu/item inquiries
- **Trade-off**: More code complexity, but better UX

### 4. Why State Machine?
- **Reason**: Clear order flow, prevents errors
- **Benefit**: Easy to debug, predictable behavior
- **Trade-off**: More code, but more reliable

### 5. Why Fuzzy Matching?
- **Reason**: Voice recognition has errors, customers use variations
- **Benefit**: Handles typos, accents, variations
- **Trade-off**: More complex algorithm, but better accuracy

### 6. Why SSML for Speech?
- **Reason**: Natural pauses, slower rate for clarity
- **Benefit**: More human-like, easier to understand
- **Trade-off**: Requires Amazon Polly (premium), but better UX

---

## Future Improvements

### 1. Production Readiness
- [ ] Replace in-memory cart with Redis
- [ ] Add rate limiting
- [ ] Add monitoring/alerting
- [ ] Add retry logic for API calls

### 2. Performance
- [ ] Implement response streaming for GPT-4
- [ ] Add Redis caching for menu items
- [ ] Optimize database queries with connection pooling

### 3. Features
- [ ] Support for special instructions
- [ ] Order modification (add/remove items)
- [ ] Order history lookup
- [ ] Multi-language support

### 4. AI Improvements
- [ ] Fine-tune GPT model on restaurant conversations
- [ ] Add sentiment analysis
- [ ] Improve correction handling
- [ ] Better handling of complex orders

---

## Conclusion

This AI system is a sophisticated voice ordering platform that combines:
- **Natural Language Understanding**: GPT-4 for conversations
- **Fast Classification**: GPT-3.5 for intent detection
- **Intelligent Matching**: Fuzzy matching with Fuse.js
- **State Management**: Clear order flow with state machine
- **Performance**: Multiple optimizations for speed

The system handles the complete order flow from greeting to confirmation, with robust error handling and edge case management.
