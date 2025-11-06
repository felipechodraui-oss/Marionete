/**
 * Player - Enhanced with retry logic and better navigation handling
 * Fixes: Element not found errors, back/forward cache issues
 */

class Player {
  constructor() {
    this.isPlaying = false;
    this.currentStep = 0;
    this.actions = [];
    this.playbackSpeed = 1;
    this.halo = null;
    this.abortController = null;
  }

  async play(actions, speed = 1) {
    if (this.isPlaying) {
      console.warn('[Marionete] Already playing');
      return { success: false, error: 'Already playing' };
    }

    if (!actions || actions.length === 0) {
      return { success: false, error: 'No actions to play' };
    }

    this.isPlaying = true;
    this.actions = actions;
    this.playbackSpeed = speed;
    this.currentStep = 0;
    this.abortController = new AbortController();

    this.halo = getHaloSystem();
    this.halo.showReplayIndicator(speed);

    console.log('[Marionete] Playback started', { 
      steps: actions.length,
      speed: `${speed}×`
    });

    try {
      for (let i = 0; i < actions.length; i++) {
        if (this.abortController.signal.aborted) {
          throw new Error('Playback aborted');
        }

        this.currentStep = i;
        const action = actions[i];

        if (action.timing && action.timing.delay > 0) {
          const scaledDelay = TimingEngine.scaleDelay(action.timing.delay, speed);
          await TimingEngine.wait(scaledDelay);
        }

        await this.executeAction(action, i + 1);
      }

      console.log('[Marionete] Playback completed successfully');
      return { success: true, stepsExecuted: actions.length };

    } catch (error) {
      console.error('[Marionete] Playback error:', error);
      return { 
        success: false, 
        error: error.message,
        stepsExecuted: this.currentStep 
      };

    } finally {
      this.cleanup();
    }
  }

  async executeAction(action, stepNumber) {
    console.log(`[Marionete] Step ${stepNumber}/${this.actions.length}:`, action.type);

    // Add extra wait for page stability
    await TimingEngine.wait(100);

    switch (action.type) {
      case 'navigation':
        await this.handleNavigation(action, stepNumber);
        break;

      case 'click':
        await this.handleClick(action, stepNumber);
        break;

      case 'input':
        await this.handleInput(action, stepNumber);
        break;

      case 'keypress':
        await this.handleKeypress(action, stepNumber);
        break;

      default:
        console.warn(`[Marionete] Unknown action type: ${action.type}`);
    }
  }

  async handleNavigation(action, stepNumber) {
    if (action.url && action.url !== window.location.href) {
      console.log('[Marionete] Navigating to:', action.url);
      
      // Store the target URL before navigation
      const targetUrl = action.url;
      
      window.location.href = targetUrl;
      
      // Wait for navigation to complete
      await this.waitForPageLoad();
      
      // Extra wait for page to settle
      await TimingEngine.wait(1000);
      
      // Verify we're on the right page
      if (window.location.href !== targetUrl) {
        console.warn('[Marionete] Navigation URL mismatch', {
          expected: targetUrl,
          actual: window.location.href
        });
      }
    }
  }

