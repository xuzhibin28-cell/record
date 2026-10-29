/**
 * Luma Capture - Audio Level Visualizer
 * Real-time LED-style audio level meter with peak hold and decay.
 */

export class AudioVisualizer {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas?.getContext('2d') || null;
    this.analyser = null;
    this.dataArray = null;
    this.animationId = null;
    this.peakLevel = 0;
    this.currentLevel = 0;
    this.isActive = false;

    if (this.canvas) {
      this.resize();
    }
  }

  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = (rect.width || 140) * dpr;
    this.canvas.height = (rect.height || 14) * dpr;
    if (this.ctx) {
      this.ctx.scale(dpr, dpr);
    }
  }

  /**
   * Connects an AnalyserNode to the visualizer.
   * @param {AnalyserNode} analyserNode
   */
  connect(analyserNode) {
    this.analyser = analyserNode;
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.5;
    const bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(bufferLength);
  }

  /**
   * Starts visualizer rendering loop.
   */
  start() {
    if (this.isActive) return;
    this.isActive = true;
    this.render();
  }

  /**
   * Stops visualizer and clears canvas.
   */
  stop() {
    this.isActive = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.currentLevel = 0;
    this.peakLevel = 0;
    this.drawIdle();
  }

  render() {
    if (!this.isActive) return;

    if (this.analyser && this.dataArray) {
      this.analyser.getByteFrequencyData(this.dataArray);

      // Calculate root mean square (RMS) energy
      let sum = 0;
      for (let i = 0; i < this.dataArray.length; i++) {
        sum += this.dataArray[i] * this.dataArray[i];
      }
      const rms = Math.sqrt(sum / this.dataArray.length);
      const targetLevel = Math.min(1, (rms / 128) * 1.4);

      // Smooth attack and release
      if (targetLevel > this.currentLevel) {
        this.currentLevel = targetLevel;
      } else {
        this.currentLevel = this.currentLevel * 0.85 + targetLevel * 0.15;
      }

      if (this.currentLevel > this.peakLevel) {
        this.peakLevel = this.currentLevel;
      } else {
        this.peakLevel = Math.max(0, this.peakLevel - 0.015);
      }
    } else {
      this.currentLevel = 0;
    }

    this.draw();
    this.animationId = requestAnimationFrame(() => this.render());
  }

  draw() {
    if (!this.ctx || !this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const width = this.canvas.width / dpr;
    const height = this.canvas.height / dpr;

    this.ctx.clearRect(0, 0, width, height);

    // Segmented LED meter styling
    const totalBars = 20;
    const gap = 2;
    const barWidth = (width - (totalBars - 1) * gap) / totalBars;
    const activeBars = Math.round(this.currentLevel * totalBars);
    const peakBarIndex = Math.min(totalBars - 1, Math.floor(this.peakLevel * totalBars));

    for (let i = 0; i < totalBars; i++) {
      const x = i * (barWidth + gap);
      const ratio = i / totalBars;

      // Color selection: Green -> Amber -> Red
      let activeColor = '#10b981'; // green
      let inactiveColor = 'rgba(255, 255, 255, 0.08)';

      if (ratio > 0.82) {
        activeColor = '#ef4444'; // clipping red
        inactiveColor = 'rgba(239, 68, 68, 0.12)';
      } else if (ratio > 0.6) {
        activeColor = '#f59e0b'; // amber
        inactiveColor = 'rgba(245, 158, 11, 0.12)';
      }

      const isActive = i < activeBars;
      const isPeak = i === peakBarIndex && this.peakLevel > 0.05;

      this.ctx.fillStyle = isActive ? activeColor : (isPeak ? activeColor : inactiveColor);
      this.ctx.beginPath();
      this.ctx.roundRect(x, 1, barWidth, height - 2, 2);
      this.ctx.fill();
    }
  }

  drawIdle() {
    if (!this.ctx || !this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const width = this.canvas.width / dpr;
    const height = this.canvas.height / dpr;

    this.ctx.clearRect(0, 0, width, height);

    const totalBars = 20;
    const gap = 2;
    const barWidth = (width - (totalBars - 1) * gap) / totalBars;

    for (let i = 0; i < totalBars; i++) {
      const x = i * (barWidth + gap);
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      this.ctx.beginPath();
      this.ctx.roundRect(x, 1, barWidth, height - 2, 2);
      this.ctx.fill();
    }
  }
}
