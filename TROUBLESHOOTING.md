# Transfer Troubleshooting Guide

This guide helps you diagnose and fix common issues with the AI-powered transfer system.

## Quick Diagnostics

### 1. Check Server Status
```bash
curl https://your-server.onrender.com/
```
Should return:
```json
{
  "status": "ok",
  "message": "The Illinois Hammer AI Intake System is running",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### 2. Check Transfer Status
```bash
curl https://your-server.onrender.com/status
```
Shows active calls, pending transfers, and timeouts.

### 3. Run Transfer Tests
```bash
node test-transfer.js
```

## Common Issues & Solutions

### Issue 1: Transfer Message Not Heard

**Symptoms:**
- Caller hears silence or default Twilio voice
- Transfer happens immediately without custom message

**Causes:**
- TTS service failure
- WebSocket disconnection before mark received
- Transfer triggered before message completion

**Solutions:**
1. Check TTS logs for errors:
   ```
   ❌ TTS error: API error: 401 - Unauthorized
   ```

2. Verify Deepgram API key in environment variables:
   ```bash
   echo $DEEPGRAM_API_KEY
   ```

3. Check if transfer is being forced due to TTS failure:
   ```
   ⚠️ Transfer message TTS failed - using fallback
   ```

### Issue 2: Long Silence After Transfer Message

**Symptoms:**
- Transfer message plays correctly
- Long silence follows (10+ seconds)
- No ring tone heard

**Causes:**
- Transfer timeout not triggered
- Webhook not received by Twilio
- Transfer flag not set properly

**Solutions:**
1. Check transfer timeout logs:
   ```
   ⚠️ Transfer timeout - forcing cleanup
   ```

2. Verify transfer flag is set:
   ```bash
   curl https://your-server.onrender.com/status | jq '.pendingTransferDetails'
   ```

3. Check Twilio webhook configuration:
   - Ensure webhook URL is correct
   - Verify HTTP method is POST
   - Check for webhook failures in Twilio console

### Issue 3: Transfer Never Happens

**Symptoms:**
- Transfer message plays
- Call stays connected to AI
- No transfer occurs

**Causes:**
- Mark event not received
- WebSocket not closed properly
- Transfer flag not set

**Solutions:**
1. Check mark event logs:
   ```
   ℹ️ Audio mark completed: transfer-message-1234567890
   ✅ Transfer message mark received - message fully played
   ```

2. Verify WebSocket closure:
   ```
   ℹ️ WebSocket closed - code: 1000, reason: 
   ```

3. Check if transfer is pending:
   ```bash
   curl https://your-server.onrender.com/status | jq '.pendingTransfers'
   ```

### Issue 4: Multiple Transfer Messages

**Symptoms:**
- Transfer message repeats
- AI continues talking after transfer

**Causes:**
- Transfer flag not properly set
- GPT continues generating responses

**Solutions:**
1. Check if transfer is properly flagged:
   ```
   ℹ️ Ignoring GPT reply - transfer already pending
   ```

2. Verify transfer state management:
   ```
   ✅ Transfer triggered by GPT: Let me transfer you to our main line...
   ```

### Issue 5: TTS Service Errors

**Symptoms:**
- No audio generated
- Error messages in logs
- Transfer falls back to default behavior

**Causes:**
- Deepgram API issues
- Invalid voice model
- Network connectivity problems

**Solutions:**
1. Check TTS service logs:
   ```
   ❌ Deepgram TTS error (401): Unauthorized
   ```

2. Verify environment variables:
   ```bash
   echo $DEEPGRAM_API_KEY
   echo $VOICE_MODEL
   ```

3. Test TTS service directly:
   ```bash
   node test-transfer.js
   ```

## Log Analysis

### Key Log Patterns

**Successful Transfer:**
```
✅ Transfer triggered by GPT: Let me transfer you to our main line...
🎤 TTS generating audio for: "Let me transfer you to our main line..."
✅ TTS generated 12345 bytes of audio
📤 Audio sent (1): 12345 bytes
📌 Mark sent: transfer-message-1234567890
ℹ️ Audio mark completed: transfer-message-1234567890
✅ Transfer message mark received - message fully played
✅ Initiating transfer after message completion
🔄 Executing transfer for callSid: CA1234567890abcdef
✅ Transfer completed for callSid: CA1234567890abcdef
```

**Failed Transfer (TTS Error):**
```
✅ Transfer triggered by GPT: Let me transfer you to our main line...
❌ TTS error: API error: 401 - Unauthorized
⚠️ TTS failed during transfer - forcing transfer
🔄 Executing transfer for callSid: CA1234567890abcdef
```

**Failed Transfer (Timeout):**
```
✅ Transfer triggered by GPT: Let me transfer you to our main line...
⚠️ Transfer timeout - forcing transfer without mark
🔄 Executing transfer for callSid: CA1234567890abcdef
```

## Environment Variables Checklist

Ensure these are set in your `.env` file:

```bash
# Twilio Configuration
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
FROM_NUMBER=+1234567890
TO_NUMBER=+1234567890

