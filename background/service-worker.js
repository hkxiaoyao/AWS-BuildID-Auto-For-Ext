/**
 * Service Worker - 后台服务
 * 管理注册状态和流程控制，支持多窗口并发注册
 */

import { GmailAliasClient, MoEmailClient } from '../lib/mail-api.js';
import { GmailApiClient } from '../lib/gmail-api.js';
import { AWSDeviceAuth, validateToken, refreshAndValidateToken } from '../lib/oidc-api.js';
import { generatePassword, generateName, generateEmailPrefix } from '../lib/utils.js';
import { generateFingerprint } from '../lib/fingerprint.js';

// Gmail 配置
let gmailBaseAddress = '';
let mailProvider = 'gmail';
let moemailConfig = {
  baseUrl: '',
  apiKey: '',
  domain: '',
  fixedPrefix: '',
  randomLength: 5,
  expiry: 3600000
};

let fingerprintSettings = {
  enabled: false
};
let currentFingerprint = null;

// Gmail API 配置
let gmailApiClient = null;
let gmailApiAuthorized = false;
let gmailSenderFilter = 'no-reply@signin.aws';  // AWS 验证码发件人

// ============== 全局状态 ==============

// 主状态
let globalState = {
  status: 'idle', // idle, running, completed, error
  step: '',
  error: null,
  totalTarget: 0,      // 目标注册数
  totalRegistered: 0,  // 已成功注册数
  totalFailed: 0,      // 失败数
  concurrency: 1,      // 并发数
  lastSuccess: null    // 最后一个成功的记录
};

// 并发会话
let sessions = new Map(); // sessionId -> session
let sessionIdCounter = 0;

// 任务队列
let taskQueue = [];
let isRunning = false;
let shouldStop = false;

// 注册历史记录
let registrationHistory = [];

// 窗口创建锁，防止同时创建多个窗口
let windowCreationLock = Promise.resolve();

// API 调用锁，防止同时调用 AWS/Mail API
let apiCallLock = Promise.resolve();

// ============== 工具函数 ==============

/**
 * 生成唯一会话 ID
 */
function generateSessionId() {
  return `session_${++sessionIdCounter}_${Date.now()}`;
}

/**
 * 等待标签页加载完成
 */
function waitForTabLoad(tabId, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const checkTab = async () => {
      try {
        const tab = await chrome.tabs.get(tabId);
        console.log(`[waitForTabLoad] tabId=${tabId}, status=${tab.status}, url=${tab.url}`);

        if (tab.status === 'complete') {
          resolve(tab);
          return;
        }
      } catch (e) {
        console.error(`[waitForTabLoad] tabId=${tabId} 获取失败:`, e);
        reject(new Error('标签页已关闭或不存在'));
        return;
      }

      if (Date.now() - startTime > timeout) {
        reject(new Error('等待页面加载超时'));
        return;
      }

      setTimeout(checkTab, 500);
    };

    checkTab();
  });
}

/**
 * 更新状态并通知 popup
 */
function broadcastState() {
  const state = getPublicState();
  chrome.runtime.sendMessage({
    type: 'STATE_UPDATE',
    state
  }).catch(() => {
    // popup 可能未打开，忽略错误
  });
}

/**
 * 获取可以发送给 popup 的公开状态
 */
function getPublicState() {
  return {
    status: globalState.status,
    step: globalState.step,
    error: globalState.error,
    totalTarget: globalState.totalTarget,
    totalRegistered: globalState.totalRegistered,
    totalFailed: globalState.totalFailed,
    lastSuccess: globalState.lastSuccess,
    sessions: Array.from(sessions.values()).map(s => ({
      id: s.id,
      status: s.status,
      step: s.step,
      email: s.email,
      error: s.error
    })),
    history: registrationHistory
  };
}

/**
 * 更新全局状态
 */
function updateGlobalState(updates) {
  globalState = { ...globalState, ...updates };
  broadcastState();
}

/**
 * 更新会话状态
 */
function updateSession(sessionId, updates) {
  const session = sessions.get(sessionId);
  if (session) {
    Object.assign(session, updates);
    broadcastState();
  }
}

