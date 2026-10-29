/**
 * Luma Capture - Main Application Controller
 * Connects UI, Media Streams, Canvas Compositor, Audio Mixer, Recorder, and IndexedDB Storage.
 */

import { ScreenRecorder } from './recorder.js';
import { AudioMixer } from './audio-mixer.js';
import { CanvasCompositor } from './canvas-compositor.js';
import { storageService } from './storage.js';
import { AudioVisualizer } from './visualizer.js';

class AppController {
  constructor() {
    // Subsystem instances
    this.recorder = new ScreenRecorder();
    this.audioMixer = new AudioMixer();
    this.compositor = new CanvasCompositor();
    this.visualizer = null;

    // Streams & Tracks
    this.screenStream = null;
    this.webcamStream = null;
    this.combinedRecordingStream = null;

    // Environment configuration injected via .env (cPanel / Apache)
    const env = window.ENV || {};

    // Settings
    this.settings = {
      resolution: env.resolution || '1080p',
      fps: env.fps || 30,
      videoBitrate: env.videoBitrate || 5000000,
      audioBitrate: env.audioBitrate || 192000,
      echoCancellation: env.echoCancellation !== undefined ? env.echoCancellation : true,
      noiseSuppression: env.noiseSuppression !== undefined ? env.noiseSuppression : true,
      autoGainControl: true,
      studioMode: env.studioMode !== undefined ? env.studioMode : true,
      filenamePrefix: env.filenamePrefix || 'ScreenRecording',
      pipShape: env.pipShape || 'circle',
      pipSize: env.pipSize || 'medium'
    };

    // Current active recording preview bundle
    this.currentExport = null;

    // Draggable PiP state
    this.pipDragging = false;
    this.pipDragOffset = { x: 0, y: 0 };

    this.cacheDom();
    this.applyInitialSettings();
    this.initVisualizer();
    this.bindEvents();
    this.initStorage();
    this.updateCapabilityDisplays();
  }

  applyInitialSettings() {
    if (this.studioModeToggle) {
      this.studioModeToggle.checked = !!this.settings.studioMode;
    }
    if (this.pipShapeSelect) {
      this.pipShapeSelect.value = this.settings.pipShape;
    }
    if (this.pipSizeSelect) {
      this.pipSizeSelect.value = this.settings.pipSize;
    }
    this.setPipShape(this.settings.pipShape);
    this.setPipSize(this.settings.pipSize);
  }

  cacheDom() {
    // Stage elements
    this.stage = document.getElementById('stage');
    this.screenPreview = document.getElementById('screenPreview');
    this.stageEmpty = document.getElementById('stageEmpty');
    this.webcamWrap = document.getElementById('webcamWrap');
    this.webcamPreview = document.getElementById('webcamPreview');
    this.webcamQuickShape = document.getElementById('webcamQuickShape');
    this.webcamQuickMirror = document.getElementById('webcamQuickMirror');
    this.webcamQuickClose = document.getElementById('webcamQuickClose');

    // HUD chips
    this.recChip = document.getElementById('recChip');
    this.timerDisplay = document.getElementById('timerDisplay');
    this.metaDisplay = document.getElementById('metaDisplay');
    this.statusPill = document.getElementById('statusPill');
    this.statusText = document.getElementById('statusText');

    // Controls Dock
    this.shareBtn = document.getElementById('shareBtn');
    this.shareLabel = document.getElementById('shareLabel');
    this.recordBtn = document.getElementById('recordBtn');
    this.recordLabel = document.getElementById('recordLabel');
    this.pauseBtn = document.getElementById('pauseBtn');
    this.webcamBtn = document.getElementById('webcamBtn');
    this.micBtn = document.getElementById('micBtn');
    this.micVisualizerCanvas = document.getElementById('micVisualizer');

    // Studio toolbar
    this.studioModeToggle = document.getElementById('studioModeToggle');
    this.pipShapeSelect = document.getElementById('pipShapeSelect');
    this.pipSizeSelect = document.getElementById('pipSizeSelect');
    this.micVolumeSlider = document.getElementById('micVolumeSlider');
    this.micVolumeVal = document.getElementById('micVolumeVal');
    this.sysVolumeSlider = document.getElementById('sysVolumeSlider');
    this.sysVolumeVal = document.getElementById('sysVolumeVal');

    // Header buttons
    this.libraryBtn = document.getElementById('libraryBtn');
    this.libraryCount = document.getElementById('libraryCount');
    this.settingsBtn = document.getElementById('settingsBtn');

    // Modals
    this.settingsModal = document.getElementById('settingsModal');
    this.settingsClose = document.getElementById('settingsClose');
    this.saveSettingsBtn = document.getElementById('saveSettingsBtn');
    this.resSelect = document.getElementById('resSelect');
    this.fpsSelect = document.getElementById('fpsSelect');
    this.vBitrateSelect = document.getElementById('vBitrateSelect');
    this.aBitrateSelect = document.getElementById('aBitrateSelect');
    this.echoToggle = document.getElementById('echoToggle');
    this.noiseToggle = document.getElementById('noiseToggle');
    this.filenamePrefixInput = document.getElementById('filenamePrefixInput');

    // Preview Modal
    this.previewModal = document.getElementById('previewModal');
    this.previewClose = document.getElementById('previewClose');
    this.previewVideoPlayer = document.getElementById('previewVideoPlayer');
    this.metaDuration = document.getElementById('metaDuration');
    this.metaSize = document.getElementById('metaSize');
    this.metaFormat = document.getElementById('metaFormat');
    this.metaRes = document.getElementById('metaRes');
    this.downloadBtn = document.getElementById('downloadBtn');
    this.saveLibraryBtn = document.getElementById('saveLibraryBtn');
    this.snapshotBtn = document.getElementById('snapshotBtn');

    // Library Modal
    this.libraryModal = document.getElementById('libraryModal');
    this.libraryClose = document.getElementById('libraryClose');
    this.libraryGrid = document.getElementById('libraryGrid');
    this.storageUsageText = document.getElementById('storageUsageText');

    // Toast Container
    this.toastContainer = document.getElementById('toastContainer');
  }

