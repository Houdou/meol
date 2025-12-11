// Electron-specific file handling
class ElectronFileHandler {
  constructor() {
    // Check for Electron in multiple ways
    this.isElectron = typeof window !== 'undefined' && (
      window.electronAPI !== undefined ||
      window.process !== undefined && window.process.versions && window.process.versions.electron ||
      navigator.userAgent.indexOf('Electron') !== -1
    );
    
    console.log('Electron detected:', this.isElectron);
    console.log('window.electronAPI:', typeof window.electronAPI);
  }

  async selectFile() {
    if (!this.isElectron) {
      return null;
    }

    try {
      console.log('Calling electronAPI.selectFile()');
      const filePath = await window.electronAPI.selectFile();
      console.log('selectFile returned:', filePath);
      return filePath;
    } catch (error) {
      console.error('Error selecting file:', error);
      throw error;
    }
  }

  async validateFilePath(filePath) {
    if (!this.isElectron) {
      return filePath;
    }

    try {
      const normalizedPath = await window.electronAPI.getFilePath(filePath);
      return normalizedPath || filePath;
    } catch (error) {
      console.error('Error validating path:', error);
      return filePath;
    }
  }

  setupDragAndDrop() {
    if (!this.isElectron) {
      console.log('Not Electron, skipping drag & drop setup');
      return;
    }

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setupDragAndDrop());
      return;
    }

    // Try multiple selectors for drop zone
    const dropZone = document.querySelector('.file-section') || 
                     document.querySelector('#fileSection') ||
                     document.querySelector('.file-input-section') ||
                     document.body;
    const filePathInput = document.getElementById('filePath');
    
    if (!filePathInput) {
      console.error('File path input not found');
      return;
    }
    
    console.log('Setting up Electron drag & drop handlers');
    console.log('Drop zone:', dropZone);
    console.log('File path input:', filePathInput);

    // Bind preventDefaults to this context
    const preventDefaults = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };

    // Prevent default drag behaviors on entire document
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      document.body.addEventListener(eventName, preventDefaults, false);
      if (dropZone !== document.body) {
        dropZone.addEventListener(eventName, preventDefaults, false);
      }
    });

    // Highlight drop zone when item is dragged over it
    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (filePathInput) {
          filePathInput.classList.add('drag-over');
        }
        if (dropZone !== document.body && dropZone.classList) {
          dropZone.classList.add('drag-over');
        }
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (filePathInput) {
          filePathInput.classList.remove('drag-over');
        }
        if (dropZone !== document.body && dropZone.classList) {
          dropZone.classList.remove('drag-over');
        }
      }, false);
    });

    // Handle dropped files using Electron's file API
    const handleDrop = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      console.log('Drop event triggered!');
      console.log('dataTransfer:', e.dataTransfer);
      console.log('files:', e.dataTransfer.files);
      
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        const file = files[0];
        
        // Debug: log file object to see what properties are available
        console.log('Dropped file object:', file);
        console.log('File type:', typeof file);
        console.log('File constructor:', file.constructor.name);
        console.log('File properties:', Object.keys(file));
        console.log('File.path:', file.path);
        console.log('File.name:', file.name);
        
        // Try to get all properties including non-enumerable ones
        const allProps = [];
        let obj = file;
        while (obj && obj !== Object.prototype) {
          allProps.push(...Object.getOwnPropertyNames(obj));
          obj = Object.getPrototypeOf(obj);
        }
        console.log('All properties (including non-enumerable):', allProps);
        
        if (this.isElectron) {
          // In Electron, File objects have a 'path' property
          // Try multiple ways to access it
          let filePath = null;
          
          // Method 1: Direct access (should work in Electron)
          try {
            if (file.path) {
              filePath = file.path;
              console.log('✓ Got path from file.path:', filePath);
            }
          } catch (err) {
            console.log('Direct access failed:', err);
          }
          
          // Method 2: Try accessing through Object.getOwnPropertyDescriptor
          if (!filePath) {
            try {
              const pathDesc = Object.getOwnPropertyDescriptor(file, 'path');
              if (pathDesc && pathDesc.value) {
                filePath = pathDesc.value;
                console.log('✓ Got path from descriptor:', filePath);
              }
            } catch (err) {
              console.log('Descriptor access failed:', err);
            }
          }
          
          // Method 3: Try accessing through Object.getOwnPropertyNames
          if (!filePath) {
            try {
              const props = Object.getOwnPropertyNames(file);
              const pathIndex = props.indexOf('path');
              if (pathIndex !== -1) {
                filePath = file[props[pathIndex]];
                console.log('✓ Got path from property names:', filePath);
              }
            } catch (err) {
              console.log('Property names access failed:', err);
            }
          }
          
          // Method 4: Try using Object.getPrototypeOf
          if (!filePath) {
            try {
              const proto = Object.getPrototypeOf(file);
              if (proto && proto.path) {
                filePath = proto.path;
                console.log('✓ Got path from prototype:', filePath);
              }
            } catch (err) {
              console.log('Prototype access failed:', err);
            }
          }
          
          // Method 5: Try JSON.stringify to see hidden properties
          if (!filePath) {
            try {
              const fileStr = JSON.stringify(file);
              const fileObj = JSON.parse(fileStr);
              if (fileObj.path) {
                filePath = fileObj.path;
                console.log('✓ Got path from JSON:', filePath);
              }
            } catch (err) {
              // File objects can't be JSON stringified, that's expected
            }
          }
          
          if (filePath) {
            // Validate the file
            if (window.electronAPI && window.electronAPI.validateFile) {
              try {
                const validation = await window.electronAPI.validateFile(filePath);
                if (validation.exists) {
                  filePathInput.value = validation.path;
                  
                  if (window.terminal) {
                    window.terminal.info(`✓ File dropped: ${validation.name}`);
                    window.terminal.info(`  Size: ${(validation.size / 1024 / 1024).toFixed(2)} MB`);
                    window.terminal.info(`  Path: ${validation.path}`);
                  }
                  
                  // Auto-load the file
                  setTimeout(() => {
                    const loadBtn = document.getElementById('loadFileBtn');
                    if (loadBtn) {
                      loadBtn.click();
                    }
                  }, 200);
                  return;
                }
              } catch (error) {
                console.error('Validation error:', error);
              }
            }
            
            // Use path directly if validation fails or not available
            filePathInput.value = filePath;
            if (window.terminal) {
              window.terminal.info(`File dropped: ${file.name}`);
              window.terminal.info(`Path: ${filePath}`);
            }
            setTimeout(() => {
              document.getElementById('loadFileBtn')?.click();
            }, 200);
          } else {
            // Path not available - log for debugging
            console.error('Could not extract file path. File object:', file);
            console.error('File object details:', {
              name: file.name,
              size: file.size,
              type: file.type,
              lastModified: file.lastModified,
              path: file.path,
              allProps: allProps
            });
            
            // Try IPC method as fallback
            if (window.electronAPI && window.electronAPI.getDroppedFilePath) {
              try {
                const path = await window.electronAPI.getDroppedFilePath(file);
                if (path) {
                  filePathInput.value = path;
                  setTimeout(() => {
                    document.getElementById('loadFileBtn')?.click();
                  }, 200);
                  return;
                }
              } catch (err) {
                console.error('IPC fallback failed:', err);
              }
            }
            
            filePathInput.value = file.name;
            if (window.terminal) {
              window.terminal.warning(`Could not get full path for: ${file.name}`);
              window.terminal.info('Please use Browse button to select the file');
              window.terminal.info('Debug: Check browser console for file object details');
            }
          }
        } else {
          console.warn('No files in dataTransfer');
        }
      } else {
        console.warn('No dataTransfer or files in drop event');
      }
    };
    
    // Add drop handler to multiple elements - use capture phase
    dropZone.addEventListener('drop', handleDrop, true);
    filePathInput.addEventListener('drop', handleDrop, true);
    document.body.addEventListener('drop', handleDrop, true);
    
    // Also add dragover handlers to allow drop
    const handleDragOver = (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      if (filePathInput) {
        filePathInput.classList.add('drag-over');
      }
      return false;
    };
    
    dropZone.addEventListener('dragover', handleDragOver, true);
    filePathInput.addEventListener('dragover', handleDragOver, true);
    document.body.addEventListener('dragover', handleDragOver, true);
    
    // Also listen for Electron custom event (from injected script in main process)
    if (this.isElectron) {
      window.addEventListener('electron-file-dropped', async (event) => {
        const { path: filePath, name, size } = event.detail;
        console.log('Electron file dropped event received:', { filePath, name, size });
        
        if (filePath) {
          filePathInput.value = filePath;
          
          if (window.terminal) {
            window.terminal.info(`✓ File dropped: ${name}`);
            if (size > 0) {
              window.terminal.info(`  Size: ${(size / 1024 / 1024).toFixed(2)} MB`);
            }
            window.terminal.info(`  Path: ${filePath}`);
          }
          
          // Validate and auto-load
          if (window.electronAPI && window.electronAPI.validateFile) {
            try {
              const validation = await window.electronAPI.validateFile(filePath);
              if (validation.exists) {
                setTimeout(() => {
                  const loadBtn = document.getElementById('loadFileBtn');
                  if (loadBtn) {
                    loadBtn.click();
                  }
                }, 200);
              } else {
                if (window.terminal) {
                  window.terminal.error(`File validation failed: ${validation.error}`);
                }
              }
            } catch (error) {
              console.error('Validation error:', error);
              // Still try to load even if validation fails
              setTimeout(() => {
                document.getElementById('loadFileBtn')?.click();
              }, 200);
            }
          } else {
            // Auto-load without validation
            setTimeout(() => {
              document.getElementById('loadFileBtn')?.click();
            }, 200);
          }
        }
      }, false);
    }
  }

  preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }
}

// Initialize Electron file handler
window.electronFileHandler = new ElectronFileHandler();

