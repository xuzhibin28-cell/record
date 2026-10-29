/**
 * Luma Capture - Canvas Compositor Module (Studio Mode)
 * Composites screen stream and webcam overlay onto an offscreen canvas and exposes captureStream().
 */

export class CanvasCompositor {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { alpha: false, desynchronized: true });

    // Video source elements
    this.screenVideo = null;
    this.webcamVideo = null;

    // PiP Overlay Configuration
    this.pipConfig = {
      visible: true,
      shape: 'circle', // 'circle' | 'rectangle'
      sizePreset: 'medium', // 'small' | 'medium' | 'large'
      sizeRatio: 0.22, // 22% of canvas width
      xRatio: 0.76, // 76% from left
      yRatio: 0.68, // 68% from top
      mirrored: true,
      borderColor: '#6366f1', // Indigo-500
      borderWidth: 4,
      borderRadius: 18,
      shadow: true
    };

    // Output dimensions
    this.targetWidth = 1920;
    this.targetHeight = 1080;
    this.fps = 30;

    this.isRunning = false;
    this.animationId = null;
    this.outputStream = null;
  }

  /**
   * Sets target resolution for composition.
   * @param {number} width
   * @param {number} height
   * @param {number} fps
   */
  setDimensions(width, height, fps = 30) {
    this.targetWidth = width || 1920;
    this.targetHeight = height || 1080;
    this.fps = fps || 30;

    if (this.canvas.width !== this.targetWidth || this.canvas.height !== this.targetHeight) {
      this.canvas.width = this.targetWidth;
      this.canvas.height = this.targetHeight;
    }
  }

  /**
   * Sets video elements used as frame sources.
   * @param {HTMLVideoElement} screenVideo
   * @param {HTMLVideoElement} webcamVideo
   */
  setSources(screenVideo, webcamVideo) {
    this.screenVideo = screenVideo;
    this.webcamVideo = webcamVideo;
  }

  /**
   * Updates PiP layout parameters.
   * @param {Object} options
   */
  updatePipConfig(options = {}) {
    Object.assign(this.pipConfig, options);

    if (options.sizePreset === 'small') {
      this.pipConfig.sizeRatio = 0.16;
    } else if (options.sizePreset === 'medium') {
      this.pipConfig.sizeRatio = 0.22;
    } else if (options.sizePreset === 'large') {
      this.pipConfig.sizeRatio = 0.30;
    }
  }

  /**
   * Starts the continuous rendering loop and returns captureStream().
   * @returns {MediaStream}
   */
  startStream() {
    this.canvas.width = this.targetWidth;
    this.canvas.height = this.targetHeight;

    this.isRunning = true;
    this.renderLoop();

    if (!this.outputStream) {
      if (typeof this.canvas.captureStream === 'function') {
        this.outputStream = this.canvas.captureStream(this.fps);
      } else {
        throw new Error('Canvas captureStream is not supported in this browser.');
      }
    }

    return this.outputStream;
  }

  /**
   * Stops the composition loop.
   */
  stopStream() {
    this.isRunning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.outputStream) {
      this.outputStream.getTracks().forEach(t => t.stop());
      this.outputStream = null;
    }
  }

  renderLoop() {
    if (!this.isRunning) return;

    this.drawFrame();

    // Prefer requestVideoFrameCallback if supported by the screen video element
    if (this.screenVideo && 'requestVideoFrameCallback' in this.screenVideo) {
      this.screenVideo.requestVideoFrameCallback(() => {
        if (this.isRunning) this.renderLoop();
      });
    } else {
      this.animationId = requestAnimationFrame(() => this.renderLoop());
    }
  }

  /**
   * Draws a single composite frame.
   */
  drawFrame() {
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;

    // 1. Draw screen video or dark background
    if (this.screenVideo && this.screenVideo.readyState >= 2) {
      const vw = this.screenVideo.videoWidth || cw;
      const vh = this.screenVideo.videoHeight || ch;

      // Keep aspect ratio letterboxed or fill
      const scale = Math.min(cw / vw, ch / vh);
      const dw = vw * scale;
      const dh = vh * scale;
      const dx = (cw - dw) / 2;
      const dy = (ch - dh) / 2;

      // Fill letterbox margin with sleek dark tone
      ctx.fillStyle = '#0b0f19';
      ctx.fillRect(0, 0, cw, ch);

      try {
        ctx.drawImage(this.screenVideo, 0, 0, vw, vh, dx, dy, dw, dh);
      } catch (e) {
        // Fallback
      }
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, cw, ch);
    }

    // 2. Draw Webcam PiP overlay if enabled and webcam has video frames
    if (
      this.pipConfig.visible &&
      this.webcamVideo &&
      this.webcamVideo.readyState >= 2 &&
      this.webcamVideo.videoWidth > 0
    ) {
      this.drawWebcamPip();
    }
  }

  drawWebcamPip() {
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;

    const vw = this.webcamVideo.videoWidth;
    const vh = this.webcamVideo.videoHeight;
    if (!vw || !vh) return;

    const pipW = Math.round(cw * this.pipConfig.sizeRatio);
    let pipH = Math.round(pipW * (vh / vw));

    if (this.pipConfig.shape === 'circle') {
      pipH = pipW; // 1:1 square cropped to circle
    }

    const pipX = Math.round(this.pipConfig.xRatio * (cw - pipW));
    const pipY = Math.round(this.pipConfig.yRatio * (ch - pipH));

    ctx.save();

    // Drop shadow
    if (this.pipConfig.shadow) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 6;
    }

    // Clipping path
    ctx.beginPath();
    if (this.pipConfig.shape === 'circle') {
      const radius = pipW / 2;
      ctx.arc(pipX + radius, pipY + radius, radius, 0, Math.PI * 2);
    } else {
      const radius = this.pipConfig.borderRadius || 16;
      ctx.roundRect(pipX, pipY, pipW, pipH, radius);
    }
    ctx.closePath();

    // Fill shadow first
    ctx.fillStyle = '#000000';
    ctx.fill();

    // Clip to shape for video
    ctx.save();
    ctx.clip();

    // Reset shadow for video drawing
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // Handle horizontal mirroring
    if (this.pipConfig.mirrored) {
      ctx.translate(pipX + pipW, pipY);
      ctx.scale(-1, 1);
    } else {
      ctx.translate(pipX, pipY);
    }

    // Crop center for circle
    if (this.pipConfig.shape === 'circle') {
      const size = Math.min(vw, vh);
      const sx = (vw - size) / 2;
      const sy = (vh - size) / 2;
      ctx.drawImage(this.webcamVideo, sx, sy, size, size, 0, 0, pipW, pipH);
    } else {
      ctx.drawImage(this.webcamVideo, 0, 0, vw, vh, 0, 0, pipW, pipH);
    }

    ctx.restore(); // Undo clip & transform

    // Draw Accent Border
    if (this.pipConfig.borderWidth > 0) {
      ctx.beginPath();
      if (this.pipConfig.shape === 'circle') {
        const radius = pipW / 2;
        ctx.arc(pipX + radius, pipY + radius, radius, 0, Math.PI * 2);
      } else {
        const radius = this.pipConfig.borderRadius || 16;
        ctx.roundRect(pipX, pipY, pipW, pipH, radius);
      }
      ctx.strokeStyle = this.pipConfig.borderColor || '#6366f1';
      ctx.lineWidth = this.pipConfig.borderWidth;
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Captures the current composite frame as a PNG data URL.
   * @returns {string}
   */
  captureSnapshot() {
    this.drawFrame();
    return this.canvas.toDataURL('image/png');
  }
}
