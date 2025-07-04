require('colors');
const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');
const { Buffer } = require('node:buffer');
const EventEmitter = require('events');


class TranscriptionService extends EventEmitter {
  constructor() {
    super();
    this.deepgram = createClient(process.env.DEEPGRAM_API_KEY);
    this.finalResult = '';
    this.speechFinal = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.reconnectDelay = 1000; // 1 second
    
    this.initializeConnection();
  }

  initializeConnection() {
    try {
      console.log('STT -> Initializing Deepgram connection...'.cyan);
      this.dgConnection = this.deepgram.listen.live({
        encoding: 'mulaw',
        sample_rate: '8000',
        model: 'nova-2',
        punctuate: true,
        interim_results: true,
        endpointing: 200,
        utterance_end_ms: 1000
      });
      
      this.setupEventHandlers();
    } catch (error) {
      console.error('STT -> Error initializing connection:', error);
      this.attemptReconnect();
    }
  }

  setupEventHandlers() {
    this.dgConnection.on(LiveTranscriptionEvents.Open, () => {
      console.log('STT -> Deepgram connection opened successfully'.green);
      this.reconnectAttempts = 0; // Reset reconnect attempts on successful connection
    });
    
    this.dgConnection.on(LiveTranscriptionEvents.Transcript, (transcriptionEvent) => {
      const alternatives = transcriptionEvent.channel?.alternatives;
      let text = '';
      if (alternatives) {
        text = alternatives[0]?.transcript;
      }
      if (transcriptionEvent.type === 'UtteranceEnd') {
        if (!this.speechFinal) {
          console.log(`UtteranceEnd received before speechFinal, emit the text collected so far: ${this.finalResult}`.yellow);
          this.emit('transcription', this.finalResult);
          return;
        } else {
          console.log('STT -> Speech was already final when UtteranceEnd recevied'.yellow);
          return;
        }
      }
      if (transcriptionEvent.is_final === true && text.trim().length > 0) {
        this.finalResult += ` ${text}`;
        if (transcriptionEvent.speech_final === true) {
          this.speechFinal = true;
          this.emit('transcription', this.finalResult);
          this.finalResult = '';
        } else {
          this.speechFinal = false;
        }
      } else {
        this.emit('utterance', text);
      }
    });
    
    this.dgConnection.on(LiveTranscriptionEvents.Error, (error) => {
      console.error('STT -> Deepgram error:', error);
      this.attemptReconnect();
    });
    
    this.dgConnection.on(LiveTranscriptionEvents.Warning, (warning) => {
      console.warn('STT -> Deepgram warning:', warning);
    });
    
    this.dgConnection.on(LiveTranscriptionEvents.Metadata, (metadata) => {
      console.log('STT -> Deepgram metadata:', metadata);
    });
    
    this.dgConnection.on(LiveTranscriptionEvents.Close, (event) => {
      console.log(`STT -> Deepgram connection closed - code: ${event?.code}, reason: ${event?.reason}`.yellow);
      // Only attempt reconnect if it wasn't a normal closure
      if (event?.code !== 1000) {
        this.attemptReconnect();
      }
    });
  }

  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`STT -> Max reconnect attempts (${this.maxReconnectAttempts}) reached. Giving up.`.red);
      this.emit('error', new Error('Max reconnect attempts reached'));
      return;
    }

    this.reconnectAttempts++;
    console.log(`STT -> Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${this.reconnectDelay}ms...`.yellow);
    
    setTimeout(() => {
      try {
        this.initializeConnection();
      } catch (error) {
        console.error('STT -> Reconnect failed:', error);
        this.attemptReconnect();
      }
    }, this.reconnectDelay);
  }


  }

  /**
   * Send the payload to Deepgram
   * @param {String} payload A base64 MULAW/8000 audio stream
   */
  send(payload) {
    try {
      if (this.dgConnection && this.dgConnection.getReadyState() === 1) {
        this.dgConnection.send(Buffer.from(payload, 'base64'));
      } else {
        console.warn('STT -> Connection not ready, cannot send payload'.yellow);
      }
    } catch (error) {
      console.error('STT -> Error sending payload:', error);
      this.attemptReconnect();
    }
  }

  /**
   * Close the connection properly
   */
  close() {
    try {
      if (this.dgConnection) {
        this.dgConnection.finish();
        console.log('STT -> Connection closed properly'.green);
      }
    } catch (error) {
      console.error('STT -> Error closing connection:', error);
    }
  }
}

module.exports = { TranscriptionService };