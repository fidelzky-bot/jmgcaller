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

// Add body parsing middleware for Twilio webhooks
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
    // Log incoming webhook for debugging
    console.log('Incoming webhook body:', req.body);
    console.log('Incoming webhook query:', req.query);
    // Get callSid from Twilio webhook (from POST body or query)
    const callSid = req.body?.CallSid || req.query?.CallSid;
    console.log(`📞 Incoming webhook for callSid: ${callSid}`.cyan);
    console.log(`Transfer flag for callSid:`, transferFlags[callSid]);
    
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
    let lastUserInput = '';
    let waitingForAnswer = false;
    let userInputBuffer = '';
    let bufferTimeout = null;
    const BUFFER_PAUSE_MS = 1200; // 1.2 seconds pause = end of answer

    // Helper for smarter deduplication
    function isSimilarInput(newInput, lastInput) {
      if (!newInput || !lastInput) return false;
      const a = newInput.trim().toLowerCase();
      const b = lastInput.trim().toLowerCase();
      if (a === b) return true;
      if (a.length < 4 || b.length < 4) return false;
      if (a.includes(b) || b.includes(a)) return true;
      let mismatches = 0;
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (a[i] !== b[i]) mismatches++;
      }
      return mismatches <= 2;
    }
  
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
              
              logTransfer('Closing WebSocket with code 1000: Transfer complete', 'info');
              ws.close(1000, 'Transfer complete');
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
  
    // Helper to flush buffer to GPT
    function flushUserInputBuffer() {
      const text = userInputBuffer.trim();
      if (text.length > 1 && !isSimilarInput(text, lastUserInput)) {
        logTransfer(`Turn-based: Sending buffered answer to GPT: ${text}`, 'info');
        gptService.completion(text, interactionCount);
        interactionCount += 1;
        lastUserInput = text;
        userInputBuffer = '';
        waitingForAnswer = false;
      }
    }

    transcriptionService.on('utterance', async (text) => {
      logTransfer(`STT Utterance: "${text}"`, 'info');
      if (!waitingForAnswer) return;
      if (text && text.length > 1) {
        userInputBuffer = text;
        if (bufferTimeout) clearTimeout(bufferTimeout);
        bufferTimeout = setTimeout(() => {
          flushUserInputBuffer();
        }, BUFFER_PAUSE_MS);
      }
      if(marks.length > 0 && text?.length > 1) {
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
      logTransfer(`STT Transcription: "${text}"`, 'info');
      if (!waitingForAnswer) return;
      if (text && text.length > 1) {
        userInputBuffer = text;
        if (bufferTimeout) clearTimeout(bufferTimeout);
        flushUserInputBuffer(); // Immediately flush on transcription event
      }
    });
    
    // When GPT emits a new question, set waitingForAnswer = true and clear buffer
    gptService.on('gptreply', async (gptReply, icount) => {
      if (pendingTransfer) {
        logTransfer(`Ignoring GPT reply - transfer already pending`, 'info');
        return;
      }
      logTransfer(`GPT -> TTS: ${gptReply.partialResponse}`, 'info');
      ttsService.generate(gptReply, icount);
      // Only set waitingForAnswer if this is a question (ends with ?)
      if (gptReply.partialResponse && gptReply.partialResponse.trim().endsWith('?')) {
        waitingForAnswer = true;
        userInputBuffer = '';
        if (bufferTimeout) clearTimeout(bufferTimeout);
      }
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
            logTransfer('Closing WebSocket with code 1000: Transfer complete', 'info');
            ws.close(1000, 'Transfer complete');
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
        logTransfer('Closing WebSocket with code 1000: Transfer complete', 'info');
        ws.close(1000, 'Transfer complete');
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
        logTransfer('Closing WebSocket with code 1000: Transfer complete', 'info');
        ws.close(1000, 'Transfer complete');
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
      // Remove all listeners to prevent duplicate transfer triggers
      gptService.removeAllListeners();
      ttsService.removeAllListeners();
      streamService.removeAllListeners();
      transcriptionService.removeAllListeners();
    });
    
  } catch (err) {
    console.error('❌ Error in WebSocket connection:', err);
  }
});

app.listen(PORT);
console.log(`🚀 Server running on port ${PORT}`.green);