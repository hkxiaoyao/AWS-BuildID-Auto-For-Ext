const USER_AGENTS = [
  {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    platform: 'Win32'
  },
  {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    platform: 'MacIntel'
  },
  {
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    platform: 'Linux x86_64'
  }
];

const SCREEN_PRESETS = [
  { width: 1920, height: 1080 },
  { width: 1680, height: 1050 },
  { width: 1536, height: 864 },
  { width: 1366, height: 768 }
];

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function generateFingerprint() {
  const ua = pick(USER_AGENTS);
  const screen = pick(SCREEN_PRESETS);
  const timezone = pick(['Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Tokyo', 'Europe/Berlin', 'America/New_York']);
  const languages = pick([
    ['zh-CN', 'zh', 'en-US'],
    ['en-US', 'en'],
    ['zh-CN', 'en-US', 'en']
  ]);

  return {
    userAgent: ua.userAgent,
    platform: ua.platform,
    language: languages[0],
    languages,
    timezone,
    hardwareConcurrency: pick([4, 8, 12, 16]),
    deviceMemory: pick([4, 8, 16]),
    screen: {
      width: screen.width,
      height: screen.height,
      availWidth: screen.width,
      availHeight: screen.height - 40,
      colorDepth: 24,
      pixelDepth: 24
    },
    webglVendor: pick(['Intel Inc.', 'Google Inc. (Intel)', 'NVIDIA Corporation']),
    webglRenderer: pick(['Intel Iris OpenGL Engine', 'ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0)', 'NVIDIA GeForce RTX 3060/PCIe/SSE2'])
  };
}

function getFingerprintInjectScript(fingerprint) {
  return `(() => {
    const fp = ${JSON.stringify(fingerprint)};
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

    override(Intl.DateTimeFormat.prototype, 'resolvedOptions', function(...args) {
      const options = Intl.DateTimeFormat.prototype.__proto__.resolvedOptions
        ? Intl.DateTimeFormat.prototype.__proto__.resolvedOptions.apply(this, args)
        : { locale: fp.language };
      return { ...options, timezone: fp.timezone, timeZone: fp.timezone };
    });

    override(screen, 'width', fp.screen.width);
    override(screen, 'height', fp.screen.height);
    override(screen, 'availWidth', fp.screen.availWidth);
    override(screen, 'availHeight', fp.screen.availHeight);
    override(screen, 'colorDepth', fp.screen.colorDepth);
    override(screen, 'pixelDepth', fp.screen.pixelDepth);

    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter) {
      if (parameter === 37445) return fp.webglVendor;
      if (parameter === 37446) return fp.webglRenderer;
      return getParameter.call(this, parameter);
    };
  })();`;
}

export { generateFingerprint, getFingerprintInjectScript };
