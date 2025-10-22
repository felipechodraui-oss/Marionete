/**
 * Background Service Worker - WITH URL VALIDATION
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Marionete BG] Received:', request.type);

  if (request.type === 'EXECUTE_FLOW') {
    handleExecuteFlow(request.data, sendResponse);
    return true;
  }

  if (request.type === 'INJECT_CONTENT_SCRIPT') {
    handleInjectContentScript(request.tabId, sendResponse);
    return true;
  }

  return false;
});

async function handleExecuteFlow(data, sendResponse) {
  try {
    const { actions, startUrl, speed = 1 } = data;

    const tab = await chrome.tabs.create({ 
      url: startUrl || 'about:blank',
      active: true
    });

    await waitForTabLoad(tab.id);
    await injectContentScript(tab.id);
    await wait(500);

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'START_PLAYBACK',
      data: { actions, speed }
    });

    sendResponse(response);
  } catch (error) {
    console.error('[Marionete BG] Execute error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleInjectContentScript(tabId, sendResponse) {
  try {
    await injectContentScript(tabId);
    sendResponse({ success: true });
  } catch (error) {
    console.error('[Marionete BG] Inject error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function injectContentScript(tabId) {
  try {
    // Get tab info
    const tab = await chrome.tabs.get(tabId);
    
    // Validate URL - DON'T inject on protected pages
    if (!canInjectIntoUrl(tab.url)) {
      console.log('[Marionete BG] Cannot inject into:', tab.url);
      throw new Error('Cannot inject into this page (protected URL)');
    }

    // Check if already injected
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
      if (response?.status === 'ready') {
        console.log('[Marionete BG] Already injected');
        return;
      }
    } catch (e) {
      // Not injected, continue
    }

    // Inject in correct order
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [
        'lib/timing.js',
        'lib/selector-engine.js',
        'content/halo.js',
        'content/recorder.js',
        'content/player.js',
        'content/injector.js'
      ]
    });

    console.log('[Marionete BG] Injected successfully');
  } catch (error) {
    console.error('[Marionete BG] Injection failed:', error);
    throw error;
  }
}

/**
 * Check if we can inject into this URL
 */
function canInjectIntoUrl(url) {
  if (!url) return false;
  
  // Block chrome:// pages
  if (url.startsWith('chrome://')) return false;
  if (url.startsWith('chrome-extension://')) return false;
  
  // Block Edge pages
  if (url.startsWith('edge://')) return false;
  
  // Block internal pages
  if (url.startsWith('about:')) return false;
  
  // Block Chrome Web Store
  if (url.includes('chrome.google.com/webstore')) return false;
  
  // Allow http and https
  if (url.startsWith('http://') || url.startsWith('https://')) return true;
  
  return false;
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };

    chrome.tabs.onUpdated.addListener(listener);

    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 30000);
  });
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

console.log('[Marionete BG] Service worker initialized');