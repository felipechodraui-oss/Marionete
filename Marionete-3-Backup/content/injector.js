/**
 * Content Script Injector - Enhanced with state restoration
 * Fixes: Recording state persistence across navigation
 */

// Prevent multiple injections
if (!window.__MARIONETE_INJECTED__) {
  window.__MARIONETE_INJECTED__ = true;

  // Wait for other scripts to load
  setTimeout(() => {
    // Check if classes are available
    if (typeof Recorder === 'undefined' || typeof Player === 'undefined') {
      console.error('[Marionete] Required classes not loaded');
      return;
    }

    // Initialize
    const recorder = new Recorder();
    const player = new Player();
    
    // Initialize halo system
    initHaloSystem();

    // Message handler
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log('[Marionete Content] Received message:', request.type);

      switch (request.type) {
        case 'START_RECORDING':
          handleStartRecording(sendResponse);
          return true; // Async response

        case 'STOP_RECORDING':
          handleStopRecording(sendResponse);
          return true;

        case 'RESTORE_RECORDING':
          handleRestoreRecording(request.data, sendResponse);
          return true;

        case 'GET_RECORDING_STATE':
          handleGetState(sendResponse);
          return true;

        case 'START_PLAYBACK':
          handleStartPlayback(request.data, sendResponse);
          return true;

        case 'STOP_PLAYBACK':
          handleStopPlayback(sendResponse);
          return true;

        case 'SET_PLAYBACK_SPEED':
          handleSetSpeed(request.speed, sendResponse);
          return true;

        case 'PING':
          sendResponse({ status: 'ready' });
          return true;

        default:
          console.warn('[Marionete Content] Unknown message type:', request.type);
          sendResponse({ success: false, error: 'Unknown message type' });
          return true;
      }
    });

    /**
     * Handle start recording
     */
    function handleStartRecording(sendResponse) {
      try {
        recorder.start();
        sendResponse({ 
          success: true, 
          state: recorder.getState() 
        });
      } catch (error) {
        console.error('[Marionete] Start recording error:', error);
        sendResponse({ 
          success: false, 
          error: error.message 
        });
      }
    }

    /**
     * Handle stop recording
     */
    function handleStopRecording(sendResponse) {
      try {
        const recordingData = recorder.stop();
        
        // If no local data, try to get from background
        if (!recordingData || recordingData.actions.length === 0) {
          chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATE' })
            .then(response => {
              if (response?.success && response.state.actions.length > 0) {
                const backgroundData = {
                  actions: response.state.actions,
                  startUrl: response.state.startUrl,
                  duration: Date.now() - response.state.startTime,
                  recordedAt: new Date().toISOString()
                };
                sendResponse({ success: true, data: backgroundData });
              } else {
                sendResponse({ success: true, data: recordingData });
              }
            })
            .catch(err => {
              console.error('[Marionete] Failed to get background state:', err);
              sendResponse({ success: true, data: recordingData });
            });
          return;
        }
        
        sendResponse({ 
          success: true, 
          data: recordingData 
        });
      } catch (error) {
        console.error('[Marionete] Stop recording error:', error);
        sendResponse({ 
          success: false, 
          error: error.message 
        });
      }
    }

    /**
     * Handle restore recording (after navigation)
     */
    function handleRestoreRecording(data, sendResponse) {
      try {
        console.log('[Marionete Content] Restoring recording state...', data);
        const result = recorder.restore(data);
        sendResponse(result);
      } catch (error) {
        console.error('[Marionete] Restore recording error:', error);
        sendResponse({ 
          success: false, 
          error: error.message 
        });
      }
    }

    /**
     * Handle get state
     */
    function handleGetState(sendResponse) {
      const state = {
        recorder: recorder.getState(),
        player: player.getState()
      };
      sendResponse({ success: true, state });
    }

    /**
     * Handle start playback
     */
    async function handleStartPlayback(data, sendResponse) {
      try {
        const { actions, speed = 1 } = data;
        const result = await player.play(actions, speed);
        sendResponse(result);
      } catch (error) {
        console.error('[Marionete] Playback error:', error);
        sendResponse({ 
          success: false, 
          error: error.message 
        });
      }
    }

    /**
     * Handle stop playback
     */
    function handleStopPlayback(sendResponse) {
      try {
        player.stop();
        sendResponse({ success: true });
      } catch (error) {
        console.error('[Marionete] Stop playback error:', error);
        sendResponse({ 
          success: false, 
          error: error.message 
        });
      }
    }

    /**
     * Handle set speed
     */
    function handleSetSpeed(speed, sendResponse) {
      try {
        player.setSpeed(speed);
        sendResponse({ 
          success: true, 
          speed 
        });
      } catch (error) {
        console.error('[Marionete] Set speed error:', error);
        sendResponse({ 
          success: false, 
          error: error.message 
        });
      }
    }

    // Check if recording should be restored (page loaded during active recording)
    setTimeout(() => {
      chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATE' })
        .then(response => {
          if (response?.success && response.state.isRecording) {
            console.log('[Marionete Content] Found active recording, requesting restore...');
            // Background will trigger RESTORE_RECORDING message
          }
        })
        .catch(err => {
          // Background might not be available yet
          console.log('[Marionete Content] Could not check recording state:', err);
        });
    }, 500);

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
      if (recorder.isRecording) {
        // Final sync before unload
        recorder.syncActionsToBackground();
      }
    });

    // Cleanup on visibility change (tab switch)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && recorder.isRecording) {
        // Sync when tab becomes hidden
        recorder.syncActionsToBackground();
      }
    });

    console.log('[Marionete Content] Initialized successfully with state restoration');
  }, 100);
}