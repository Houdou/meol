/**
 * Transcription filtering utilities
 * Shared logic for filtering transcription segments
 */

/**
 * Check if text is exactly "Thank you." (with various punctuation)
 * This filters out false positives from clapping sounds
 * Based on: https://github.com/openai/whisper/discussions/905
 * @param {string} text - Text to check
 * @returns {boolean} True if text should be skipped
 */
function shouldSkipThankYou(text) {
  if (!text) return false;
  const normalized = text.trim();
  const thankYouVariations = [
    "Thank you.",
    "Thank you",
    "thank you.",
    "thank you",
    "Thank You.",
    "Thank You",
    "THANK YOU.",
    "THANK YOU"
  ];
  return thankYouVariations.includes(normalized);
}

module.exports = {
  shouldSkipThankYou
};

