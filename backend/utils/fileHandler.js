const path = require('path');
const fs = require('fs');

// Allowed video/audio file extensions
const ALLOWED_EXTENSIONS = [
  '.mp4', '.avi', '.mov', '.mkv', '.webm', '.mpeg', '.mpg',
  '.mp3', '.m4a', '.aac', '.wav', '.ogg', '.flac', '.wma'
];

/**
 * Validate and normalize file path
 * @param {string} filePath - Path to the file
 * @returns {Object} { valid: boolean, normalizedPath: string, error: string }
 */
function validateFilePath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return { valid: false, error: 'File path is required' };
  }

  // Normalize the path
  let normalizedPath;
  try {
    normalizedPath = path.normalize(filePath);
    // Resolve relative paths to absolute
    if (!path.isAbsolute(normalizedPath)) {
      normalizedPath = path.resolve(normalizedPath);
    }
  } catch (error) {
    return { valid: false, error: `Invalid file path: ${error.message}` };
  }

  // Check if file exists
  if (!fs.existsSync(normalizedPath)) {
    return { valid: false, error: 'File does not exist' };
  }

  // Check if it's a file (not a directory)
  const stats = fs.statSync(normalizedPath);
  if (!stats.isFile()) {
    return { valid: false, error: 'Path is not a file' };
  }

  // Check file extension
  const ext = path.extname(normalizedPath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return { 
      valid: false, 
      error: `Unsupported file type. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}` 
    };
  }

  return { valid: true, normalizedPath };
}

/**
 * Get file info
 * @param {string} filePath - Path to the file
 * @returns {Object} File information
 */
function getFileInfo(filePath) {
  const validation = validateFilePath(filePath);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const stats = fs.statSync(validation.normalizedPath);
  return {
    path: validation.normalizedPath,
    name: path.basename(validation.normalizedPath),
    size: stats.size,
    extension: path.extname(validation.normalizedPath).toLowerCase(),
    modified: stats.mtime
  };
}

module.exports = {
  validateFilePath,
  getFileInfo,
  ALLOWED_EXTENSIONS
};

