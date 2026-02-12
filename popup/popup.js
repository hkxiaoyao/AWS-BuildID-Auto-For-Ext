/**
 * Popup 脚本 - 弹窗逻辑
 * 支持自定义循环次数和多窗口并发
 */

// DOM 元素
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const stepText = document.getElementById('step-text');
const counter = document.getElementById('counter');

const loopCountInput = document.getElementById('loop-count');
const concurrencyInput = document.getElementById('concurrency');

const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const resetBtn = document.getElementById('reset-btn');

const errorSection = document.getElementById('error-section');
const errorText = document.getElementById('error-text');

const sessionsSection = document.getElementById('sessions-section');
const sessionsList = document.getElementById('sessions-list');

const accountSection = document.getElementById('account-section');
const emailValue = document.getElementById('email-value');
const passwordValue = document.getElementById('password-value');

const tokenSection = document.getElementById('token-section');
const accessTokenValue = document.getElementById('access-token-value');

const historyList = document.getElementById('history-list');
const exportBtn = document.getElementById('export-btn');
const exportCsvBtn = document.getElementById('export-csv-btn');
const clearBtn = document.getElementById('clear-btn');
const validateBtn = document.getElementById('validate-btn');
const validateSection = document.getElementById('validate-section');
const validateText = document.getElementById('validate-text');

// Gmail 配置元素
const gmailAddressInput = document.getElementById('gmail-address');
const gmailSaveBtn = document.getElementById('gmail-save-btn');
const gmailStatus = document.getElementById('gmail-status');
const gmailAuthBtn = document.getElementById('gmail-auth-btn');
const gmailAuthStatus = document.getElementById('gmail-auth-status');
const gmailSenderInput = document.getElementById('gmail-sender');
const gmailSenderSaveBtn = document.getElementById('gmail-sender-save-btn');
const mailProviderSelect = document.getElementById('mail-provider');
const moemailConfigPanel = document.getElementById('moemail-config');
const moemailBaseUrlInput = document.getElementById('moemail-base-url');
const moemailApiKeyInput = document.getElementById('moemail-api-key');
const moemailDomainInput = document.getElementById('moemail-domain');
const moemailLoadDomainsBtn = document.getElementById('moemail-load-domains-btn');
const moemailPrefixInput = document.getElementById('moemail-prefix');
const moemailRandomLenInput = document.getElementById('moemail-random-len');
const moemailExpirySelect = document.getElementById('moemail-expiry');
const moemailSaveBtn = document.getElementById('moemail-save-btn');
const moemailStatus = document.getElementById('moemail-status');

const fingerprintEnabledInput = document.getElementById('fingerprint-enabled');
const fingerprintRandomBtn = document.getElementById('fingerprint-random-btn');
const fingerprintPreviewBtn = document.getElementById('fingerprint-preview-btn');
const fingerprintPreview = document.getElementById('fingerprint-preview');

// Token Pool 元素
const poolApiKeyInput = document.getElementById('pool-api-key');
const poolConnectBtn = document.getElementById('pool-connect-btn');
const poolDisconnectBtn = document.getElementById('pool-disconnect-btn');
const poolUploadBtn = document.getElementById('pool-upload-btn');
const poolConfig = document.getElementById('pool-config');
const poolUserInfo = document.getElementById('pool-user-info');
const poolUsername = document.getElementById('pool-username');
const poolPoints = document.getElementById('pool-points');

// Gmail 配置
let gmailAddress = '';
let mailProvider = 'gmail';
let moemailConfig = {
  baseUrl: '',
  apiKey: '',
  domain: '',
  fixedPrefix: '',
  randomLength: 5,
  expiry: 3600000
};

// Token Pool 配置
const POOL_API_URL = 'http://localhost:8080';
let poolApiKey = '';
let poolUser = null;

/**
 * 更新 UI 状态
 */
