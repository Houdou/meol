const ffmpeg = require('fluent-ffmpeg');

/**
 * Extract video/audio metadata using ffprobe
 * @param {string} filePath - Path to the video/audio file
 * @returns {Promise<Object>} Metadata object
 */
async function getVideoMetadata(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(new Error(`Failed to extract metadata: ${err.message}`));
        return;
      }

      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      const audioStream = metadata.streams.find(s => s.codec_type === 'audio');

      const result = {
        format: {
          format_name: metadata.format.format_name,
          format_long_name: metadata.format.format_long_name,
          duration: parseFloat(metadata.format.duration) || 0,
          size: parseInt(metadata.format.size) || 0,
          bit_rate: parseInt(metadata.format.bit_rate) || 0,
        },
        video: videoStream ? {
          codec: videoStream.codec_name,
          width: videoStream.width,
          height: videoStream.height,
          fps: eval(videoStream.r_frame_rate) || 0,
          bit_rate: parseInt(videoStream.bit_rate) || 0,
        } : null,
        audio: audioStream ? {
          codec: audioStream.codec_name,
          sample_rate: parseInt(audioStream.sample_rate) || 0,
          channels: audioStream.channels || 0,
          bit_rate: parseInt(audioStream.bit_rate) || 0,
        } : null,
      };

      resolve(result);
    });
  });
}

/**
 * Format duration from seconds to readable string
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration (e.g., "1h 23m 45s")
 */
function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

/**
 * Format file size to human-readable string
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size (e.g., "1.5 GB")
 */
function formatFileSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

module.exports = {
  getVideoMetadata,
  formatDuration,
  formatFileSize
};