# Server Configuration
SERVER=your-server.onrender.com

# API Keys
OPENAI_API_KEY=sk-your-openai-key
DEEPGRAM_API_KEY=your-deepgram-key

# TTS Configuration
VOICE_MODEL=nova-2

# Optional
RECORDING_ENABLED=false
```

## Testing Procedures

### 1. Basic Functionality Test
```bash
node test-transfer.js
```

### 2. Live Call Test
```bash
node test-transfer.js --live-test
```

### 3. Manual Call Test
1. Call your Twilio number
2. Say "I'm not calling about a new case"
3. Listen for transfer message
4. Verify transfer to main line

### 4. Stress Test
1. Make multiple calls simultaneously
2. Test with poor network conditions
3. Verify transfer reliability

## Performance Monitoring

### Key Metrics to Track

1. **Transfer Success Rate**
   - Successful transfers / Total transfer attempts
   - Target: >95%

2. **Transfer Message Completion Rate**
   - Messages fully played / Transfer attempts
   - Target: >98%

3. **TTS Error Rate**
   - TTS failures / Total TTS requests
   - Target: <2%

4. **Transfer Time**
   - Time from transfer trigger to completion
   - Target: <5 seconds

### Monitoring Commands

```bash
# Check current status
curl https://your-server.onrender.com/status

# Monitor logs in real-time
# (Use your hosting platform's log viewer)

# Test transfer function
node -e "
const transfer = require('./functions/transferToMainLine');
transfer({callSid: 'test'}).then(console.log);
"
```

## Emergency Procedures

### If Transfers Stop Working

1. **Immediate Actions:**
   ```bash
   # Check server status
   curl https://your-server.onrender.com/
   
   # Check for errors
   curl https://your-server.onrender.com/status
   ```

2. **Fallback Options:**
   - Temporarily disable AI and use direct transfer
   - Use Twilio's built-in transfer functionality
   - Route calls to voicemail

3. **Recovery Steps:**
   - Restart the application
   - Check API key validity
   - Verify webhook configuration

### Contact Information

- **Twilio Support:** https://support.twilio.com/
- **Deepgram Support:** https://developers.deepgram.com/support/
- **OpenAI Support:** https://help.openai.com/

## Best Practices

1. **Regular Testing**
   - Run transfer tests weekly
   - Monitor logs daily
   - Test with real calls monthly

2. **Monitoring**
   - Set up alerts for transfer failures
   - Monitor API usage and limits
   - Track call quality metrics

3. **Maintenance**
   - Keep API keys secure and rotated
   - Update dependencies regularly
   - Backup configuration files

4. **Documentation**
   - Keep call flow documentation updated
   - Document any customizations
   - Maintain troubleshooting procedures 