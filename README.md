# Slash Search — Safari Web Extension

**Press `/` (or your custom shortcut) on any webpage to instantly focus the search bar.** Works just like GitHub, YouTube, Gmail, and other power-user tools — but everywhere.

---

## Features

- **⚡ Instant Search Focus**: Press `/` (or custom key) to focus the best search input on any page.
- **🎯 Element Picker & Custom Selector Pinning**: Power-user feature allowing you to manually click and pin any search bar on tricky websites.
- **💾 Local Database Storage**: Remembers your custom search mappings, disabled websites, shortcuts, and theme preferences permanently across restarts.
- **🌓 Light & Dark Mode**: One-click theme switcher (System Auto / ☀️ Light / 🌙 Dark) rendered in Apple Liquid Glass.
- **🫧 Apple Liquid Glass UI**: Ultra-minimal frosted glass popup window with deep backdrop blur that lets the webpage blur right through.
- **🔴 Master Global Switch**: Enable or disable the extension globally with one click.
- **🌐 Per-Site Whitelist & Blacklist**: Pause search shortcuts on specific domains (e.g. Google Docs, Figma, Notion).
- **⌨️ Custom Activation Key**: Choose any key (e.g. `/`, `s`, `f`, `Space`) with the interactive shortcut recorder.
- **🟢 Live Search Status**: Real-time status indicator showing whether an automatic or custom search field is active.
- **📜 Smooth Auto-Scroll & Text Select**: Automatically scrolls off-screen search bars into view with smooth animation.

## How to Pin a Custom Search Bar on Any Site

1. Navigate to the website where you want to map a custom search bar.
2. Click the **Slash Search** toolbar icon in Safari.
3. Click the **🎯 Pick** button.
4. Hover over the search bar or input field on the page and click it.
5. A confirmation toast will appear, and the search bar is permanently mapped for that domain!

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
├── popup.html         # Liquid Glass Settings popup UI
├── popup.css          # Apple Liquid Glass design system & dark/light themes
├── popup.js           # Settings manager & real-time tab messaging
├── content.js         # Search engine, element picker HUD & keyboard handler
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
| 1.3.0   | Added Interactive Element Picker HUD for custom selector pinning, persistent local database storage (`chrome.storage.local`), and Light / Dark Mode theme switcher. |
| 1.2.0   | Added Action Popup with Master Global Switch, Per-Site Blacklist, Custom Shortcut Key Recorder, Live Search Detection Indicator, and Preferences (Auto-select / Smooth scroll). |
| 1.1.0   | Transparent RGBA icons, `role="searchbox"` support, inherited `contentEditable` detection, non-text input filtering, opacity check, and smooth scroll. |
| 1.0.0   | Initial release — basic `/` to search. |

## License

MIT — free to use, modify, and distribute.