  async handleClick(action, stepNumber) {
    const element = await this.findElementWithRetry(action.selectors, stepNumber);

    if (!element) {
      throw new Error(`Element not found for step ${stepNumber} (click)`);
    }

    if (this.halo) {
      this.halo.showHalo(element, 'replay', `${stepNumber}. Click`, 800);
    }

    // Scroll into view with more time
    element.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'center',
      inline: 'center'
    });

    await TimingEngine.wait(300);

    // Check if element is still in viewport
    const rect = element.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      console.warn('[Marionete] Element not in viewport after scroll, scrolling again');
      element.scrollIntoView({ block: 'center' });
      await TimingEngine.wait(200);
    }

    // Try multiple click methods for better compatibility
    try {
      // Method 1: Direct click
      element.click();
    } catch (e) {
      console.warn('[Marionete] Direct click failed, trying MouseEvent');
      // Method 2: Mouse event
      const clickEvent = new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true
      });
      element.dispatchEvent(clickEvent);
    }

    // Handle navigation after click
    if (element.tagName === 'A' && element.href) {
      const currentUrl = window.location.href;
      await TimingEngine.wait(200);
      
      if (window.location.href !== currentUrl) {
        console.log('[Marionete] Link clicked, waiting for navigation...');
        await this.waitForPageLoad();
        await TimingEngine.wait(1000); // Extra time for Brazilian sites
      }
    } else if (element.tagName === 'BUTTON' || element.type === 'submit') {
      // Button might trigger navigation
      await TimingEngine.wait(200);
      const urlBefore = window.location.href;
      await TimingEngine.wait(500);
      
      if (window.location.href !== urlBefore) {
        console.log('[Marionete] Button triggered navigation, waiting...');
        await this.waitForPageLoad();
        await TimingEngine.wait(1000);
      }
    }
  }

  async handleInput(action, stepNumber) {
    const element = await this.findElementWithRetry(action.selectors, stepNumber);

    if (!element) {
      throw new Error(`Element not found for step ${stepNumber} (input)`);
    }

    if (this.halo) {
      this.halo.showHalo(element, 'replay', `${stepNumber}. Digitação`, 800);
    }

    element.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'center' 
    });

    await TimingEngine.wait(200);

    // Focus and clear
    element.focus();
    await TimingEngine.wait(50);
    
    // Clear existing value
    element.value = '';
    
    // Type with delay for better compatibility
    const chars = action.value.split('');
    for (let i = 0; i < chars.length; i++) {
      element.value += chars[i];
      
      // Trigger input event after each character
      element.dispatchEvent(new Event('input', { bubbles: true }));
      
      // Small delay between characters (scaled by speed)
      if (i < chars.length - 1) {
        await TimingEngine.wait(Math.max(10, 30 / this.playbackSpeed));
      }
    }

    // Final events
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));

    await TimingEngine.wait(100);
  }

  async handleKeypress(action, stepNumber) {
    const element = await this.findElementWithRetry(action.selectors, stepNumber);

    if (!element) {
      throw new Error(`Element not found for step ${stepNumber} (keypress)`);
    }

    if (this.halo) {
      this.halo.showHalo(element, 'replay', `${stepNumber}. ${action.key}`, 800);
    }

    element.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'center' 
    });

    await TimingEngine.wait(200);

    element.focus();
    await TimingEngine.wait(50);

    const eventOptions = {
      key: action.key,
      code: action.key === 'Enter' ? 'Enter' : action.key,
      keyCode: action.key === 'Enter' ? 13 : 0,
      which: action.key === 'Enter' ? 13 : 0,
      bubbles: true,
      cancelable: true
    };

    element.dispatchEvent(new KeyboardEvent('keydown', eventOptions));
    element.dispatchEvent(new KeyboardEvent('keypress', eventOptions));
    element.dispatchEvent(new KeyboardEvent('keyup', eventOptions));

    if (action.key === 'Enter') {
      const currentUrl = window.location.href;
      await TimingEngine.wait(200);
      
      if (window.location.href !== currentUrl) {
        console.log('[Marionete] Enter triggered navigation, waiting...');
        await this.waitForPageLoad();
        await TimingEngine.wait(1000);
      }
    }
  }

  /**
   * Find element with retry logic for better reliability
   */
  async findElementWithRetry(selectors, stepNumber, maxRetries = 5) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      // Try to find element
      const element = SelectorEngine.findElement(selectors);
      
      if (element) {
        if (attempt > 1) {
          console.log(`[Marionete] Found element on attempt ${attempt}`);
        }
        return element;
      }

      // If not found, wait and retry
      if (attempt < maxRetries) {
        const waitTime = attempt * 200; // Progressive backoff
        console.warn(`[Marionete] Element not found, retry ${attempt}/${maxRetries} in ${waitTime}ms...`);
        await TimingEngine.wait(waitTime);
      }
    }

    // Final attempt with detailed logging
    console.error('[Marionete] Element not found after retries', {
      step: stepNumber,
      selectors: selectors,
      currentUrl: window.location.href
    });

    return null;
  }

  async waitForPageLoad() {
    return new Promise((resolve) => {
      // If already loaded
      if (document.readyState === 'complete') {
        console.log('[Marionete] Page already loaded');
        resolve();
        return;
      }

      let resolved = false;

      // Method 1: Wait for load event
      const loadHandler = () => {
        if (!resolved) {
          resolved = true;
          console.log('[Marionete] Page loaded (load event)');
          resolve();
        }
      };

      // Method 2: Wait for readyState change
      const stateHandler = () => {
        if (document.readyState === 'complete' && !resolved) {
          resolved = true;
          console.log('[Marionete] Page loaded (readyState)');
          document.removeEventListener('readystatechange', stateHandler);
          window.removeEventListener('load', loadHandler);
          resolve();
        }
      };

      window.addEventListener('load', loadHandler, { once: true });
      document.addEventListener('readystatechange', stateHandler);

      // Timeout after 15 seconds (Brazilian sites might be slower)
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.warn('[Marionete] Page load timeout (15s), continuing anyway');
          document.removeEventListener('readystatechange', stateHandler);
          window.removeEventListener('load', loadHandler);
          resolve();
        }
      }, 15000);
    });
  }

  pause() {
    if (!this.isPlaying) return;
    
    if (this.abortController) {
      this.abortController.abort();
    }
    
    console.log('[Marionete] Playback paused at step', this.currentStep);
  }

  stop() {
    this.pause();
    this.cleanup();
  }

  setSpeed(speed) {
    this.playbackSpeed = speed;
    
    if (this.halo) {
      this.halo.showReplayIndicator(speed);
    }
    
    console.log('[Marionete] Speed changed to', `${speed}×`);
  }

  getState() {
    return {
      isPlaying: this.isPlaying,
      currentStep: this.currentStep,
      totalSteps: this.actions.length,
      speed: this.playbackSpeed,
      progress: this.actions.length > 0 
        ? (this.currentStep / this.actions.length) * 100 
        : 0
    };
  }

  cleanup() {
    this.isPlaying = false;
    this.currentStep = 0;
    
    if (this.halo) {
      this.halo.hideIndicators();
      this.halo.clearAll();
    }
    
    if (this.abortController) {
      this.abortController = null;
    }
  }

  destroy() {
    this.stop();
    this.actions = [];
  }
}