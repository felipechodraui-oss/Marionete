/**
 * Flow Manager Controller - WITH VARIABLES + EXPORT/IMPORT
 */

// State
let flows = {};
let selectedFlow = null;
let selectedSpeed = 1;
let sortableInstance = null;
let currentEditingStep = null;

// DOM Elements
const flowList = document.getElementById('flowList');
const flowTitle = document.getElementById('flowTitle');
const btnDelete = document.getElementById('btnDelete');
const btnExecute = document.getElementById('btnExecute');
const btnExport = document.getElementById('btnExport');
const btnImport = document.getElementById('btnImport');
const btnNewFlow = document.getElementById('btnNewFlow');
const speedSelector = document.getElementById('speedSelector');
const flowDetails = document.getElementById('flowDetails');
const emptyState = document.getElementById('emptyState');
const detailUrl = document.getElementById('detailUrl');
const detailActions = document.getElementById('detailActions');
const detailDuration = document.getElementById('detailDuration');
const detailVariables = document.getElementById('detailVariables');
const detailCreated = document.getElementById('detailCreated');
const stepCount = document.getElementById('stepCount');
const stepsList = document.getElementById('stepsList');
const variablesSection = document.getElementById('variablesSection');
const variablesList = document.getElementById('variablesList');

// Modals
const variableModal = document.getElementById('variableModal');
const executionModal = document.getElementById('executionModal');
const fileInput = document.getElementById('fileInput');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadFlows();
  setupEventListeners();
  setupSpeedSelector();
});

function setupEventListeners() {
  btnDelete.addEventListener('click', handleDelete);
  btnExecute.addEventListener('click', handleExecuteWithVariables);
  btnExport.addEventListener('click', handleExport);
  btnImport.addEventListener('click', () => fileInput.click());
  btnNewFlow.addEventListener('click', handleNewFlow);
  
  fileInput.addEventListener('change', handleImport);
  
  // Variable modal
  document.getElementById('closeVariableModal').addEventListener('click', closeVariableModal);
  document.getElementById('cancelVariable').addEventListener('click', closeVariableModal);
  document.getElementById('saveVariable').addEventListener('click', saveVariableConfig);
  
  // Execution modal
  document.getElementById('cancelExecution').addEventListener('click', closeExecutionModal);
  document.getElementById('startExecution').addEventListener('click', executeWithVariableValues);
}

function setupSpeedSelector() {
  const speedBtns = document.querySelectorAll('.speed-btn');
  
  speedBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      selectedSpeed = parseFloat(btn.dataset.speed);
      
      speedBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

async function loadFlows() {
  try {
    const storage = await chrome.storage.local.get(null);
    
    flows = Object.entries(storage)
      .filter(([key, value]) => value.actions && value.recordedAt)
      .reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {});

    renderFlowList();
  } catch (error) {
    console.error('[Marionete Manager] Load error:', error);
  }
}

function renderFlowList() {
  const flowArray = Object.entries(flows).sort((a, b) => {
    return new Date(b[1].recordedAt) - new Date(a[1].recordedAt);
  });

  if (flowArray.length === 0) {
    flowList.innerHTML = '<div style="padding: 20px; text-align: center; color: #6c757d; font-size: 13px;">Nenhum fluxo salvo</div>';
    return;
  }

  flowList.innerHTML = flowArray.map(([name, flow]) => {
    const varCount = countVariables(flow);
    const varBadge = varCount > 0 ? ` <span style="background:#667eea;color:white;padding:2px 6px;border-radius:10px;font-size:10px;">${varCount} var</span>` : '';
    
    return `
      <div class="flow-item-sidebar" data-flow="${escapeHtml(name)}">
        <div class="flow-item-name">${escapeHtml(flow.name || name)}${varBadge}</div>
        <div class="flow-item-meta">
          ${flow.actionCount || flow.actions.length} ações • ${formatDuration(flow.duration)}
        </div>
      </div>
    `;
  }).join('');

  flowList.querySelectorAll('.flow-item-sidebar').forEach(item => {
    item.addEventListener('click', () => {
      const flowName = item.dataset.flow;
      selectFlow(flowName);
    });
  });
}

