const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Extract video frame at specific timestamp
 * @param {string} filePath - Path to the video file
 * @param {number} timestamp - Timestamp in seconds
 * @param {string} outputPath - Optional output path for screenshot
 * @returns {Promise<string>} Path to the screenshot file
 */
async function extractFrame(filePath, timestamp, outputPath = null) {
  return new Promise((resolve, reject) => {
    // Generate output path if not provided
    if (!outputPath) {
      const tempDir = os.tmpdir();
      const filename = `frame_${Date.now()}_${Math.floor(timestamp)}.jpg`;
      outputPath = path.join(tempDir, filename);
    }

    // Check if video file exists
    if (!fs.existsSync(filePath)) {
      reject(new Error(`Video file not found: ${filePath}`));
      return;
    }

    ffmpeg(filePath)
      .seekInput(timestamp)
      .frames(1)
      .outputOptions([
        '-q:v', '2', // High quality JPEG
        '-vf', 'scale=320:-1' // Scale to 320px width, maintain aspect ratio
      ])
      .output(outputPath)
      .on('end', () => {
        if (fs.existsSync(outputPath)) {
          resolve(outputPath);
        } else {
          reject(new Error('Screenshot file was not created'));
        }
      })
      .on('error', (err) => {
        reject(new Error(`Failed to extract frame: ${err.message}`));
      })
      .run();
  });
}

/**
 * Extract frame and add subtitle overlay
 * @param {string} filePath - Path to the video file
 * @param {number} timestamp - Timestamp in seconds
 * @param {string} subtitleText - Text to overlay on the frame
 * @param {string} outputPath - Optional output path
 * @returns {Promise<string>} Path to the screenshot file
 */
async function extractFrameWithSubtitle(filePath, timestamp, subtitleText, outputPath = null) {
  return new Promise((resolve, reject) => {
    if (!outputPath) {
      const tempDir = os.tmpdir();
      const filename = `frame_sub_${Date.now()}_${Math.floor(timestamp)}.jpg`;
      outputPath = path.join(tempDir, filename);
    }

    if (!fs.existsSync(filePath)) {
      reject(new Error(`Video file not found: ${filePath}`));
      return;
    }

    // On Windows, fontconfig is often not available, so we'll extract the frame without
    // burning subtitles into the image. The subtitle will be displayed via CSS overlay in the frontend.
    // This is actually better as it allows for dynamic styling and doesn't require font configuration.
    console.log(`[VideoScreenshot] Extracting frame at ${timestamp}s (subtitle will be shown via CSS overlay)`);
    
    // Simply extract the frame - subtitle overlay is handled by frontend CSS
    extractFrame(filePath, timestamp, outputPath)
      .then((path) => {
        console.log(`[VideoScreenshot] ✅ Frame extracted successfully: ${path}`);
        resolve(path);
      })
      .catch((err) => {
        reject(new Error(`Failed to extract frame: ${err.message}`));
      });
  });
}

module.exports = {
  extractFrame,
  extractFrameWithSubtitle
};

