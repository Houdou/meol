const express = require('express');
const router = express.Router();
const { validateFilePath } = require('../utils/fileHandler');
const { getVideoMetadata, formatDuration, formatFileSize } = require('../services/videoService');

/**
 * POST /api/metadata
 * Get video/audio metadata
 * Body: { filePath: string }
 */
router.post('/', async (req, res) => {
  try {
    const { filePath } = req.body;

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

    const metadata = await getVideoMetadata(validation.normalizedPath);

    // Format the response with human-readable values
    const formattedMetadata = {
      ...metadata,
      format: {
        ...metadata.format,
        duration_formatted: formatDuration(metadata.format.duration),
        size_formatted: formatFileSize(metadata.format.size),
        bit_rate_formatted: formatFileSize(metadata.format.bit_rate / 8) + '/s'
      }
    };

    res.json({
      success: true,
      metadata: formattedMetadata
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to extract metadata',
      message: error.message
    });
  }
});

module.exports = router;

