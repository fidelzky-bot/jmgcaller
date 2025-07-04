const EventEmitter = require('events');
const uuid = require('uuid');

class StreamService extends EventEmitter {
  constructor(websocket) {
    super();
    this.ws = websocket;
    this.expectedAudioIndex = 0;
    this.audioBuffer = {};
    this.streamSid = '';
    this.isConnected = true;
    
    // Track sent audio for debugging
    this.sentAudioCount = 0;
    this.sentMarks = [];
  }

  setStreamSid (streamSid) {
    this.streamSid = streamSid;
    console.log(`📡 Stream service initialized for streamSid: ${streamSid}`.cyan);
  }

  buffer (index, audio, markLabel = null) {
    // Escape hatch for intro message, which doesn't have an index
    if(index === null) {
      this.sendAudio(audio, markLabel);
    } else if(index === this.expectedAudioIndex) {
      this.sendAudio(audio, markLabel);
      this.expectedAudioIndex++;

      while(Object.prototype.hasOwnProperty.call(this.audioBuffer, this.expectedAudioIndex)) {
        const bufferedAudio = this.audioBuffer[this.expectedAudioIndex];
        this.sendAudio(bufferedAudio.audio, bufferedAudio.markLabel);
        this.expectedAudioIndex++;
      }
    } else {
      this.audioBuffer[index] = { audio, markLabel };
    }
  }

  sendAudio (audio, markLabel = null) {
    if (!this.isConnected) {
      console.warn('⚠️ Attempted to send audio on closed WebSocket'.yellow);
      return;
    }
    
    if (!audio || audio.length === 0) {
      console.error('❌ Attempted to send empty audio data'.red);
      this.emit('error', new Error('Empty audio data provided to sendAudio'));
      return;
    }
    
    try {
      // Send the audio data
      const mediaMessage = {
        streamSid: this.streamSid,
        event: 'media',
        media: {
          payload: audio,
        },
      };
      
      this.ws.send(JSON.stringify(mediaMessage));
      this.sentAudioCount++;
      
      console.log(`📤 Audio sent (${this.sentAudioCount}): ${audio.length} bytes`.blue);
      
      // When the media completes you will receive a `mark` message with the label
      const label = markLabel || uuid.v4();
      const markMessage = {
        streamSid: this.streamSid,
        event: 'mark',
        mark: {
          name: label
        }
      };
      
      this.ws.send(JSON.stringify(markMessage));
      this.sentMarks.push(label);
      
      console.log(`📌 Mark sent: ${label}`.blue);
      this.emit('audiosent', label);
      
    } catch (error) {
      console.error('❌ Error sending audio/mark:', error);
      this.emit('error', error);
    }
  }
  
  // Method to check connection status
  isWebSocketConnected() {
    return this.isConnected && this.ws.readyState === 1;
  }
  
  // Method to close the stream service
  close() {
    this.isConnected = false;
    console.log(`🔌 Stream service closed for streamSid: ${this.streamSid}`.yellow);
  }
  
  // Method to get statistics
  getStats() {
    return {
      streamSid: this.streamSid,
      sentAudioCount: this.sentAudioCount,
      sentMarks: this.sentMarks,
      expectedAudioIndex: this.expectedAudioIndex,
      bufferSize: Object.keys(this.audioBuffer).length,
      isConnected: this.isConnected
    };
  }
}

module.exports = {StreamService};