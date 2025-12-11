const express = require('express');
const router = express.Router();
const { validateFilePath } = require('../utils/fileHandler');
const { streamTranscribeWithWhisper } = require('../services/whisperService');

/**
 * POST /api/transcribe
 * Start transcription (streaming handled via WebSocket)
 * Body: { filePath: string, model: string, language: string, task: string, temperature: number }
 */
router.post('/', async (req, res) => {
  try {
    const { filePath, model, language, task, temperature, chunkSize, videoFilePath } = req.body;

    if (!filePath) {
      return res.status(400).json({
        error: 'File path is required'
      });
    }

    const validation = validateFilePath(filePath);
    if (!validation.valid) {
      return res.status(400).json({
        error: validation.error
      });
    }

    // Get socket ID from request body (sent by frontend)
    const socketId = req.body.socketId;
    
    if (!socketId) {
      return res.status(400).json({
        error: 'Socket ID is required for streaming transcription'
      });
    }

    // Get io instance from app
    const io = req.app.get('io');
    if (!io) {
      return res.status(500).json({
        error: 'WebSocket server not initialized'
      });
    }

    // Validate and set chunk size (5-30 seconds)
    const validChunkSize = Math.max(5, Math.min(30, chunkSize || 30));

    // Check if file has video stream for screenshots
    let videoFilePathForScreenshots = null;
    if (videoFilePath) {
      try {
        const { getVideoMetadata } = require('../services/videoService');
        const metadata = await getVideoMetadata(videoFilePath);
        if (metadata.video !== null) {
          videoFilePathForScreenshots = videoFilePath;
        }
      } catch (error) {
        console.error(`Failed to check video metadata: ${error.message}`);
      }
    }

    // Start streaming transcription with chunked processing
    const process = streamTranscribeWithWhisper(
      validation.normalizedPath,
      {
        model: model || 'turbo',
        language: language || null,
        task: task || 'transcribe',
        temperature: temperature || 0.0,
        chunkSize: validChunkSize,
        videoFilePath: videoFilePathForScreenshots // Only set if file has video stream
      },
      io,
      socketId
    );

    res.json({
      success: true,
      message: 'Transcription started',
      socketId: socketId
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to start transcription',
      message: error.message
    });
  }
});

module.exports = router;

