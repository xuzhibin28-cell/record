# Luma Capture — Web Screen Recorder & Video Capture System

A complete, production-grade, web-based screen recording and video studio that runs directly inside modern web browsers. Built with native web APIs without external bloated frameworks or database dependencies.

Persists video blobs and metadata locally on the client machine using **IndexedDB**, and supports environment-level configuration via **`.env`** for easy deployment to **cPanel / Apache / Shared Hosting**.

---

## 🚀 Key Features

1. **Screen & Tab Capture**:
   - Supports capturing entire monitors, application windows, or browser tabs via `navigator.mediaDevices.getDisplayMedia`.
   - Real-time preview with automatic detection of user-initiated stop events.

2. **Webcam Picture-in-Picture (PiP)**:
   - Live camera overlay draggable to any position on the screen stage.
   - Switchable shapes: **Circle** or **Rectangle** (with rounded corners).
   - Mirror mode toggle for natural camera framing.
   - Multi-tier sizing (Small, Medium, Large) and smooth hover quick actions.

3. **Studio Canvas Compositor (Studio Mode)**:
   - Composites screen video and draggable webcam PiP into a unified canvas in real-time using HTML5 Canvas API and `canvas.captureStream()`.
   - Ensures webcam overlay is burned directly into the exported video file, not just displayed on the web page.

4. **Multi-Source Audio Mixing**:
   - Microphone capture via `navigator.mediaDevices.getUserMedia`.
   - System / tab audio capture when supported by browser screen sharing.
   - Mixed cleanly using the **Web Audio API** (`AudioContext`, `createGain`, `createAnalyser`, `createMediaStreamDestination`).
   - Independent volume sliders for microphone and system audio.
   - Echo cancellation, noise suppression, and auto gain control toggles.
   - Real-time LED-style audio level visualizer with peak hold.

5. **Robust MediaRecorder Engine**:
   - Automatic codec negotiation probing (`video/webm;codecs=vp9,opus`, `video/webm;codecs=vp8,opus`, `video/mp4`).
   - Configurable video bitrate (2.5 Mbps to 15 Mbps) and audio bitrate (128 kbps to 256 kbps).
   - Accurate duration tracking that cleanly pauses when recording is paused.
   - Frame thumbnail generation for library cards.

6. **Recording Preview & Export**:
   - Video player with standard controls.
   - Duration, file size, and format indicators.
   - **One-click Download**: Formatted filename with timestamp (`ScreenRecording_YYYY-MM-DD_HH-mm-ss.webm`).
   - **Save to Library**: Saves video Blob directly to IndexedDB.
   - **Snapshot PNG**: Grab high-resolution screenshots from recorded video.

7. **Local Recordings Library (IndexedDB)**:
   - Persistent client-side storage without requiring MySQL or any backend database.
   - Storage usage and quota indicator.
   - Play/preview saved videos directly.
   - Rename titles with inline validation.
   - Instant re-download or deletion with confirmation.

8. **Keyboard Shortcuts**:
   - <kbd>Space</kbd>: Start / Stop Recording
   - <kbd>P</kbd>: Pause / Resume
   - <kbd>M</kbd>: Toggle Microphone
   - <kbd>W</kbd>: Toggle Webcam Overlay
   - <kbd>Esc</kbd>: Close open modals

---

## ⚙️ Environment Configuration (`.env`)

You can easily customize the application name, default resolution, bitrates, audio settings, and branding by editing the `.env` file:

```ini
# Application Branding & Info
APP_NAME="Luma Capture"
APP_TAGLINE="Web Screen & Audio Studio"
APP_ENV=production
APP_URL="https://yourdomain.com/record"

# Default Recording Pipeline Settings (720p | 1080p | 1440p)
DEFAULT_RESOLUTION=1080p

# Options: 30 | 60
DEFAULT_FPS=30

# Video Bitrate (2500000 = 2.5 Mbps, 5000000 = 5 Mbps, 8000000 = 8 Mbps, 15000000 = 15 Mbps)
DEFAULT_VIDEO_BITRATE=5000000

# Audio Bitrate (128000 = 128 kbps, 192000 = 192 kbps, 256000 = 256 kbps)
DEFAULT_AUDIO_BITRATE=192000

# Default Export Filename Prefix
DEFAULT_FILENAME_PREFIX="ScreenRecording"

# Enable Studio Canvas Mode by Default (Composites screen + webcam overlay directly)
ENABLE_STUDIO_MODE=true

# Audio Enhancements by Default
ENABLE_ECHO_CANCELLATION=true
ENABLE_NOISE_SUPPRESSION=true

# PiP Camera Default Shape: circle | rectangle
DEFAULT_PIP_SHAPE=circle

# PiP Camera Default Size: small | medium | large
DEFAULT_PIP_SIZE=medium
```

---

## 📁 Project Structure

```text
record/
├── .env                     # Active environment configuration
├── .env.example             # Configuration template for deployments
├── .htaccess                # Apache/cPanel security rules (blocks .env access, enables gzip)
├── config.php               # Lightweight, zero-dependency .env parser
├── index.html               # Main dashboard UI shell and modals
├── index.php                # Entry point that parses .env and serves the app
├── record.php               # Alternative entry point
├── css/
│   ├── style.css            # Dark navy theme, glassmorphic design, stage layout
│   └── components.css       # Buttons, PiP overlay, sliders, modals, library grid, toast
├── js/
│   ├── app.js               # Application orchestration and UI event handling
│   ├── recorder.js          # MediaRecorder state machine and timing logic
│   ├── audio-mixer.js       # Web Audio API routing, gain, and multi-track mixing
│   ├── canvas-compositor.js # Studio Mode real-time canvas compositor
│   ├── storage.js           # IndexedDB persistence manager
│   └── visualizer.js        # Real-time LED audio visualizer
└── README.md                # Documentation and guide
```

---

## 🌐 Deploying to cPanel

1. **Upload Files**:
   - Log into your **cPanel File Manager**.
   - Navigate to `public_html/` (or a subfolder like `public_html/record/`).
   - Upload all files and folders from this project.
   - *Tip: In cPanel File Manager, click **Settings** (top right) and check **"Show Hidden Files (dotfiles)"** so `.env` and `.htaccess` are visible.*

2. **Configure `.env`**:
   - Rename `.env.example` to `.env` (or edit the existing `.env` directly in cPanel File Manager).
   - Set `APP_URL` to your domain (e.g. `https://yourdomain.com/record`).
   - Configure branding or default recording settings as needed.

3. **Verify Security**:
   - The included `.htaccess` file automatically blocks all public access to `.env` and `.git` files, returning `403 Forbidden` if anyone attempts to access `https://yourdomain.com/record/.env`.

4. **SSL / HTTPS (Important)**:
   - Modern browsers require HTTPS (or `localhost`) to permit `getDisplayMedia` (screen capture) and `getUserMedia` (camera/mic).
   - Ensure an SSL certificate (such as cPanel's free **AutoSSL** or Let's Encrypt) is active on your domain.

---

## 🔒 Security & Privacy
- **100% Client-Side**: No video or audio is ever uploaded to any external server.
- **No Database Needed**: All recordings and metadata stay safely inside your browser's private IndexedDB storage.
- **XSS Protection**: User-entered titles are sanitized before DOM rendering.