function updateUI(state) {
  console.log('[Popup] 更新 UI:', state);

  // 状态指示器
  statusDot.className = 'dot';
  switch (state.status) {
    case 'idle':
      statusDot.classList.add('idle');
      statusText.textContent = '准备就绪';
      break;
    case 'running':
      statusDot.classList.add('processing');
      statusText.textContent = '注册进行中';
      break;
    case 'completed':
      statusDot.classList.add('success');
      statusText.textContent = '全部完成';
      break;
    case 'error':
      statusDot.classList.add('error');
      statusText.textContent = '发生错误';
      break;
    default:
      statusDot.classList.add('idle');
      statusText.textContent = state.status || '未知状态';
  }

  // 计数器
  if (state.totalTarget > 0) {
    counter.style.display = 'inline';
    counter.textContent = `${state.totalRegistered}/${state.totalTarget}`;
  } else {
    counter.style.display = 'none';
  }

  // 步骤文本
  stepText.textContent = state.step || '';

  // 错误显示
  if (state.error) {
    errorSection.style.display = 'flex';
    errorText.textContent = state.error;
  } else {
    errorSection.style.display = 'none';
  }

  // 按钮和设置状态
  const isRunning = state.status === 'running';
  const isIdle = state.status === 'idle';
  const isFinished = state.status === 'completed' || state.status === 'error';

  // 设置输入框禁用状态
  loopCountInput.disabled = !isIdle;
  concurrencyInput.disabled = !isIdle;

  if (isIdle) {
    startBtn.style.display = 'flex';
    stopBtn.style.display = 'none';
    resetBtn.style.display = 'none';
  } else if (isRunning) {
    startBtn.style.display = 'none';
    stopBtn.style.display = 'flex';
    resetBtn.style.display = 'none';
  } else if (isFinished) {
    startBtn.style.display = 'none';
    stopBtn.style.display = 'none';
    resetBtn.style.display = 'flex';
    resetBtn.style.flex = '1';
  }

  // 并发会话显示
  if (state.sessions && state.sessions.length > 0) {
    sessionsSection.style.display = 'block';
    renderSessions(state.sessions);
  } else {
    sessionsSection.style.display = 'none';
  }

  // 账号信息（显示最后一个成功的）
  if (state.lastSuccess) {
    accountSection.style.display = 'block';
    emailValue.textContent = state.lastSuccess.email || '-';
    passwordValue.textContent = state.lastSuccess.password || '-';
  } else {
    accountSection.style.display = 'none';
  }

  // Token 信息
  if (state.lastSuccess?.token) {
    tokenSection.style.display = 'block';
    accessTokenValue.textContent = state.lastSuccess.token.accessToken || '-';
  } else {
    tokenSection.style.display = 'none';
  }

  // 历史记录
  renderHistory(state.history || []);
}

/**
 * 渲染并发会话列表
 */
function renderSessions(sessions) {
  sessionsList.innerHTML = sessions.map((session, index) => {
    let statusClass = 'running';
    if (session.status === 'completed') statusClass = 'success';
    else if (session.status === 'error') statusClass = 'error';

    return `
      <div class="session-item">
        <span class="session-id">#${index + 1}</span>
        <span class="session-status ${statusClass}"></span>
        <span class="session-step">${session.step || session.status}</span>
        <span class="session-email">${session.email || ''}</span>
      </div>
    `;
  }).join('');
}

/**
 * 渲染历史记录
 */
function renderHistory(history) {
  if (!history || history.length === 0) {
    historyList.innerHTML = '<div class="history-empty">暂无记录</div>';
    return;
  }

  historyList.innerHTML = history.slice(0, 20).map(item => {
    // 确定状态类
    let statusClass = item.success ? 'success' : 'failed';
    if (item.success && item.tokenStatus) {
      const statusClassMap = {
        valid: 'success',
        suspended: 'suspended',
        expired: 'expired',
        invalid: 'invalid',
        error: 'error',
        unknown: 'unknown'
      };
      statusClass = statusClassMap[item.tokenStatus] || 'unknown';
    }

    // Token 状态徽章
    let tokenBadge = '';
    if (item.success && item.tokenStatus) {
      const badgeLabels = {
        valid: '有效',
        suspended: '封禁',
        expired: '过期',
        invalid: '无效',
        error: '错误',
        unknown: '未验证'
      };
      tokenBadge = `<span class="token-badge ${item.tokenStatus}">${badgeLabels[item.tokenStatus] || item.tokenStatus}</span>`;
    }

    return `
    <div class="history-item" data-id="${item.id}">
      <div class="history-status ${statusClass}"></div>
      <div class="history-info">
        <div class="history-email">${item.email || '-'}${tokenBadge}</div>
        <div class="history-time">${item.time || ''}</div>
      </div>
      <div class="history-actions">
        ${item.success && item.token ? `<button class="kiro-btn" data-id="${item.id}" title="同步至 Kiro IDE">Kiro</button>` : ''}
        <button class="copy-btn-record" data-id="${item.id}">复制</button>
      </div>
    </div>
  `;
  }).join('');
}

// 事件委托：处理历史记录按钮点击
historyList.addEventListener('click', async (e) => {
  const target = e.target;

  // Kiro 同步按钮
  if (target.classList.contains('kiro-btn')) {
    const id = target.getAttribute('data-id');
    await syncToKiro(id);
  }

  // 复制按钮
  if (target.classList.contains('copy-btn-record')) {
    const id = target.getAttribute('data-id');
    await copyRecord(id);
  }
});

/**
 * 检测操作系统类型
 * @returns {'windows' | 'macos' | 'linux'}
 */
