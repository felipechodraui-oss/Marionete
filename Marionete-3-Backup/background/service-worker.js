/**
 * Background Service Worker - WITH STATE PERSISTENCE & AUTO-RECOVERY
 * Fixes: Recording lost on navigation, state synchronization
 */

// Global recording state tracking
const recordingState = {
  isRecording: false,
  tabId: null,
  actions: [],
  startUrl: null,
  startTime: null,
  lastSyncTime: null
};

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

  if (request.type === 'RECORDING_STARTED') {
    handleRecordingStarted(sender.tab.id, request.data, sendResponse);
    return true;
  }

  if (request.type === 'RECORDING_STOPPED') {
    handleRecordingStopped(sendResponse);
    return true;
  }

  if (request.type === 'SYNC_ACTIONS') {
    handleSyncActions(request.data, sendResponse);
    return true;
  }

  if (request.type === 'GET_RECORDING_STATE') {
    sendResponse({ success: true, state: recordingState });
    return true;
  }

  return false;
});

// Monitor tab updates to re-inject content script during recording
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!recordingState.isRecording || recordingState.tabId !== tabId) return;
  
  if (changeInfo.status === 'loading' && tab.url) {
    console.log('[Marionete BG] Page navigating during recording:', tab.url);
  }
  
  if (changeInfo.status === 'complete') {
    console.log('[Marionete BG] Page loaded, re-injecting content script...');
    
    try {
      await wait(500); // Wait for page to settle
      await injectContentScript(tabId);
      await wait(200);
      
      // Restore recording state
      const response = await chrome.tabs.sendMessage(tabId, {
        type: 'RESTORE_RECORDING',
        data: {
          actions: recordingState.actions,
          startUrl: recordingState.startUrl,
          startTime: recordingState.startTime
        }
      });
      
      if (response?.success) {
        console.log('[Marionete BG] Recording state restored successfully');
      }
    } catch (error) {
      console.error('[Marionete BG] Failed to restore recording:', error);
    }
  }
});

// Track when recording tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (recordingState.isRecording && recordingState.tabId === tabId) {
    console.warn('[Marionete BG] Recording tab closed, clearing state');
    resetRecordingState();
  }
});

async function handleRecordingStarted(tabId, data, sendResponse) {
  recordingState.isRecording = true;
  recordingState.tabId = tabId;
  recordingState.startUrl = data.startUrl;
  recordingState.startTime = data.startTime;
  recordingState.actions = [];
  recordingState.lastSyncTime = Date.now();
  
  console.log('[Marionete BG] Recording started, state saved', {
    tabId,
    startUrl: data.startUrl
  });
  
  sendResponse({ success: true });
}

async function handleRecordingStopped(sendResponse) {
  const data = {
    actions: recordingState.actions,
    startUrl: recordingState.startUrl,
    startTime: recordingState.startTime
  };
  
  resetRecordingState();
  
  console.log('[Marionete BG] Recording stopped, returning', data.actions.length, 'actions');
  sendResponse({ success: true, data });
}

async function handleSyncActions(data, sendResponse) {
  if (!recordingState.isRecording) {
    sendResponse({ success: false, error: 'Not recording' });
    return;
  }
  
  // Merge new actions (avoid duplicates by timestamp)
  const existingTimestamps = new Set(
    recordingState.actions.map(a => a.timing?.timestamp).filter(Boolean)
  );
  
  const newActions = data.actions.filter(action => {
    return !action.timing?.timestamp || !existingTimestamps.has(action.timing.timestamp);
  });
  
  recordingState.actions.push(...newActions);
  recordingState.lastSyncTime = Date.now();
  
  console.log('[Marionete BG] Synced', newActions.length, 'new actions. Total:', recordingState.actions.length);
  
  sendResponse({ 
    success: true, 
    totalActions: recordingState.actions.length 
  });
}

function resetRecordingState() {
  recordingState.isRecording = false;
  recordingState.tabId = null;
  recordingState.actions = [];
  recordingState.startUrl = null;
  recordingState.startTime = null;
  recordingState.lastSyncTime = null;
}

async function handleExecuteFlow(data, sendResponse) {
  try {
    const { actions, startUrl, speed = 1 } = data;

    const tab = await chrome.tabs.create({ 
      url: startUrl || 'about:blank',
      active: true
    });

    await waitForTabLoad(tab.id);
    
    // Wait extra time for page to fully settle
    await wait(1000);
    
    await injectContentScript(tab.id);
    await wait(800);

    // Use a more reliable message sending method
    let retries = 3;
    let response = null;
    
    while (retries > 0 && !response) {
      try {
        response = await chrome.tabs.sendMessage(tab.id, {
          type: 'START_PLAYBACK',
          data: { actions, speed }
        });
        break;
      } catch (error) {
        retries--;
        if (retries > 0) {
          console.log(`[Marionete BG] Retry sending playback message, ${retries} left`);
          await wait(500);
        } else {
          throw error;
        }
      }
    }

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

console.log('[Marionete BG] Service worker initialized with state persistence');