async function applyFingerprintToTab(tabId) {
  if (!fingerprintSettings.enabled || !currentFingerprint) {
    return;
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    injectImmediately: true,
    func: (fp) => {
      const override = (obj, prop, value) => {
        try {
          Object.defineProperty(obj, prop, { get: () => value, configurable: true });
        } catch (e) {}
      };

      override(navigator, 'userAgent', fp.userAgent);
      override(navigator, 'platform', fp.platform);
      override(navigator, 'language', fp.language);
      override(navigator, 'languages', fp.languages);
      override(navigator, 'hardwareConcurrency', fp.hardwareConcurrency);
      override(navigator, 'deviceMemory', fp.deviceMemory);

      override(screen, 'width', fp.screen.width);
      override(screen, 'height', fp.screen.height);
      override(screen, 'availWidth', fp.screen.availWidth);
      override(screen, 'availHeight', fp.screen.availHeight);
      override(screen, 'colorDepth', fp.screen.colorDepth);
      override(screen, 'pixelDepth', fp.screen.pixelDepth);

      const getParameter = WebGLRenderingContext?.prototype?.getParameter;
      if (getParameter) {
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
          if (parameter === 37445) return fp.webglVendor;
          if (parameter === 37446) return fp.webglRenderer;
          return getParameter.call(this, parameter);
        };
      }
    },
    args: [currentFingerprint]
  });
}

// ============== 会话管理 ==============

/**
 * 创建新会话
 */
function createSession() {
  const sessionId = generateSessionId();
  const session = {
    id: sessionId,
    status: 'pending', // pending, running, polling_token, completed, error
    step: '等待中...',
    error: null,
    // 账号信息
    email: null,
    password: null,
    firstName: null,
    lastName: null,
    // 邮箱客户端
    mailClient: null,
    mailAccessKey: null,
    // OIDC 客户端
    oidcClient: null,
    oidcAuth: null,
    // 窗口信息
    windowId: null,
    tabId: null,
    // Token 结果
    token: null,
    // 轮询控制
    pollAbort: false,
    // 会话开始时间（用于过滤验证码邮件）
    startTime: Date.now(),
    // 验证码
    verificationCode: null
  };
  sessions.set(sessionId, session);
  return session;
}

/**
 * 销毁会话
 */
async function destroySession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;

  // 关闭窗口
  if (session.windowId) {
    try {
      await chrome.windows.remove(session.windowId);
    } catch (e) {
      // 窗口可能已关闭
    }
  }

  // Gmail 别名模式不需要删除邮箱
  session.mailClient = null;

  sessions.delete(sessionId);
}

/**
 * 关闭所有会话
 */
async function closeAllSessions() {
  const promises = Array.from(sessions.keys()).map(id => destroySession(id));
  await Promise.all(promises);
  sessions.clear();
}

// ============== 注册流程 ==============

/**
 * 带锁的 API 调用，防止并发请求导致限流
 */
async function withApiLock(fn) {
  await apiCallLock;
  let releaseLock;
  apiCallLock = new Promise(resolve => { releaseLock = resolve; });
  try {
    return await fn();
  } finally {
    // API 调用后延迟一小段时间再释放锁
    await new Promise(resolve => setTimeout(resolve, 500));
    releaseLock();
  }
}

/**
 * 单个会话的注册流程
 */
