const EventEmitter = require('events');
const uuid = require('uuid');

class StreamService extends EventEmitter {
  constructor(websocket) {
    super();
    this.ws = websocket;
    this.expectedAudioIndex = 0;
    this.audioBuffer = {};
    this.streamSid = '';
  }

  setStreamSid (streamSid) {
    this.streamSid = streamSid;
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
    this.ws.send(
      JSON.stringify({
        streamSid: this.streamSid,
        event: 'media',
        media: {
          payload: audio,
        },
      })
    );
    // When the media completes you will receive a `mark` message with the label
    const label = markLabel || uuid.v4();
    this.ws.send(
      JSON.stringify({
        streamSid: this.streamSid,
        event: 'mark',
        mark: {
          name: label
        }
      })
    );
    this.emit('audiosent', label);
  }
}

module.exports = {StreamService};