  initVisualizer() {
    if (this.micVisualizerCanvas) {
      this.visualizer = new AudioVisualizer(this.micVisualizerCanvas);
      this.visualizer.drawIdle();
    }
  }

  async initStorage() {
    try {
      await storageService.init();
      this.refreshLibraryCount();
      storageService.subscribe(() => {
        this.refreshLibraryCount();
      });
    } catch (err) {
      console.warn('Storage initialization fallback:', err);
    }
  }

  async refreshLibraryCount() {
    try {
      const recordings = await storageService.getAllRecordings();
      if (this.libraryCount) {
        this.libraryCount.textContent = String(recordings.length);
      }
    } catch (e) {
      console.warn('Could not read recording count', e);
    }
  }

  updateCapabilityDisplays() {
    const supportedMime = this.recorder.supportedMimeType;
    if (this.metaDisplay) {
      this.metaDisplay.textContent = supportedMime ? supportedMime.split(';')[0] : 'Ready';
    }
  }

  bindEvents() {
    // Screen sharing
    this.shareBtn?.addEventListener('click', () => this.toggleScreenShare());

    // Recording Controls
    this.recordBtn?.addEventListener('click', () => this.toggleRecording());
    this.pauseBtn?.addEventListener('click', () => this.togglePause());

    // Webcam Toggle
    this.webcamBtn?.addEventListener('click', () => this.toggleWebcam());

    // Microphone Toggle
    this.micBtn?.addEventListener('click', () => this.toggleMicrophone());

    // Studio toolbar controls
    this.studioModeToggle?.addEventListener('change', (e) => {
      this.settings.studioMode = e.target.checked;
      this.showToast(`Studio Mode ${this.settings.studioMode ? 'Enabled' : 'Disabled'}`, 'info');
    });

    this.pipShapeSelect?.addEventListener('change', (e) => {
      this.setPipShape(e.target.value);
    });

    this.pipSizeSelect?.addEventListener('change', (e) => {
      this.setPipSize(e.target.value);
    });

    // Volume sliders
    this.micVolumeSlider?.addEventListener('input', (e) => {
      const vol = parseFloat(e.target.value);
      this.audioMixer.setMicVolume(vol);
      if (this.micVolumeVal) this.micVolumeVal.textContent = `${Math.round(vol * 100)}%`;
    });

    this.sysVolumeSlider?.addEventListener('input', (e) => {
      const vol = parseFloat(e.target.value);
      this.audioMixer.setSystemVolume(vol);
      if (this.sysVolumeVal) this.sysVolumeVal.textContent = `${Math.round(vol * 100)}%`;
    });

    // Webcam Quick Bar buttons
    this.webcamQuickShape?.addEventListener('click', () => {
      const current = this.compositor.pipConfig.shape;
      const next = current === 'circle' ? 'rectangle' : 'circle';
      this.setPipShape(next);
      if (this.pipShapeSelect) this.pipShapeSelect.value = next;
    });

    this.webcamQuickMirror?.addEventListener('click', () => {
      const nextMirrored = !this.compositor.pipConfig.mirrored;
      this.compositor.updatePipConfig({ mirrored: nextMirrored });
      this.webcamPreview?.classList.toggle('mirrored', nextMirrored);
    });

    this.webcamQuickClose?.addEventListener('click', () => {
      this.toggleWebcam(false);
    });

    // Webcam Draggable positioning on stage
    this.setupPipDraggable();

    // Modals open/close
    this.settingsBtn?.addEventListener('click', () => this.openSettingsModal());
    this.settingsClose?.addEventListener('click', () => this.closeModal(this.settingsModal));
    this.saveSettingsBtn?.addEventListener('click', () => this.saveSettingsFromModal());

    this.libraryBtn?.addEventListener('click', () => this.openLibraryModal());
    this.libraryClose?.addEventListener('click', () => this.closeModal(this.libraryModal));

    this.previewClose?.addEventListener('click', () => this.closeModal(this.previewModal));

    // Preview Actions
    this.downloadBtn?.addEventListener('click', () => this.downloadCurrentExport());
    this.saveLibraryBtn?.addEventListener('click', () => this.saveCurrentExportToLibrary());
    this.snapshotBtn?.addEventListener('click', () => this.captureSnapshotFromPreview());

    // Recorder callbacks
    this.recorder.onStateChange = (state) => this.handleRecorderStateChange(state);
    this.recorder.onTick = (sec, formatted) => {
      if (this.timerDisplay) this.timerDisplay.textContent = formatted;
    };
    this.recorder.onError = (err) => {
      this.showToast(`Recording error: ${err.message || 'Unknown error'}`, 'error');
    };

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
  }