async function runSessionRegistration(session) {
  try {
    session.status = 'running';
    session.pollAbort = false;
    updateSession(session.id, { step: '初始化...' });

    // 步骤 1: 生成账号信息（先生成，用于邮箱前缀）
    updateSession(session.id, { step: '生成账号信息...' });
    const { firstName, lastName } = generateName();
    const password = generatePassword(12);
    session.firstName = firstName;
    session.lastName = lastName;
    session.password = password;

    // 步骤 2: 生成邮箱
    updateSession(session.id, { step: '生成邮箱...' });

    let email;
    if (mailProvider === 'moemail') {
      session.mailClient = new MoEmailClient(moemailConfig);
      if (!session.mailClient.isConfigured()) {
        throw new Error('MoEmail 配置不完整，请先配置地址 / Key / 域名');
      }
      email = await session.mailClient.createInbox();
    } else {
      if (!gmailBaseAddress) {
        throw new Error('未配置 Gmail 地址，请在插件设置中配置');
      }

      session.mailClient = new GmailAliasClient({ baseEmail: gmailBaseAddress });
      const nameSuffix = `${firstName.toLowerCase()}${lastName.toLowerCase()}`.slice(0, 8);
      email = await session.mailClient.createInbox({
        prefix: nameSuffix,
        mode: 'auto'
      });
    }
    session.email = email;
    session.manualVerification = true; // 标记需要手动输入验证码
    updateSession(session.id, { email });

    console.log(`[Session ${session.id}] 账号信息:`, { email, firstName, lastName });

    // 步骤 3: 获取 OIDC 授权 URL（使用 API 锁）
    updateSession(session.id, { step: '获取授权链接...' });
    session.oidcClient = new AWSDeviceAuth();
    const authInfo = await withApiLock(() => session.oidcClient.quickAuth());
    session.oidcAuth = authInfo;

    console.log(`[Session ${session.id}] OIDC 授权信息:`, authInfo.verificationUriComplete);

    // 步骤 4: 打开无痕窗口（使用锁防止同时创建多个窗口）
    updateSession(session.id, { step: '打开无痕窗口...' });

    // 等待获取窗口创建锁
    await windowCreationLock;
    let releaseLock;
    windowCreationLock = new Promise(resolve => { releaseLock = resolve; });

    try {
      console.log(`[Session ${session.id}] 准备创建无痕窗口，URL:`, authInfo.verificationUriComplete);

      const window = await chrome.windows.create({
        url: authInfo.verificationUriComplete,
        incognito: true,
        focused: true,
        width: 600,
        height: 800
      });

      console.log(`[Session ${session.id}] chrome.windows.create 返回值:`, window);
      console.log(`[Session ${session.id}] window 类型:`, typeof window);
      console.log(`[Session ${session.id}] window.id:`, window?.id);
      console.log(`[Session ${session.id}] window.tabs:`, window?.tabs);

      // 检查窗口和标签页
      if (!window) {
        throw new Error('chrome.windows.create 返回 null/undefined，可能缺少权限或无痕模式未启用');
      }

      if (!window.id) {
        throw new Error(`窗口对象缺少 id 属性，返回值: ${JSON.stringify(window)}`);
      }

      if (!window.tabs || window.tabs.length === 0) {
        throw new Error(`窗口缺少标签页，windowId=${window.id}`);
      }

      session.windowId = window.id;
      session.tabId = window.tabs[0].id;
      console.log(`[Session ${session.id}] 无痕窗口创建成功: windowId=${window.id}, tabId=${session.tabId}`);

      try {
        await applyFingerprintToTab(session.tabId);
      } catch (e) {
        console.warn(`[Session ${session.id}] 指纹注入失败:`, e.message);
      }

      // 等待页面加载完成
      updateSession(session.id, { step: '等待页面加载...' });
      try {
        await waitForTabLoad(session.tabId, 30000);
        console.log(`[Session ${session.id}] 页面已加载`);
      } catch (e) {
        console.warn(`[Session ${session.id}] 等待页面加载:`, e.message);
        // 即使超时也继续，content script 会处理
      }

      // 额外等待一小段时间让 content script 初始化
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.error(`[Session ${session.id}] 创建无痕窗口错误:`, error);

      // 根据错误类型给出详细提示
      let errorMsg = '创建无痕窗口失败';

      if (error.message && error.message.includes('cannot be created')) {
        errorMsg = '无法创建无痕窗口，请在扩展设置中启用"在无痕模式下允许"';
      } else if (error.message && (error.message.includes('null/undefined') || error.message.includes('缺少权限'))) {
        errorMsg = '创建窗口失败：请检查扩展权限，重新加载扩展后重试';
      } else if (error.message) {
        errorMsg = error.message;
      }

      throw new Error(errorMsg);
    } finally {
      // 释放窗口创建锁
      releaseLock();
    }

    // 步骤 5: 轮询 Token
    session.status = 'polling_token';
    updateSession(session.id, { step: '自动填表中...' });

    const tokenResult = await pollSessionToken(session);

    if (tokenResult) {
      // 成功
      session.status = 'completed';
      session.token = tokenResult;
      updateSession(session.id, { step: '注册成功!' });

      // 保存到历史
      saveToHistory(session, true);

      // 更新全局状态
      globalState.totalRegistered++;
      globalState.lastSuccess = {
        email: session.email,
        password: session.password,
        firstName: session.firstName,
        lastName: session.lastName,
        token: {
          ...tokenResult,
          clientId: session.oidcAuth?.clientId || '',
          clientSecret: session.oidcAuth?.clientSecret || ''
        }
      };

      return true;
    } else {
      throw new Error('Token 获取超时或被中断');
    }

  } catch (error) {
    console.error(`[Session ${session.id}] 注册失败:`, error);
    session.status = 'error';
    session.error = error.message;
    updateSession(session.id, { step: '失败: ' + error.message });

    saveToHistory(session, false);
    globalState.totalFailed++;

    return false;
  } finally {
    // 关闭窗口
    if (session.windowId) {
      try {
        await chrome.windows.remove(session.windowId);
        session.windowId = null;
      } catch (e) {
        // 忽略
      }
    }

    // Gmail 别名模式不需要删除邮箱
    session.mailClient = null;
  }
}

