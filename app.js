require('dotenv').config();
require('colors');

const express = require('express');
const ExpressWs = require('express-ws');

const { GptService } = require('./services/gpt-service');
const { StreamService } = require('./services/stream-service');
const { TranscriptionService } = require('./services/transcription-service');
const { TextToSpeechService } = require('./services/tts-service');
const { recordingService } = require('./services/recording-service');

const VoiceResponse = require('twilio').twiml.VoiceResponse;

const app = express();
ExpressWs(app);

const PORT = process.env.PORT || 3000;

const transferFlags = {};
const transferTimeouts = {};
const activeCalls = {};

// Health check endpoint for OnRender
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'The Illinois Hammer AI Intake System is running',
    timestamp: new Date().toISOString()
  });
});

// Monitoring endpoint for debugging transfers
app.get('/status', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    activeCalls: Object.keys(activeCalls).length,
    pendingTransfers: Object.keys(transferFlags).length,
    transferTimeouts: Object.keys(transferTimeouts).length,
    activeCallDetails: activeCalls,
    pendingTransferDetails: transferFlags,
    timeoutDetails: transferTimeouts
  });
});

app.post('/incoming', (req, res) => {
  try {
    // Get callSid from Twilio webhook (from POST body or query)
    const callSid = req.body?.CallSid || req.query?.CallSid;
    console.log(`📞 Incoming webhook for callSid: ${callSid}`.cyan);
    
    if (callSid && transferFlags[callSid]) {
      // Transfer requested for this call
      console.log(`🔄 Executing transfer for callSid: ${callSid}`.green);
      const response = new VoiceResponse();
      response.dial('+16156175000');
      delete transferFlags[callSid];
      
      // Clean up any pending timeout
      if (transferTimeouts[callSid]) {
        clearTimeout(transferTimeouts[callSid]);
        delete transferTimeouts[callSid];
      }
      
      res.type('text/xml');
      res.end(response.toString());
      console.log(`✅ Transfer completed for callSid: ${callSid}`.green);
      return;
    }
    
    console.log(`🎯 New call starting for callSid: ${callSid}`.blue);
    const response = new VoiceResponse();
    const connect = response.connect();
    connect.stream({ url: `wss://${process.env.SERVER}/connection` });
    res.type('text/xml');
    res.end(response.toString());
  } catch (err) {
    console.error('❌ Error in /incoming webhook:', err);
    res.status(500).send('Internal Server Error');
  }
});

