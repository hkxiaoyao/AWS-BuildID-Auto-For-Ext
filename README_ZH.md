# AWS BuildID 自动注册 - 多语言支持

此分支为原始 [AWS-BuildID-Auto-For-Ext](https://github.com/hkxiaoyao/AWS-BuildID-Auto-For-Ext) 项目添加了**多语言支持 (i18n)**。

## 🌍 支持的语言

- 🇨🇳 **简体中文** - zh_CN（默认）
- 🇬🇧 **英语** - en
- 🇹🇷 **土耳其语** - tr

## 📦 安装

### 从源码安装

1. **克隆仓库：**
```bash
git clone https://github.com/[your-username]/AWS-BuildID-Auto-For-Ext.git
cd AWS-BuildID-Auto-For-Ext
```

2. **在 Chrome 中加载：**
   - 打开 Chrome
   - 访问 `chrome://extensions/`
   - 开启右上角的**"开发者模式"**
   - 点击**"加载已解压的扩展程序"**
   - 选择项目文件夹

3. **启用无痕模式权限：**
   - 点击扩展卡片上的**"详细信息"**
   - 启用**"在无痕模式下启用"**
   - 刷新扩展（点击 🔄 图标）

## 🌐 语言切换

扩展会自动检测您的**浏览器语言设置**：

### Chrome 语言设置

1. Chrome 设置 → **语言** (`chrome://settings/languages`)
2. 将您的首选语言移至**首选语言**列表顶部
3. 重启 Chrome
4. 扩展现在将以您的语言显示

### 支持的语言代码

- `zh-CN`, `zh` → 中文
- `en`, `en-US`, `en-GB` → 英语
- `tr`, `tr-TR` → 土耳其语
- 其他语言 → 中文（默认）

## ✨ 原始功能

保留所有原始功能：

- ✅ 半自动注册
- ✅ 批量注册（1-100）
- ✅ Gmail 无限别名
- ✅ 无痕模式
- ✅ Token 管理
- ✅ Token 验证
- ✅ Kiro IDE 同步

详细使用方法请参见[原始文档](https://github.com/hkxiaoyao/AWS-BuildID-Auto-For-Ext)。

## 🛠️ 开发者说明

### i18n 结构

```
_locales/
├── zh_CN/
│   └── messages.json  # 中文翻译
├── en/
│   └── messages.json  # 英文翻译
└── tr/
    └── messages.json  # 土耳其语翻译
```

### 添加新语言

1. 创建 `_locales/[语言代码]/messages.json`
2. 复制 `zh_CN/messages.json`
3. 翻译所有 `message` 值
4. 重启 Chrome

### 添加新翻译键

1. 在所有语言文件中添加新键：
```json
{
  "newKey": {
    "message": "翻译文本"
  }
}
```

2. 在 HTML 中使用：
```html
<span data-i18n="newKey">默认文本</span>
```

3. 在 JavaScript 中使用：
```javascript
const text = i18n('newKey');
```

## 🤝 贡献

欢迎提交新语言翻译或改进的 Pull Request！

## 📄 许可证

MIT License - 与原项目相同

## 🙏 致谢

- 原始项目：[hkxiaoyao/AWS-BuildID-Auto-For-Ext](https://github.com/hkxiaoyao/AWS-BuildID-Auto-For-Ext)
- Chrome i18n API：[Chrome Extension i18n](https://developer.chrome.com/docs/extensions/reference/i18n/)

---

**用 ❤️ 由社区制作**
