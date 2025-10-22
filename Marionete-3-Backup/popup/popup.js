/**
 * Popup Controller - Manages UI and communication
 */

// State
let isRecording = false;
let recordingInterval = null;
let currentTab = null;

// DOM Elements
const btnStart = document.getElementById('btnStart');
const btnPause = document.getElementById('btnPause');
const btnStop = document.getElementById('btnStop');
const btnOpenManager = document.getElementById('btnOpenManager');
const recordingStatus = document.getElementById('recordingStatus');
const actionCount = document.getElementById('actionCount');
const duration = document.getElementById('duration');
const message = document.getElementById('message');
const recentFlows = document.getElementById('recentFlows');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Get current tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tabs[0];

  // Setup tabs
  setupTabs();

  // Setup button handlers
  btnStart.addEventListener('click', handleStartRecording);
  btnPause.addEventListener('click', handlePauseRecording);
  btnStop.addEventListener('click', handleStopRecording);
  btnOpenManager.addEventListener('click', handleOpenManager);

  // Load recent flows
  loadRecentFlows();

  // Check recording state
  await checkRecordingState();
});

/**
 * Setup tab switching
 */
function setupTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;

      // Update buttons
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update content
      tabContents.forEach(content => {
        if (content.dataset.content === targetTab) {
          content.classList.add('active');
        } else {
          content.classList.remove('active');
        }
      });
    });
  });
}

/**
 * Check if recording is active
 */
async function checkRecordingState() {
  try {
    // Inject content script first
    await injectContentScript();

    // Check state
    const response = await chrome.tabs.sendMessage(currentTab.id, {
      type: 'GET_RECORDING_STATE'
    });

    if (response.success && response.state.recorder.isRecording) {
      isRecording = true;
      updateRecordingUI(true);
      startRecordingMonitor();
    }
  } catch (error) {
    console.log('[Marionete Popup] No active recording');
  }
}

/**
 * Handle start recording
 */
async function handleStartRecording() {
  try {
    showMessage('Iniciando gravação...', 'info');

    // Inject content script
    await injectContentScript();

    // Start recording
    const response = await chrome.tabs.sendMessage(currentTab.id, {
      type: 'START_RECORDING'
    });

    if (response.success) {
      isRecording = true;
      updateRecordingUI(true);
      startRecordingMonitor();
      showMessage('✅ Gravação iniciada! Faça suas ações na página.', 'success');
    } else {
      throw new Error(response.error || 'Falha ao iniciar gravação');
    }
  } catch (error) {
    console.error('[Marionete Popup] Start error:', error);
    showMessage('❌ Erro ao iniciar gravação: ' + error.message, 'error');
  }
}

/**
 * Handle pause recording (for future implementation)
 */
async function handlePauseRecording() {
  showMessage('⏸️ Pausar gravação (em breve)', 'info');
}

/**
 * Handle stop recording
 */
async function handleStopRecording() {
  try {
    showMessage('Parando gravação...', 'info');

    // Stop recording
    const response = await chrome.tabs.sendMessage(currentTab.id, {
      type: 'STOP_RECORDING'
    });

    if (response.success && response.data) {
      isRecording = false;
      updateRecordingUI(false);
      stopRecordingMonitor();

      // Prompt for name
      const flowName = await promptFlowName();
      if (!flowName) {
        showMessage('⚠️ Gravação cancelada', 'error');
        return;
      }

      // Save flow
      await saveFlow(flowName, response.data);
      showMessage(`✅ Fluxo "${flowName}" salvo com sucesso!`, 'success');

      // Reload recent flows
      loadRecentFlows();
    } else {
      throw new Error(response.error || 'Nenhuma ação gravada');
    }
  } catch (error) {
    console.error('[Marionete Popup] Stop error:', error);
    showMessage('❌ Erro ao parar gravação: ' + error.message, 'error');
    isRecording = false;
    updateRecordingUI(false);
    stopRecordingMonitor();
  }
}

/**
 * Prompt for flow name
 */
function promptFlowName() {
  return new Promise((resolve) => {
    const defaultName = `Fluxo ${new Date().toLocaleString('pt-BR')}`;
    const name = prompt('Nome do fluxo:', defaultName);
    resolve(name ? name.trim() : null);
  });
}

/**
 * Save flow to storage
 */
async function saveFlow(name, data) {
  const flow = {
    name,
    actions: data.actions,
    startUrl: data.startUrl,
    duration: data.duration,
    recordedAt: data.recordedAt,
    actionCount: data.actions.length
  };

  // Save to local storage
  await chrome.storage.local.set({ [name]: flow });
  console.log('[Marionete Popup] Flow saved:', name);
}

/**
 * Update recording UI
 */
