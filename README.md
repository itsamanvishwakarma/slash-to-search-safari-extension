# Slash Search — Safari Web Extension

**Press `/` (or your custom shortcut) on any webpage to instantly focus the search bar.** Works just like GitHub, YouTube, Gmail, and other power-user tools — but everywhere.

---

## Features

- **⚡ Instant Search Focus**: Press `/` (or custom key) to focus the best search input on any page.
- **⚙️ Action Popup Menu**: Click the extension icon in Safari's toolbar to open settings and diagnostics.
- **🔴 Master Global Switch**: Enable or disable the extension globally with one click.
- **🌐 Per-Site Whitelist & Blacklist**: Pause search shortcuts on specific domains (e.g. Google Docs, Figma, Notion).
- **⌨️ Custom Activation Key**: Choose any key (e.g. `/`, `s`, `f`, `Space`) with the interactive shortcut recorder.
- **🟢 Live Search Status**: See in real-time whether a search bar was detected on the current page, complete with element details and a test focus button.
- **🎯 Smart Scoring Engine**: Prioritizes `input[type="search"]`, `role="searchbox"`, ARIA `role="search"` containers, and search placeholders.
- **📜 Smooth Auto-Scroll & Text Select**: Automatically scrolls the search bar into view and highlights existing query text for instant typing.

## How It Works

The extension runs a content script on web pages:

1. When you press your shortcut key, it verifies you're not actively typing inside a text box.
2. It checks if the extension is enabled globally and not disabled on the current domain.
3. It scans visible input, textarea, and contenteditable elements to calculate search relevance scores.
4. The best-matching search field is focused, scrolled into view, and text is auto-selected.

## Load in Safari

1. Open **Safari → Settings → Advanced**.
2. Enable **Show features for web developers**.
3. In **Safari → Settings → Developer**, enable **Allow unsigned extensions**.
4. Go to **Safari → Develop → Show Extension Builder** (or use the developer menu for loading unsigned extensions).
5. Click **+** → **Add Extension…** and select this directory.
6. Enable **Slash Search** in **Safari → Settings → Extensions**.

## Project Structure

```
slash-to-search-safari-extension/
├── manifest.json      # Extension manifest (MV3)
├── popup.html         # Settings popup UI
├── popup.css          # Native macOS / Apple HIG styles & dark mode
├── popup.js           # Settings manager & real-time tab messaging
├── content.js         # Search detection, shortcut handling & focus engine
├── images/
│   ├── icon-48.png    # Toolbar icon (transparent RGBA)
│   ├── icon-96.png    # 2× toolbar icon
│   ├── icon-128.png   # Extension page icon
│   ├── icon-256.png   # 2× extension page icon
│   └── icon-512.png   # High-res icon
└── README.md          # Documentation
```

## Version History

| Version | Changes |
|---------|---------|
| 1.2.0   | Added Action Popup with Master Global Switch, Per-Site Blacklist, Custom Shortcut Key Recorder, Live Search Detection Indicator, and Preferences (Auto-select / Smooth scroll). |
| 1.1.0   | Transparent RGBA icons, `role="searchbox"` support, inherited `contentEditable` detection, non-text input filtering, opacity check, and smooth scroll. |
| 1.0.0   | Initial release — basic `/` to search. |

## License

MIT — free to use, modify, and distribute.
