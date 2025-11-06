/**
 * Recorder - Enhanced with state persistence and cross-page compatibility
 * Fixes: Lost recording on navigation, better site compatibility
 */

class Recorder {
  constructor() {
    this.isRecording = false;
    this.actions = [];
    this.startTime = null;
    this.lastActionTime = null;
    this.startUrl = null;
    this.currentUrl = null;
    this.halo = null;
    this.syncInterval = null;
    this.lastSyncTime = null;
    
    this.handleClick = this.handleClick.bind(this);
    this.handleInput = this.handleInput.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleNavigation = this.handleNavigation.bind(this);
  }

  start() {
    if (this.isRecording) {
      console.warn('[Marionete] Already recording');
      return;
    }

    this.isRecording = true;
    this.actions = [];
    this.startTime = TimingEngine.now();
    this.lastActionTime = this.startTime;
    this.startUrl = window.location.href;
    this.currentUrl = this.startUrl;
    this.lastSyncTime = Date.now();

    this.halo = getHaloSystem();
    this.halo.showRecordingIndicator();

    // Attach event listeners with capture phase for better compatibility
    document.addEventListener('click', this.handleClick, true);
    document.addEventListener('input', this.handleInput, true);
    document.addEventListener('keydown', this.handleKeyDown, true);

    // Also attach to window for better coverage
    window.addEventListener('click', this.handleClick, true);

    this.setupNavigationTracking();
    this.startStateSync();

    // Notify background that recording started
    chrome.runtime.sendMessage({
      type: 'RECORDING_STARTED',
      data: {
        startUrl: this.startUrl,
        startTime: this.startTime
      }
    }).catch(err => {
      console.error('[Marionete] Failed to notify background:', err);
    });

    console.log('[Marionete] Recording started', { url: this.startUrl });
  }

  stop() {
    if (!this.isRecording) {
      console.warn('[Marionete] Not recording');
      return null;
    }

    this.isRecording = false;

    // Remove event listeners
    document.removeEventListener('click', this.handleClick, true);
    document.removeEventListener('input', this.handleInput, true);
    document.removeEventListener('keydown', this.handleKeyDown, true);
    window.removeEventListener('click', this.handleClick, true);

    // Stop sync
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    if (this.halo) {
      this.halo.hideIndicators();
      this.halo.clearAll();
    }

    // Final sync before stopping
    this.syncActionsToBackground();

    const recordingData = {
      actions: this.actions,
      startUrl: this.startUrl,
      duration: TimingEngine.now() - this.startTime,
      recordedAt: new Date().toISOString()
    };

    // Notify background that recording stopped
    chrome.runtime.sendMessage({
      type: 'RECORDING_STOPPED'
    }).catch(err => {
      console.error('[Marionete] Failed to notify background:', err);
    });

    console.log('[Marionete] Recording stopped', {
      actions: this.actions.length,
      duration: TimingEngine.formatDuration(recordingData.duration)
    });

    return recordingData;
  }

  /**
   * Restore recording state after navigation
   */
  restore(data) {
    console.log('[Marionete] Restoring recording state...', {
      existingActions: data.actions.length,
      startUrl: data.startUrl
    });

    this.isRecording = true;
    this.actions = data.actions || [];
    this.startUrl = data.startUrl;
    this.startTime = data.startTime;
    this.lastActionTime = this.actions.length > 0 
      ? this.actions[this.actions.length - 1].timing.timestamp 
      : this.startTime;
    this.currentUrl = window.location.href;
    this.lastSyncTime = Date.now();

    // Check if URL changed (navigation occurred)
    if (this.currentUrl !== this.startUrl) {
      const now = TimingEngine.now();
      const navigationAction = {
        type: 'navigation',
        url: this.currentUrl,
        fromUrl: this.actions.length > 0 
          ? this.actions[this.actions.length - 1].url 
          : this.startUrl,
        timing: TimingEngine.createTimingData('navigation', now, this.lastActionTime)
      };
      this.actions.push(navigationAction);
      this.lastActionTime = now;
      
      console.log('[Marionete] Captured navigation during restore', {
        from: navigationAction.fromUrl,
        to: this.currentUrl
      });
    }

    // Restart UI and listeners
    this.halo = getHaloSystem();
    this.halo.showRecordingIndicator();

    document.addEventListener('click', this.handleClick, true);
    document.addEventListener('input', this.handleInput, true);
    document.addEventListener('keydown', this.handleKeyDown, true);
    window.addEventListener('click', this.handleClick, true);

    this.setupNavigationTracking();
    this.startStateSync();

    console.log('[Marionete] Recording state restored successfully');
    return { success: true };
  }

