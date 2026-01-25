# Local Testing Guide for Twilio Voice Calls

This guide will help you test your Twilio voice calls locally without deploying to production.

## Quick Start

### Option 1: Using ngrok (Recommended)

1. **Install ngrok** (if not already installed):
   ```bash
   # macOS
   brew install ngrok
   
   # Or download from https://ngrok.com/download
   ```

2. **Start your local server**:
   ```bash
   npm run dev:server
   ```
   Your server should be running on `http://localhost:3001`

3. **Start ngrok in a new terminal**:
   ```bash
   npm run ngrok
   ```
   Or manually:
   ```bash
   ngrok http 3001
   ```

4. **Copy the ngrok HTTPS URL** (e.g., `https://abc123.ngrok.io`)

5. **Update Twilio Webhook URLs**:
   - Go to [Twilio Console](https://console.twilio.com/)
   - Navigate to Phone Numbers → Manage → Active Numbers
   - Click on your Twilio phone number
   - Under "Voice & Fax" section, set:
     - **A CALL COMES IN**: `https://your-ngrok-url.ngrok.io/api/voice/incoming-call`
     - **STATUS CALLBACK URL**: `https://your-ngrok-url.ngrok.io/api/voice/status-callback`
   - Save the configuration

6. **Test your call**:
   - Call your Twilio phone number
   - Your local server will receive the webhook requests
   - Check your terminal for logs

### Option 2: Using Twilio CLI (Alternative)

1. **Install Twilio CLI**:
   ```bash
   npm install -g twilio-cli
   twilio login
   ```

2. **Start your local server**:
   ```bash
   npm run dev:server
   ```

3. **In another terminal, start ngrok**:
   ```bash
   ngrok http 3001
   ```

4. **Use Twilio CLI to update webhook**:
   ```bash
   twilio phone-numbers:update YOUR_TWILIO_PHONE_NUMBER \
     --voice-url https://your-ngrok-url.ngrok.io/api/voice/incoming-call \
     --status-callback-url https://your-ngrok-url.ngrok.io/api/voice/status-callback
   ```

## Testing Tips

### 1. Check ngrok Web Interface
- When ngrok is running, visit `http://127.0.0.1:4040` in your browser
- You can see all incoming requests, replay them, and inspect the payloads

### 2. Monitor Server Logs
- Keep your server terminal open to see real-time logs
- Look for incoming webhook requests and any errors

### 3. Test Speech Recognition
- Speak clearly and wait for the beep
- Try different accents and speaking speeds
- Test edge cases like background noise

### 4. Test Different Scenarios
- Order placement flow
- Menu inquiries
- Customer info collection
- Order confirmation

## Troubleshooting

### Issue: ngrok URL changes every time
**Solution**: Use a free ngrok account to get a static domain:
1. Sign up at https://ngrok.com
2. Get your authtoken: `ngrok config add-authtoken YOUR_TOKEN`
3. Use a static domain: `ngrok http 3001 --domain=your-static-domain.ngrok.io`

### Issue: Twilio can't reach your local server
**Solution**: 
- Make sure ngrok is running
- Verify the ngrok URL is HTTPS (not HTTP)
- Check that your server is running on the correct port
- Ensure firewall isn't blocking connections

### Issue: Voice changes not working
**Solution**:
- Make sure you restarted your local server after code changes
- Check that Amazon Polly is enabled in your Twilio account
- Verify the voice name is correct (e.g., `polly.Joanna`)

### Issue: Can't hear the voice agent
**Solution**:
- Check your phone's volume
- Verify Twilio phone number is configured correctly
- Check server logs for errors
- Test with a different phone number

## Quick Test Script

You can also test the voice endpoints directly using curl:

```bash
# Test incoming call endpoint
curl -X POST http://localhost:3001/api/voice/incoming-call \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=test123&From=%2B1234567890"

# Test speech handler
curl -X POST http://localhost:3001/api/voice/handle-speech \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=test123&From=%2B1234567890&SpeechResult=I+want+to+order+butter+chicken"
```

## Environment Variables for Local Testing

Make sure your `.env` file has:
```env
PORT=3001
NODE_ENV=development
# ... other variables
```

## Next Steps

1. Make code changes locally
2. Restart your server: `npm run dev:server`
3. Test immediately by calling your Twilio number
4. No need to push to GitHub or deploy!

## Notes

- **ngrok free tier**: URLs change on restart, but perfect for development
- **ngrok paid tier**: Get static domains for consistent testing
- **Local changes**: Any code changes require server restart to take effect
- **Database**: Uses your Supabase database (same as production)
