# Changelog

## [1.1.0] - Multi-language Support

### Added
- 🌍 Multi-language support (i18n) using Chrome Extension i18n API
- 🇨🇳 Chinese (Simplified) - zh_CN (Default)
- 🇬🇧 English - en
- 🇹🇷 Turkish - tr
- Automatic language detection based on browser settings
- `i18n.js` helper script for automatic text replacement
- `i18n()` helper function in popup.js for dynamic translations
- README files in 3 languages (README.md, README_EN.md, README_ZH.md, README_TR.md)

### Changed
- Updated `manifest.json` with `default_locale` field
- Modified popup.html to use `data-i18n` attributes
- Updated popup.js to use i18n for dynamic content
- HTML lang attribute now updates based on current locale

### Technical Details
- All user-facing text moved to `_locales/[lang]/messages.json`
- Supports automatic placeholder, title, and text content translation
- Maintains all original functionality
- No breaking changes to existing features

### File Structure
```
_locales/
├── zh_CN/messages.json  (Chinese - Default)
├── en/messages.json     (English)
└── tr/messages.json     (Turkish)

popup/
├── i18n.js             (i18n helper)
├── popup.html          (Updated with data-i18n attributes)
└── popup.js            (Updated with i18n() function)
```

### How to Use
1. Install the extension
2. Chrome will automatically detect your browser language
3. To change language: Chrome Settings → Languages → Move preferred language to top
4. Restart Chrome

### For Developers
- To add a new language: Create `_locales/[code]/messages.json`
- To add a new translation key: Add to all language files
- Use `data-i18n="key"` in HTML
- Use `i18n('key')` in JavaScript

---

## [1.0.0] - Original Release

### Features
- Semi-automatic AWS Builder ID registration
- Batch registration (1-100 accounts)
- Gmail unlimited aliases support
- Incognito mode support
- Token management and validation
- Kiro IDE synchronization
- Multiple email providers (Gmail, Guerrilla Mail, GPTMail, DuckMail, MoeMail)
- Proxy support
- Token Pool integration

---

**Original Project:** [hkxiaoyao/AWS-BuildID-Auto-For-Ext](https://github.com/hkxiaoyao/AWS-BuildID-Auto-For-Ext)