function detectOS() {
  const platform = navigator.platform.toLowerCase();
  const userAgent = navigator.userAgent.toLowerCase();
  
  if (platform.includes('win') || userAgent.includes('windows')) {
    return 'windows';
  } else if (platform.includes('mac') || userAgent.includes('macintosh')) {
    return 'macos';
  } else {
    return 'linux';
  }
}

/**
 * 同步至 Kiro IDE（生成命令并复制到剪贴板）
 * 智能检测操作系统，生成对应的命令
 */
async function syncToKiro(id) {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'EXPORT_HISTORY' });
    const record = response.history?.find(r => String(r.id) === String(id));

    if (!record) {
      alert('找不到该记录');
      return;
    }
    if (!record.token) {
      alert('该记录没有 Token 信息');
      return;
    }

    const { clientId, clientSecret, accessToken, refreshToken } = record.token;
    if (!clientId || !accessToken) {
      alert('Token 信息不完整');
      return;
    }

    // 计算 clientId 的 SHA1 哈希
    const encoder = new TextEncoder();
    const data = encoder.encode(clientId);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const clientIdHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
    const clientExpiresAt = new Date(Date.now() + 90 * 86400 * 1000).toISOString();

    const authToken = JSON.stringify({
      accessToken,
      refreshToken,
      expiresAt,
      clientIdHash,
      authMethod: 'IdC',
      provider: 'BuilderId',
      region: 'us-east-1'
    }, null, 2);

    const clientInfo = JSON.stringify({
      clientId,
      clientSecret,
      expiresAt: clientExpiresAt
    }, null, 2);

    // 智能检测操作系统
    const os = detectOS();
    let command = '';
    let terminalName = '';

    if (os === 'windows') {
      // Windows PowerShell 命令
      // 转义 JSON 中的特殊字符用于 PowerShell
      const authTokenEscaped = authToken.replace(/'/g, "''");
      const clientInfoEscaped = clientInfo.replace(/'/g, "''");
      
      command = `$ssoDir = "$env:USERPROFILE\\.aws\\sso\\cache"
if (!(Test-Path $ssoDir)) { New-Item -ItemType Directory -Force -Path $ssoDir | Out-Null }
@'
${authTokenEscaped}
'@ | Out-File -FilePath "$ssoDir\\kiro-auth-token.json" -Encoding UTF8 -NoNewline
@'
${clientInfoEscaped}
'@ | Out-File -FilePath "$ssoDir\\${clientIdHash}.json" -Encoding UTF8 -NoNewline
Write-Host "已同步至 Kiro IDE" -ForegroundColor Green`;
      terminalName = 'PowerShell';
    } else {
      // macOS / Linux bash 命令
      command = `mkdir -p ~/.aws/sso/cache && cat > ~/.aws/sso/cache/kiro-auth-token.json << 'EOF'
${authToken}
EOF
cat > ~/.aws/sso/cache/${clientIdHash}.json << 'EOF'
${clientInfo}
EOF
echo "已同步至 Kiro IDE"`;
      terminalName = '终端';
    }

    await navigator.clipboard.writeText(command);
    alert(`检测到 ${os === 'windows' ? 'Windows' : os === 'macos' ? 'macOS' : 'Linux'} 系统\n命令已复制到剪贴板\n\n请在 ${terminalName} 中粘贴执行`);
  } catch (err) {
    alert('同步失败: ' + err.message);
  }
}

/**
 * 复制记录
 */
async function copyRecord(id) {
  const response = await chrome.runtime.sendMessage({ type: 'EXPORT_HISTORY' });
  const record = response.history?.find(r => String(r.id) === String(id));
  if (record) {
    const text = `邮箱: ${record.email}\n密码: ${record.password}\n姓名: ${record.firstName} ${record.lastName}\nToken: ${record.token?.accessToken || '无'}`;
    await navigator.clipboard.writeText(text);
    alert('已复制到剪贴板');
  }
}

/**
 * 复制到剪贴板
 */
async function copyToClipboard(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    button.classList.add('copied');
    const originalText = button.textContent;
    button.textContent = '已复制';
    setTimeout(() => {
      button.classList.remove('copied');
      button.textContent = originalText;
    }, 1500);
  } catch (err) {
    console.error('复制失败:', err);
  }
}

/**
 * 开始注册
 */