  /**
   * Periodically sync actions to background for persistence
   */
  startStateSync() {
    // Sync every 2 seconds
    this.syncInterval = setInterval(() => {
      if (this.isRecording && this.actions.length > 0) {
        this.syncActionsToBackground();
      }
    }, 2000);
  }

  syncActionsToBackground() {
    // Check if we can communicate with background
    if (!chrome.runtime?.id) {
      console.warn('[Marionete] Extension context invalidated, cannot sync');
      return;
    }

    try {
      chrome.runtime.sendMessage({
        type: 'SYNC_ACTIONS',
        data: {
          actions: this.actions
        }
      }).then(response => {
        if (response?.success) {
          this.lastSyncTime = Date.now();
          console.log('[Marionete] Synced to background. Total:', response.totalActions);
        }
      }).catch(err => {
        // Ignore back/forward cache errors
        if (err.message && err.message.includes('back/forward cache')) {
          console.log('[Marionete] Page in back/forward cache, sync skipped');
        } else if (err.message && err.message.includes('message port closed')) {
          console.log('[Marionete] Message port closed, sync skipped');
        } else {
          console.warn('[Marionete] Sync failed:', err);
        }
      });
    } catch (err) {
      console.warn('[Marionete] Cannot sync:', err);
    }
  }

  handleClick(event) {
    if (!this.isRecording) return;

    const element = event.target;
    
    // Skip Marionete elements
    if (this.isMarioneteElement(element)) return;

    // Try to get actual clickable element (traverse up for nested elements)
    const clickableElement = this.findClickableElement(element);
    const targetElement = clickableElement || element;

    const now = TimingEngine.now();
    const selectors = SelectorEngine.generateSelectors(targetElement);
    
    const action = {
      type: 'click',
      selectors,
      timing: TimingEngine.createTimingData('click', now, this.lastActionTime),
      url: window.location.href,
      elementType: targetElement.tagName.toLowerCase(),
      textContent: targetElement.textContent?.trim().substring(0, 50) || ''
    };

    this.actions.push(action);
    this.lastActionTime = now;

    if (this.halo) {
      this.halo.showHalo(targetElement, 'recording', `${this.actions.length}. Click`);
    }

    console.log('[Marionete] Captured click', { 
      step: this.actions.length,
      element: targetElement.tagName,
      delay: action.timing.delay 
    });
  }

  /**
   * Find the actual clickable element (button, link, etc.)
   */
  findClickableElement(element) {
    let current = element;
    let depth = 0;
    
    while (current && depth < 5) {
      // Check if it's a clickable element
      if (current.tagName === 'A' || 
          current.tagName === 'BUTTON' ||
          current.onclick ||
          current.getAttribute('role') === 'button' ||
          current.getAttribute('data-testid') ||
          current.classList.contains('btn') ||
          current.classList.contains('button')) {
        return current;
      }
      
      current = current.parentElement;
      depth++;
    }
    
    return null;
  }

  handleInput(event) {
    if (!this.isRecording) return;

    const element = event.target;
    
    if (this.isMarioneteElement(element)) return;

    if (!['INPUT', 'TEXTAREA'].includes(element.tagName)) return;

    const now = TimingEngine.now();
    const selectors = SelectorEngine.generateSelectors(element);

    // Merge consecutive inputs to same element
    const lastAction = this.actions[this.actions.length - 1];
    if (lastAction && 
        lastAction.type === 'input' && 
        this.selectorsMatch(lastAction.selectors, selectors) &&
        (now - lastAction.timing.timestamp) < 1000) {
      lastAction.value = element.value;
      lastAction.timing.timestamp = now;
      return;
    }

    const action = {
      type: 'input',
      selectors,
      value: element.value,
      timing: TimingEngine.createTimingData('input', now, this.lastActionTime),
      url: window.location.href,
      inputType: element.type || 'text',
      placeholder: element.placeholder || ''
    };

    this.actions.push(action);
    this.lastActionTime = now;

    if (this.halo) {
      this.halo.showHalo(element, 'recording', `${this.actions.length}. Digitação`);
    }

    console.log('[Marionete] Captured input', { 
      step: this.actions.length,
      valueLength: element.value.length 
    });
  }

  selectorsMatch(sel1, sel2) {
    return sel1.id === sel2.id || 
           sel1.name === sel2.name ||
           sel1.css === sel2.css;
  }

  handleKeyDown(event) {
    if (!this.isRecording) return;
    if (event.key !== 'Enter') return;

    const element = event.target;
    
    if (this.isMarioneteElement(element)) return;

    const now = TimingEngine.now();
    const selectors = SelectorEngine.generateSelectors(element);

    const action = {
      type: 'keypress',
      key: 'Enter',
      selectors,
      timing: TimingEngine.createTimingData('keypress', now, this.lastActionTime),
      url: window.location.href
    };

    this.actions.push(action);
    this.lastActionTime = now;

    if (this.halo) {
      this.halo.showHalo(element, 'recording', `${this.actions.length}. Enter`);
    }

    console.log('[Marionete] Captured Enter key', { step: this.actions.length });
  }

