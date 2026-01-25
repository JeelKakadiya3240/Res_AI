-- Create conversations table to store call logs
CREATE TABLE IF NOT EXISTS conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  call_sid VARCHAR(255) UNIQUE NOT NULL,
  customer_phone VARCHAR(20),
  customer_name VARCHAR(255),
  conversation_data JSONB NOT NULL,
  order_id VARCHAR(50),
  order_placed BOOLEAN DEFAULT false,
  call_duration INTEGER,
  call_status VARCHAR(50),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create conversation_messages table for detailed message history
CREATE TABLE IF NOT EXISTS conversation_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_conversations_call_sid ON conversations(call_sid);
CREATE INDEX IF NOT EXISTS idx_conversations_customer_phone ON conversations(customer_phone);
CREATE INDEX IF NOT EXISTS idx_conversations_order_id ON conversations(order_id);
CREATE INDEX IF NOT EXISTS idx_conversations_started_at ON conversations(started_at);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation_id ON conversation_messages(conversation_id);

-- Trigger to update updated_at timestamp
CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