app.ws('/connection', (ws) => {
  try {
    ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error);
    });
    
    // Filled in from start message
    let streamSid;
    let callSid;
    let pendingTransfer = false;
    let transferMarkLabel = null;
    let transferTimeout = null;
    let transferMessageSent = false;
    let transferMessagePlayed = false;

    const gptService = new GptService();
    const streamService = new StreamService(ws);
    const transcriptionService = new TranscriptionService();
    const ttsService = new TextToSpeechService({});
  
    let marks = [];
    let interactionCount = 0;
    
    // Enhanced logging function
    const logTransfer = (message, level = 'info') => {
      const timestamp = new Date().toISOString();
      const prefix = `[${timestamp}] [${callSid || 'unknown'}] [${streamSid || 'unknown'}]`;
      switch(level) {
        case 'error':
          console.error(`❌ ${prefix} ${message}`.red);
          break;
        case 'warn':
          console.warn(`⚠️ ${prefix} ${message}`.yellow);
          break;
        case 'success':
          console.log(`✅ ${prefix} ${message}`.green);
          break;
        default:
          console.log(`ℹ️ ${prefix} ${message}`.cyan);
      }
    };
  
    // Incoming from MediaStream
    ws.on('message', function message(data) {
      const msg = JSON.parse(data);
      if (msg.event === 'start') {
        streamSid = msg.start.streamSid;
        callSid = msg.start.callSid;
        
        logTransfer(`Media stream started`, 'success');
        
        streamService.setStreamSid(streamSid);
        gptService.setCallSid(callSid);

        // Set RECORDING_ENABLED='true' in .env to record calls
        recordingService(ttsService, callSid).then(() => {
          logTransfer(`Starting AI intake process`, 'info');
          ttsService.generate({partialResponseIndex: null, partialResponse: 'Thank you for calling The Illinois Hammer. Are you calling about a new case?'}, 0);
        });
      } else if (msg.event === 'media') {
        transcriptionService.send(msg.media.payload);
      } else if (msg.event === 'mark') {
        const label = msg.mark.name;
        logTransfer(`Audio mark completed: ${label}`, 'info');
        marks = marks.filter(m => m !== msg.mark.name);
        
        // Check if this is our transfer message mark
        if (pendingTransfer && transferMarkLabel && label === transferMarkLabel) {
          logTransfer(`Transfer message mark received - message fully played`, 'success');
          transferMessagePlayed = true;
          
          // Set a short timeout to ensure the message is fully processed
          setTimeout(() => {
            if (pendingTransfer && callSid) {
              logTransfer(`Initiating transfer after message completion`, 'success');
              transferFlags[callSid] = true;
              
              // Set a timeout to force transfer if webhook doesn't come
              transferTimeouts[callSid] = setTimeout(() => {
                logTransfer(`Transfer timeout - forcing cleanup`, 'warn');
                delete transferFlags[callSid];
                delete transferTimeouts[callSid];
              }, 10000); // 10 second timeout
              
              ws.close();
              pendingTransfer = false;
              transferMarkLabel = null;
            }
          }, 500); // 500ms delay to ensure message is fully processed
        }
      } else if (msg.event === 'stop') {
        logTransfer(`Media stream ended`, 'info');
        
        // If we have a pending transfer but haven't received the mark, force it
        if (pendingTransfer && callSid && !transferMessagePlayed) {
          logTransfer(`Stream ended with pending transfer - forcing transfer`, 'warn');
          transferFlags[callSid] = true;
          delete transferTimeouts[callSid];
        }
      }
    });
  
    transcriptionService.on('utterance', async (text) => {
      // This is a bit of a hack to filter out empty utterances
      if(marks.length > 0 && text?.length > 5) {
        logTransfer(`Interruption detected - clearing stream`, 'warn');
        ws.send(
          JSON.stringify({
            streamSid,
            event: 'clear',
          })
        );
      }
    });
  
    transcriptionService.on('transcription', async (text) => {
      if (!text) { return; }
      logTransfer(`STT -> GPT: ${text}`, 'info');
      gptService.completion(text, interactionCount);
      interactionCount += 1;
    });
    
    gptService.on('gptreply', async (gptReply, icount) => {
      if (pendingTransfer) {
        logTransfer(`Ignoring GPT reply - transfer already pending`, 'info');
        return; // Ignore further replies after transfer is triggered
      }
      
      if (gptReply && gptReply.partialResponse && gptReply.partialResponse.toLowerCase().includes('transfer you to our main line')) {
        logTransfer(`Transfer triggered by GPT: ${gptReply.partialResponse}`, 'success');
        pendingTransfer = true;
        transferMarkLabel = 'transfer-message-' + Date.now();
        transferMessageSent = true;
        
        // Set a timeout in case the TTS fails or mark is never received
        transferTimeout = setTimeout(() => {
          if (pendingTransfer && callSid) {
            logTransfer(`Transfer timeout - forcing transfer without mark`, 'warn');
            transferFlags[callSid] = true;
            ws.close();
            pendingTransfer = false;
            transferMarkLabel = null;
          }
        }, 15000); // 15 second timeout for transfer message
        
        ttsService.generate({ ...gptReply, markLabel: transferMarkLabel }, icount);
        return;
      }
      
      logTransfer(`GPT -> TTS: ${gptReply.partialResponse}`, 'info');
      ttsService.generate(gptReply, icount);
    });
  
    ttsService.on('speech', (responseIndex, audio, label, icount) => {
      logTransfer(`TTS -> TWILIO: ${label}`, 'info');
      
      // Check if TTS failed to generate audio
      if (!audio || audio.length === 0) {
        logTransfer(`TTS generated empty audio for label: ${label}`, 'error');
        
        // If this was the transfer message, we need to handle it
        if (pendingTransfer && transferMarkLabel === label) {
          logTransfer(`Transfer message TTS failed - using fallback`, 'warn');
          // Force the transfer since we can't play the message
          if (callSid) {
            transferFlags[callSid] = true;
            ws.close();
            pendingTransfer = false;
            transferMarkLabel = null;
          }
        }
        return;
      }
      
      streamService.buffer(responseIndex, audio, label);
    });
    
    // Enhanced error handling for TTS
    ttsService.on('error', (error) => {
      logTransfer(`TTS error: ${error.message}`, 'error');
      
      // If we have a pending transfer and TTS fails, force the transfer
      if (pendingTransfer && callSid) {
        logTransfer(`TTS failed during transfer - forcing transfer`, 'warn');
        transferFlags[callSid] = true;
        ws.close();
        pendingTransfer = false;
        transferMarkLabel = null;
      }
    });
  
    streamService.on('audiosent', (markLabel) => {
      marks.push(markLabel);
      logTransfer(`Audio sent with mark: ${markLabel}`, 'info');
      
      // Legacy transfer logic (kept for backward compatibility)
      if (pendingTransfer && transferMarkLabel && markLabel === transferMarkLabel && callSid) {
        logTransfer(`Legacy transfer logic triggered`, 'info');
        transferFlags[callSid] = true;
        ws.close();
        pendingTransfer = false;
        transferMarkLabel = null;
      }
    });
    
    // WebSocket close handling
    ws.on('close', (code, reason) => {
      logTransfer(`WebSocket closed - code: ${code}, reason: ${reason}`, 'info');
      
      // Clean up timeouts
      if (transferTimeout) {
        clearTimeout(transferTimeout);
        transferTimeout = null;
      }
      
      // If we have a pending transfer but haven't completed it, force it
      if (pendingTransfer && callSid && !transferMessagePlayed) {
        logTransfer(`WebSocket closed with pending transfer - forcing transfer`, 'warn');
        transferFlags[callSid] = true;
      }
    });
    
  } catch (err) {
    console.error('❌ Error in WebSocket connection:', err);
  }
});

app.listen(PORT);
console.log(`🚀 Server running on port ${PORT}`.green);