/**
 * Gmail API 客户端
 * 使用 chrome.identity 进行 OAuth 认证，自动获取验证码邮件
 */

class GmailApiClient {
  constructor() {
    this.token = null;
    this.tokenExpiry = null;
  }

  /**
   * 获取 OAuth Token（使用 Web Auth Flow，不依赖浏览器登录）
   * @param {boolean} interactive - 是否弹出授权窗口
   */
  async authenticate(interactive = true) {
    // 如果已有 token 且未过期，直接返回
    if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.token;
    }

    // 从 storage 恢复 token
    const stored = await chrome.storage.local.get(['gmailApiToken', 'gmailApiTokenExpiry']);
    if (stored.gmailApiToken && stored.gmailApiTokenExpiry && Date.now() < stored.gmailApiTokenExpiry) {
      this.token = stored.gmailApiToken;
      this.tokenExpiry = stored.gmailApiTokenExpiry;
      return this.token;
    }

    if (!interactive) {
      throw new Error('Token 已过期，需要重新授权');
    }

    // 获取 manifest 中的 client_id
    const manifest = chrome.runtime.getManifest();
    const clientId = manifest.oauth2.client_id;
    const redirectUrl = chrome.identity.getRedirectURL();

    // 构建 OAuth 授权 URL
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('redirect_uri', redirectUrl);
    authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/gmail.readonly');

    return new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        {
          url: authUrl.toString(),
          interactive: true
        },
        (responseUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          // 从重定向 URL 提取 access_token
          const url = new URL(responseUrl);
          const params = new URLSearchParams(url.hash.substring(1));
          const token = params.get('access_token');
          const expiresIn = parseInt(params.get('expires_in') || '3600');

          if (!token) {
            reject(new Error('未能获取 access token'));
            return;
          }

          this.token = token;
          this.tokenExpiry = Date.now() + expiresIn * 1000;

          // 保存到 storage
          chrome.storage.local.set({
            gmailApiToken: token,
            gmailApiTokenExpiry: this.tokenExpiry
          });

          resolve(token);
        }
      );
    });
  }

  /**
   * 移除缓存的 Token（用于重新授权）
   */
  async revokeToken() {
    this.token = null;
    this.tokenExpiry = null;
    await chrome.storage.local.remove(['gmailApiToken', 'gmailApiTokenExpiry']);
  }

  /**
   * 搜索邮件
   * @param {string} query - Gmail 搜索查询
   * @param {number} maxResults - 最大结果数
   */
  async searchMessages(query, maxResults = 5) {
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.token}` }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `搜索邮件失败: ${response.status}`);
    }

    return response.json();
  }

  /**
   * 获取邮件详情
   * @param {string} messageId - 邮件 ID
   */
  async getMessage(messageId) {
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.token}` }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `获取邮件失败: ${response.status}`);
    }

    return response.json();
  }

  /**
   * 解码邮件正文（处理 Base64 URL 安全编码）
   * @param {object} message - Gmail API 返回的邮件对象
   */
  decodeBody(message) {
    const payload = message.payload;
    let body = '';

    // 尝试从 payload.body 获取
    if (payload.body?.data) {
      body = this._decodeBase64Url(payload.body.data);
    }
    // 尝试从 parts 获取（multipart 邮件）
    else if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          body = this._decodeBase64Url(part.body.data);
          break;
        }
        // 递归处理嵌套 parts
        if (part.parts) {
          for (const subPart of part.parts) {
            if (subPart.mimeType === 'text/plain' && subPart.body?.data) {
              body = this._decodeBase64Url(subPart.body.data);
              break;
            }
          }
          if (body) break;
        }
      }
      // 如果没找到 text/plain，尝试 text/html
      if (!body) {
        for (const part of payload.parts) {
          if (part.mimeType === 'text/html' && part.body?.data) {
            body = this._decodeBase64Url(part.body.data);
            break;
          }
        }
      }
    }

    return body;
  }

  /**
   * 解码 Base64 URL 安全编码
   */
  _decodeBase64Url(data) {
    // 将 URL 安全的 Base64 转换为标准 Base64
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    try {
      return decodeURIComponent(escape(atob(base64)));
    } catch (e) {
      // 如果 UTF-8 解码失败，尝试直接解码
      return atob(base64);
    }
  }

  /**
   * 从邮件正文提取验证码
   * AWS 邮件格式: "验证码：771970" 或 "verification code: 771970"
   * @param {string} body - 邮件正文
   */
  extractVerificationCode(body) {
    const patterns = [
      /验证码[：:]\s*(\d{6})/,              // 中文格式（AWS 使用）
      /verification\s*code[：:]\s*(\d{6})/i, // 英文格式
      /code[：:]\s*(\d{6})/i,                // 简化英文
      /(\d{6})/                              // 兜底：任意6位数字
    ];

    for (const pattern of patterns) {
      const match = body.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * 获取最新验证码
   * 先等待让邮件到达，然后轮询获取
   * @param {string} senderEmail - 发件人邮箱
   * @param {number} afterTimestamp - 只获取此时间之后的邮件
   * @param {object} options - 配置选项
   */
  async fetchVerificationCode(senderEmail, afterTimestamp, options = {}) {
    const {
      initialDelay = 20000,  // 初始等待时间（毫秒）
      maxAttempts = 12,      // 最大尝试次数
      pollInterval = 5000    // 轮询间隔（毫秒）
    } = options;

    // 非交互式认证，使用缓存 token
    await this.authenticate(false);

    // 构建搜索查询：按发件人 + 时间过滤
    const afterEpoch = Math.floor(afterTimestamp / 1000);
    const query = `from:${senderEmail} after:${afterEpoch}`;

    console.log(`[Gmail API] 等待 ${initialDelay / 1000} 秒让验证码邮件到达...`);
    await new Promise(resolve => setTimeout(resolve, initialDelay));

    // 轮询获取验证码
    for (let i = 0; i < maxAttempts; i++) {
      console.log(`[Gmail API] 第 ${i + 1}/${maxAttempts} 次尝试获取验证码...`);

      try {
        const result = await this.searchMessages(query, 1);

        if (result.messages?.length) {
          const message = await this.getMessage(result.messages[0].id);
          const body = this.decodeBody(message);
          const code = this.extractVerificationCode(body);

          if (code) {
            console.log(`[Gmail API] 成功获取验证码: ${code}`);
            return code;
          }

          console.log('[Gmail API] 找到邮件但未能提取验证码，邮件内容:', body.substring(0, 200));
        } else {
          console.log('[Gmail API] 未找到匹配的邮件');
        }
      } catch (error) {
        console.error(`[Gmail API] 第 ${i + 1} 次尝试失败:`, error.message);
      }

      // 等待后重试
      if (i < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }

    return null;
  }

  /**
   * 检查是否已授权
   */
  async isAuthorized() {
    try {
      await this.authenticate(false);
      return !!this.token;
    } catch {
      return false;
    }
  }
}

export { GmailApiClient };
