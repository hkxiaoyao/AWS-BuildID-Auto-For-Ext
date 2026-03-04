# AWS BuildID Auto Registration - Multi-language Support

This fork adds **multi-language support (i18n)** to the original [AWS-BuildID-Auto-For-Ext](https://github.com/hkxiaoyao/AWS-BuildID-Auto-For-Ext) project.

## 🌍 Supported Languages

- 🇨🇳 **Chinese (Simplified)** - zh_CN (Default)
- 🇬🇧 **English** - en
- 🇹🇷 **Turkish** - tr

## 📦 Installation

### Install from Source

1. **Clone the repository:**
```bash
git clone https://github.com/[your-username]/AWS-BuildID-Auto-For-Ext.git
cd AWS-BuildID-Auto-For-Ext
```

2. **Load in Chrome:**
   - Open Chrome
   - Go to `chrome://extensions/`
   - Enable **"Developer mode"** in the top right
   - Click **"Load unpacked"**
   - Select the project folder

3. **Enable incognito mode permission:**
   - Click **"Details"** on the extension card
   - Enable **"Allow in incognito"**
   - Refresh the extension (click 🔄 icon)

## 🌐 Language Switching

The extension automatically detects your **browser language settings**:

### Chrome Language Settings

1. Chrome Settings → **Languages** (`chrome://settings/languages`)
2. Move your preferred language to the top of the **Preferred languages** list
3. Restart Chrome
4. The extension will now display in your language

### Supported Language Codes

- `zh-CN`, `zh` → Chinese
- `en`, `en-US`, `en-GB` → English
- `tr`, `tr-TR` → Turkish
- Other languages → Chinese (default)

## ✨ Original Features

All original features are preserved:

- ✅ Semi-automatic registration
- ✅ Batch registration (1-100)
- ✅ Gmail unlimited aliases
- ✅ Incognito mode
- ✅ Token management
- ✅ Token validation
- ✅ Kiro IDE synchronization

For detailed usage, see the [original documentation](https://github.com/hkxiaoyao/AWS-BuildID-Auto-For-Ext).

## 🛠️ Developer Notes

### i18n Structure

```
_locales/
├── zh_CN/
│   └── messages.json  # Chinese translations
├── en/
│   └── messages.json  # English translations
└── tr/
    └── messages.json  # Turkish translations
```

### Adding a New Language

1. Create `_locales/[language_code]/messages.json`
2. Copy `zh_CN/messages.json`
3. Translate all `message` values
4. Restart Chrome

### Adding a New Translation Key

1. Add the new key to all language files:
```json
{
  "newKey": {
    "message": "Translated text"
  }
}
```

2. Use in HTML:
```html
<span data-i18n="newKey">Default text</span>
```

3. Use in JavaScript:
```javascript
const text = i18n('newKey');
```

## 🤝 Contributing

Pull requests for new language translations or improvements are welcome!

## 📄 License

MIT License - Same as the original project

## 🙏 Credits

- Original project: [hkxiaoyao/AWS-BuildID-Auto-For-Ext](https://github.com/hkxiaoyao/AWS-BuildID-Auto-For-Ext)
- Chrome i18n API: [Chrome Extension i18n](https://developer.chrome.com/docs/extensions/reference/i18n/)

---

**Made with ❤️ by the community**