async function startRegistration() {
  const loopCount = parseInt(loopCountInput.value) || 1;
  const concurrency = parseInt(concurrencyInput.value) || 1;

  if (mailProvider === 'gmail') {
    if (!gmailAddress) {
      alert('请先配置 Gmail 地址');
      gmailAddressInput.focus();
      return;
    }
  } else {
    if (!moemailConfig.baseUrl || !moemailConfig.apiKey || !moemailConfig.domain) {
      alert('请先完整配置 MoEmail 地址、Key、域名');
      moemailBaseUrlInput.focus();
      return;
    }
  }

  // 验证输入
  if (loopCount < 1 || loopCount > 100) {
    alert('注册数量需在 1-100 之间');
    return;
  }
  if (concurrency < 1 || concurrency > 3) {
    alert('并发窗口需在 1-3 之间');
    return;
  }

  // Gmail 别名模式建议并发为 1
  if (mailProvider === 'gmail' && concurrency > 1) {
    const confirm = window.confirm('使用 Gmail 别名模式时，建议并发设为 1（需要手动输入验证码）。\n\n是否继续？');
    if (!confirm) return;
  }

  startBtn.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'START_BATCH_REGISTRATION',
      loopCount,
      concurrency,
      gmailAddress,
      mailProvider,
      moemailConfig
    });
    console.log('[Popup] 注册响应:', response);

    if (response.state) {
      updateUI(response.state);
    }
  } catch (error) {
    console.error('[Popup] 注册错误:', error);
    updateUI({
      status: 'error',
      error: error.message
    });
  } finally {
    startBtn.disabled = false;
  }
}

/**
 * 停止注册
 */
async function stopRegistration() {
  try {
    await chrome.runtime.sendMessage({ type: 'STOP_REGISTRATION' });
  } catch (error) {
    console.error('[Popup] 停止错误:', error);
  }
}

/**
 * 重置
 */
async function reset() {
  try {
    await chrome.runtime.sendMessage({ type: 'RESET' });
    // 重新获取状态
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    if (response?.state) {
      updateUI(response.state);
    } else {
      updateUI({ status: 'idle', history: [] });
    }
  } catch (error) {
    console.error('[Popup] 重置错误:', error);
  }
}

/**
 * 导出历史 (JSON) - 只导出有效的 Token
 */
async function exportHistory() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'EXPORT_HISTORY' });
    const history = response.history || [];

    if (history.length === 0) {
      alert('暂无记录');
      return;
    }

    // 只导出成功且 token 状态是 valid 或 unknown（未验证）的记录
    // 过滤掉: suspended, expired, invalid, error
    const validRecords = history.filter(r =>
      r.success &&
      r.token &&
      r.tokenStatus !== 'suspended' &&
      r.tokenStatus !== 'expired' &&
      r.tokenStatus !== 'invalid' &&
      r.tokenStatus !== 'error'
    );

    if (validRecords.length === 0) {
      alert('没有有效的注册记录（可能全部被封禁、过期或无效）');
      return;
    }

    // 生成 JSON 格式（与原项目一致，只包含 Token 信息）
    const jsonData = validRecords.map(r => ({
      clientId: r.token?.clientId || '',
      clientSecret: r.token?.clientSecret || '',
      accessToken: r.token?.accessToken || '',
      refreshToken: r.token?.refreshToken || ''
    }));

    const jsonStr = JSON.stringify(jsonData, null, 2);

    // 下载 JSON
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `accounts-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    // 提示导出数量
    const totalSuccess = history.filter(r => r.success && r.token).length;
    if (validRecords.length < totalSuccess) {
      alert(`已导出 ${validRecords.length} 个有效账号（共 ${totalSuccess} 个成功注册，${totalSuccess - validRecords.length} 个被过滤）`);
    }

  } catch (error) {
    console.error('[Popup] 导出错误:', error);
  }
}

/**
 * 导出为 CSV（完整信息，包含 Token 状态）
 */
async function exportHistoryCSV() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'EXPORT_HISTORY' });
    const history = response.history || [];

    if (history.length === 0) {
      alert('暂无记录');
      return;
    }

    // CSV 格式（添加 token_status 字段）
    const headers = ['email', 'password', 'first_name', 'last_name', 'client_id', 'client_secret', 'access_token', 'refresh_token', 'success', 'token_status', 'error'];
    const rows = history.map(r => [
      r.email || '',
      r.password || '',
      r.firstName || '',
      r.lastName || '',
      r.token?.clientId || '',
      r.token?.clientSecret || '',
      r.token?.accessToken || '',
      r.token?.refreshToken || '',
      r.success ? 'true' : 'false',
      r.tokenStatus || '',
      r.error || ''
    ]);

    const csv = [headers, ...rows].map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n');

    // 下载 CSV
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `accounts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('[Popup] 导出 CSV 错误:', error);
  }
}

/**
 * 清空历史
 */
async function clearHistory() {
  if (!confirm('确定要清空所有历史记录吗？')) {
    return;
  }

  try {
    await chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY' });
    renderHistory([]);
  } catch (error) {
    console.error('[Popup] 清空错误:', error);
  }
}

/**
 * 验证所有 Token
 */
