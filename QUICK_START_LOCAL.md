# 🚀 Quick Start: Local Testing

## Step-by-Step Local Testing

### 1. Install ngrok (One-time setup)
```bash
# macOS
brew install ngrok

# Or download from https://ngrok.com/download
# Then add to PATH
```

### 2. Start Your Local Server
```bash
npm run dev:server
```
✅ Server running on `http://localhost:3001`

### 3. Start ngrok (New Terminal)
```bash
npm run ngrok
```
✅ You'll see something like: `Forwarding https://abc123.ngrok.io -> http://localhost:3001`

### 4. Copy the ngrok HTTPS URL
Example: `https://abc123.ngrok.io`

### 5. Update Twilio Webhook
1. Go to: https://console.twilio.com/us1/develop/phone-numbers/manage/incoming
2. Click your phone number
3. Under "Voice & Fax":
   - **A CALL COMES IN**: `https://abc123.ngrok.io/api/voice/incoming-call`
   - **STATUS CALLBACK**: `https://abc123.ngrok.io/api/voice/status-callback`
4. Click **Save**

### 6. Test!
📞 Call your Twilio phone number
👂 Listen to the voice agent
💻 Watch your terminal for logs

## Quick Commands

```bash
# Start server only
npm run dev:server

# Start ngrok only
npm run ngrok

# Test API endpoints
npm run test:local

# Test voice endpoints
npm run test:voice

# Start both server + ngrok together
npm run dev:local
```

## Making Changes

1. ✏️ Edit your code
2. 🔄 Server auto-restarts (nodemon)
3. 📞 Call again to test
4. ✅ No deployment needed!

## Troubleshooting

**ngrok URL changes?** → That's normal on free tier. Just update Twilio webhook again.

**Can't connect?** → Make sure:
- Server is running (`npm run dev:server`)
- ngrok is running (`npm run ngrok`)
- Using HTTPS URL (not HTTP)
- Port matches (3001)

**Voice not working?** → Check:
- Twilio webhook URLs are correct
- Server logs for errors
- Environment variables are set

## View ngrok Requests

Visit: `http://127.0.0.1:4040` while ngrok is running
- See all requests
- Replay requests
- Inspect payloads

## Need Help?

See `LOCAL_TESTING.md` for detailed documentation.
