# Slash Search — Safari Web Extension

**Press `/` on any webpage to instantly focus the search bar.** Works just like GitHub, YouTube, Gmail, and other power-user tools — but everywhere.

---

## Features

- **`/` focuses the best search input** on the current page.
- Smart scoring system prioritizes `input[type="search"]`, `role="searchbox"`, ARIA `role="search"` containers, and fields with search-related names/placeholders.
- Fields with non-search purposes (email, password, phone, login, etc.) are automatically deprioritized.
- If the search field is off-screen, the page **smoothly scrolls** to bring it into view.
- Existing text in the field is **auto-selected** so you can start typing immediately.
- Works normally while you're already typing — `/` is only intercepted from non-editable areas.
- `Shift+/` (`?`) is never intercepted.
- Modifier keys (`Ctrl`, `Cmd`, `Alt`) are never intercepted.

## How It Works

The extension runs a content script on every page. When you press `/`:

1. It checks you're not already inside an editable field.
2. It scans all visible input/textarea/contenteditable elements on the page.
3. Each element gets a relevance score based on its `type`, `name`, `id`, `placeholder`, `aria-label`, `role`, surrounding container (`role="search"`, `<nav>`, `<header>`), and nearby text.
4. The highest-scoring element with a positive score is focused.
5. Any existing text is selected so you can overwrite it immediately.

## Load Temporarily in Safari

1. Open **Safari → Settings → Advanced**.
2. Enable **Developer features** (Show features for web developers).
3. In **Safari → Settings → Developer**, enable **Allow unsigned extensions**.
4. Go to **Safari → Develop → Show Extension Builder** (or use the menu for loading unsigned extensions).
5. Click **+** → **Add Extension…** and select this folder.
6. Enable **Slash Search** in **Safari → Settings → Extensions**.

> **Note:** Temporary extensions must be re-enabled each time Safari restarts.

## Project Structure

```
slash-to-search-safari-extension/
├── manifest.json      # Extension manifest (MV3)
├── content.js         # Content script — search-field detection & focus
├── images/
│   ├── icon-48.png    # Toolbar icon
│   ├── icon-96.png    # 2× toolbar icon
│   ├── icon-128.png   # Extension page icon
│   ├── icon-256.png   # 2× extension page icon
│   └── icon-512.png   # High-res icon
└── README.md          # This file
```

## Version History

| Version | Changes |
|---------|---------|
| 1.1.0   | Added icons, `role="searchbox"` support, inherited `contentEditable` detection, non-text input filtering, opacity check, `role="search"` container scoring, minimum-score threshold, expanded penalty list, viewport check with smooth scroll, class attribute scoring, improved README. |
| 1.0.0   | Initial release — basic `/` to search. |

## License

MIT — free to use, modify, and distribute.
