/**
 * Gmail 无限别名邮箱生成器
 * 利用 Gmail 的特性生成无限邮箱变体：
 * 1. + 号别名：user+alias@gmail.com
 * 2. . 点号插入：u.ser@gmail.com（Gmail 忽略点号）
 * 3. 大小写变体：User@gmail.com（Gmail 不区分大小写）
 * 4. 组合变体：U.ser+alias@gmail.com
 * 
 * 验证码需要用户从 Gmail 收件箱手动获取
 */

/**
 * 生成随机字符串
 * @param {number} length - 长度
 * @returns {string}
 */
function generateRandomString(length = 6) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 生成时间戳字符串
 * @returns {string}
 */
function generateTimestamp() {
  const now = new Date();
  return [
    now.getFullYear().toString().slice(-2),
    (now.getMonth() + 1).toString().padStart(2, '0'),
    now.getDate().toString().padStart(2, '0'),
    now.getHours().toString().padStart(2, '0'),
    now.getMinutes().toString().padStart(2, '0'),
    now.getSeconds().toString().padStart(2, '0')
  ].join('');
}

/**
 * 在字符串中随机位置插入点号
 * @param {string} str - 原字符串
 * @param {number} count - 插入点号数量
 * @returns {string}
 */
function insertRandomDots(str, count = 1) {
  if (str.length <= 1) return str;
  
  const chars = str.split('');
  const positions = [];
  
  // 收集可插入点号的位置（不能在开头、结尾、连续）
  for (let i = 1; i < chars.length; i++) {
    if (chars[i - 1] !== '.' && chars[i] !== '.') {
      positions.push(i);
    }
  }
  
  // 随机选择位置插入点号
  for (let i = 0; i < count && positions.length > 0; i++) {
    const idx = Math.floor(Math.random() * positions.length);
    const pos = positions[idx];
    chars.splice(pos + i, 0, '.');
    positions.splice(idx, 1);
  }
  
  return chars.join('');
}

/**
 * 随机大小写变换
 * @param {string} str - 原字符串
 * @returns {string}
 */
function randomizeCase(str) {
  return str.split('').map(char => {
    if (Math.random() > 0.5) {
      return char.toUpperCase();
    }
    return char.toLowerCase();
  }).join('');
}

/**
 * 生成所有可能的点号插入变体
 * @param {string} str - 原字符串
 * @returns {string[]} 变体数组
 */
function generateDotVariants(str) {
  if (str.length <= 1) return [str];
  
  const variants = new Set();
  variants.add(str);
  
  // 生成 1-3 个点号的变体
  for (let dots = 1; dots <= Math.min(3, str.length - 1); dots++) {
    for (let i = 0; i < 5; i++) { // 每种点数生成5个随机变体
      variants.add(insertRandomDots(str, dots));
    }
  }
  
  return Array.from(variants);
}

/**
 * 从任意 JSON 结构中提取可能的域名列表
 * @param {any} input
 * @returns {string[]}
 */
