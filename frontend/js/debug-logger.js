// Debug logger for displaying backend logs in frontend
class DebugLogger {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.logs = [];
    this.maxLogs = 100;
    this.isVisible = false;
  }

  log(source, message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = {
      timestamp,
      source,
      message,
      type
    };
    
    this.logs.push(logEntry);
    
    // Keep only last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
    
    // Render if visible
    if (this.isVisible) {
      this.render();
    }
    
    // Also log to browser console
    const consoleMessage = `[${timestamp}] [${source}] ${message}`;
    switch (type) {
      case 'error':
        console.error(consoleMessage);
        break;
      case 'warning':
        console.warn(consoleMessage);
        break;
      case 'success':
        console.log(`%c${consoleMessage}`, 'color: #3fb950');
        break;
      default:
        console.log(consoleMessage);
    }
  }

  render() {
    if (!this.container) return;
    
    this.container.innerHTML = '';
    
    this.logs.forEach(log => {
      const entry = document.createElement('div');
      entry.className = `debug-log-entry debug-log-${log.type}`;
      
      const timeSpan = document.createElement('span');
      timeSpan.className = 'debug-log-time';
      timeSpan.textContent = log.timestamp;
      
      const sourceSpan = document.createElement('span');
      sourceSpan.className = 'debug-log-source';
      sourceSpan.textContent = `[${log.source}]`;
      
      const messageSpan = document.createElement('span');
      messageSpan.className = 'debug-log-message';
      messageSpan.textContent = log.message;
      
      entry.appendChild(timeSpan);
      entry.appendChild(sourceSpan);
      entry.appendChild(messageSpan);
      
      this.container.appendChild(entry);
    });
    
    // Scroll to bottom
    this.container.scrollTop = this.container.scrollHeight;
  }

  show() {
    this.isVisible = true;
    if (this.container) {
      this.container.classList.remove('hidden');
      this.container.classList.add('show');
    }
    this.render();
  }

  hide() {
    this.isVisible = false;
    if (this.container) {
      this.container.classList.add('hidden');
      this.container.classList.remove('show');
    }
  }

  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  clear() {
    this.logs = [];
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

// Create global instance
window.debugLogger = new DebugLogger('debugLogs');

