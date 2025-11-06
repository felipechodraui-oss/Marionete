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

    console.log('[Marionete] Found element for click:', {
      tag: element.tagName,
      id: element.id,
      class: element.className,
      text: element.textContent?.substring(0, 50)
    });

    if (this.halo) {
      this.halo.showHalo(element, 'replay', `${stepNumber}. Click`, 1200);
    }

    // Ensure element is in viewport with multiple attempts
    for (let i = 0; i < 2; i++) {
      element.scrollIntoView({ 
        behavior: i === 0 ? 'smooth' : 'auto',
        block: 'center',
        inline: 'center'
      });
      await TimingEngine.wait(i === 0 ? 400 : 200);
    }

    // Verify element is visible and interactable
    const rect = element.getBoundingClientRect();
    const isInViewport = rect.top >= 0 && 
                        rect.left >= 0 && 
                        rect.bottom <= window.innerHeight && 
                        rect.right <= window.innerWidth;
    
    if (!isInViewport) {
      console.warn('[Marionete] Element not fully in viewport, scrolling again');
      window.scrollTo({
        top: window.scrollY + rect.top - (window.innerHeight / 2),
        behavior: 'auto'
      });
      await TimingEngine.wait(300);
    }

    // Remove any overlays or modals that might block the click
    const computedStyle = window.getComputedStyle(element);
    if (computedStyle.pointerEvents === 'none') {
      console.warn('[Marionete] Element has pointer-events: none, trying to fix');
      element.style.pointerEvents = 'auto';
      await TimingEngine.wait(100);
    }

    // Try multiple click methods in sequence for maximum compatibility
    let clickSucceeded = false;
    const clickMethods = [
      // Method 1: Focus + Click (most reliable for buttons/links)
      async () => {
        try {
          element.focus();
          await TimingEngine.wait(100);
          element.click();
          return true;
        } catch (e) {
          console.warn('[Marionete] Method 1 (focus+click) failed:', e.message);
          return false;
        }
      },
      
      // Method 2: MouseEvent sequence (for complex interactions)
      async () => {
        try {
          const rect = element.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          
          ['mousedown', 'mouseup', 'click'].forEach(eventType => {
            const mouseEvent = new MouseEvent(eventType, {
              view: window,
              bubbles: true,
              cancelable: true,
              clientX: x,
              clientY: y,
              screenX: x,
              screenY: y,
              button: 0,
              buttons: 1
            });
            element.dispatchEvent(mouseEvent);
          });
          return true;
        } catch (e) {
          console.warn('[Marionete] Method 2 (MouseEvent) failed:', e.message);
          return false;
        }
      },
      
      // Method 3: Direct dispatch click
      async () => {
        try {
          const clickEvent = new Event('click', { bubbles: true, cancelable: true });
          element.dispatchEvent(clickEvent);
          return true;
        } catch (e) {
          console.warn('[Marionete] Method 3 (Event) failed:', e.message);
          return false;
        }
      },
      
      // Method 4: PointerEvent (for modern touch/pointer interfaces)
      async () => {
        try {
          const rect = element.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          
          ['pointerdown', 'pointerup'].forEach(eventType => {
            const pointerEvent = new PointerEvent(eventType, {
              view: window,
              bubbles: true,
              cancelable: true,
              clientX: x,
              clientY: y,
              pointerId: 1,
              pointerType: 'mouse',
              isPrimary: true
            });
            element.dispatchEvent(pointerEvent);
          });
          
          element.click();
          return true;
        } catch (e) {
          console.warn('[Marionete] Method 4 (PointerEvent) failed:', e.message);
          return false;
        }
      },

      // Method 5: For links, trigger navigation directly
      async () => {
        if (element.tagName === 'A' && element.href) {
          try {
            window.location.href = element.href;
            return true;
          } catch (e) {
            console.warn('[Marionete] Method 5 (direct navigation) failed:', e.message);
            return false;
          }
        }
        return false;
      }
    ];

    // Try each method until one succeeds
    for (let i = 0; i < clickMethods.length; i++) {
      console.log(`[Marionete] Trying click method ${i + 1}/${clickMethods.length}`);
      clickSucceeded = await clickMethods[i]();
      
      if (clickSucceeded) {
        console.log(`[Marionete] Click succeeded with method ${i + 1}`);
        break;
      }
      
      await TimingEngine.wait(100);
    }

    if (!clickSucceeded) {
      console.warn('[Marionete] All click methods failed, but continuing...');
    }

    // Wait and check for navigation
    await TimingEngine.wait(300);
    
    const urlBefore = window.location.href;
    
    // Special handling for different element types
    if (element.tagName === 'A' && element.href) {
      // Link click - wait for navigation
      await TimingEngine.wait(500);
      
      if (window.location.href !== urlBefore) {
        console.log('[Marionete] Link clicked, navigation detected');
        await this.waitForPageLoad();
        await TimingEngine.wait(1500); // Extra time for new page
      }
    } else if (element.tagName === 'BUTTON' || element.type === 'submit' || element.type === 'button') {
      // Button click - might trigger navigation or action
      await TimingEngine.wait(600);
      
      if (window.location.href !== urlBefore) {
        console.log('[Marionete] Button triggered navigation');
        await this.waitForPageLoad();
        await TimingEngine.wait(1500);
      }
    } else if (element.onclick || element.getAttribute('onclick')) {
      // Has onclick handler - wait for any async action
      await TimingEngine.wait(500);
      
      if (window.location.href !== urlBefore) {
        console.log('[Marionete] Onclick triggered navigation');
        await this.waitForPageLoad();
        await TimingEngine.wait(1500);
      }
    }

    // Final check for any late navigation
    await TimingEngine.wait(200);
    if (window.location.href !== urlBefore) {
      console.log('[Marionete] Late navigation detected');
      await this.waitForPageLoad();
      await TimingEngine.wait(1000);
    }
  }

  async handleInput(action, stepNumber) {
    const element = await this.findElementWithRetry(action.selectors, stepNumber);

    if (!element) {
      throw new Error(`Element not found for step ${stepNumber} (input)`);
    }

    console.log('[Marionete] Found input element:', {
      tag: element.tagName,
      type: element.type,
      name: element.name,
      id: element.id
    });

    if (this.halo) {
      this.halo.showHalo(element, 'replay', `${stepNumber}. Digitação`, 1000);
    }

    element.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'center' 
    });

    await TimingEngine.wait(300);

    // Focus element properly
    element.focus();
    await TimingEngine.wait(100);

    // Trigger focus event
    element.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    element.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    
    await TimingEngine.wait(50);
    
    // Clear existing value with proper events
    if (element.value) {
      element.value = '';
      element.dispatchEvent(new Event('input', { bubbles: true }));
      await TimingEngine.wait(50);
    }
    
    // Type with realistic timing and full event sequence
    const chars = action.value.split('');
    
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      
      // KeyDown event
      element.dispatchEvent(new KeyboardEvent('keydown', {
        key: char,
        code: `Key${char.toUpperCase()}`,
        charCode: char.charCodeAt(0),
        keyCode: char.charCodeAt(0),
        which: char.charCodeAt(0),
        bubbles: true,
        cancelable: true
      }));
      
      // KeyPress event (deprecated but some sites still use it)
      element.dispatchEvent(new KeyboardEvent('keypress', {
        key: char,
        code: `Key${char.toUpperCase()}`,
        charCode: char.charCodeAt(0),
        keyCode: char.charCodeAt(0),
        which: char.charCodeAt(0),
        bubbles: true,
        cancelable: true
      }));
      
      // Actually add the character
      element.value += char;
      
      // Input event (most important for modern frameworks)
      const inputEvent = new Event('input', { 
        bubbles: true,
        cancelable: false
      });
      
      // Add inputType for better compatibility
      Object.defineProperty(inputEvent, 'inputType', {
        value: 'insertText',
        writable: false
      });
      Object.defineProperty(inputEvent, 'data', {
        value: char,
        writable: false
      });
      
      element.dispatchEvent(inputEvent);
      
      // KeyUp event
      element.dispatchEvent(new KeyboardEvent('keyup', {
        key: char,
        code: `Key${char.toUpperCase()}`,
        charCode: char.charCodeAt(0),
        keyCode: char.charCodeAt(0),
        which: char.charCodeAt(0),
        bubbles: true,
        cancelable: true
      }));
      
      // Realistic typing delay (scaled by playback speed)
      if (i < chars.length - 1) {
        const baseDelay = Math.random() * 40 + 30; // 30-70ms
        await TimingEngine.wait(Math.max(10, baseDelay / this.playbackSpeed));
      }
    }

    await TimingEngine.wait(100);

    // Final events after typing complete
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
    element.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));

    // For React/Vue/Angular - trigger additional events
    try {
      // React onChange synthetic event
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      ).set;
      
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(element, action.value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } catch (e) {
      // Framework-specific event triggering failed, continue anyway
    }

    await TimingEngine.wait(150);
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
  async findElementWithRetry(selectors, stepNumber, maxRetries = 8) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Try to find element
        const element = SelectorEngine.findElement(selectors);
        
        if (element) {
          // Check if element is interactable
          const isInteractable = this.isElementInteractable(element);
          
          if (isInteractable) {
            if (attempt > 1) {
              console.log(`[Marionete] ✓ Found element on attempt ${attempt}`);
            }
            return element;
          } else if (attempt < maxRetries) {
            console.warn(`[Marionete] Element found but not interactable, retry ${attempt}/${maxRetries}`);
            lastError = 'Element not interactable';
          } else {
            // Last attempt - return even if not fully interactable
            console.warn('[Marionete] Element not fully interactable, using anyway');
            return element;
          }
        } else {
          lastError = 'Element not found';
        }

        // If not found, wait and retry with progressive backoff
        if (attempt < maxRetries) {
          const waitTime = Math.min(attempt * 300, 2000); // Max 2 seconds
          console.warn(`[Marionete] Step ${stepNumber}: ${lastError}, retry ${attempt}/${maxRetries} in ${waitTime}ms...`);
          await TimingEngine.wait(waitTime);
          
          // On later attempts, try scrolling to make elements load
          if (attempt > 3) {
            window.scrollBy(0, 100);
            await TimingEngine.wait(100);
            window.scrollBy(0, -100);
            await TimingEngine.wait(100);
          }
        }
      } catch (error) {
        lastError = error.message;
        console.warn(`[Marionete] Error during element finding: ${error.message}`);
        
        if (attempt < maxRetries) {
          await TimingEngine.wait(attempt * 300);
        }
      }
    }

    // Final attempt with detailed logging
    console.error('[Marionete] ❌ Element not found after all retries', {
      step: stepNumber,
      selectors: {
        id: selectors.id,
        name: selectors.name,
        testId: selectors.testId,
        className: selectors.className,
        tagName: selectors.tagName,
        textContent: selectors.textContent
      },
      currentUrl: window.location.href,
      lastError: lastError
    });

    return null;
  }

  /**
   * Check if element is interactable
   */
  isElementInteractable(element) {
    if (!element || !element.isConnected) return false;
    
    try {
      const style = window.getComputedStyle(element);
      
      // Check visibility
      if (style.display === 'none' || 
          style.visibility === 'hidden' || 
          style.opacity === '0') {
        return false;
      }
      
      // Check if element has size
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return false;
      }
      
      // Check if not disabled
      if (element.disabled) {
        return false;
      }
      
      return true;
    } catch (e) {
      return false;
    }
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