  /* ================= SCREEN CAPTURE ================= */

  async toggleScreenShare() {
    if (this.screenStream) {
      this.stopScreenShare();
      return;
    }
    await this.startScreenShare();
  }

  async startScreenShare() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      this.showToast('Your browser does not support screen capture (getDisplayMedia).', 'error');
      return;
    }

    try {
      // Configure display media constraints
      const constraints = {
        video: {
          cursor: 'always',
          displaySurface: 'monitor'
        },
        audio: {
          echoCancellation: this.settings.echoCancellation,
          noiseSuppression: this.settings.noiseSuppression
        }
      };

      const stream = await navigator.mediaDevices.getDisplayMedia(constraints);
      this.screenStream = stream;

      // Assign to preview element
      this.screenPreview.srcObject = stream;
      await this.screenPreview.play();

      // UI state
      this.stageEmpty?.classList.add('hidden');
      if (this.shareLabel) this.shareLabel.textContent = 'Stop Sharing';
      this.shareBtn?.classList.add('active');

      const videoTrack = stream.getVideoTracks()[0];
      const settings = videoTrack.getSettings ? videoTrack.getSettings() : {};
      const resText = settings.width && settings.height ? `${settings.width}x${settings.height}` : 'Screen Active';
      const fpsText = settings.frameRate ? `${Math.round(settings.frameRate)}fps` : '';
      if (this.metaDisplay) {
        this.metaDisplay.textContent = `${resText} ${fpsText}`;
      }

      // Check if system / tab audio is present
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        await this.audioMixer.attachSystemAudio(audioTracks[0]);
        this.showToast('Screen & System Audio connected.', 'success');
      } else {
        this.audioMixer.detachSystemAudio();
        this.showToast('Screen connected. (No system audio shared)', 'info');
      }

      // Handle user stopping screen share from native browser banner
      videoTrack.onended = () => {
        this.stopScreenShare();
      };
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        this.showToast('Screen sharing permission was dismissed or denied.', 'warning');
      } else {
        console.error('Error starting screen share:', err);
        this.showToast(`Failed to capture screen: ${err.message}`, 'error');
      }
    }
  }

  stopScreenShare() {
    if (this.recorder.state === 'recording' || this.recorder.state === 'paused') {
      // Automatically finalize recording before cleaning up
      this.showToast('Screen sharing ended. Finalizing recording...', 'info');
      this.stopRecording();
    }

    if (this.screenStream) {
      this.screenStream.getTracks().forEach((track) => track.stop());
      this.screenStream = null;
    }

    if (this.screenPreview) {
      this.screenPreview.srcObject = null;
    }

    this.audioMixer.detachSystemAudio();

    this.stageEmpty?.classList.remove('hidden');
    if (this.shareLabel) this.shareLabel.textContent = 'Select Screen';
    this.shareBtn?.classList.remove('active');
    if (this.metaDisplay) this.metaDisplay.textContent = 'Idle';
  }

  /* ================= WEBCAM & PIP ================= */

  async toggleWebcam(forceState = null) {
    const shouldEnable = forceState !== null ? forceState : !this.webcamStream;

    if (!shouldEnable) {
      if (this.webcamStream) {
        this.webcamStream.getTracks().forEach(t => t.stop());
        this.webcamStream = null;
      }
      if (this.webcamPreview) this.webcamPreview.srcObject = null;
      if (this.webcamWrap) this.webcamWrap.hidden = true;
      this.webcamBtn?.setAttribute('aria-pressed', 'false');
      this.webcamBtn?.classList.remove('active');
      this.compositor.updatePipConfig({ visible: false });
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      this.showToast('Your browser does not support webcam capture (getUserMedia).', 'error');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: false
      });

      this.webcamStream = stream;
      if (this.webcamPreview) {
        this.webcamPreview.srcObject = stream;
        await this.webcamPreview.play();
      }

      if (this.webcamWrap) {
        this.webcamWrap.hidden = false;
        // Position initially bottom-right
        this.applyPipInitialPosition();
      }

      this.webcamBtn?.setAttribute('aria-pressed', 'true');
      this.webcamBtn?.classList.add('active');

      this.compositor.updatePipConfig({ visible: true });
      this.showToast('Webcam overlay enabled.', 'success');
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        this.showToast('Webcam permission denied.', 'warning');
      } else {
        console.error('Webcam error:', err);
        this.showToast(`Webcam error: ${err.message}`, 'error');
      }
    }
  }

  setPipShape(shape) {
    if (!this.webcamWrap) return;
    this.webcamWrap.classList.remove('shape-circle', 'shape-rectangle');
    this.webcamWrap.classList.add(`shape-${shape}`);
    this.compositor.updatePipConfig({ shape });
  }

  setPipSize(sizePreset) {
    let ratio = 0.22;
    if (sizePreset === 'small') ratio = 0.16;
    if (sizePreset === 'large') ratio = 0.30;
    this.compositor.updatePipConfig({ sizePreset, sizeRatio: ratio });

    if (this.webcamWrap) {
      const stageW = this.stage.clientWidth || 960;
      this.webcamWrap.style.width = `${Math.round(stageW * ratio)}px`;
    }
  }

  applyPipInitialPosition() {
    if (!this.webcamWrap || !this.stage) return;
    const stageRect = this.stage.getBoundingClientRect();
    const width = Math.round(stageRect.width * 0.22);
    this.webcamWrap.style.width = `${width}px`;
    this.webcamWrap.style.left = `${Math.round(stageRect.width * 0.74)}px`;
    this.webcamWrap.style.top = `${Math.round(stageRect.height * 0.65)}px`;

    this.compositor.updatePipConfig({
      xRatio: 0.74,
      yRatio: 0.65
    });
  }

  setupPipDraggable() {
    if (!this.webcamWrap || !this.stage) return;

    const onPointerDown = (e) => {
      // Don't drag if clicking buttons inside the quick toolbar
      if (e.target.closest('.webcam-quick-bar') || e.target.closest('.webcam-resize-handle')) {
        return;
      }
      this.pipDragging = true;
      const wrapRect = this.webcamWrap.getBoundingClientRect();
      this.pipDragOffset.x = e.clientX - wrapRect.left;
      this.pipDragOffset.y = e.clientY - wrapRect.top;
      this.webcamWrap.setPointerCapture?.(e.pointerId);
    };

    const onPointerMove = (e) => {
      if (!this.pipDragging) return;
      const stageRect = this.stage.getBoundingClientRect();
      const wrapRect = this.webcamWrap.getBoundingClientRect();

      let newLeft = e.clientX - stageRect.left - this.pipDragOffset.x;
      let newTop = e.clientY - stageRect.top - this.pipDragOffset.y;

      // Constrain within stage bounds
      const maxLeft = stageRect.width - wrapRect.width;
      const maxTop = stageRect.height - wrapRect.height;

      newLeft = Math.max(8, Math.min(maxLeft - 8, newLeft));
      newTop = Math.max(8, Math.min(maxTop - 8, newTop));

      this.webcamWrap.style.left = `${newLeft}px`;
      this.webcamWrap.style.top = `${newTop}px`;

      // Update normalized coordinates for canvas compositor Studio Mode
      const xRatio = maxLeft > 0 ? newLeft / maxLeft : 0;
      const yRatio = maxTop > 0 ? newTop / maxTop : 0;
      this.compositor.updatePipConfig({ xRatio, yRatio });
    };

    const onPointerUp = (e) => {
      if (this.pipDragging) {
        this.pipDragging = false;
        try {
          this.webcamWrap.releasePointerCapture?.(e.pointerId);
        } catch (err) {}
      }
    };

    this.webcamWrap.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  /* ================= MICROPHONE ================= */

  async toggleMicrophone() {
    if (this.audioMixer.micStream) {
      this.audioMixer.detachMicrophone(true);
      this.visualizer?.stop();
      this.micBtn?.setAttribute('aria-pressed', 'false');
      this.micBtn?.classList.remove('active');
      this.showToast('Microphone disabled.', 'info');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      this.showToast('getUserMedia is not supported.', 'error');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: this.settings.echoCancellation,
          noiseSuppression: this.settings.noiseSuppression,
          autoGainControl: this.settings.autoGainControl
        },
        video: false
      });

      await this.audioMixer.attachMicrophone(stream);

      // Start audio visualizer
      const micAnalyser = this.audioMixer.getMicAnalyser();
      if (micAnalyser && this.visualizer) {
        this.visualizer.connect(micAnalyser);
        this.visualizer.start();
      }

      this.micBtn?.setAttribute('aria-pressed', 'true');
      this.micBtn?.classList.add('active');
      this.showToast('Microphone enabled & visualizer active.', 'success');
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        this.showToast('Microphone permission denied.', 'warning');
      } else {
        console.error('Microphone error:', err);
        this.showToast(`Microphone error: ${err.message}`, 'error');
      }
    }
  }

  /* ================= RECORDING ENGINE ================= */

  async toggleRecording() {
    if (this.recorder.state === 'recording' || this.recorder.state === 'paused') {
      await this.stopRecording();
    } else {
      await this.startRecording();
    }
  }

  togglePause() {
    if (this.recorder.state === 'recording') {
      this.recorder.pause();
    } else if (this.recorder.state === 'paused') {
      this.recorder.resume();
    }
  }

  async startRecording() {
    // If no screen has been captured yet, prompt for screen capture first
    if (!this.screenStream) {
      await this.startScreenShare();
      if (!this.screenStream) return;
    }

    try {
      // 1. Determine video track: Studio Mode Canvas Compositor vs Direct Screen Track
      let finalVideoTrack = null;

      const isStudio = this.settings.studioMode && this.webcamStream;
      if (isStudio) {
        // Configure compositor
        const dims = this.getResolutionDimensions();
        this.compositor.setDimensions(dims.width, dims.height, this.settings.fps);
        this.compositor.setSources(this.screenPreview, this.webcamPreview);
        const compStream = this.compositor.startStream();
        finalVideoTrack = compStream.getVideoTracks()[0];
      } else {
        finalVideoTrack = this.screenStream.getVideoTracks()[0];
      }

      if (!finalVideoTrack) {
        throw new Error('Unable to acquire a valid video track for recording.');
      }

      // 2. Determine Audio Track: Web Audio Mixer
      const tracksToRecord = [finalVideoTrack];
      const mixedAudioTrack = this.audioMixer.getMixedTrack();
      if (mixedAudioTrack) {
        tracksToRecord.push(mixedAudioTrack);
      }

      this.combinedRecordingStream = new MediaStream(tracksToRecord);

      // 3. Start MediaRecorder
      this.recorder.start(this.combinedRecordingStream, {
        videoBitrate: this.settings.videoBitrate,
        audioBitrate: this.settings.audioBitrate
      });

      this.showToast('Recording started.', 'success');
    } catch (err) {
      console.error('Failed to start recording:', err);
      this.showToast(`Start failed: ${err.message}`, 'error');
    }
  }

  async stopRecording() {
    if (this.recorder.state === 'idle') return;

    try {
      const result = await this.recorder.stop();
      if (this.compositor.isRunning) {
        this.compositor.stopStream();
      }

      if (result) {
        this.currentExport = result;
        this.openPreviewModal(result);
        this.showToast('Recording processed successfully!', 'success');
      }
    } catch (err) {
      console.error('Stop recording error:', err);
      this.showToast(`Error stopping recording: ${err.message}`, 'error');
    }
  }

  handleRecorderStateChange(state) {
    if (this.statusPill) this.statusPill.setAttribute('data-state', state);
    if (this.statusText) {
      this.statusText.textContent = state.charAt(0).toUpperCase() + state.slice(1);
    }

    if (state === 'recording') {
      this.recChip?.removeAttribute('hidden');
      if (this.recordLabel) this.recordLabel.textContent = 'Stop Recording';
      this.recordBtn?.classList.add('recording');
      if (this.pauseBtn) this.pauseBtn.disabled = false;
      if (this.pauseBtn) this.pauseBtn.textContent = 'Pause';
    } else if (state === 'paused') {
      this.recChip?.removeAttribute('hidden');
      if (this.pauseBtn) this.pauseBtn.textContent = 'Resume';
    } else if (state === 'idle') {
      this.recChip?.setAttribute('hidden', '');
      if (this.recordLabel) this.recordLabel.textContent = 'Start Recording';
      this.recordBtn?.classList.remove('recording');
      if (this.pauseBtn) {
        this.pauseBtn.disabled = true;
        this.pauseBtn.textContent = 'Pause';
      }
      if (this.timerDisplay) this.timerDisplay.textContent = '00:00:00';
    }
  }

  getResolutionDimensions() {
    switch (this.settings.resolution) {
      case '720p':
        return { width: 1280, height: 720 };
      case '1440p':
        return { width: 2560, height: 1440 };
      case '1080p':
      default:
        return { width: 1920, height: 1080 };
    }
  }

  /* ================= PREVIEW & EXPORT ================= */

  openPreviewModal(recordingData) {
    if (!this.previewModal) return;

    this.previewVideoPlayer.src = recordingData.url;
    if (this.metaDuration) this.metaDuration.textContent = this.recorder.formatDuration(recordingData.duration);
    if (this.metaSize) this.metaSize.textContent = this.formatFileSize(recordingData.size);
    if (this.metaFormat) this.metaFormat.textContent = recordingData.extension.toUpperCase();
    if (this.metaRes) this.metaRes.textContent = `${recordingData.width}x${recordingData.height}`;

    this.previewModal.classList.add('open');
  }

  downloadCurrentExport() {
    if (!this.currentExport) return;
    const prefix = this.settings.filenamePrefix || 'Recording';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${prefix}_${timestamp}.${this.currentExport.extension}`;

    const a = document.createElement('a');
    a.href = this.currentExport.url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    this.showToast(`Saved download: ${filename}`, 'success');
  }

  async saveCurrentExportToLibrary() {
    if (!this.currentExport) return;
    try {
      const title = `${this.settings.filenamePrefix} - ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      await storageService.saveRecording({
        title,
        blob: this.currentExport.blob,
        mimeType: this.currentExport.mimeType,
        extension: this.currentExport.extension,
        size: this.currentExport.size,
        duration: this.currentExport.duration,
        width: this.currentExport.width,
        height: this.currentExport.height,
        thumbnail: this.currentExport.thumbnail
      });

      this.showToast('Saved to local Recordings Library!', 'success');
    } catch (err) {
      console.error('Save to storage error:', err);
      this.showToast(`Failed to save: ${err.message}`, 'error');
    }
  }

  captureSnapshotFromPreview() {
    if (!this.previewVideoPlayer) return;

    try {
      const video = this.previewVideoPlayer;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1920;
      canvas.height = video.videoHeight || 1080;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `Snapshot_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      this.showToast('Snapshot captured as PNG.', 'success');
    } catch (err) {
      console.error('Snapshot failed:', err);
      this.showToast('Snapshot capture failed.', 'error');
    }
  }

  /* ================= LIBRARY MANAGEMENT ================= */

  async openLibraryModal() {
    if (!this.libraryModal) return;
    this.libraryModal.classList.add('open');
    await this.renderLibraryRecordings();
  }

  async renderLibraryRecordings() {
    if (!this.libraryGrid) return;
    this.libraryGrid.innerHTML = '<div class="empty-library"><p>Loading recordings...</p></div>';

    try {
      const recordings = await storageService.getAllRecordings();

      // Storage quota estimate
      const estimate = await storageService.getStorageEstimate();
      if (this.storageUsageText && estimate) {
        const usageMb = (estimate.usage / (1024 * 1024)).toFixed(1);
        const quotaMb = (estimate.quota / (1024 * 1024)).toFixed(0);
        this.storageUsageText.textContent = `Used ${usageMb} MB of ${quotaMb} MB (~${estimate.percent}%)`;
      }

      if (recordings.length === 0) {
        this.libraryGrid.innerHTML = `
          <div class="empty-library" style="grid-column: 1 / -1;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="2" y="4" width="20" height="15" rx="3"></rect>
              <polygon points="10 9 15 12 10 15 10 9"></polygon>
            </svg>
            <h3>No recordings saved yet</h3>
            <p>Recorded videos saved to your library will be securely stored in your browser here.</p>
          </div>
        `;
        return;
      }

      this.libraryGrid.innerHTML = '';
      for (const item of recordings) {
        const card = document.createElement('div');
        card.className = 'recording-card';

        const dateStr = new Date(item.createdAt).toLocaleDateString([], {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        const thumbHtml = item.thumbnail
          ? `<img class="recording-thumb" src="${item.thumbnail}" alt="Thumbnail" />`
          : `<div class="recording-thumb-empty"><span>No Preview</span></div>`;

        card.innerHTML = `
          <div class="recording-thumb-wrap" data-id="${item.id}">
            ${thumbHtml}
            <div class="thumb-play-overlay">
              <div class="play-circle">
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <polygon points="8 5 19 12 8 19 8 5"></polygon>
                </svg>
              </div>
            </div>
            <span class="recording-duration-badge">${this.recorder.formatDuration(item.duration)}</span>
          </div>

          <div class="recording-info">
            <div class="recording-title-row">
              <span class="recording-title" title="Click to rename" data-action="rename" data-id="${item.id}">
                ${this.escapeHtml(item.title)}
              </span>
            </div>
            <div class="recording-meta">
              <span>${dateStr}</span>
              <span>•</span>
              <span>${this.formatFileSize(item.size)}</span>
              <span>•</span>
              <span>${item.extension.toUpperCase()}</span>
            </div>
            <div class="recording-actions">
              <button class="btn btn-ghost" data-action="play" data-id="${item.id}" title="Play preview">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
              </button>
              <button class="btn btn-ghost" data-action="download" data-id="${item.id}" title="Download file">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </button>
              <button class="btn btn-ghost" data-action="delete" data-id="${item.id}" title="Delete recording">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #ef4444;">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>
        `;

        // Card button delegates
        card.querySelector('.recording-thumb-wrap').onclick = () => this.playSavedRecording(item.id);
        card.querySelector('[data-action="play"]').onclick = () => this.playSavedRecording(item.id);
        card.querySelector('[data-action="download"]').onclick = () => this.downloadSavedRecording(item.id);
        card.querySelector('[data-action="delete"]').onclick = () => this.deleteSavedRecording(item.id);
        card.querySelector('[data-action="rename"]').onclick = () => this.renameSavedRecording(item.id, item.title);

        this.libraryGrid.appendChild(card);
      }
    } catch (err) {
      console.error('Error loading library recordings:', err);
      this.libraryGrid.innerHTML = `<div class="empty-library"><p>Error loading library recordings: ${err.message}</p></div>`;
    }
  }

  async playSavedRecording(id) {
    const rec = await storageService.getRecording(id);
    if (!rec || !rec.blob) {
      this.showToast('Recording file not found in storage.', 'error');
      return;
    }
    const url = URL.createObjectURL(rec.blob);
    this.currentExport = { ...rec, url };
    this.closeModal(this.libraryModal);
    this.openPreviewModal(this.currentExport);
  }

  async downloadSavedRecording(id) {
    const rec = await storageService.getRecording(id);
    if (!rec || !rec.blob) return;

    const url = URL.createObjectURL(rec.blob);
    const cleanTitle = rec.title.replace(/[/\\?%*:|"<>]/g, '-');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cleanTitle}.${rec.extension || 'webm'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async deleteSavedRecording(id) {
    if (!confirm('Are you sure you want to delete this recording from your library?')) {
      return;
    }
    await storageService.deleteRecording(id);
    this.showToast('Recording deleted.', 'info');
    await this.renderLibraryRecordings();
  }

  async renameSavedRecording(id, oldTitle) {
    const newTitle = prompt('Enter a new title for this recording:', oldTitle);
    if (newTitle && newTitle.trim() && newTitle.trim() !== oldTitle) {
      await storageService.updateTitle(id, newTitle.trim());
      this.showToast('Recording renamed.', 'success');
      await this.renderLibraryRecordings();
    }
  }

  /* ================= SETTINGS ================= */

  openSettingsModal() {
    if (!this.settingsModal) return;
    if (this.resSelect) this.resSelect.value = this.settings.resolution;
    if (this.fpsSelect) this.fpsSelect.value = String(this.settings.fps);
    if (this.vBitrateSelect) this.vBitrateSelect.value = String(this.settings.videoBitrate);
    if (this.aBitrateSelect) this.aBitrateSelect.value = String(this.settings.audioBitrate);
    if (this.echoToggle) this.echoToggle.checked = this.settings.echoCancellation;
    if (this.noiseToggle) this.noiseToggle.checked = this.settings.noiseSuppression;
    if (this.filenamePrefixInput) this.filenamePrefixInput.value = this.settings.filenamePrefix;

    this.settingsModal.classList.add('open');
  }

  saveSettingsFromModal() {
    if (this.resSelect) this.settings.resolution = this.resSelect.value;
    if (this.fpsSelect) this.settings.fps = parseInt(this.fpsSelect.value, 10);
    if (this.vBitrateSelect) this.settings.videoBitrate = parseInt(this.vBitrateSelect.value, 10);
    if (this.aBitrateSelect) this.settings.audioBitrate = parseInt(this.aBitrateSelect.value, 10);
    if (this.echoToggle) this.settings.echoCancellation = this.echoToggle.checked;
    if (this.noiseToggle) this.settings.noiseSuppression = this.noiseToggle.checked;
    if (this.filenamePrefixInput) this.settings.filenamePrefix = this.filenamePrefixInput.value.trim() || 'ScreenRecording';

    this.closeModal(this.settingsModal);
    this.showToast('Settings saved successfully.', 'success');
  }

  closeModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.remove('open');
    if (modalEl === this.previewModal && this.previewVideoPlayer) {
      this.previewVideoPlayer.pause();
    }
  }

  /* ================= KEYBOARD SHORTCUTS ================= */

  handleKeyboardShortcuts(e) {
    // Avoid handling shortcuts when typing inside inputs
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;

    // Space: Start / Stop Recording
    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault();
      this.toggleRecording();
    }

    // P: Pause / Resume
    if (e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey) {
      this.togglePause();
    }

    // M: Toggle Mic
    if (e.key.toLowerCase() === 'm' && !e.ctrlKey && !e.metaKey) {
      this.toggleMicrophone();
    }

    // W: Toggle Webcam
    if (e.key.toLowerCase() === 'w' && !e.ctrlKey && !e.metaKey) {
      this.toggleWebcam();
    }

    // Escape: Close any open modal
    if (e.key === 'Escape') {
      this.closeModal(this.previewModal);
      this.closeModal(this.settingsModal);
      this.closeModal(this.libraryModal);
    }
  }

  /* ================= TOAST NOTIFICATION UTILS ================= */

  showToast(message, type = 'info', duration = 3500) {
    if (!this.toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    } else if (type === 'error') {
      iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
    } else if (type === 'warning') {
      iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
    } else {
      iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    }

    toast.innerHTML = `${iconSvg}<span>${this.escapeHtml(message)}</span>`;
    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, duration);
  }

  /* ================= HELPERS ================= */

  formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

// Instantiate on DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
  window.app = new AppController();
});
