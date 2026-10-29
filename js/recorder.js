/**
 * Luma Capture - MediaRecorder Engine
 * Handles stream recording, state transitions, accurate elapsed time calculation,
 * codec negotiation, and export bundle assembly.
 */

export class ScreenRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.state = 'idle'; // 'idle' | 'recording' | 'paused' | 'processing'

    // Timing tracking
    this.startTime = 0;
    this.pausedAt = 0;
    this.totalPausedDuration = 0;
    this.elapsedSeconds = 0;
    this.timerInterval = null;

    // Callbacks
    this.onStateChange = null;
    this.onTick = null;
    this.onError = null;

    // Supported formats cache
    this.supportedMimeType = this.detectSupportedMimeType();
  }

  /**
   * Tests and detects the most robust supported MIME type for the client browser.
   * @returns {string}
   */
  detectSupportedMimeType() {
    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=h264,opus',
      'video/webm',
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4'
    ];

    if (typeof MediaRecorder === 'undefined') {
      return '';
    }

    for (const mime of candidates) {
      try {
        if (MediaRecorder.isTypeSupported(mime)) {
          return mime;
        }
      } catch (e) {
        // Continue searching
      }
    }
    return '';
  }

  /**
   * Translates mimeType to appropriate file extension.
   * @param {string} mimeType
   * @returns {string}
   */
  getExtension(mimeType) {
    if (!mimeType) return 'webm';
    if (mimeType.includes('mp4')) return 'mp4';
    if (mimeType.includes('mkv')) return 'mkv';
    return 'webm';
  }

  /**
   * Starts recording a MediaStream.
   * @param {MediaStream} stream
   * @param {Object} options
   */
  start(stream, options = {}) {
    if (this.state === 'recording' || this.state === 'paused') {
      throw new Error('A recording is already active.');
    }

    if (!stream || stream.getTracks().length === 0) {
      throw new Error('No active tracks found in media stream.');
    }

    this.recordedChunks = [];
    const mimeType = options.mimeType || this.supportedMimeType;
    const recorderOptions = {};

    if (mimeType && MediaRecorder.isTypeSupported(mimeType)) {
      recorderOptions.mimeType = mimeType;
    }

    if (options.videoBitrate) {
      recorderOptions.videoBitsPerSecond = options.videoBitrate;
    }
    if (options.audioBitrate) {
      recorderOptions.audioBitsPerSecond = options.audioBitrate;
    }

    try {
      this.mediaRecorder = new MediaRecorder(stream, recorderOptions);
    } catch (err) {
      console.warn('Fallback initializing MediaRecorder without explicit options:', err);
      this.mediaRecorder = new MediaRecorder(stream);
    }

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };

    this.mediaRecorder.onerror = (event) => {
      console.error('MediaRecorder runtime error:', event.error);
      this._setState('idle');
      this._stopTimer();
      if (this.onError) {
        this.onError(event.error || new Error('Recording stopped unexpectedly.'));
      }
    };

    // Slice in 1-second chunks for resilient data availability
    this.mediaRecorder.start(1000);

    // Timing
    this.startTime = Date.now();
    this.pausedAt = 0;
    this.totalPausedDuration = 0;
    this.elapsedSeconds = 0;

    this._startTimer();
    this._setState('recording');
  }

  /**
   * Pauses the active recording.
   */
  pause() {
    if (this.state !== 'recording' || !this.mediaRecorder) return;

    if (this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
      this.pausedAt = Date.now();
      this._stopTimer();
      this._setState('paused');
    }
  }

  /**
   * Resumes the paused recording.
   */
  resume() {
    if (this.state !== 'paused' || !this.mediaRecorder) return;

    if (this.mediaRecorder.state === 'paused') {
      this.totalPausedDuration += Date.now() - this.pausedAt;
      this.pausedAt = 0;
      this.mediaRecorder.resume();
      this._startTimer();
      this._setState('recording');
    }
  }

  /**
   * Stops recording and generates final video file bundle with thumbnail.
   * @returns {Promise<Object>}
   */
  async stop() {
    if (this.state === 'idle') return null;

    this._stopTimer();
    this._setState('processing');

    // Calculate final duration excluding pause periods
    const end = this.pausedAt > 0 ? this.pausedAt : Date.now();
    const finalDurationMs = Math.max(500, end - this.startTime - this.totalPausedDuration);
    const finalDurationSec = Math.round(finalDurationMs / 1000);

    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        this._setState('idle');
        return reject(new Error('Recorder is not initialized.'));
      }

      this.mediaRecorder.onstop = async () => {
        try {
          const actualMime = this.mediaRecorder.mimeType || this.supportedMimeType || 'video/webm';
          const extension = this.getExtension(actualMime);
          const blob = new Blob(this.recordedChunks, { type: actualMime });
          const url = URL.createObjectURL(blob);

          // Generate thumbnail and probe dimensions from video blob
          const { thumbnail, width, height } = await this._generateThumbnail(url);

          const result = {
            blob,
            url,
            mimeType: actualMime,
            extension,
            size: blob.size,
            duration: finalDurationSec,
            width,
            height,
            thumbnail,
            createdAt: Date.now()
          };

          this.mediaRecorder = null;
          this.recordedChunks = [];
          this._setState('idle');

          resolve(result);
        } catch (err) {
          this._setState('idle');
          reject(err);
        }
      };

      try {
        if (this.mediaRecorder.state !== 'inactive') {
          this.mediaRecorder.stop();
        } else {
          this.mediaRecorder.onstop();
        }
      } catch (err) {
        this._setState('idle');
        reject(err);
      }
    });
  }

  _startTimer() {
    this._stopTimer();
    this.timerInterval = setInterval(() => {
      const now = Date.now();
      const diffMs = now - this.startTime - this.totalPausedDuration;
      this.elapsedSeconds = Math.max(0, Math.floor(diffMs / 1000));
      if (this.onTick) {
        this.onTick(this.elapsedSeconds, this.formatDuration(this.elapsedSeconds));
      }
    }, 500);
  }

  _stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  _setState(newState) {
    this.state = newState;
    if (this.onStateChange) {
      this.onStateChange(this.state);
    }
  }

  /**
   * Helper to format seconds as HH:MM:SS.
   * @param {number} sec
   * @returns {string}
   */
  formatDuration(sec) {
    const s = Math.floor(sec % 60);
    const m = Math.floor((sec / 60) % 60);
    const h = Math.floor(sec / 3600);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  /**
   * Creates a snapshot thumbnail from the generated video URL.
   * @param {string} videoUrl
   * @returns {Promise<{thumbnail: string, width: number, height: number}>}
   */
  async _generateThumbnail(videoUrl) {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.src = videoUrl;
      video.muted = true;
      video.playsInline = true;

      const cleanUp = () => {
        video.removeAttribute('src');
        video.load();
      };

      video.onloadedmetadata = () => {
        // Seek to 0.5s or 0 for instant frame
        video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
      };

      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          const width = video.videoWidth || 640;
          const height = video.videoHeight || 360;

          // Thumbnail size (max 480px width)
          const thumbWidth = 480;
          const thumbHeight = Math.round((thumbWidth * height) / width);

          canvas.width = thumbWidth;
          canvas.height = thumbHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, thumbWidth, thumbHeight);

          const thumbnail = canvas.toDataURL('image/jpeg', 0.82);
          cleanUp();
          resolve({ thumbnail, width, height });
        } catch (e) {
          cleanUp();
          resolve({ thumbnail: null, width: 1920, height: 1080 });
        }
      };

      video.onerror = () => {
        cleanUp();
        resolve({ thumbnail: null, width: 1920, height: 1080 });
      };

      // Safety timeout in case seek fails
      setTimeout(() => {
        cleanUp();
        resolve({ thumbnail: null, width: 1920, height: 1080 });
      }, 3000);
    });
  }
}