function updateRecordingUI(recording) {
  if (recording) {
    btnStart.disabled = true;
    btnPause.disabled = false;
    btnStop.disabled = false;
    recordingStatus.classList.remove('hidden');
    recordingStatus.classList.add('recording');
  } else {
    btnStart.disabled = false;
    btnPause.disabled = true;
    btnStop.disabled = true;
    recordingStatus.classList.add('hidden');
    recordingStatus.classList.remove('recording');
  }
}

/**
 * Start monitoring recording state
 */
function startRecordingMonitor() {
  let startTime = Date.now();

  recordingInterval = setInterval(async () => {
    try {
      const response = await chrome.tabs.sendMessage(currentTab.id, {
        type: 'GET_RECORDING_STATE'
      });

      if (response.success && response.state.recorder) {
        const state = response.state.recorder;
        actionCount.textContent = state.actionCount || 0;
        
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        duration.textContent = formatDuration(elapsed * 1000);
      }
    } catch (error) {
      // Tab might be closed or navigated
      console.warn('[Marionete Popup] Monitor error:', error);
      stopRecordingMonitor();
    }
  }, 500);
}

/**
 * Stop monitoring
 */
function stopRecordingMonitor() {
  if (recordingInterval) {
    clearInterval(recordingInterval);
    recordingInterval = null;
  }
}

/**
 * Load recent flows
 */
async function loadRecentFlows() {
  try {
    const storage = await chrome.storage.local.get(null);
    const flows = Object.values(storage)
      .filter(item => item.actions && item.recordedAt)
      .sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt))
      .slice(0, 3);

    if (flows.length === 0) {
      recentFlows.innerHTML = '<div class="empty-state">Nenhum fluxo salvo ainda</div>';
      return;
    }

    recentFlows.innerHTML = flows.map(flow => `
      <div class="flow-item" data-flow="${flow.name}">
        <div class="flow-info">
          <div class="flow-name">${escapeHtml(flow.name)}</div>
          <div class="flow-meta">
            ${flow.actionCount} ações • ${formatDuration(flow.duration)}
          </div>
        </div>
        <div class="flow-actions">
          <button class="flow-action-btn" data-action="play" title="Executar">
            ▶️
          </button>
        </div>
      </div>
    `).join('');

    // Attach event listeners
    recentFlows.querySelectorAll('.flow-action-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const flowName = btn.closest('.flow-item').dataset.flow;
        const action = btn.dataset.action;
        
        if (action === 'play') {
          await executeFlow(flowName);
        }
      });
    });

  } catch (error) {
    console.error('[Marionete Popup] Load flows error:', error);
  }
}

/**
 * Execute flow
 */
async function executeFlow(flowName) {
  try {
    const storage = await chrome.storage.local.get(flowName);
    const flow = storage[flowName];

    if (!flow) {
      showMessage('❌ Fluxo não encontrado', 'error');
      return;
    }

    showMessage('🚀 Executando fluxo...', 'info');

    // Execute in background
    chrome.runtime.sendMessage({
      type: 'EXECUTE_FLOW',
      data: {
        actions: flow.actions,
        startUrl: flow.startUrl,
        speed: 1
      }
    }, (response) => {
      if (response?.success) {
        showMessage('✅ Fluxo executado com sucesso!', 'success');
      } else {
        showMessage('❌ Erro na execução: ' + (response?.error || 'Desconhecido'), 'error');
      }
    });

    // Close popup
    setTimeout(() => window.close(), 1000);

  } catch (error) {
    console.error('[Marionete Popup] Execute error:', error);
    showMessage('❌ Erro ao executar: ' + error.message, 'error');
  }
}

/**
 * Handle open manager
 */
function handleOpenManager() {
  chrome.tabs.create({ url: chrome.runtime.getURL('manager/flows.html') });
  window.close();
}

/**
 * Inject content script
 */
async function injectContentScript() {
  try {
    // Check if URL is valid
    if (currentTab.url.startsWith('chrome://') || 
        currentTab.url.startsWith('chrome-extension://') ||
        currentTab.url.startsWith('edge://')) {
      throw new Error('Não é possível gravar nesta página. Use uma página web normal (http:// ou https://)');
    }

    const response = await chrome.runtime.sendMessage({
      type: 'INJECT_CONTENT_SCRIPT',
      tabId: currentTab.id
    });

    if (!response.success) {
      throw new Error(response.error);
    }
  } catch (error) {
    console.error('[Marionete Popup] Inject error:', error);
    throw error;
  }
}

/**
 * Show message
 */
function showMessage(text, type = 'info') {
  message.textContent = text;
  message.className = `message ${type}`;
  message.classList.remove('hidden');

  setTimeout(() => {
    message.classList.add('hidden');
  }, 5000);
}

/**
 * Format duration
 */
function formatDuration(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}