function selectFlow(flowName) {
  selectedFlow = flowName;
  const flow = flows[flowName];

  if (!flow) return;

  flowList.querySelectorAll('.flow-item-sidebar').forEach(item => {
    if (item.dataset.flow === flowName) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  flowTitle.textContent = flow.name || flowName;
  btnDelete.disabled = false;
  btnExecute.disabled = false;
  btnExport.disabled = false;

  emptyState.classList.add('hidden');
  speedSelector.classList.remove('hidden');
  flowDetails.classList.remove('hidden');

  renderFlowDetails(flow);
}

function renderFlowDetails(flow) {
  detailUrl.textContent = flow.startUrl || 'N/A';
  detailActions.textContent = flow.actionCount || flow.actions.length;
  detailDuration.textContent = formatDuration(flow.duration);
  
  const varCount = countVariables(flow);
  detailVariables.textContent = varCount;
  
  if (varCount > 0) {
    variablesSection.classList.remove('hidden');
    renderVariablesList(flow);
  } else {
    variablesSection.classList.add('hidden');
  }

  stepCount.textContent = `${flow.actions.length} passos`;
  renderSteps(flow.actions);
}

function renderVariablesList(flow) {
  const variables = extractVariables(flow);
  
  if (variables.length === 0) {
    variablesList.innerHTML = '<p style="color:#6c757d;font-size:13px;">Nenhuma variável definida</p>';
    return;
  }

  variablesList.innerHTML = variables.map(variable => `
    <div class="variable-item">
      <div class="variable-info">
        <div class="variable-name">{{${variable.name}}}</div>
        <div class="variable-preview">Valor padrão: "${variable.defaultValue}"</div>
      </div>
      <div class="variable-actions">
        <button class="variable-btn" onclick="removeVariable('${variable.name}')">
          🗑️ Remover
        </button>
      </div>
    </div>
  `).join('');
}

function renderSteps(actions) {
  stepsList.innerHTML = actions.map((action, index) => {
    const stepNumber = index + 1;
    const typeLabel = getActionTypeLabel(action.type);
    const badge = getActionBadge(action.type);
    const timing = action.timing ? formatDuration(action.timing.delay) : '0ms';
    
    return `
      <div class="step-item" data-index="${index}">
        <div class="step-number">${stepNumber}</div>
        <div class="step-content">
          <div class="step-header">
            <div class="step-type">
              <span class="step-badge ${action.type}">${badge}</span>
              ${typeLabel}
            </div>
            <div class="step-timing">⏱️ +${timing}</div>
          </div>
          <div class="step-details">
            ${renderStepDetails(action, index)}
          </div>
          <div class="step-actions">
            ${action.type === 'input' ? `
              <button class="step-action-btn variable-btn-icon" data-action="make-variable" data-index="${index}" title="Converter em variável">
                🔤
              </button>
            ` : ''}
            <button class="step-action-btn" data-action="edit" data-index="${index}">
              ✏️ Editar
            </button>
            <button class="step-action-btn" data-action="delete" data-index="${index}">
              🗑️ Remover
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  setupSortable();

  stepsList.querySelectorAll('.step-action-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const index = parseInt(btn.dataset.index);
      
      if (action === 'delete') {
        handleDeleteStep(index);
      } else if (action === 'edit') {
        handleEditStep(index);
      } else if (action === 'make-variable') {
        openVariableModal(index);
      }
    });
  });
}

function renderStepDetails(action, index) {
  let details = '';

  if (action.selectors) {
    const selector = action.selectors.id || action.selectors.css || action.selectors.className || 'N/A';
    details += `
      <div class="step-detail-item">
        <span class="step-detail-label">Seletor:</span>
        <span class="step-detail-value">${escapeHtml(selector)}</span>
      </div>
    `;
  }

  if (action.type === 'input' && action.value) {
    const isVariable = action.value.match(/^{{(.+)}}$/);
    const displayValue = isVariable 
      ? `<span class="step-value-with-var"><span class="var-badge">VAR</span> ${escapeHtml(action.value)}</span>`
      : `"${escapeHtml(action.value)}"`;
    
    details += `
      <div class="step-detail-item">
        <span class="step-detail-label">Valor:</span>
        <span class="step-detail-value">${displayValue}</span>
      </div>
    `;
  }

  if (action.type === 'keypress' && action.key) {
    details += `
      <div class="step-detail-item">
        <span class="step-detail-label">Tecla:</span>
        <span class="step-detail-value">${action.key}</span>
      </div>
    `;
  }

  if (action.type === 'navigation') {
    details += `
      <div class="step-detail-item">
        <span class="step-detail-label">URL:</span>
        <span class="step-detail-value">${escapeHtml(action.url)}</span>
      </div>
    `;
  }

  if (action.url && action.type !== 'navigation') {
    details += `
      <div class="step-detail-item">
        <span class="step-detail-label">Página:</span>
        <span class="step-detail-value">${escapeHtml(action.url)}</span>
      </div>
    `;
  }

  return details;
}

function setupSortable() {
  if (sortableInstance) {
    sortableInstance.destroy();
  }

  if (!window.Sortable || !selectedFlow) return;

  sortableInstance = Sortable.create(stepsList, {
    animation: 150,
    handle: '.step-item',
    ghostClass: 'sortable-ghost',
    dragClass: 'sortable-drag',
    onEnd: function(evt) {
      const flow = flows[selectedFlow];
      const movedItem = flow.actions.splice(evt.oldIndex, 1)[0];
      flow.actions.splice(evt.newIndex, 0, movedItem);
      
      saveFlow(selectedFlow, flow);
      renderSteps(flow.actions);
    }
  });
}

// ============ VARIABLE FUNCTIONS ============

function openVariableModal(stepIndex) {
  const flow = flows[selectedFlow];
  const action = flow.actions[stepIndex];
  
  if (action.type !== 'input') {
    alert('Apenas ações de digitação podem ser variáveis');
    return;
  }

  currentEditingStep = stepIndex;
  
  // Check if already a variable
  const existingVar = action.value.match(/^{{(.+)}}$/);
  if (existingVar) {
    document.getElementById('variableName').value = existingVar[1];
    document.getElementById('variableValue').value = action.originalValue || action.value;
  } else {
    document.getElementById('variableName').value = '';
    document.getElementById('variableValue').value = action.value;
  }
  
  document.getElementById('variableSensitive').checked = action.sensitive || false;
  
  variableModal.classList.remove('hidden');
}

function closeVariableModal() {
  variableModal.classList.add('hidden');
  currentEditingStep = null;
}

function saveVariableConfig() {
  const varName = document.getElementById('variableName').value.trim();
  const originalValue = document.getElementById('variableValue').value;
  const isSensitive = document.getElementById('variableSensitive').checked;
  
  if (!varName) {
    alert('Digite um nome para a variável');
    return;
  }
  
  // Validate variable name (no spaces, alphanumeric + underscore)
  if (!/^[a-zA-Z0-9_]+$/.test(varName)) {
    alert('Nome inválido. Use apenas letras, números e underscore (_)');
    return;
  }
  
  const flow = flows[selectedFlow];
  const action = flow.actions[currentEditingStep];
  
  action.value = `{{${varName}}}`;
  action.originalValue = originalValue;
  action.sensitive = isSensitive;
  action.isVariable = true;
  
  saveFlow(selectedFlow, flow);
  renderFlowDetails(flow);
  closeVariableModal();
}

function removeVariable(varName) {
  if (!confirm(`Remover variável "{{${varName}}}"?`)) return;
  
  const flow = flows[selectedFlow];
  
  flow.actions.forEach(action => {
    if (action.isVariable && action.value === `{{${varName}}}`) {
      action.value = action.originalValue || '';
      delete action.isVariable;
      delete action.originalValue;
      delete action.sensitive;
    }
  });
  
  saveFlow(selectedFlow, flow);
  renderFlowDetails(flow);
}

function extractVariables(flow) {
  const variables = [];
  const seen = new Set();
  
  flow.actions.forEach(action => {
    if (action.isVariable && action.value.match(/^{{(.+)}}$/)) {
      const varName = action.value.match(/^{{(.+)}}$/)[1];
      if (!seen.has(varName)) {
        seen.add(varName);
        variables.push({
          name: varName,
          defaultValue: action.originalValue || '',
          sensitive: action.sensitive || false
        });
      }
    }
  });
  
  return variables;
}

function countVariables(flow) {
  return extractVariables(flow).length;
}

// ============ EXECUTION WITH VARIABLES ============

function handleExecuteWithVariables() {
  if (!selectedFlow) return;
  
  const flow = flows[selectedFlow];
  const variables = extractVariables(flow);
  
  if (variables.length === 0) {
    // No variables, execute directly
    executeFlow(flow, {});
  } else {
    // Show modal to collect variable values
    showExecutionModal(variables, flow);
  }
}

function showExecutionModal(variables, flow) {
  const container = document.getElementById('executionVariableInputs');
  
  container.innerHTML = variables.map(variable => `
    <div class="form-group">
      <label>${variable.name}:</label>
      <input 
        type="${variable.sensitive ? 'password' : 'text'}" 
        id="exec_${variable.name}" 
        placeholder="${variable.sensitive ? '••••••' : variable.defaultValue}"
        value="${variable.sensitive ? '' : variable.defaultValue}"
      />
      <small>${variable.sensitive ? '🔒 Informação sensível' : 'Pressione Enter para usar o valor padrão'}</small>
    </div>
  `).join('');
  
  executionModal.classList.remove('hidden');
}

function closeExecutionModal() {
  executionModal.classList.add('hidden');
}

function executeWithVariableValues() {
  const flow = flows[selectedFlow];
  const variables = extractVariables(flow);
  
  const variableValues = {};
  
  for (const variable of variables) {
    const input = document.getElementById(`exec_${variable.name}`);
    const value = input.value.trim();
    
    if (!value) {
      alert(`Por favor, preencha o valor para: ${variable.name}`);
      return;
    }
    
    variableValues[variable.name] = value;
  }
  
  closeExecutionModal();
  executeFlow(flow, variableValues);
}

async function executeFlow(flow, variableValues) {
  try {
    // Replace variables in actions
    const processedActions = flow.actions.map(action => {
      if (action.isVariable && action.value.match(/^{{(.+)}}$/)) {
        const varName = action.value.match(/^{{(.+)}}$/)[1];
        return {
          ...action,
          value: variableValues[varName] || action.originalValue || action.value
        };
      }
      return action;
    });
    
    const response = await chrome.runtime.sendMessage({
      type: 'EXECUTE_FLOW',
      data: {
        actions: processedActions,
        startUrl: flow.startUrl,
        speed: selectedSpeed
      }
    });

    if (response?.success) {
      alert('✅ Fluxo enviado para execução!');
    } else {
      alert('❌ Erro ao executar: ' + (response?.error || 'Desconhecido'));
    }
  } catch (error) {
    console.error('[Marionete Manager] Execute error:', error);
    alert('❌ Erro ao executar fluxo');
  }
}

// ============ EXPORT/IMPORT ============

function handleExport() {
  if (!selectedFlow) return;
  
  const flow = flows[selectedFlow];
  
  const exportData = {
    name: flow.name,
    version: '1.0',
    exported: new Date().toISOString(),
    flow: flow
  };
  
  const dataStr = JSON.stringify(exportData, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${flow.name.replace(/[^a-z0-9]/gi, '_')}.json`;
  link.click();
  
  URL.revokeObjectURL(url);
  
  console.log('[Marionete] Exported flow:', flow.name);
}

async function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  try {
    const text = await file.text();
    const importData = JSON.parse(text);
    
    // Validate
    if (!importData.flow || !importData.flow.actions) {
      throw new Error('Arquivo inválido');
    }
    
    const flow = importData.flow;
    
    // Check if flow name already exists
    let flowName = flow.name;
    let counter = 1;
    while (flows[flowName]) {
      flowName = `${flow.name} (${counter})`;
      counter++;
    }
    
    flow.name = flowName;
    flow.recordedAt = flow.recordedAt || new Date().toISOString();
    
    // Save
    await chrome.storage.local.set({ [flowName]: flow });
    flows[flowName] = flow;
    
    renderFlowList();
    selectFlow(flowName);
    
    alert(`✅ Fluxo importado: ${flowName}`);
    
  } catch (error) {
    console.error('[Marionete] Import error:', error);
    alert('❌ Erro ao importar: ' + error.message);
  } finally {
    fileInput.value = '';
  }
}

// ============ STANDARD FUNCTIONS ============

async function handleDeleteStep(index) {
  if (!selectedFlow) return;

  const confirmed = confirm('Deseja remover este passo?');
  if (!confirmed) return;

  const flow = flows[selectedFlow];
  flow.actions.splice(index, 1);
  flow.actionCount = flow.actions.length;

  await saveFlow(selectedFlow, flow);
  renderFlowDetails(flow);
}

function handleEditStep(index) {
  if (!selectedFlow) return;

  const flow = flows[selectedFlow];
  const action = flow.actions[index];

  if (action.type === 'input') {
    const currentValue = action.isVariable ? action.originalValue : action.value;
    const newValue = prompt('Novo valor:', currentValue);
    if (newValue !== null) {
      if (action.isVariable) {
        action.originalValue = newValue;
      } else {
        action.value = newValue;
      }
      saveFlow(selectedFlow, flow);
      renderFlowDetails(flow);
    }
  } else {
    alert('Edição disponível apenas para ações de digitação no momento');
  }
}

async function handleDelete() {
  if (!selectedFlow) return;

  const flow = flows[selectedFlow];
  const confirmed = confirm(`Deseja apagar o fluxo "${flow.name}"?`);
  
  if (!confirmed) return;

  try {
    await chrome.storage.local.remove(selectedFlow);
    delete flows[selectedFlow];
    
    selectedFlow = null;
    
    flowTitle.textContent = 'Selecione um fluxo';
    btnDelete.disabled = true;
    btnExecute.disabled = true;
    btnExport.disabled = true;
    speedSelector.classList.add('hidden');
    flowDetails.classList.add('hidden');
    emptyState.classList.remove('hidden');
    
    renderFlowList();
  } catch (error) {
    console.error('[Marionete Manager] Delete error:', error);
    alert('Erro ao apagar fluxo');
  }
}

function handleNewFlow() {
  alert('Para criar um novo fluxo, use o botão de gravação na extensão enquanto navega em uma página.');
}

async function saveFlow(name, flow) {
  await chrome.storage.local.set({ [name]: flow });
  flows[name] = flow;
}

// ============ HELPER FUNCTIONS ============

function getActionTypeLabel(type) {
  const labels = {
    click: 'Clique',
    input: 'Digitação',
    keypress: 'Tecla Pressionada',
    navigation: 'Navegação'
  };
  return labels[type] || type;
}

function getActionBadge(type) {
  const badges = {
    click: '👆',
    input: '⌨️',
    keypress: '↵',
    navigation: '🌐'
  };
  return badges[type] || '•';
}

function formatDuration(ms) {
  if (!ms || ms < 0) return '0ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Make removeVariable globally accessible
window.removeVariable = removeVariable;