/**
 * Test script for voice endpoints locally
 * This simulates Twilio webhook calls to test your voice routes
 * 
 * Usage: node test-voice-local.js
 */

const API_URL = process.env.API_URL || 'http://localhost:3001';

// Helper function to send form data
async function sendFormData(url, data) {
  const formBody = new URLSearchParams();
  Object.keys(data).forEach(key => {
    formBody.append(key, data[key]);
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formBody.toString(),
  });

  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: await response.text(),
  };
}

async function testVoiceEndpoints() {
  console.log('🎤 Testing Voice Endpoints Locally...\n');
  console.log(`API URL: ${API_URL}\n`);

  const testCallSid = `test-${Date.now()}`;
  const testPhoneNumber = '+1234567890';

  // Test 1: Incoming Call
  try {
    console.log('1. Testing /api/voice/incoming-call...');
    const incomingCallData = {
      CallSid: testCallSid,
      From: testPhoneNumber,
      To: '+1987654321',
      CallStatus: 'ringing',
    };

    const result = await sendFormData(
      `${API_URL}/api/voice/incoming-call`,
      incomingCallData
    );

    console.log(`   Status: ${result.status}`);
    if (result.status === 200) {
      console.log('   ✅ Incoming call handler responded');
      // Check if it's TwiML
      if (result.body.includes('<?xml') || result.body.includes('<Response>')) {
        console.log('   ✅ Response is valid TwiML');
        // Extract the greeting text
        const greetingMatch = result.body.match(/<Say[^>]*>([^<]+)<\/Say>/);
        if (greetingMatch) {
          console.log(`   📢 Greeting: "${greetingMatch[1]}"`);
        }
      }
    } else {
      console.log(`   ❌ Failed: ${result.body}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  // Test 2: Handle Speech - Order Item
  try {
    console.log('\n2. Testing /api/voice/handle-speech (Order Item)...');
    const speechData = {
      CallSid: testCallSid,
      From: testPhoneNumber,
      SpeechResult: 'I want to order butter chicken',
    };

    const result = await sendFormData(
      `${API_URL}/api/voice/handle-speech`,
      speechData
    );

    console.log(`   Status: ${result.status}`);
    if (result.status === 200) {
      console.log('   ✅ Speech handler responded');
      if (result.body.includes('<?xml') || result.body.includes('<Response>')) {
        console.log('   ✅ Response is valid TwiML');
        // Extract response text
        const sayMatches = result.body.match(/<Say[^>]*>([^<]+)<\/Say>/g);
        if (sayMatches) {
          sayMatches.forEach((match, index) => {
            const text = match.replace(/<[^>]+>/g, '').trim();
            console.log(`   📢 Response ${index + 1}: "${text}"`);
          });
        }
      }
    } else {
      console.log(`   ❌ Failed: ${result.body}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  // Test 3: Handle Speech - Menu Inquiry
  try {
    console.log('\n3. Testing /api/voice/handle-speech (Menu Inquiry)...');
    const speechData = {
      CallSid: testCallSid,
      From: testPhoneNumber,
      SpeechResult: 'What do you have on the menu?',
    };

    const result = await sendFormData(
      `${API_URL}/api/voice/handle-speech`,
      speechData
    );

    console.log(`   Status: ${result.status}`);
    if (result.status === 200) {
      console.log('   ✅ Speech handler responded');
      if (result.body.includes('<?xml') || result.body.includes('<Response>')) {
        console.log('   ✅ Response is valid TwiML');
      }
    } else {
      console.log(`   ❌ Failed: ${result.body}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  // Test 4: Handle Speech - No Speech Result (Error Case)
  try {
    console.log('\n4. Testing /api/voice/handle-speech (No Speech)...');
    const speechData = {
      CallSid: testCallSid,
      From: testPhoneNumber,
      // No SpeechResult
    };

    const result = await sendFormData(
      `${API_URL}/api/voice/handle-speech`,
      speechData
    );

    console.log(`   Status: ${result.status}`);
    if (result.status === 200) {
      console.log('   ✅ Handler correctly handled missing speech');
      if (result.body.includes("didn't catch") || result.body.includes('repeat')) {
        console.log('   ✅ Appropriate error message returned');
      }
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  console.log('\n✨ Voice endpoint testing complete!');
  console.log('\n💡 Tips:');
  console.log('   - Make sure your server is running: npm run dev:server');
  console.log('   - Check server logs for detailed information');
  console.log('   - For real voice testing, use ngrok: npm run ngrok');
  console.log('   - Update Twilio webhook to your ngrok URL');
}

// Run tests
testVoiceEndpoints().catch(console.error);