/**
 * 轮询获取 Token
 */
async function pollSessionToken(session) {
  if (!session.oidcClient) return null;

  const startTime = Date.now();
  const timeout = 600000; // 10 分钟超时
  const pollInterval = Math.max(session.oidcClient.interval * 1000, 2000);

  while (!session.pollAbort && !shouldStop && Date.now() - startTime < timeout) {
    try {
      const result = await session.oidcClient.getToken();
      if (result) {
        console.log(`[Session ${session.id}] Token 获取成功`);
        return result;
      }
    } catch (error) {
      if (!error.message.includes('authorization_pending')) {
        console.error(`[Session ${session.id}] Token 轮询错误:`, error);
      }
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  return null;
}

/**
 * 保存注册结果到历史
 */
function saveToHistory(session, success) {
  let tokenInfo = null;
  if (success && session.token) {
    tokenInfo = {
      ...session.token,
      clientId: session.oidcAuth?.clientId || '',
      clientSecret: session.oidcAuth?.clientSecret || ''
    };
  }

  const record = {
    id: Date.now() + Math.random(),
    time: new Date().toLocaleString(),
    email: session.email,
    password: session.password,
    firstName: session.firstName,
    lastName: session.lastName,
    success: success,
    error: success ? null : session.error,
    token: tokenInfo,
    tokenStatus: success ? 'unknown' : null // unknown, valid, invalid, suspended
  };

  registrationHistory.unshift(record);

  // 只保留最近 100 条记录
  if (registrationHistory.length > 100) {
    registrationHistory = registrationHistory.slice(0, 100);
  }

  // 保存到 storage
  chrome.storage.local.set({ registrationHistory });
}

/**
 * 批量验证所有 Token（并发执行，带进度）
 */
async function validateAllTokens() {
  const results = {
    total: 0,
    valid: 0,
    expired: 0,
    suspended: 0,
    invalid: 0,
    error: 0,
    details: []
  };

  const recordsToValidate = registrationHistory.filter(r => r.success && r.token?.refreshToken);
  results.total = recordsToValidate.length;

  if (results.total === 0) {
    return results;
  }

  // 并发验证（每批 5 个）
  const concurrency = 5;
  let validated = 0;

  // 通知开始验证
  chrome.runtime.sendMessage({
    type: 'VALIDATION_PROGRESS',
    progress: { validated: 0, total: results.total }
  }).catch(() => {});

  for (let i = 0; i < recordsToValidate.length; i += concurrency) {
    const batch = recordsToValidate.slice(i, i + concurrency);

    // 并发执行当前批次
    const batchResults = await Promise.allSettled(
      batch.map(async (record) => {
        try {
          // 使用刷新并验证的方法
          const result = await refreshAndValidateToken({
            clientId: record.token.clientId,
            clientSecret: record.token.clientSecret,
            refreshToken: record.token.refreshToken
          });

          // 更新记录的 token 状态
          record.tokenStatus = result.status;

          // 如果刷新成功，更新 token
          if (result.newAccessToken) {
            record.token.accessToken = result.newAccessToken;
            record.token.refreshToken = result.newRefreshToken;
          }

          return { record, result };
        } catch (error) {
          record.tokenStatus = 'error';
          return { record, result: { status: 'error', error: error.message } };
        }
      })
    );

    // 统计结果
    for (const promiseResult of batchResults) {
      if (promiseResult.status === 'fulfilled') {
        const { result } = promiseResult.value;
        
        switch (result.status) {
          case 'valid':
            results.valid++;
            break;
          case 'suspended':
            results.suspended++;
            results.details.push({ 
              email: promiseResult.value.record.email, 
              status: 'suspended', 
              error: result.error 
            });
            break;
          case 'expired':
            results.expired++;
            results.details.push({ 
              email: promiseResult.value.record.email, 
              status: 'expired', 
              error: result.error 
            });
            break;
          case 'invalid':
            results.invalid++;
            results.details.push({ 
              email: promiseResult.value.record.email, 
              status: 'invalid', 
              error: result.error 
            });
            break;
          case 'error':
            results.error++;
            results.details.push({ 
              email: promiseResult.value.record.email, 
              status: 'error', 
              error: result.error 
            });
            break;
        }
      } else {
        results.error++;
      }

      validated++;
    }

    // 通知进度更新
    chrome.runtime.sendMessage({
      type: 'VALIDATION_PROGRESS',
      progress: { validated, total: results.total }
    }).catch(() => {});

    // 批次间延迟，避免限流
    if (i + concurrency < recordsToValidate.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // 保存更新后的状态
  chrome.storage.local.set({ registrationHistory });
  broadcastState();

  return results;
}

// ============== 批量注册控制 ==============

/**
 * 开始批量注册
 */
async function startBatchRegistration(loopCount, concurrency, options = {}) {
  if (isRunning) {
    return { success: false, error: '已有注册任务在运行' };
  }

  mailProvider = options.mailProvider || 'gmail';
  gmailBaseAddress = options.gmailAddress || '';
  if (options.moemailConfig) {
    moemailConfig = { ...moemailConfig, ...options.moemailConfig };
  }

  if (mailProvider === 'moemail') {
    const checker = new MoEmailClient(moemailConfig);
    if (!checker.isConfigured()) {
      return { success: false, error: 'MoEmail 配置不完整（地址 / Key / 域名）' };
    }
  } else if (!gmailBaseAddress) {
    return { success: false, error: '未配置 Gmail 地址' };
  }

  if (fingerprintSettings.enabled && !currentFingerprint) {
    currentFingerprint = generateFingerprint();
    await chrome.storage.local.set({ currentFingerprint });
  }

  isRunning = true;
  shouldStop = false;

  // 重置状态
  globalState = {
    status: 'running',
    step: '开始注册...',
    error: null,
    totalTarget: loopCount,
    totalRegistered: 0,
    totalFailed: 0,
    concurrency: concurrency,
    lastSuccess: null
  };

  sessions.clear();
  broadcastState();

  console.log(`[Service Worker] 开始批量注册: 目标=${loopCount}, 并发=${concurrency}, provider=${mailProvider}`);

  // 创建任务队列
  taskQueue = [];
  for (let i = 0; i < loopCount; i++) {
    taskQueue.push(i);
  }

  // 并发执行
  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(runWorker(i));
  }

  await Promise.all(workers);

  // 完成
  isRunning = false;
  globalState.status = shouldStop ? 'idle' : 'completed';
  globalState.step = shouldStop
    ? `已停止，成功 ${globalState.totalRegistered} 个`
    : `完成！成功 ${globalState.totalRegistered}/${loopCount} 个`;

  broadcastState();

  return { success: true, state: getPublicState() };
}

/**
 * 工作线程 - 从队列取任务执行
 */
async function runWorker(workerId) {
  console.log(`[Worker ${workerId}] 启动`);

  // 错开启动时间，避免同时创建窗口和调用 API
  // 第一个 worker 立即启动，后续 worker 等待更长时间
  if (workerId > 0) {
    await new Promise(resolve => setTimeout(resolve, workerId * 3000));
  }

  while (!shouldStop && taskQueue.length > 0) {
    const taskIndex = taskQueue.shift();
    if (taskIndex === undefined) break;

    console.log(`[Worker ${workerId}] 执行任务 #${taskIndex + 1}`);

    // 清理已完成的旧会话，只保留活跃的
    for (const [id, s] of sessions) {
      if (s.status === 'completed' || s.status === 'error') {
        sessions.delete(id);
      }
    }

    // 创建会话
    const session = createSession();

    const done = globalState.totalRegistered + globalState.totalFailed;
    updateGlobalState({
      step: `进度 ${done}/${globalState.totalTarget}，正在注册第 ${taskIndex + 1} 个...`
    });

    // 执行注册
    await runSessionRegistration(session);

    // 更新全局进度
    const doneAfter = globalState.totalRegistered + globalState.totalFailed;
    updateGlobalState({
      step: `进度 ${doneAfter}/${globalState.totalTarget}`
    });

    // 任务间延迟
    if (!shouldStop && taskQueue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log(`[Worker ${workerId}] 结束`);
}

/**
 * 停止注册
 */
function stopRegistration() {
  console.log('[Service Worker] 停止注册');
  shouldStop = true;
  taskQueue = [];

  // 中断所有会话的轮询
  for (const session of sessions.values()) {
    session.pollAbort = true;
  }

  updateGlobalState({ step: '正在停止...' });
}

/**
 * 完全重置状态
 */
async function resetState() {
  shouldStop = true;
  taskQueue = [];
  isRunning = false;

  await closeAllSessions();

  globalState = {
    status: 'idle',
    step: '',
    error: null,
    totalTarget: 0,
    totalRegistered: 0,
    totalFailed: 0,
    concurrency: 1,
    lastSuccess: null
  };

  broadcastState();
}

// ============== 消息处理 ==============

/**
 * 根据 windowId 查找对应的会话（主要方式）
 * windowId 在整个认证流程中保持不变，比 tabId 更可靠
 */
function findSessionByWindowId(windowId) {
  for (const session of sessions.values()) {
    if (session.windowId === windowId) {
      return session;
    }
  }
  return null;
}

/**
 * 获取验证码（优先使用 Gmail API 自动获取，否则手动输入）
 */
async function getVerificationCode(session) {
  if (!session) {
    return { success: false, error: '会话未初始化' };
  }

  // 如果会话中已经有验证码（用户已输入或已获取），则返回
  if (session.verificationCode) {
    return { success: true, code: session.verificationCode };
  }

  // 检查是否已授权 Gmail API
  if (gmailApiAuthorized && gmailApiClient) {
    try {
      console.log(`[Session ${session.id}] 使用 Gmail API 自动获取验证码...`);

      // 使用会话开始时间作为过滤条件，避免获取旧邮件
      const afterTimestamp = session.startTime || Date.now() - 300000; // 5分钟内

      const code = await gmailApiClient.fetchVerificationCode(
        gmailSenderFilter,
        afterTimestamp,
        {
          initialDelay: 20000,  // 先等待 20 秒
          maxAttempts: 12,      // 最多尝试 12 次
          pollInterval: 5000   // 每 5 秒检查一次
        }
      );

      if (code) {
        console.log(`[Session ${session.id}] Gmail API 成功获取验证码: ${code}`);
        session.verificationCode = code;
        return { success: true, code };
      }

      // 超时，回退到手动模式
      console.log(`[Session ${session.id}] Gmail API 获取验证码超时，回退到手动模式`);
      return {
        success: false,
        needManualInput: true,
        error: '自动获取验证码超时，请手动填写'
      };
    } catch (error) {
      console.error(`[Session ${session.id}] Gmail API 获取验证码失败:`, error);
      return {
        success: false,
        needManualInput: true,
        error: `自动获取失败: ${error.message}，请手动填写`
      };
    }
  }

  // Gmail 别名模式下，需要用户手动输入验证码
  console.log(`[Session ${session.id}] Gmail API 未授权，等待用户手动输入验证码`);

  return {
    success: false,
    needManualInput: true,
    error: '请从 Gmail 收件箱获取验证码并手动填写'
  };
}

/**
 * 处理来自 popup 和 content script 的消息
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 用 windowId 查找会话（跨域导航时 tabId 可能变化，windowId 不变）
  const senderWindowId = sender.tab?.windowId;
  const session = senderWindowId ? findSessionByWindowId(senderWindowId) : null;

  if (sender.tab) {
    console.log('[Service Worker] 收到消息:', message.type,
      'tabId:', sender.tab.id, 'windowId:', senderWindowId,
      'session:', session?.id || 'none');
  } else {
    console.log('[Service Worker] 收到消息:', message.type, '(popup)');
  }

  switch (message.type) {
    case 'GET_STATE':
      sendResponse({ state: getPublicState() });
      break;

    case 'START_BATCH_REGISTRATION':
      startBatchRegistration(message.loopCount || 1, message.concurrency || 1, {
        gmailAddress: message.gmailAddress,
        mailProvider: message.mailProvider,
        moemailConfig: message.moemailConfig
      })
        .then(sendResponse);
      return true;

    case 'STOP_REGISTRATION':
      stopRegistration();
      sendResponse({ success: true });
      break;

    case 'GET_VERIFICATION_CODE':
      if (session) {
        getVerificationCode(session).then(sendResponse);
        return true;
      } else {
        console.warn('[Service Worker] GET_VERIFICATION_CODE: 找不到会话, windowId:', senderWindowId);
        sendResponse({ success: false, error: '找不到对应会话' });
      }
      break;

    case 'GET_ACCOUNT_INFO':
      if (session) {
        console.log(`[Service Worker] GET_ACCOUNT_INFO: 会话 ${session.id}, email: ${session.email}`);
        sendResponse({
          email: session.email,
          password: session.password,
          firstName: session.firstName,
          lastName: session.lastName,
          fullName: session.firstName && session.lastName
            ? `${session.firstName} ${session.lastName}`
            : null
        });
      } else {
        // 列出现有会话帮助调试
        const existingSessions = Array.from(sessions.values()).map(s =>
          `${s.id}(windowId:${s.windowId})`
        ).join(', ');
        console.warn('[Service Worker] GET_ACCOUNT_INFO: 找不到会话',
          'senderWindowId:', senderWindowId,
          '现有会话:', existingSessions || '无');
        sendResponse({});
      }
      break;

    case 'RESET':
      resetState().then(() => sendResponse({ success: true }));
      return true;

    case 'UPDATE_STEP':
      if (session) {
        updateSession(session.id, { step: message.step });
      }
      sendResponse({ success: true });
      break;

    case 'REPORT_ERROR':
      if (session) {
        session.status = 'error';
        session.error = message.error;
        updateSession(session.id, { step: '错误: ' + message.error });
      }
      sendResponse({ success: true });
      break;

    case 'AUTH_COMPLETED':
      if (session) {
        updateSession(session.id, { step: '授权完成，等待 Token...' });
      }
      sendResponse({ success: true });
      break;

    case 'CLEAR_HISTORY':
      registrationHistory = [];
      chrome.storage.local.remove('registrationHistory');
      sendResponse({ success: true });
      break;

    case 'EXPORT_HISTORY':
      sendResponse({ history: registrationHistory });
      break;

    case 'VALIDATE_TOKEN':
      // 验证单个 Token
      if (message.accessToken) {
        validateToken(message.accessToken).then(sendResponse);
        return true;
      } else {
        sendResponse({ valid: false, error: '缺少 accessToken' });
      }
      break;

    case 'VALIDATE_ALL_TOKENS':
      // 批量验证所有 Token
      validateAllTokens().then(sendResponse);
      return true;

    case 'GET_VALID_HISTORY':
      // 获取已验证且有效的历史记录（排除 suspended, expired, invalid, error）
      sendResponse({
        history: registrationHistory.filter(r =>
          r.success &&
          r.token &&
          r.tokenStatus !== 'suspended' &&
          r.tokenStatus !== 'expired' &&
          r.tokenStatus !== 'invalid' &&
          r.tokenStatus !== 'error'
        )
      });
      break;

    // ==================== Gmail API 相关消息 ====================

    case 'GMAIL_API_AUTHORIZE':
      // Gmail API 授权
      (async () => {
        try {
          if (!gmailApiClient) {
            gmailApiClient = new GmailApiClient();
          }
          await gmailApiClient.authenticate(true);
          gmailApiAuthorized = true;
          await chrome.storage.local.set({ gmailApiAuthorized: true });
          sendResponse({ success: true });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'GMAIL_API_CHECK_AUTH':
      // 检查 Gmail API 授权状态
      (async () => {
        try {
          if (!gmailApiClient) {
            gmailApiClient = new GmailApiClient();
          }
          const authorized = await gmailApiClient.isAuthorized();
          gmailApiAuthorized = authorized;
          sendResponse({ authorized });
        } catch (error) {
          sendResponse({ authorized: false, error: error.message });
        }
      })();
      return true;

    case 'GMAIL_API_REVOKE':
      // 撤销 Gmail API 授权
      (async () => {
        try {
          if (gmailApiClient) {
            await gmailApiClient.revokeToken();
          }
          gmailApiAuthorized = false;
          await chrome.storage.local.set({ gmailApiAuthorized: false });
          sendResponse({ success: true });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'GMAIL_API_SET_SENDER':
      // 设置验证码发件人
      if (message.sender) {
        gmailSenderFilter = message.sender;
        chrome.storage.local.set({ gmailSenderFilter: message.sender });
      }
      sendResponse({ success: true });
      break;

    case 'GMAIL_API_GET_CONFIG':
      // 获取 Gmail API 配置
      sendResponse({
        authorized: gmailApiAuthorized,
        sender: gmailSenderFilter
      });
      break;

    case 'MOEMAIL_LOAD_DOMAINS':
      (async () => {
        try {
          const client = new MoEmailClient(message.config || {});
          const domains = await client.fetchDomains();
          sendResponse({ success: true, domains });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'FINGERPRINT_GET_CONFIG':
      sendResponse({
        success: true,
        settings: fingerprintSettings,
        current: currentFingerprint
      });
      break;

    case 'FINGERPRINT_SET_CONFIG':
      fingerprintSettings = {
        ...fingerprintSettings,
        ...(message.settings || {})
      };
      chrome.storage.local.set({ fingerprintSettings });
      sendResponse({ success: true, settings: fingerprintSettings });
      break;

    case 'FINGERPRINT_RANDOMIZE':
      currentFingerprint = generateFingerprint();
      chrome.storage.local.set({ currentFingerprint });
      sendResponse({ success: true, fingerprint: currentFingerprint });
      break;

    default:
      sendResponse({ error: '未知消息类型' });
  }
});

// 监听标签页更新（处理窗口内导航时 tabId 更新）
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.incognito && changeInfo.status === 'loading') {
    const session = findSessionByWindowId(tab.windowId);
    if (session && session.tabId !== tabId) {
      console.log(`[Service Worker] 会话 ${session.id} 标签页更新: ${session.tabId} -> ${tabId}`);
      session.tabId = tabId;
    }
  }
});

// 监听窗口关闭
chrome.windows.onRemoved.addListener((windowId) => {
  const session = findSessionByWindowId(windowId);
  if (session) {
    console.log(`[Service Worker] 会话 ${session.id} 的窗口已关闭`);
    session.windowId = null;
    session.tabId = null;
  }
});

// Service Worker 激活时恢复状态
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Service Worker] 扩展已安装/更新');
});

// 恢复历史记录和 Gmail API 配置
chrome.storage.local.get([
  'registrationHistory',
  'gmailApiAuthorized',
  'gmailSenderFilter',
  'fingerprintSettings',
  'currentFingerprint',
  'mailProvider',
  'moemailConfig',
  'gmailAddress'
]).then((stored) => {
  if (stored.registrationHistory) {
    registrationHistory = stored.registrationHistory;
    console.log('[Service Worker] 恢复历史记录:', registrationHistory.length, '条');
  }

  // 恢复 Gmail API 配置
  if (stored.gmailSenderFilter) {
    gmailSenderFilter = stored.gmailSenderFilter;
  }

  if (stored.mailProvider) {
    mailProvider = stored.mailProvider;
  }
  if (stored.gmailAddress) {
    gmailBaseAddress = stored.gmailAddress;
  }
  if (stored.moemailConfig) {
    moemailConfig = { ...moemailConfig, ...stored.moemailConfig };
  }

  if (stored.fingerprintSettings) {
    fingerprintSettings = { ...fingerprintSettings, ...stored.fingerprintSettings };
  }
  if (stored.currentFingerprint) {
    currentFingerprint = stored.currentFingerprint;
  }

  // 检查 Gmail API 授权状态
  if (stored.gmailApiAuthorized) {
    gmailApiClient = new GmailApiClient();
    gmailApiClient.isAuthorized().then(authorized => {
      gmailApiAuthorized = authorized;
      console.log('[Service Worker] Gmail API 授权状态:', authorized ? '已授权' : '未授权');
    }).catch(() => {
      gmailApiAuthorized = false;
    });
  }
});
