/**
 * Timing Module - High-precision delay management
 * Uses performance.now() for sub-millisecond accuracy
 */

class TimingEngine {
  /**
   * Get current high-precision timestamp
   * @returns {number} Timestamp in milliseconds
   */
  static now() {
    return performance.now();
  }

  /**
   * Calculate delay between two timestamps
   * @param {number} start 
   * @param {number} end 
   * @returns {number} Delay in milliseconds
   */
  static calculateDelay(start, end) {
    return Math.max(0, end - start);
  }

  /**
   * Wait for specified duration
   * @param {number} ms - Milliseconds to wait
   * @returns {Promise<void>}
   */
  static async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Scale delay based on playback speed
   * @param {number} delay - Original delay in ms
   * @param {number} speed - Playback speed multiplier (0.5, 1, 2, 4)
   * @returns {number} Scaled delay
   */
  static scaleDelay(delay, speed = 1) {
    const scaled = delay / speed;
    // Minimum delay to prevent UI lockup
    return Math.max(10, scaled);
  }

  /**
   * Create timing data for an action
   * @param {string} type - Action type
   * @param {number} timestamp - Current timestamp
   * @param {number|null} previousTimestamp - Previous action timestamp
   * @returns {Object}
   */
  static createTimingData(type, timestamp, previousTimestamp = null) {
    return {
      timestamp,
      delay: previousTimestamp ? this.calculateDelay(previousTimestamp, timestamp) : 0,
      type
    };
  }

  /**
   * Get human-readable duration
   * @param {number} ms 
   * @returns {string}
   */
  static formatDuration(ms) {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }
}