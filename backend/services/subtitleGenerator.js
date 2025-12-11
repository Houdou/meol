const fs = require('fs');
const path = require('path');

/**
 * Generate SRT subtitle file from segments
 * @param {Array} segments - Array of segments with {start, end, text}
 * @param {string} outputPath - Path to save the SRT file
 * @returns {Promise<string>} Path to the generated SRT file
 */
function generateSRT(segments, outputPath) {
  let srtContent = '';
  
  segments.forEach((segment, index) => {
    const sequence = index + 1;
    const startTime = formatSRTTime(segment.start);
    const endTime = formatSRTTime(segment.end);
    const text = segment.text.trim();
    
    srtContent += `${sequence}\n`;
    srtContent += `${startTime} --> ${endTime}\n`;
    srtContent += `${text}\n\n`;
  });
  
  fs.writeFileSync(outputPath, srtContent, 'utf8');
  return outputPath;
}

/**
 * Generate VTT subtitle file from segments
 * @param {Array} segments - Array of segments with {start, end, text}
 * @param {string} outputPath - Path to save the VTT file
 * @returns {Promise<string>} Path to the generated VTT file
 */
function generateVTT(segments, outputPath) {
  let vttContent = 'WEBVTT\n\n';
  
  segments.forEach((segment) => {
    const startTime = formatVTTTime(segment.start);
    const endTime = formatVTTTime(segment.end);
    const text = segment.text.trim();
    
    vttContent += `${startTime} --> ${endTime}\n`;
    vttContent += `${text}\n\n`;
  });
  
  fs.writeFileSync(outputPath, vttContent, 'utf8');
  return outputPath;
}

/**
 * Format time for SRT format (HH:MM:SS,mmm)
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted time string
 */
function formatSRTTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds % 1) * 1000);
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}

/**
 * Format time for VTT format (HH:MM:SS.mmm)
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted time string
 */
function formatVTTTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds % 1) * 1000);
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
}

module.exports = {
  generateSRT,
  generateVTT,
  formatSRTTime,
  formatVTTTime
};