async function validateAllTokens() {
  validateBtn.disabled = true;
  validateSection.style.display = 'block';
  validateSection.classList.remove('validate-result');
  validateText.textContent = '正在验证所有 Token (0/0)...';

  try {
    // 监听验证进度
    const progressListener = (message) => {
      if (message.type === 'VALIDATION_PROGRESS') {
        const { validated, total } = message.progress;
        validateText.textContent = `正在验证 Token (${validated}/${total})...`;
      }
    };
    chrome.runtime.onMessage.addListener(progressListener);

    const response = await chrome.runtime.sendMessage({ type: 'VALIDATE_ALL_TOKENS' });
    console.log('[Popup] 验证结果:', response);

    // 移除进度监听器
    chrome.runtime.onMessage.removeListener(progressListener);

    validateSection.classList.add('validate-result');

    // 构建结果文本
    const parts = [];
    if (response.valid > 0) parts.push(`${response.valid} 有效`);
    if (response.expired > 0) parts.push(`${response.expired} 过期`);
    if (response.suspended > 0) parts.push(`${response.suspended} 封禁`);
    if (response.invalid > 0) parts.push(`${response.invalid} 无效`);
    if (response.error > 0) parts.push(`${response.error} 错误`);

    validateText.textContent = `验证完成: ${parts.join(', ')}`;

    // 5秒后隐藏
    setTimeout(() => {
      validateSection.style.display = 'none';
    }, 5000);

    // 刷新状态
    const stateResponse = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    if (stateResponse?.state) {
      updateUI(stateResponse.state);
    }

  } catch (error) {
    console.error('[Popup] 验证错误:', error);
    validateSection.classList.add('validate-result');
    validateText.textContent = '验证失败: ' + error.message;
  } finally {
    validateBtn.disabled = false;
  }
}

// ==================== Gmail 配置功能 ====================

/**
 * 加载 Gmail 配置
 */
async function loadGmailConfig() {
  try {
    const result = await chrome.storage.local.get(['gmailAddress']);
    if (result.gmailAddress) {
      gmailAddress = result.gmailAddress;
      gmailAddressInput.value = gmailAddress;
      updateGmailStatus(true);
    }
  } catch (error) {
    console.error('[Gmail] 加载配置错误:', error);
  }
}

/**
 * 保存 Gmail 配置
 */
async function saveGmailConfig() {
  const email = gmailAddressInput.value.trim();
  
  if (!email) {
    gmailStatus.textContent = '请输入邮箱地址';
    gmailStatus.classList.add('error');
    return;
  }
  
  // 验证邮箱格式
  if (!email.includes('@')) {
    gmailStatus.textContent = '邮箱格式无效';
    gmailStatus.classList.add('error');
    return;
  }
  
  try {
    gmailAddress = email;
    await chrome.storage.local.set({ gmailAddress: email });
    updateGmailStatus(true);
  } catch (error) {
    console.error('[Gmail] 保存配置错误:', error);
    gmailStatus.textContent = '保存失败: ' + error.message;
    gmailStatus.classList.add('error');
  }
}

/**
 * 更新 Gmail 状态显示
 */
function updateGmailStatus(saved) {
  if (saved && gmailAddress) {
    gmailStatus.textContent = `✓ 已配置: ${gmailAddress}`;
    gmailStatus.classList.remove('error');
  } else {
    gmailStatus.textContent = '';
    gmailStatus.classList.remove('error');
  }
}

function updateProviderUI() {
  const isMoEmail = mailProvider === 'moemail';
  moemailConfigPanel.style.display = isMoEmail ? 'flex' : 'none';
  document.querySelector('.gmail-config').style.display = isMoEmail ? 'none' : 'flex';
}

async function saveMailProvider() {
  mailProvider = mailProviderSelect.value;
  await chrome.storage.local.set({ mailProvider });
  updateProviderUI();
}

async function loadMoEmailConfig() {
  const stored = await chrome.storage.local.get(['mailProvider', 'moemailConfig']);
  if (stored.mailProvider) {
    mailProvider = stored.mailProvider;
    mailProviderSelect.value = mailProvider;
  }

  if (stored.moemailConfig) {
    moemailConfig = { ...moemailConfig, ...stored.moemailConfig };
  }

  moemailBaseUrlInput.value = moemailConfig.baseUrl || '';
  moemailApiKeyInput.value = moemailConfig.apiKey || '';
  moemailDomainInput.value = moemailConfig.domain || '';
  moemailPrefixInput.value = moemailConfig.fixedPrefix || '';
  moemailRandomLenInput.value = moemailConfig.randomLength || 5;
  moemailExpirySelect.value = String(moemailConfig.expiry || 3600000);
  updateProviderUI();
}

