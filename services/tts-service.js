require('dotenv').config();
const { Buffer } = require('node:buffer');
const EventEmitter = require('events');
const fetch = require('node-fetch');

class TextToSpeechService extends EventEmitter {
  constructor() {
    super();
    this.nextExpectedIndex = 0;
    this.speechBuffer = {};
  }

  async generate(gptReply, interactionCount) {
    const { partialResponseIndex, partialResponse, markLabel } = gptReply;

    if (!partialResponse) { 
      this.emit('error', new Error('No partial response provided to TTS'));
      return; 
    }

    try {
      console.log(`🎤 TTS generating audio for: "${partialResponse}"`.cyan);
      
      const response = await fetch(
        `https://api.deepgram.com/v1/speak?model=${process.env.VOICE_MODEL}&encoding=mulaw&sample_rate=8000&container=none`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: partialResponse,
          }),
        }
      );

      if (response.status === 200) {
        try {
          const blob = await response.blob();
          const audioArrayBuffer = await blob.arrayBuffer();
          const base64String = Buffer.from(audioArrayBuffer).toString('base64');
          
          // Validate that we actually got audio data
          if (!base64String || base64String.length === 0) {
            throw new Error('TTS returned empty audio data');
          }
          
          console.log(`✅ TTS generated ${base64String.length} bytes of audio`.green);
          this.emit('speech', partialResponseIndex, base64String, markLabel || partialResponse, interactionCount);
        } catch (err) {
          console.error('❌ Error processing TTS response:', err);
          this.emit('error', new Error(`TTS processing failed: ${err.message}`));
        }
      } else {
        const errorText = await response.text();
        console.error(`❌ Deepgram TTS error (${response.status}):`, errorText);
        this.emit('error', new Error(`TTS API error: ${response.status} - ${errorText}`));
      }
    } catch (err) {
      console.error('❌ Error occurred in TextToSpeech service:', err);
      this.emit('error', new Error(`TTS service error: ${err.message}`));
    }
  }
}

module.exports = { TextToSpeechService };