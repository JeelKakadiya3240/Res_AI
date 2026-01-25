const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.');
}

// Validate URL format
if (!supabaseUrl.startsWith('http://') && !supabaseUrl.startsWith('https://')) {
  throw new Error(`Invalid SUPABASE_URL: "${supabaseUrl}". It must be a valid HTTP/HTTPS URL (e.g., https://xxxxx.supabase.co). Please update your .env file with your actual Supabase project URL.`);
}

if (supabaseUrl.includes('your_supabase') || supabaseUrl.includes('placeholder')) {
  throw new Error(`SUPABASE_URL appears to be a placeholder: "${supabaseUrl}". Please replace it with your actual Supabase project URL from https://supabase.com`);
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
