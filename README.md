# MeoL - Local Video Transcription (Electron App)

A desktop application for transcribing video and audio files using OpenAI Whisper, featuring real-time WebSocket streaming, GPU acceleration, and an elegant terminal-style output interface.

## Features

- 🖥️ **Desktop App** - Native Electron application with drag & drop support
- 🎥 **Local File Processing** - Read files directly from your filesystem (no uploads)
- 🎯 **Multiple Whisper Models** - Choose from tiny, base, small, medium, large, or turbo models
- 🚀 **GPU Acceleration** - Automatic CUDA/GPU detection and usage
- 🌍 **Multilingual Support** - Auto-detect or specify language
- 📊 **Real-time Streaming** - See transcription chunks as they're generated via WebSocket
- 🎨 **Modern UI** - Clean interface with terminal-style output and live transcription preview
- 📈 **Progress Tracking** - Real-time progress updates during transcription
- 🎬 **Video Metadata** - Extract and display video/audio information

## Prerequisites

- **Node.js** (v14 or higher)
- **Python** (3.8 or higher)
- **ffmpeg** - Must be installed and available in PATH
- **NVIDIA GPU** (optional, for GPU acceleration)
- **Yarn** (or npm)

## Installation

1. **Clone or navigate to the project directory**

2. **Install Python dependencies:**

   ```bash
   python -m venv venv
   venv\Scripts\activate  # On Windows
   # source venv/bin/activate  # On Linux/Mac
   pip install openai-whisper
   ```

3. **Install PyTorch with CUDA support (for GPU acceleration):**

   ```bash
   venv\Scripts\python.exe -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
   ```

4. **Install Node.js dependencies:**

   ```bash
   yarn install
   ```

5. **Verify ffmpeg is installed:**
   ```bash
   ffmpeg -version
   ```

## Usage

### Running the Electron App

```bash
yarn start
```

This will:

1. Start the backend Express server
2. Launch the Electron desktop application
3. Open the transcription interface

### Features

**File Selection:**

- **Drag & Drop**: Drag video/audio files directly into the app
- **Browse Button**: Click Browse to use native file picker
- **Auto-load**: Files are automatically loaded when selected

**Transcription:**

- Select Whisper model (turbo recommended for speed)
- Choose language (or leave as auto-detect)
- Select task: Transcribe or Translate to English
- Adjust temperature if needed
- Click "Start Transcription"
- Watch real-time chunks appear with timestamps

**Real-time Preview:**

- Live transcription chunks appear as they're processed
- Each chunk shows start/end timestamps
- Smooth animations and visual feedback
- Progress indicators

## Supported File Formats

**Video:** MP4, AVI, MOV, MKV, WebM, MPEG, MPG  
**Audio:** MP3, M4A, AAC, WAV, OGG, FLAC, WMA

## Whisper Models

| Model  | Parameters | VRAM   | Relative Speed |
| ------ | ---------- | ------ | -------------- |
| tiny   | 39M        | ~1 GB  | ~10x           |
| base   | 74M        | ~1 GB  | ~7x            |
| small  | 244M       | ~2 GB  | ~4x            |
| medium | 769M       | ~5 GB  | ~2x            |
| large  | 1550M      | ~10 GB | 1x             |
| turbo  | 809M       | ~6 GB  | ~8x            |

**Recommendation:** Use `turbo` for the best balance of speed and accuracy.

## Building for Distribution

```bash
# Build for current platform
yarn build

# Build for Windows
yarn build:win
```

Built applications will be in the `dist/` directory.

## Project Structure

```
meol/
├── electron/
│   ├── main.js              # Electron main process
│   └── preload.js           # Preload script for secure IPC
├── backend/
│   ├── server.js            # Express server with WebSocket
│   ├── routes/              # API routes
│   ├── services/             # Whisper & video services
│   └── utils/                # Utilities
├── frontend/
│   ├── index.html           # Main UI
│   ├── css/                 # Styles
│   └── js/                  # Application logic
├── venv/                    # Python virtual environment
└── package.json
```

## Troubleshooting

**GPU not detected:**

- Ensure NVIDIA drivers are installed
- Verify CUDA toolkit is installed
- Check PyTorch CUDA installation: `python -c "import torch; print(torch.cuda.is_available())"`

**File drag & drop not working:**

- Ensure you're running the Electron app (`yarn start`), not the web version
- Check that files are valid video/audio formats

**Transcription fails:**

- Verify Python venv is set up correctly
- Check that openai-whisper is installed in venv
- Ensure ffmpeg is installed and in PATH
- Check server console for error messages

## License

MIT

## Credits

Built with:

- [OpenAI Whisper](https://github.com/openai/whisper)
- [Electron](https://www.electronjs.org/)
- Express.js
- Socket.io
- ffmpeg
