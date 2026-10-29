/**
 * Luma Capture - Audio Mixer Module
 * Routes, controls volume, and mixes microphone and system/display audio using Web Audio API.
 */

export class AudioMixer {
  constructor() {
    this.audioContext = null;
    this.destination = null;

    // Mic state
    this.micStream = null;
    this.micSource = null;
    this.micGainNode = null;
    this.micAnalyser = null;
    this.micVolume = 1.0;
    this.micMuted = false;

    // System state
    this.systemStream = null;
    this.systemSource = null;
    this.systemGainNode = null;
    this.systemAnalyser = null;
    this.systemVolume = 1.0;
    this.systemMuted = false;

    this.isInitialized = false;
  }

  /**
   * Initializes the AudioContext and destination node.
   */
  async ensureContext() {
    if (!this.audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        throw new Error('Web Audio API is not supported in this browser.');
      }
      this.audioContext = new AudioCtx();
      this.destination = this.audioContext.createMediaStreamDestination();
      this.isInitialized = true;
    }

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    return this.audioContext;
  }

  /**
   * Connects microphone audio stream to the mixer.
   * @param {MediaStream} stream
   */
  async attachMicrophone(stream) {
    await this.ensureContext();

    // Clean up previous mic source
    if (this.micSource) {
      try {
        this.micSource.disconnect();
      } catch (e) {
        console.warn('Error disconnecting mic source:', e);
      }
    }

    this.micStream = stream;
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;

    this.micSource = this.audioContext.createMediaStreamSource(new MediaStream([audioTrack]));
    this.micGainNode = this.audioContext.createGain();
    this.micGainNode.gain.value = this.micMuted ? 0 : this.micVolume;

    this.micAnalyser = this.audioContext.createAnalyser();

    // Wire up: micSource -> micGainNode -> destination & micAnalyser
    this.micSource.connect(this.micGainNode);
    this.micGainNode.connect(this.destination);
    this.micGainNode.connect(this.micAnalyser);
  }

  /**
   * Detaches microphone from mixer and stops mic tracks if requested.
   * @param {boolean} stopTracks
   */
  detachMicrophone(stopTracks = false) {
    if (this.micSource) {
      try {
        this.micSource.disconnect();
      } catch (e) {}
      this.micSource = null;
    }
    if (this.micGainNode) {
      try {
        this.micGainNode.disconnect();
      } catch (e) {}
      this.micGainNode = null;
    }
    this.micAnalyser = null;

    if (stopTracks && this.micStream) {
      this.micStream.getAudioTracks().forEach(t => t.stop());
      this.micStream = null;
    }
  }

  /**
   * Connects system/display audio track from screen share stream.
   * @param {MediaStreamTrack} track
   */
  async attachSystemAudio(track) {
    if (!track) return;
    await this.ensureContext();

    if (this.systemSource) {
      try {
        this.systemSource.disconnect();
      } catch (e) {}
    }

    this.systemStream = new MediaStream([track]);
    this.systemSource = this.audioContext.createMediaStreamSource(this.systemStream);
    this.systemGainNode = this.audioContext.createGain();
    this.systemGainNode.gain.value = this.systemMuted ? 0 : this.systemVolume;

    this.systemAnalyser = this.audioContext.createAnalyser();

    this.systemSource.connect(this.systemGainNode);
    this.systemGainNode.connect(this.destination);
    this.systemGainNode.connect(this.systemAnalyser);
  }

  detachSystemAudio() {
    if (this.systemSource) {
      try {
        this.systemSource.disconnect();
      } catch (e) {}
      this.systemSource = null;
    }
    if (this.systemGainNode) {
      try {
        this.systemGainNode.disconnect();
      } catch (e) {}
      this.systemGainNode = null;
    }
    this.systemAnalyser = null;
    this.systemStream = null;
  }

  /**
   * Sets microphone volume (0.0 to 2.0).
   * @param {number} vol
   */
  setMicVolume(vol) {
    this.micVolume = Math.max(0, Math.min(2.0, vol));
    if (this.micGainNode && !this.micMuted) {
      this.micGainNode.gain.setTargetAtTime(this.micVolume, this.audioContext.currentTime, 0.02);
    }
  }

  /**
   * Sets microphone mute state.
   * @param {boolean} muted
   */
  setMicMuted(muted) {
    this.micMuted = !!muted;
    if (this.micGainNode) {
      const targetGain = this.micMuted ? 0 : this.micVolume;
      this.micGainNode.gain.setTargetAtTime(targetGain, this.audioContext.currentTime, 0.02);
    }
  }

  /**
   * Sets system audio volume (0.0 to 2.0).
   * @param {number} vol
   */
  setSystemVolume(vol) {
    this.systemVolume = Math.max(0, Math.min(2.0, vol));
    if (this.systemGainNode && !this.systemMuted) {
      this.systemGainNode.gain.setTargetAtTime(this.systemVolume, this.audioContext.currentTime, 0.02);
    }
  }

  /**
   * Returns mixed MediaStreamAudioDestinationNode stream.
   * @returns {MediaStream|null}
   */
  getMixedStream() {
    return this.destination ? this.destination.stream : null;
  }

  /**
   * Returns mixed audio track (or null if none).
   * @returns {MediaStreamTrack|null}
   */
  getMixedTrack() {
    const stream = this.getMixedStream();
    return stream ? stream.getAudioTracks()[0] || null : null;
  }

  getMicAnalyser() {
    return this.micAnalyser;
  }

  getSystemAnalyser() {
    return this.systemAnalyser;
  }

  hasAudio() {
    const hasMic = !!(this.micSource && this.micStream && this.micStream.getAudioTracks().length > 0);
    const hasSys = !!(this.systemSource && this.systemStream && this.systemStream.getAudioTracks().length > 0);
    return hasMic || hasSys;
  }

  /**
   * Completely tears down audio context and releases resources.
   */
  async close() {
    this.detachMicrophone(true);
    this.detachSystemAudio();

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        await this.audioContext.close();
      } catch (e) {
        console.warn('Error closing AudioContext:', e);
      }
    }
    this.audioContext = null;
    this.destination = null;
    this.isInitialized = false;
  }
}
