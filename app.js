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

// Health check endpoint for OnRender
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'The Illinois Hammer AI Intake System is running',
    timestamp: new Date().toISOString()
  });
});

app.post('/incoming', (req, res) => {
  try {
    // Get callSid from Twilio webhook (from POST body or query)
    const callSid = req.body?.CallSid || req.query?.CallSid;
    if (callSid && transferFlags[callSid]) {
      // Transfer requested for this call
      const response = new VoiceResponse();
      response.dial('+16156175000');
      delete transferFlags[callSid];
      res.type('text/xml');
      res.end(response.toString());
      return;
    }
    const response = new VoiceResponse();
    const connect = response.connect();
    connect.stream({ url: `wss://${process.env.SERVER}/connection` });
    res.type('text/xml');
    res.end(response.toString());
  } catch (err) {
    console.log(err);
  }
});

app.ws('/connection', (ws) => {
  try {
    ws.on('error', console.error);
    // Filled in from start message
    let streamSid;
    let callSid;
    let pendingTransfer = false;
    let transferMarkLabel = null;

    const gptService = new GptService();
    const streamService = new StreamService(ws);
    const transcriptionService = new TranscriptionService();
    const ttsService = new TextToSpeechService({});
  
    let marks = [];
    let interactionCount = 0;
  
    // Incoming from MediaStream
    ws.on('message', function message(data) {
      const msg = JSON.parse(data);
      if (msg.event === 'start') {
        streamSid = msg.start.streamSid;
        callSid = msg.start.callSid;
        
        streamService.setStreamSid(streamSid);
        gptService.setCallSid(callSid);

        // Set RECORDING_ENABLED='true' in .env to record calls
        recordingService(ttsService, callSid).then(() => {
          console.log(`Twilio -> Starting Media Stream for ${streamSid}`.underline.red);
          ttsService.generate({partialResponseIndex: null, partialResponse: 'Thank you for calling The Illinois Hammer. Are you calling about a new case?'}, 0);
        });
      } else if (msg.event === 'media') {
        transcriptionService.send(msg.media.payload);
      } else if (msg.event === 'mark') {
        const label = msg.mark.name;
        console.log(`Twilio -> Audio completed mark (${msg.sequenceNumber}): ${label}`.red);
        marks = marks.filter(m => m !== msg.mark.name);
      } else if (msg.event === 'stop') {
        console.log(`Twilio -> Media stream ${streamSid} ended.`.underline.red);
      }
    });
  
    transcriptionService.on('utterance', async (text) => {
      // This is a bit of a hack to filter out empty utterances
      if(marks.length > 0 && text?.length > 5) {
        console.log('Twilio -> Interruption, Clearing stream'.red);
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
      console.log(`Interaction ${interactionCount} – STT -> GPT: ${text}`.yellow);
      gptService.completion(text, interactionCount);
      interactionCount += 1;
    });
    
    gptService.on('gptreply', async (gptReply, icount) => {
      if (pendingTransfer) return; // Ignore further replies after transfer is triggered
      if (gptReply && gptReply.partialResponse && gptReply.partialResponse.toLowerCase().includes('transfer you to our main line')) {
        pendingTransfer = true;
        transferMarkLabel = 'transfer-message-' + Date.now();
        ttsService.generate({ ...gptReply, markLabel: transferMarkLabel }, icount);
        return;
      }
      console.log(`Interaction ${icount}: GPT -> TTS: ${gptReply.partialResponse}`.green );
      ttsService.generate(gptReply, icount);
    });
  
    ttsService.on('speech', (responseIndex, audio, label, icount) => {
      console.log(`Interaction ${icount}: TTS -> TWILIO: ${label}`.blue);
      streamService.buffer(responseIndex, audio, label);
    });
  
    streamService.on('audiosent', (markLabel) => {
      marks.push(markLabel);
      // If a transfer is pending and this is the transfer message mark, close the WebSocket and set the flag
      if (pendingTransfer && transferMarkLabel && markLabel === transferMarkLabel && callSid) {
        transferFlags[callSid] = true;
        ws.close();
        pendingTransfer = false;
        transferMarkLabel = null;
      }
    });
  } catch (err) {
    console.log(err);
  }
});

app.listen(PORT);
console.log(`Server running on port ${PORT}`);