async function saveMoEmailConfig() {
  const config = {
    baseUrl: moemailBaseUrlInput.value.trim().replace(/\/+$/, ''),
    apiKey: moemailApiKeyInput.value.trim(),
    domain: moemailDomainInput.value.trim(),
    fixedPrefix: moemailPrefixInput.value.trim(),
    randomLength: Math.max(1, Math.min(16, parseInt(moemailRandomLenInput.value, 10) || 5)),
    expiry: parseInt(moemailExpirySelect.value, 10)
  };

  if (!config.baseUrl || !config.apiKey || !config.domain) {
    moemailStatus.textContent = '请填写地址 / key / 域名';
    moemailStatus.classList.add('error');
    return;
  }

  moemailConfig = config;
  await chrome.storage.local.set({ moemailConfig: config });
  moemailStatus.textContent = `✓ 已保存，示例邮箱: ${(config.fixedPrefix || '') + 'x'.repeat(config.randomLength)}@${config.domain}`;
  moemailStatus.classList.remove('error');
}

async function loadMoEmailDomains() {
  moemailLoadDomainsBtn.disabled = true;
  moemailLoadDomainsBtn.textContent = '加载中...';
  try {
    const baseUrl = moemailBaseUrlInput.value.trim().replace(/\/+$/, '');
    const apiKey = moemailApiKeyInput.value.trim();

    if (!baseUrl || !apiKey) {
      throw new Error('请先输入邮箱地址和 API Key');
    }

    let response = await chrome.runtime.sendMessage({
      type: 'MOEMAIL_LOAD_DOMAINS',
      config: {
        baseUrl,
        apiKey
      }
    });

    // 兼容旧后台：若返回未知消息类型，直接在 popup 端请求 /api/config
    if (!response?.success && response?.error === '未知消息类型') {
      const directResp = await fetch(`${baseUrl}/api/config`, {
        method: 'GET',
        headers: {
          'X-API-Key': apiKey
        }
      });
      const directData = await directResp.json();
      const domains = extractDomainListForPopup(directData);
      response = {
        success: directResp.ok && Array.isArray(domains) && domains.length > 0,
        domains,
        error: directResp.ok ? '未获取到域名列表' : (directData?.message || directData?.error || `请求失败(${directResp.status})`)
      };
    }

    if (!response.success) {
      throw new Error(response.error || '获取失败');
    }

    if (response.domains?.length > 0) {
      moemailDomainInput.value = response.domains[0];
      moemailStatus.textContent = `✓ 获取成功，共 ${response.domains.length} 个域名`;
      moemailStatus.classList.remove('error');
    }
  } catch (error) {
    moemailStatus.textContent = '获取域名失败: ' + error.message;
    moemailStatus.classList.add('error');
  } finally {
    moemailLoadDomainsBtn.disabled = false;
    moemailLoadDomainsBtn.textContent = '获取域名';
  }
}