  setupNavigationTracking() {
    let lastUrl = window.location.href;
    let checkCount = 0;
    
    const checkUrlChange = () => {
      if (!this.isRecording) return;
      
      checkCount++;
      const currentUrl = window.location.href;
      
      if (currentUrl !== lastUrl) {
        // URL changed
        console.log('[Marionete] URL change detected', { from: lastUrl, to: currentUrl });
        this.handleNavigation(currentUrl);
        lastUrl = currentUrl;
        checkCount = 0; // Reset count
      }
      
      // Periodic logging for debugging (every 10 checks = 5 seconds)
      if (checkCount % 10 === 0) {
        console.log('[Marionete] Recording active, monitoring URL...', {
          currentUrl,
          actions: this.actions.length
        });
      }
    };

    // Multiple tracking methods for better compatibility
    
    // 1. MutationObserver for DOM changes (SPAs)
    try {
      const observer = new MutationObserver(checkUrlChange);
      observer.observe(document, { subtree: true, childList: true });
      this.navigationObserver = observer;
    } catch (err) {
      console.warn('[Marionete] MutationObserver failed:', err);
    }

    // 2. History API interception
    try {
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;
      
      history.pushState = function(...args) {
        const result = originalPushState.apply(this, args);
        checkUrlChange();
        return result;
      };
      
      history.replaceState = function(...args) {
        const result = originalReplaceState.apply(this, args);
        checkUrlChange();
        return result;
      };

      // Store originals for cleanup
      this.originalPushState = originalPushState;
      this.originalReplaceState = originalReplaceState;
    } catch (err) {
      console.warn('[Marionete] History API interception failed:', err);
    }

    // 3. Polling as fallback (more frequent for Brazilian sites)
    this.urlCheckInterval = setInterval(checkUrlChange, 500);

    // 4. Listen to popstate (back/forward)
    this.popstateHandler = checkUrlChange;
    window.addEventListener('popstate', this.popstateHandler);

    // 5. Listen to hashchange (some sites use hash routing)
    this.hashchangeHandler = checkUrlChange;
    window.addEventListener('hashchange', this.hashchangeHandler);

    // 6. Page visibility change (tab switch detection)
    this.visibilityHandler = () => {
      if (!document.hidden && this.isRecording) {
        console.log('[Marionete] Tab visible again, checking URL...');
        checkUrlChange();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);

    console.log('[Marionete] Navigation tracking initialized with 6 methods');
  }

  handleNavigation(newUrl) {
    if (!this.isRecording || newUrl === this.currentUrl) return;

    const now = TimingEngine.now();

    const action = {
      type: 'navigation',
      url: newUrl,
      fromUrl: this.currentUrl,
      timing: TimingEngine.createTimingData('navigation', now, this.lastActionTime)
    };

    this.actions.push(action);
    this.lastActionTime = now;
    this.currentUrl = newUrl;

    console.log('[Marionete] Captured navigation', { 
      step: this.actions.length,
      from: action.fromUrl,
      to: newUrl
    });

    // Immediate sync on navigation
    this.syncActionsToBackground();
  }

  isMarioneteElement(element) {
    if (!element) return false;
    
    let current = element;
    while (current) {
      if (current.id === 'marionete-halo-container') return true;
      if (current.className && 
          typeof current.className === 'string' && 
          current.className.includes('marionete')) return true;
      current = current.parentElement;
    }
    
    return false;
  }

  getState() {
    return {
      isRecording: this.isRecording,
      actionCount: this.actions.length,
      duration: this.startTime ? TimingEngine.now() - this.startTime : 0,
      startUrl: this.startUrl,
      currentUrl: this.currentUrl
    };
  }

  destroy() {
    if (this.isRecording) {
      this.stop();
    }
    
    if (this.urlCheckInterval) {
      clearInterval(this.urlCheckInterval);
    }
    
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    
    if (this.navigationObserver) {
      this.navigationObserver.disconnect();
    }

    // Restore history methods
    if (this.originalPushState) {
      history.pushState = this.originalPushState;
    }
    if (this.originalReplaceState) {
      history.replaceState = this.originalReplaceState;
    }

    if (this.popstateHandler) {
      window.removeEventListener('popstate', this.popstateHandler);
    }

    if (this.hashchangeHandler) {
      window.removeEventListener('hashchange', this.hashchangeHandler);
    }

    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    }
  }
}