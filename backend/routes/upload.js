const express = require('express');
const router = express.Router();
const { validateFilePath, getFileInfo } = require('../utils/fileHandler');

/**
 * POST /api/upload
 * Accept file path (no upload - files are read directly from filesystem)
 * Body: { filePath: string }
 */
router.post('/', (req, res) => {
  try {
    const { filePath } = req.body;

    if (!filePath) {
      return res.status(400).json({
        error: 'File path is required',
        message: 'Please provide a file path in the request body'
      });
    }

    const validation = validateFilePath(filePath);
    if (!validation.valid) {
      return res.status(400).json({
        error: validation.error,
        message: 'Invalid file path provided'
      });
    }

    const fileInfo = getFileInfo(validation.normalizedPath);

    res.json({
      success: true,
      file: fileInfo
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to process file path',
      message: error.message
    });
  }
});

module.exports = router;