function extractDomainListForPopup(input) {
  const found = new Set();
  const domainRegex = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

  const pushCandidate = (value) => {
    if (typeof value !== 'string') return;
    const parts = value
      .split(/[\s,;|]+/)
      .map(part => part.trim().replace(/^@/, '').toLowerCase())
      .filter(Boolean);

    for (const normalized of parts) {
      if (domainRegex.test(normalized)) {
        found.add(normalized);
      }
    }
  };

  const walk = (node) => {
    if (!node) return;
    if (typeof node === 'string') {
      pushCandidate(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node === 'object') {
      pushCandidate(node.domain);
      pushCandidate(node.name);
      pushCandidate(node.value);
      pushCandidate(node.host);
      Object.values(node).forEach(walk);
    }
  };

  walk(input);
  return Array.from(found);
}

function renderFingerprintPreview(fp) {
  if (!fp) {
    fingerprintPreview.value = '';
    return;
  }
  fingerprintPreview.value = JSON.stringify(fp, null, 2);
}

async function loadFingerprintConfig() {
  const response = await chrome.runtime.sendMessage({ type: 'FINGERPRINT_GET_CONFIG' });
  if (!response?.success) return;
  fingerprintEnabledInput.checked = !!response.settings?.enabled;
  renderFingerprintPreview(response.current);
}

async function saveFingerprintEnabled() {
  await chrome.runtime.sendMessage({
    type: 'FINGERPRINT_SET_CONFIG',
    settings: {
      enabled: fingerprintEnabledInput.checked
    }
  });
}

async function randomizeFingerprint() {
  const response = await chrome.runtime.sendMessage({ type: 'FINGERPRINT_RANDOMIZE' });
  if (response?.success) {
    renderFingerprintPreview(response.fingerprint);
  }
}

// ==================== Gmail API 授权功能 ====================

/**
 * 加载 Gmail API 配置
 */
async function loadGmailApiConfig() {
  try {
    // 从 service worker 获取配置
    const response = await chrome.runtime.sendMessage({ type: 'GMAIL_API_GET_CONFIG' });

    // 更新授权状态显示
    updateGmailAuthStatus(response.authorized);

    // 更新发件人配置
    if (response.sender) {
      gmailSenderInput.value = response.sender;
    }
  } catch (error) {
    console.error('[Gmail API] 加载配置错误:', error);
  }
}

/**
 * 更新 Gmail API 授权状态显示
 */
function updateGmailAuthStatus(authorized) {
  if (authorized) {
    gmailAuthStatus.textContent = '✓ 已授权';
    gmailAuthStatus.classList.remove('error');
    gmailAuthStatus.classList.add('success');
    gmailAuthBtn.textContent = '重新授权';
  } else {
    gmailAuthStatus.textContent = '';
    gmailAuthStatus.classList.remove('success', 'error');
    gmailAuthBtn.textContent = '授权 Gmail API';
  }
}

/**
 * Gmail API 授权
 */
async function authorizeGmailApi() {
  gmailAuthBtn.disabled = true;
  gmailAuthBtn.textContent = '授权中...';
  gmailAuthStatus.textContent = '';
  gmailAuthStatus.classList.remove('success', 'error');

  try {
    const response = await chrome.runtime.sendMessage({ type: 'GMAIL_API_AUTHORIZE' });

    if (response.success) {
      updateGmailAuthStatus(true);
    } else {
      gmailAuthStatus.textContent = '授权失败: ' + response.error;
      gmailAuthStatus.classList.add('error');
      gmailAuthBtn.textContent = '授权 Gmail API';
    }
  } catch (error) {
    gmailAuthStatus.textContent = '授权失败: ' + error.message;
    gmailAuthStatus.classList.add('error');
    gmailAuthBtn.textContent = '授权 Gmail API';
  } finally {
    gmailAuthBtn.disabled = false;
  }
}

/**
 * 保存验证码发件人配置
 */
async function saveGmailSender() {
  const sender = gmailSenderInput.value.trim();
  if (!sender) {
    alert('请输入发件人地址');
    return;
  }

  try {
    await chrome.runtime.sendMessage({
      type: 'GMAIL_API_SET_SENDER',
      sender: sender
    });

    // 显示保存成功提示
    gmailSenderSaveBtn.textContent = '已保存';
    setTimeout(() => {
      gmailSenderSaveBtn.textContent = '保存';
    }, 1500);
  } catch (error) {
    alert('保存失败: ' + error.message);
  }
}

// ==================== Token Pool 功能 ====================

/**
 * 加载 Token Pool 配置
 */
async function loadPoolConfig() {
  try {
    const result = await chrome.storage.local.get(['poolApiKey']);
    if (result.poolApiKey) {
      poolApiKey = result.poolApiKey;
      poolApiKeyInput.value = poolApiKey;
      await connectToPool();
    }
  } catch (error) {
    console.error('[Pool] 加载配置错误:', error);
  }
}

/**
 * 连接到 Token Pool
 */
async function connectToPool() {
  const apiKey = poolApiKeyInput.value.trim();
  if (!apiKey) {
    alert('请输入 API Key');
    return;
  }

  poolConnectBtn.disabled = true;
  poolConnectBtn.textContent = '连接中...';

  try {
    const response = await fetch(`${POOL_API_URL}/api/cli/profile`, {
      method: 'GET',
      headers: {
        'X-API-Key': apiKey
      }
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || '连接失败');
    }

    const user = await response.json();
    poolApiKey = apiKey;
    poolUser = user;

    // 保存到 storage
    await chrome.storage.local.set({ poolApiKey: apiKey });

    // 更新 UI
    updatePoolUI();

  } catch (error) {
    console.error('[Pool] 连接错误:', error);
    alert('连接失败: ' + error.message);
  } finally {
    poolConnectBtn.disabled = false;
    poolConnectBtn.textContent = '连接';
  }
}

/**
 * 断开 Token Pool 连接
 */
async function disconnectFromPool() {
  poolApiKey = '';
  poolUser = null;
  await chrome.storage.local.remove(['poolApiKey']);
  poolApiKeyInput.value = '';
  updatePoolUI();
}

/**
 * 更新 Token Pool UI
 */
function updatePoolUI() {
  if (poolUser) {
    poolConfig.style.display = 'none';
    poolUserInfo.style.display = 'flex';
    poolUsername.textContent = poolUser.username || poolUser.email;
    poolPoints.textContent = `${poolUser.points} 积分`;
    poolUploadBtn.style.display = 'inline-flex';
  } else {
    poolConfig.style.display = 'block';
    poolUserInfo.style.display = 'none';
    poolUploadBtn.style.display = 'none';
  }
}

/**
 * 上传有效 Token 至 Pool
 */
async function uploadToPool() {
  if (!poolApiKey || !poolUser) {
    alert('请先连接 Token Pool');
    return;
  }

  try {
    // 获取历史记录
    const response = await chrome.runtime.sendMessage({ type: 'EXPORT_HISTORY' });
    const history = response.history || [];

    // 过滤有效的 Token
    const validRecords = history.filter(r =>
      r.success &&
      r.token &&
      r.tokenStatus === 'valid'
    );

    if (validRecords.length === 0) {
      alert('没有可上传的有效 Token\n\n请先验证 Token 状态');
      return;
    }

    if (!confirm(`确定上传 ${validRecords.length} 个有效 Token 至 Pool？`)) {
      return;
    }

    poolUploadBtn.disabled = true;
    poolUploadBtn.textContent = '上传中...';

    // 准备上传数据
    const tokens = validRecords.map(r => ({
      email: r.email,
      clientId: r.token.clientId,
      clientSecret: r.token.clientSecret,
      accessToken: r.token.accessToken,
      refreshToken: r.token.refreshToken
    }));

    // 上传
    const uploadResponse = await fetch(`${POOL_API_URL}/api/cli/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': poolApiKey
      },
      body: JSON.stringify({ tokens })
    });

    const result = await uploadResponse.json();

    if (!uploadResponse.ok) {
      throw new Error(result.error || '上传失败');
    }

    // 更新积分显示
    if (result.current_points !== undefined) {
      poolUser.points = result.current_points;
      poolPoints.textContent = `${poolUser.points} 积分`;
    }

    // 构建结果消息
    let message = '上传成功！\n\n';
    if (result.new_count > 0) message += `新增: ${result.new_count}\n`;
    if (result.update_count > 0) message += `更新: ${result.update_count}\n`;
    if (result.skip_count > 0) message += `跳过: ${result.skip_count}\n`;
    if (result.valid_count > 0) message += `有效: ${result.valid_count}\n`;
    if (result.points_earned > 0) message += `\n获得 ${result.points_earned} 积分`;

    alert(message);

  } catch (error) {
    console.error('[Pool] 上传错误:', error);
    alert('上传失败: ' + error.message);
  } finally {
    poolUploadBtn.disabled = false;
    poolUploadBtn.textContent = '上传';
  }
}

/**
 * 初始化
 */
async function init() {
  // 获取当前状态
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    if (response?.state) {
      updateUI(response.state);
    }
  } catch (error) {
    console.error('[Popup] 获取状态错误:', error);
  }

  // 加载 Gmail 配置
  await loadGmailConfig();
  await loadMoEmailConfig();

  // 加载 Gmail API 配置
  await loadGmailApiConfig();
  await loadFingerprintConfig();

  // 加载 Token Pool 配置
  await loadPoolConfig();

  // 监听状态更新
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'STATE_UPDATE') {
      updateUI(message.state);
    }
  });

  // 绑定按钮事件
  startBtn.addEventListener('click', startRegistration);
  stopBtn.addEventListener('click', stopRegistration);
  resetBtn.addEventListener('click', reset);
  exportBtn.addEventListener('click', exportHistory);
  exportCsvBtn.addEventListener('click', exportHistoryCSV);
  clearBtn.addEventListener('click', clearHistory);
  validateBtn.addEventListener('click', validateAllTokens);

  // Gmail 配置事件
  gmailSaveBtn.addEventListener('click', saveGmailConfig);
  gmailAddressInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveGmailConfig();
    }
  });

  // Gmail API 授权事件
  gmailAuthBtn.addEventListener('click', authorizeGmailApi);
  gmailSenderSaveBtn.addEventListener('click', saveGmailSender);
  mailProviderSelect.addEventListener('change', saveMailProvider);
  moemailSaveBtn.addEventListener('click', saveMoEmailConfig);
  moemailLoadDomainsBtn.addEventListener('click', loadMoEmailDomains);

  fingerprintEnabledInput.addEventListener('change', saveFingerprintEnabled);
  fingerprintRandomBtn.addEventListener('click', randomizeFingerprint);
  fingerprintPreviewBtn.addEventListener('click', loadFingerprintConfig);

  // Token Pool 事件
  poolConnectBtn.addEventListener('click', connectToPool);
  poolDisconnectBtn.addEventListener('click', disconnectFromPool);
  poolUploadBtn.addEventListener('click', uploadToPool);

  // 绑定复制按钮事件
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const targetElement = document.getElementById(targetId);
      if (targetElement && targetElement.textContent !== '-') {
        copyToClipboard(targetElement.textContent, btn);
      }
    });
  });
}

// 启动
document.addEventListener('DOMContentLoaded', init);
