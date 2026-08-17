(() => {
  "use strict";

  const storage = (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync)
    ? chrome.storage.sync
    : (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local)
    ? chrome.storage.local
    : null;

  const DEFAULT_SETTINGS = {
    globalEnabled: true,
    shortcutKey: "/",
    autoSelect: true,
    smoothScroll: true,
    disabledDomains: []
  };

  let currentSettings = { ...DEFAULT_SETTINGS };

  // Load and sync settings from storage
  function loadSettings() {
    if (storage) {
      storage.get(DEFAULT_SETTINGS, (data) => {
        currentSettings = { ...DEFAULT_SETTINGS, ...data };
      });
    }
  }

  // Live storage change listener
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes) => {
      for (const key of Object.keys(changes)) {
        if (changes[key] && changes[key].newValue !== undefined) {
          currentSettings[key] = changes[key].newValue;
        }
      }
    });
  }

  loadSettings();

  const EDITABLE_SELECTOR =
    'input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"], [role="searchbox"]';

  /**
   * Returns true when the given element is an editable field where the user
   * is likely typing text.
   */
  function isEditable(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    try {
      return el.matches(EDITABLE_SELECTOR);
    } catch {
      return false;
    }
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none" || parseFloat(style.opacity) === 0) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function scoreSearchField(el) {
    if (!isVisible(el) || el.disabled || el.readOnly) return -Infinity;

    const tag = el.tagName;
    const type = (el.getAttribute("type") || "").toLowerCase();

    // Skip non-text input types entirely
    if (
      tag === "INPUT" &&
      type &&
      !["text", "search", "url", ""].includes(type)
    ) {
      return -Infinity;
    }

    const attrs = [
      el.getAttribute("name"),
      el.getAttribute("id"),
      el.getAttribute("placeholder"),
      el.getAttribute("aria-label"),
      el.getAttribute("autocomplete"),
      el.getAttribute("title"),
      el.getAttribute("class"),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    let score = 0;

    // Native search input
    if (type === "search") score += 100;

    // role="searchbox"
    if (el.getAttribute("role") === "searchbox") score += 90;

    // Common search attributes
    if (/\bsearch\b/.test(attrs)) score += 80;
    if (/\b(query|find|keyword|keywords|q)\b/.test(attrs)) score += 45;

    // Search autocomplete
    if (el.getAttribute("autocomplete") === "search") score += 60;

    // Prefer inputs over textareas
    if (tag === "INPUT") score += 10;

    // Penalize non-search fields
    if (
      /\b(email|password|tel|phone|address|username|user|login|signup|register|credit|card|cvv|ssn|zip|postal)\b/.test(
        attrs
      )
    ) {
      score -= 200;
    }

    if (type === "hidden") return -Infinity;

    // Containers
    const parent = el.closest("form, nav, header, [role='search']");
    if (parent) {
      if (parent.getAttribute("role") === "search") score += 70;
      const parentTag = parent.tagName;
      if (parentTag === "NAV" || parentTag === "HEADER") score += 15;
    }

    // Nearby text
    const parentText = (el.parentElement?.textContent || "").slice(0, 200).toLowerCase();
    if (/\bsearch\b/.test(parentText)) score += 20;

    // Top of page preference
    const rect = el.getBoundingClientRect();
    if (rect.top < 300) score += 10;

    return score;
  }

  function findSearchField() {
    const candidates = Array.from(
      document.querySelectorAll(EDITABLE_SELECTOR)
    );

    let best = null;
    let bestScore = -Infinity;

    for (const el of candidates) {
      const score = scoreSearchField(el);
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }

    return bestScore > 0 ? best : null;
  }

  function isInViewport(el) {
    const rect = el.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  }

  function focusSearchField() {
    const field = findSearchField();
    if (!field) return false;

    try {
      field.focus({ preventScroll: false });
    } catch {
      field.focus();
    }

    if (currentSettings.smoothScroll !== false && !isInViewport(field)) {
      field.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    if (
      currentSettings.autoSelect !== false &&
      (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)
    ) {
      try {
        field.select();
      } catch {
        // Ignore select errors on restricted inputs
      }
    }

    return document.activeElement === field;
  }

  function isShortcutMatch(event) {
    const shortcut = (currentSettings.shortcutKey || "/").trim();

    if (shortcut.toLowerCase() === "space") {
      return event.key === " " || event.code === "Space";
    }

    return event.key.toLowerCase() === shortcut.toLowerCase();
  }

  // Keydown listener
  document.addEventListener(
    "keydown",
    (event) => {
      // 1. Check master global toggle
      if (currentSettings.globalEnabled === false) return;

      // 2. Check per-site blacklist
      const currentHost = window.location.hostname.replace(/^www\./, "");
      if (
        currentSettings.disabledDomains &&
        (currentSettings.disabledDomains.includes(currentHost) ||
         currentSettings.disabledDomains.includes(window.location.hostname))
      ) {
        return;
      }

      // 3. Check shortcut key
      if (!isShortcutMatch(event)) return;

      // 4. Ignore inside inputs or when modifiers are pressed
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (event.shiftKey && currentSettings.shortcutKey !== "?") ||
        isEditable(event.target)
      ) {
        return;
      }

      if (event.defaultPrevented) return;

      if (focusSearchField()) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    true
  );

  // Runtime message listener (Instant update & status queries)
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      // Instant settings update without needing page reload
      if (request.action === "UPDATE_SETTINGS" && request.settings) {
        currentSettings = { ...DEFAULT_SETTINGS, ...request.settings };
        sendResponse({ success: true });
        return true;
      }

      if (request.action === "GET_SEARCH_STATUS") {
        const field = findSearchField();
        if (field) {
          sendResponse({
            found: true,
            tag: field.tagName.toLowerCase(),
            placeholder: field.getAttribute("placeholder") || "",
            id: field.id || ""
          });
        } else {
          sendResponse({ found: false });
        }
        return true;
      }

      if (request.action === "TRIGGER_FOCUS") {
        const success = focusSearchField();
        sendResponse({ success });
        return true;
      }
    });
  }
})();
