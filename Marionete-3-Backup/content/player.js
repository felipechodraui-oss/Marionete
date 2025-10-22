/**
 * Player - Replays recorded flows with timing precision
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

    switch (action.type) {
      case 'navigation':
        await this.handleNavigation(action);
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

  async handleNavigation(action) {
    if (action.url && action.url !== window.location.href) {
      console.log('[Marionete] Navigating to:', action.url);
      window.location.href = action.url;
      
      await this.waitForPageLoad();
    }
  }

  async handleClick(action, stepNumber) {
    const element = SelectorEngine.findElement(action.selectors);

    if (!element) {
      throw new Error(`Element not found for step ${stepNumber}`);
    }

    if (this.halo) {
      this.halo.showHalo(element, 'replay', `${stepNumber}. Click`, 800);
    }

    element.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'center',
      inline: 'center'
    });

    await TimingEngine.wait(150);

    element.click();

    if (element.tagName === 'A' && element.href) {
      const currentUrl = window.location.href;
      await TimingEngine.wait(100);
      
      if (window.location.href !== currentUrl) {
        await this.waitForPageLoad();
      }
    }
  }

  async handleInput(action, stepNumber) {
    const element = SelectorEngine.findElement(action.selectors);

    if (!element) {
      throw new Error(`Element not found for step ${stepNumber}`);
    }

    if (this.halo) {
      this.halo.showHalo(element, 'replay', `${stepNumber}. Digitação`, 800);
    }

    element.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'center' 
    });

    await TimingEngine.wait(150);

    element.focus();
    element.value = action.value;

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));

    await TimingEngine.wait(50);
  }

  async handleKeypress(action, stepNumber) {
    const element = SelectorEngine.findElement(action.selectors);

    if (!element) {
      throw new Error(`Element not found for step ${stepNumber}`);
    }

    if (this.halo) {
      this.halo.showHalo(element, 'replay', `${stepNumber}. ${action.key}`, 800);
    }

    element.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'center' 
    });

    await TimingEngine.wait(150);

    element.focus();

    const eventOptions = {
      key: action.key,
      code: action.key === 'Enter' ? 'Enter' : action.key,
      bubbles: true,
      cancelable: true
    };

    element.dispatchEvent(new KeyboardEvent('keydown', eventOptions));
    element.dispatchEvent(new KeyboardEvent('keypress', eventOptions));
    element.dispatchEvent(new KeyboardEvent('keyup', eventOptions));

    if (action.key === 'Enter') {
      const currentUrl = window.location.href;
      await TimingEngine.wait(100);
      
      if (window.location.href !== currentUrl) {
        await this.waitForPageLoad();
      }
    }
  }

  async waitForPageLoad() {
    return new Promise((resolve) => {
      if (document.readyState === 'complete') {
        resolve();
      } else {
        window.addEventListener('load', () => resolve(), { once: true });
        
        setTimeout(() => resolve(), 10000);
      }
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