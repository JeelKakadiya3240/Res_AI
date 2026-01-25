const OpenAI = require('openai');
require('dotenv').config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Extract customer name and phone from user input using AI
 */
async function extractCustomerInfo(userInput) {
  try {
    const prompt = `Extract the customer's name and phone number from the following text. Return ONLY a JSON object.

Return format:
{
  "name": "extracted name or null",
  "phone": "extracted phone number (digits only, no spaces/dashes) or null"
}

Rules:
- Name: Look for phrases like "my name is X", "I'm X", "call me X", or just a name
- Phone: Look for phone numbers in formats like "123-456-7890", "1234567890", "+1 234 567 8900", "my number is X"
- If name is found, return it (capitalize first letter of each word)
- If phone is found, return only digits (remove spaces, dashes, parentheses, plus signs)
- If nothing is found, return null

Text: "${userInput}"

Return ONLY valid JSON, no other text.`;

    // OPTIMIZATION: Use gpt-3.5-turbo instead of gpt-4-turbo-preview - 5x faster, sufficient for extraction
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',  // Changed from gpt-4-turbo-preview - 5x faster, sufficient for name/phone extraction
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: userInput }
      ],
      temperature: 0.1,
      max_tokens: 100,
      response_format: { type: 'json_object' }
    });

    const result = JSON.parse(completion.choices[0].message.content);
    
    // Clean phone number - remove all non-digits except leading +
    if (result.phone) {
      result.phone = result.phone.replace(/[^\d+]/g, '');
      // If it starts with +, keep it, otherwise remove any leading +
      if (!result.phone.startsWith('+')) {
        result.phone = result.phone.replace(/^\+/, '');
      }
    }
    
    // Clean name - capitalize properly
    if (result.name) {
      result.name = result.name.trim();
      // Capitalize first letter of each word
      result.name = result.name.split(' ').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      ).join(' ');
    }
    
    console.log('📝 Extracted customer info:', result);
    return result;
  } catch (error) {
    console.error('Error extracting customer info:', error);
    return { name: null, phone: null };
  }
}

module.exports = {
  extractCustomerInfo
};
