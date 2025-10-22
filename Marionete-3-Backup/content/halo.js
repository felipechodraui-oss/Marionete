/**
 * Halo System - Visual feedback for recording and replay
 * Creates badge overlays around target elements
 */

class HaloSystem {
  constructor() {
    this.activeHalos = new Map();
    this.haloContainer = null;
    this.init();
  }

  init() {
    this.haloContainer = document.createElement('div');
    this.haloContainer.id = 'marionete-halo-container';
    
    const shadow = this.haloContainer.attachShadow({ mode: 'open' });
    
    const style = document.createElement('style');
    style.textContent = `
      :host {
        all: initial;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 2147483647;
      }

      .halo {
        position: absolute;
        pointer-events: none;
        border-radius: 4px;
        box-sizing: border-box;
        transition: all 0.2s ease;
      }

      .halo-recording {
        border: 3px solid #00ff00;
        background: rgba(0, 255, 0, 0.1);
        box-shadow: 0 0 10px rgba(0, 255, 0, 0.5);
        animation: pulse-recording 1.5s infinite;
      }

      .halo-replay {
        border: 3px solid #0099ff;
        background: rgba(0, 153, 255, 0.1);
        box-shadow: 0 0 10px rgba(0, 153, 255, 0.5);
        animation: pulse-replay 1s infinite;
      }

      .halo-badge {
        position: absolute;
        top: -8px;
        left: 50%;
        transform: translateX(-50%);
        background: #000;
        color: #fff;
        padding: 2px 8px;
        border-radius: 10px;
        font-family: Arial, sans-serif;
        font-size: 11px;
        font-weight: 600;
        white-space: nowrap;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
      }

      .halo-recording .halo-badge {
        background: #00ff00;
        color: #000;
      }

      .halo-replay .halo-badge {
        background: #0099ff;
        color: #fff;
      }

      @keyframes pulse-recording {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.7; transform: scale(1.02); }
      }

      @keyframes pulse-replay {
        0%, 100% { border-color: #0099ff; }
        50% { border-color: #00ccff; }
      }

      .recording-indicator {
        position: fixed;
        top: 16px;
        right: 16px;
        background: linear-gradient(135deg, #ff4444 0%, #cc0000 100%);
        color: white;
        padding: 10px 16px;
        border-radius: 24px;
        font-family: Arial, sans-serif;
        font-size: 13px;
        font-weight: 600;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        display: flex;
        align-items: center;
        gap: 8px;
        z-index: 2147483647;
        animation: pulse-indicator 2s infinite;
      }

      .recording-dot {
        width: 8px;
        height: 8px;
        background: #fff;
        border-radius: 50%;
        animation: blink 1s infinite;
      }

      @keyframes pulse-indicator {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }

      @keyframes blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }

      .replay-indicator {
        position: fixed;
        top: 16px;
        right: 16px;
        background: linear-gradient(135deg, #0099ff 0%, #0066cc 100%);
        color: white;
        padding: 10px 16px;
        border-radius: 24px;
        font-family: Arial, sans-serif;
        font-size: 13px;
        font-weight: 600;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        display: flex;
        align-items: center;
        gap: 8px;
        z-index: 2147483647;
      }

      .replay-speed {
        background: rgba(255, 255, 255, 0.2);
        padding: 2px 8px;
        border-radius: 10px;
        font-size: 11px;
      }
    `;
    
    shadow.appendChild(style);
    document.documentElement.appendChild(this.haloContainer);
  }

  showHalo(element, type = 'recording', label = '', duration = 1500) {
    if (!element || !this.haloContainer) return;

    const shadow = this.haloContainer.shadowRoot;
    const rect = element.getBoundingClientRect();
    
    const halo = document.createElement('div');
    halo.className = `halo halo-${type}`;
    
    this.updateHaloPosition(halo, rect);
    
    if (label) {
      const badge = document.createElement('div');
      badge.className = 'halo-badge';
      badge.textContent = label;
      halo.appendChild(badge);
    }
    
    shadow.appendChild(halo);
    
    const haloId = Math.random().toString(36).substring(7);
    this.activeHalos.set(haloId, { element, halo, type });
    
    if (duration > 0) {
      setTimeout(() => this.removeHalo(haloId), duration);
    }
    
    return haloId;
  }

  updateHaloPosition(halo, rect) {
    halo.style.top = `${rect.top}px`;
    halo.style.left = `${rect.left}px`;
    halo.style.width = `${rect.width}px`;
    halo.style.height = `${rect.height}px`;
  }

  removeHalo(haloId) {
    const haloData = this.activeHalos.get(haloId);
    if (haloData && haloData.halo.parentNode) {
      haloData.halo.remove();
      this.activeHalos.delete(haloId);
    }
  }

  clearAll() {
    if (!this.haloContainer?.shadowRoot) return;
    
    const halos = this.haloContainer.shadowRoot.querySelectorAll('.halo');
    halos.forEach(halo => halo.remove());
    this.activeHalos.clear();
  }

  showRecordingIndicator() {
    if (!this.haloContainer?.shadowRoot) return;
    
    const existing = this.haloContainer.shadowRoot.querySelector('.recording-indicator');
    if (existing) return;
    
    const indicator = document.createElement('div');
    indicator.className = 'recording-indicator';
    indicator.innerHTML = `
      <div class="recording-dot"></div>
      <span>GRAVANDO</span>
    `;
    
    this.haloContainer.shadowRoot.appendChild(indicator);
  }

  showReplayIndicator(speed = 1) {
    if (!this.haloContainer?.shadowRoot) return;
    
    const recIndicator = this.haloContainer.shadowRoot.querySelector('.recording-indicator');
    if (recIndicator) recIndicator.remove();
    
    const existing = this.haloContainer.shadowRoot.querySelector('.replay-indicator');
    if (existing) {
      existing.querySelector('.replay-speed').textContent = `${speed}×`;
      return;
    }
    
    const indicator = document.createElement('div');
    indicator.className = 'replay-indicator';
    indicator.innerHTML = `
      <span>▶ REPRODUZINDO</span>
      <div class="replay-speed">${speed}×</div>
    `;
    
    this.haloContainer.shadowRoot.appendChild(indicator);
  }

  hideIndicators() {
    if (!this.haloContainer?.shadowRoot) return;
    
    const indicators = this.haloContainer.shadowRoot.querySelectorAll(
      '.recording-indicator, .replay-indicator'
    );
    indicators.forEach(ind => ind.remove());
  }

  updateAllPositions() {
    this.activeHalos.forEach(({ element, halo }) => {
      if (element && halo) {
        const rect = element.getBoundingClientRect();
        this.updateHaloPosition(halo, rect);
      }
    });
  }

  destroy() {
    this.clearAll();
    this.hideIndicators();
    if (this.haloContainer?.parentNode) {
      this.haloContainer.remove();
    }
    this.haloContainer = null;
  }
}

// Global instance
let haloInstance = null;

function initHaloSystem() {
  if (!haloInstance) {
    haloInstance = new HaloSystem();
    
    window.addEventListener('scroll', () => {
      haloInstance?.updateAllPositions();
    }, { passive: true });
    
    window.addEventListener('resize', () => {
      haloInstance?.updateAllPositions();
    }, { passive: true });
  }
  
  return haloInstance;
}

function getHaloSystem() {
  return haloInstance || initHaloSystem();
}