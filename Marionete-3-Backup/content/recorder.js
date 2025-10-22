/**
 * Recorder - Captures user interactions with timing and navigation tracking
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

    this.halo = getHaloSystem();
    this.halo.showRecordingIndicator();

    document.addEventListener('click', this.handleClick, true);
    document.addEventListener('input', this.handleInput, true);
    document.addEventListener('keydown', this.handleKeyDown, true);

    this.setupNavigationTracking();

    console.log('[Marionete] Recording started', { url: this.startUrl });
  }

  stop() {
    if (!this.isRecording) {
      console.warn('[Marionete] Not recording');
      return null;
    }

    this.isRecording = false;

    document.removeEventListener('click', this.handleClick, true);
    document.removeEventListener('input', this.handleInput, true);
    document.removeEventListener('keydown', this.handleKeyDown, true);

    if (this.halo) {
      this.halo.hideIndicators();
      this.halo.clearAll();
    }

    const recordingData = {
      actions: this.actions,
      startUrl: this.startUrl,
      duration: TimingEngine.now() - this.startTime,
      recordedAt: new Date().toISOString()
    };

    console.log('[Marionete] Recording stopped', {
      actions: this.actions.length,
      duration: TimingEngine.formatDuration(recordingData.duration)
    });

    return recordingData;
  }

  handleClick(event) {
    if (!this.isRecording) return;

    const element = event.target;
    
    if (this.isMarioneteElement(element)) return;

    const now = TimingEngine.now();
    const selectors = SelectorEngine.generateSelectors(element);
    
    const action = {
      type: 'click',
      selectors,
      timing: TimingEngine.createTimingData('click', now, this.lastActionTime),
      url: window.location.href
    };

    this.actions.push(action);
    this.lastActionTime = now;

    if (this.halo) {
      this.halo.showHalo(element, 'recording', `${this.actions.length}. Click`);
    }

    console.log('[Marionete] Captured click', { 
      step: this.actions.length,
      delay: action.timing.delay 
    });
  }

  handleInput(event) {
    if (!this.isRecording) return;

    const element = event.target;
    
    if (this.isMarioneteElement(element)) return;

    if (!['INPUT', 'TEXTAREA'].includes(element.tagName)) return;

    const now = TimingEngine.now();
    const selectors = SelectorEngine.generateSelectors(element);

    const lastAction = this.actions[this.actions.length - 1];
    if (lastAction && 
        lastAction.type === 'input' && 
        lastAction.selectors.id === selectors.id &&
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
      url: window.location.href
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
    
    const checkUrlChange = () => {
      if (!this.isRecording) return;
      
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        this.handleNavigation(currentUrl);
        lastUrl = currentUrl;
      }
    };

    const observer = new MutationObserver(checkUrlChange);
    observer.observe(document, { subtree: true, childList: true });

    this.urlCheckInterval = setInterval(checkUrlChange, 500);

    this.navigationObserver = observer;
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
      startUrl: this.startUrl
    };
  }

  destroy() {
    if (this.isRecording) {
      this.stop();
    }
    
    if (this.urlCheckInterval) {
      clearInterval(this.urlCheckInterval);
    }
    
    if (this.navigationObserver) {
      this.navigationObserver.disconnect();
    }
  }
}