function extractDomainList(input) {
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
      // 常见字段优先提取
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

/**
 * Gmail 无限别名邮箱客户端
 */
class GmailAliasClient {
  /**
   * @param {Object} options - 配置选项
   * @param {string} options.baseEmail - 基础 Gmail 地址
   */
  constructor(options = {}) {
    this.baseEmail = options.baseEmail || '';
    this.address = null;
    this.usedVariants = new Set(); // 记录已使用的变体，避免重复
    this.counter = 0;
  }

  /**
   * 设置基础邮箱
   * @param {string} email - Gmail 地址
   */
  setBaseEmail(email) {
    if (!email || !email.includes('@')) {
      throw new Error('无效的邮箱地址');
    }
    this.baseEmail = email.trim().toLowerCase();
    // 移除用户名中已有的点号，获取纯净的用户名
    const [username, domain] = this.baseEmail.split('@');
    this.pureUsername = username.replace(/\./g, '');
    this.domain = domain;
  }

  /**
   * 生成别名邮箱（自动选择最佳变体方式）
   * @param {Object} options - 生成选项
   * @param {string} [options.mode] - 变体模式: 'plus' | 'dot' | 'case' | 'mixed' | 'auto'
   * @param {string} [options.suffix] - 自定义后缀（用于 + 号模式）
   * @returns {string} 别名邮箱地址
   */
  generateAlias(options = {}) {
    if (!this.baseEmail) {
      throw new Error('未设置基础邮箱地址');
    }

    const mode = options.mode || 'auto';
    let email = '';
    let attempts = 0;
    const maxAttempts = 100;

    // 确保生成唯一的邮箱
    while (attempts < maxAttempts) {
      switch (mode) {
        case 'plus':
          email = this._generatePlusVariant(options.suffix);
          break;
        case 'dot':
          email = this._generateDotVariant();
          break;
        case 'case':
          email = this._generateCaseVariant();
          break;
        case 'mixed':
          email = this._generateMixedVariant(options.suffix);
          break;
        case 'auto':
        default:
          email = this._generateAutoVariant();
          break;
      }

      if (!this.usedVariants.has(email.toLowerCase())) {
        this.usedVariants.add(email.toLowerCase());
        break;
      }
      attempts++;
    }

    this.address = email;
    this.counter++;
    return email;
  }

  /**
   * 生成 + 号别名
   * 格式: user+suffix@gmail.com
   */
  _generatePlusVariant(customSuffix) {
    const suffix = customSuffix || `${generateTimestamp()}${generateRandomString(4)}`;
    return `${this.pureUsername}+${suffix}@${this.domain}`;
  }

  /**
   * 生成点号变体
   * 格式: u.s.er@gmail.com
   */
  _generateDotVariant() {
    const dotCount = Math.floor(Math.random() * Math.min(3, this.pureUsername.length - 1)) + 1;
    const username = insertRandomDots(this.pureUsername, dotCount);
    return `${username}@${this.domain}`;
  }

  /**
   * 生成大小写变体
   * 格式: UsEr@gmail.com
   */
  _generateCaseVariant() {
    const username = randomizeCase(this.pureUsername);
    return `${username}@${this.domain}`;
  }

  /**
   * 生成混合变体（点号 + 大小写 + 可选的 + 号）
   * 格式: U.sEr+suffix@gmail.com
   */
  _generateMixedVariant(customSuffix) {
    let username = this.pureUsername;
    
    // 随机添加点号
    if (username.length > 2 && Math.random() > 0.3) {
      const dotCount = Math.floor(Math.random() * 2) + 1;
      username = insertRandomDots(username, dotCount);
    }
    
    // 随机大小写
    if (Math.random() > 0.5) {
      username = randomizeCase(username);
    }
    
    // 随机添加 + 号后缀
    if (Math.random() > 0.5 || customSuffix) {
      const suffix = customSuffix || generateRandomString(6);
      return `${username}+${suffix}@${this.domain}`;
    }
    
    return `${username}@${this.domain}`;
  }

  /**
   * 自动选择变体方式（轮换使用不同方式）
   */
  _generateAutoVariant() {
    const methods = [
      () => this._generatePlusVariant(),           // + 号（最可靠）
      () => this._generateMixedVariant(),          // 混合
      () => this._generateDotPlusVariant(),        // 点号 + plus
    ];
    
    // 优先使用 + 号方式（最可靠），偶尔混合其他方式
    const methodIndex = this.counter % 3 === 0 ? 
      Math.floor(Math.random() * methods.length) : 0;
    
    return methods[methodIndex]();
  }

  /**
   * 生成点号 + plus 组合变体
   * 格式: u.ser+suffix@gmail.com
   */
  _generateDotPlusVariant() {
    let username = this.pureUsername;
    
    // 添加点号
    if (username.length > 2) {
      const dotCount = Math.floor(Math.random() * 2) + 1;
      username = insertRandomDots(username, dotCount);
    }
    
    // 添加 + 号后缀
    const suffix = `${generateTimestamp().slice(-6)}${generateRandomString(3)}`;
    return `${username}+${suffix}@${this.domain}`;
  }

  /**
   * 创建新邮箱（兼容旧接口）
   * @param {Object} options - 创建选项
   * @returns {Promise<string>} 邮箱地址
   */
  async createInbox(options = {}) {
    // 确保已设置基础邮箱
    if (!this.pureUsername && this.baseEmail) {
      this.setBaseEmail(this.baseEmail);
    }
    
    return this.generateAlias({
      mode: options.mode || 'auto',
      suffix: options.prefix // 兼容旧的 prefix 参数
    });
  }

  /**
   * 等待验证码（手动模式）
   * @returns {Promise<null>}
   */
  async waitForVerificationCode() {
    return null;
  }

  /**
   * 删除邮箱（Gmail 别名无需删除）
   */
  async deleteInbox() {
    this.address = null;
  }

  /**
   * 获取当前邮箱信息
   */
  getInfo() {
    return {
      address: this.address,
      baseEmail: this.baseEmail,
      usedCount: this.usedVariants.size
    };
  }

  /**
   * 检查是否已配置
   */
  isConfigured() {
    return !!this.baseEmail && this.baseEmail.includes('@');
  }

  /**
   * 获取变体统计
   */
  getStats() {
    return {
      totalGenerated: this.counter,
      uniqueVariants: this.usedVariants.size
    };
  }
}

/**
 * MoEmail 临时邮箱客户端
 */
class MoEmailClient {
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl || '').trim().replace(/\/+$/, '');
    this.apiKey = (options.apiKey || '').trim();
    this.domain = (options.domain || '').trim();
    this.fixedPrefix = (options.fixedPrefix || '').trim();
    this.randomLength = Number.isFinite(options.randomLength) ? Number(options.randomLength) : 5;
    this.expiry = Number.isFinite(options.expiry) ? Number(options.expiry) : 3600000;
    this.address = null;
  }

  setConfig(options = {}) {
    if (options.baseUrl !== undefined) this.baseUrl = String(options.baseUrl).trim().replace(/\/+$/, '');
    if (options.apiKey !== undefined) this.apiKey = String(options.apiKey).trim();
    if (options.domain !== undefined) this.domain = String(options.domain).trim();
    if (options.fixedPrefix !== undefined) this.fixedPrefix = String(options.fixedPrefix).trim();
    if (options.randomLength !== undefined) this.randomLength = Math.max(1, Math.min(16, Number(options.randomLength) || 5));
    if (options.expiry !== undefined) this.expiry = Number(options.expiry);
  }

  async _request(path, { method = 'GET', body } = {}) {
    if (!this.baseUrl) throw new Error('未配置邮箱地址');
    const headers = {};
    if (method !== 'GET') {
      headers['Content-Type'] = 'application/json';
    }
    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      const message = data?.message || data?.error || `请求失败(${response.status})`;
      throw new Error(message);
    }

    return data;
  }

  async fetchDomains() {
    const data = await this._request('/api/config');
    const domainList = extractDomainList(data);

    if (!Array.isArray(domainList) || domainList.length === 0) {
      const topLevelKeys = data && typeof data === 'object'
        ? Object.keys(data).slice(0, 12).join(',')
        : typeof data;
      throw new Error(`未获取到域名列表（/api/config 返回结构未识别，keys: ${topLevelKeys || 'none'}）`);
    }
    return domainList;
  }

  buildAddress() {
    if (!this.domain) {
      throw new Error('未配置邮箱域名后缀');
    }
    const randomPart = generateRandomString(Math.max(1, this.randomLength));
    const localPart = `${this.fixedPrefix || ''}${randomPart}`;
    return `${localPart}@${this.domain}`;
  }

  async createInbox() {
    const address = this.buildAddress();
    const [name, domain] = address.split('@');
    const payloads = [{ name, domain, expiryTime: this.expiry }];

    // 按官方文档优先调用 /api/emails/generate
    const candidates = ['/api/emails/generate', '/api/emails'];
    let lastError = null;
    for (const path of candidates) {
      for (const payload of payloads) {
        try {
          const result = await this._request(path, { method: 'POST', body: payload });
          const returnedEmail = result?.email || result?.data?.email || result?.address || result?.data?.address;
          this.address = returnedEmail || address;
          return this.address;
        } catch (error) {
          lastError = error;
        }
      }
    }

    throw new Error(`创建临时邮箱失败: ${lastError?.message || '未知错误'}`);
  }

  isConfigured() {
    return !!(this.baseUrl && this.apiKey && this.domain);
  }

  getInfo() {
    return {
      address: this.address,
      baseUrl: this.baseUrl,
      domain: this.domain,
      fixedPrefix: this.fixedPrefix,
      randomLength: this.randomLength,
      expiry: this.expiry
    };
  }
}

// 兼容旧接口
const MailClient = GmailAliasClient;

export { 
  GmailAliasClient, 
  MoEmailClient,
  MailClient,
  generateRandomString,
  generateTimestamp,
  insertRandomDots,
  randomizeCase,
  generateDotVariants
};
