const fs = require('fs');
const path = require('path');

/**
 * Get or create cache directory in the same directory as the backend
 * @returns {string} Path to the cache directory
 */
function getCacheDir() {
  // Get the backend directory (where this file is located)
  const backendDir = path.join(__dirname, '..');
  const cacheDir = path.join(backendDir, 'cache');
  
  // Create cache directory if it doesn't exist
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
    console.log(`[CacheManager] Created cache directory: ${cacheDir}`);
  }
  
  return cacheDir;
}

/**
 * Clean up all files in the cache directory
 * @returns {Promise<void>}
 */
async function cleanupCache() {
  try {
    const cacheDir = getCacheDir();
    const files = fs.readdirSync(cacheDir);
    
    let deletedCount = 0;
    for (const file of files) {
      const filePath = path.join(cacheDir, file);
      try {
        const stats = fs.statSync(filePath);
        if (stats.isFile()) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      } catch (error) {
        console.error(`[CacheManager] Failed to delete ${filePath}:`, error.message);
      }
    }
    
    if (deletedCount > 0) {
      console.log(`[CacheManager] Cleaned up ${deletedCount} file(s) from cache directory`);
    }
  } catch (error) {
    console.error(`[CacheManager] Error cleaning up cache:`, error.message);
  }
}

/**
 * Clean up specific files from cache
 * @param {string[]} filePaths - Array of file paths to delete
 * @returns {Promise<void>}
 */
async function cleanupFiles(filePaths) {
  if (!filePaths || filePaths.length === 0) {
    return;
  }
  
  let deletedCount = 0;
  for (const filePath of filePaths) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    } catch (error) {
      console.error(`[CacheManager] Failed to delete ${filePath}:`, error.message);
    }
  }
  
  if (deletedCount > 0) {
    console.log(`[CacheManager] Cleaned up ${deletedCount} screenshot file(s)`);
  }
}

module.exports = {
  getCacheDir,
  cleanupCache,
  cleanupFiles
};

