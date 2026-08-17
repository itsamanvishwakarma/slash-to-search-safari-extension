(() => {
  "use strict";

  const storage = (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local)
    ? chrome.storage.local
    : (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync)
    ? chrome.storage.sync
    : null;

  const DEFAULT_SETTINGS = {
    globalEnabled: true,
    shortcutKey: "/",
    autoSelect: true,
    smoothScroll: true,
    theme: "system",
    disabledDomains: [],
    customSelectors: {}
  };

  let currentSettings = { ...DEFAULT_SETTINGS };

  // Load and sync settings from storage
  function loadSettings() {
    if (storage) {
      storage.get(DEFAULT_SETTINGS, (data) => {
        currentSettings = { ...DEFAULT_SETTINGS, ...data };
        if (!currentSettings.customSelectors) currentSettings.customSelectors = {};
        if (!currentSettings.disabledDomains) currentSettings.disabledDomains = [];
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
    try {
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none" || parseFloat(style.opacity) === 0) {
        return false;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    } catch {
      return false;
    }
  }

  // Deep Shadow DOM Querying (crucial for Reddit, YouTube, modern Web Components)
  function querySelectorAllDeep(selector, root = document) {
    const results = [];
    try {
      if (root.querySelectorAll) {
        results.push(...Array.from(root.querySelectorAll(selector)));
      }
    } catch {}

    try {
      const allElements = root.querySelectorAll ? root.querySelectorAll("*") : [];
      for (const el of allElements) {
        if (el.shadowRoot) {
          results.push(...querySelectorAllDeep(selector, el.shadowRoot));
        }
      }
    } catch {}

    return results;
  }

  function querySelectorDeep(selector, root = document) {
    try {
      if (root.querySelector) {
        const direct = root.querySelector(selector);
        if (direct) return direct;
      }
    } catch {}

    try {
      const allElements = root.querySelectorAll ? root.querySelectorAll("*") : [];
      for (const el of allElements) {
        if (el.shadowRoot) {
          const found = querySelectorDeep(selector, el.shadowRoot);
          if (found) return found;
        }
      }
    } catch {}

    return null;
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
    const parent = el.closest ? el.closest("form, nav, header, [role='search'], reddit-search-large, shreddit-search-bar") : null;
    if (parent) {
      if (parent.getAttribute && parent.getAttribute("role") === "search") score += 70;
      const parentTag = parent.tagName;
      if (parentTag === "NAV" || parentTag === "HEADER" || parentTag.includes("SEARCH")) score += 30;
    }

    // Nearby text
    const parentText = (el.parentElement?.textContent || "").slice(0, 200).toLowerCase();
    if (/\bsearch\b/.test(parentText)) score += 20;

    // Top of page preference
    try {
      const rect = el.getBoundingClientRect();
      if (rect.top < 300) score += 10;
    } catch {}

    return score;
  }

  function findSearchField() {
    const host = window.location.hostname.replace(/^www\./, "");

    // 1. Check custom mapped selector for this website first (with deep shadow DOM search)
    const customSelector =
      currentSettings.customSelectors?.[host] ||
      currentSettings.customSelectors?.[window.location.hostname];

    if (customSelector) {
      try {
        const customEl = querySelectorDeep(customSelector);
        if (customEl) {
          // If custom selector matched a wrapper component, find the inner input
          if (customEl.tagName !== "INPUT" && customEl.tagName !== "TEXTAREA") {
            const innerInput = querySelectorDeep("input, textarea", customEl.shadowRoot || customEl);
            if (innerInput && isVisible(innerInput)) return innerInput;
          }
          if (isVisible(customEl)) return customEl;
        }
      } catch {}
    }

    // 2. Automatic Smart Scoring Detection (pierces shadow roots on Reddit/YouTube/etc.)
    const candidates = querySelectorAllDeep(EDITABLE_SELECTOR);

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
    try {
      const rect = el.getBoundingClientRect();
      return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
      );
    } catch {
      return true;
    }
  }

  function focusSearchField() {
    const field = findSearchField();
    if (!field) return false;

    try {
      field.focus({ preventScroll: false });
      // Dispatch click/focus to open custom search overlays (e.g. Reddit search dropdown)
      field.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      field.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      field.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
    } catch {
      try {
        field.focus();
      } catch {}
    }

    if (currentSettings.smoothScroll !== false && !isInViewport(field)) {
      try {
        field.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {}
    }

    if (
      currentSettings.autoSelect !== false &&
      (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)
    ) {
      try {
        field.select();
      } catch {}
    }

    return true;
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

  // ==========================================
  // ELEMENT PICKER / CUSTOM SELECTOR PINNING
  // ==========================================

  let isPickerActive = false;
  let pickerHighlightBox = null;
  let pickerHud = null;

  // Deep element resolution from screen coordinates (pierces Shadow DOM on Reddit)
  function getDeepElementFromPoint(x, y) {
    let el = document.elementFromPoint(x, y);
    while (el && el.shadowRoot) {
      const nested = el.shadowRoot.elementFromPoint(x, y);
      if (!nested || nested === el) break;
      el = nested;
    }
    return el;
  }

  function generateUniqueSelector(el) {
    if (!el || !(el instanceof Element)) return "";

    // If the element has an internal input inside its shadowRoot or children, prefer that
    if (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA") {
      const inner = el.querySelector?.("input, textarea") || el.shadowRoot?.querySelector?.("input, textarea");
      if (inner) {
        el = inner;
      }
    }

    const tag = el.tagName.toLowerCase();

    // 1. Unique ID
    if (el.id) {
      const idSel = `#${CSS.escape(el.id)}`;
      if (querySelectorDeep(idSel)) return idSel;
    }

    // 2. Unique Name attribute
    const name = el.getAttribute("name");
    if (name) {
      const sel = `${tag}[name="${CSS.escape(name)}"]`;
      if (querySelectorDeep(sel)) return sel;
    }

    // 3. Unique placeholder
    const placeholder = el.getAttribute("placeholder");
    if (placeholder) {
      const sel = `${tag}[placeholder="${CSS.escape(placeholder)}"]`;
      if (querySelectorDeep(sel)) return sel;
    }

    // 4. Unique aria-label
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel) {
      const sel = `${tag}[aria-label="${CSS.escape(ariaLabel)}"]`;
      if (querySelectorDeep(sel)) return sel;
    }

    // 5. Unique data-testid
    const testId = el.getAttribute("data-testid");
    if (testId) {
      const sel = `[data-testid="${CSS.escape(testId)}"]`;
      if (querySelectorDeep(sel)) return sel;
    }

    // 6. Host Web Component + Tag (e.g. shreddit-search-bar input, reddit-search-large input)
    let parent = el.parentElement || (el.getRootNode && el.getRootNode().host);
    while (parent && parent !== document.body) {
      const parentTag = parent.tagName?.toLowerCase();
      if (parentTag && (parentTag.includes("search") || parentTag.includes("header") || parent.id)) {
        const parentSel = parent.id ? `#${CSS.escape(parent.id)}` : parentTag;
        return `${parentSel} ${tag}`;
      }
      parent = parent.parentElement || (parent.getRootNode && parent.getRootNode().host);
    }

    // 7. Generic fallback with type
    const type = el.getAttribute("type");
    if (type) return `${tag}[type="${type}"]`;

    return tag;
  }

  function startElementPicker() {
    if (isPickerActive) return;
    isPickerActive = true;

    // Create Highlight Box
    pickerHighlightBox = document.createElement("div");
    pickerHighlightBox.id = "slash-search-picker-box";
    Object.assign(pickerHighlightBox.style, {
      position: "fixed",
      pointerEvents: "none",
      zIndex: "2147483646",
      border: "2.5px solid #0071e3",
      background: "rgba(0, 113, 227, 0.18)",
      borderRadius: "8px",
      boxShadow: "0 0 20px rgba(0, 113, 227, 0.5), inset 0 0 10px rgba(0, 113, 227, 0.2)",
      transition: "top 0.05s ease, left 0.05s ease, width 0.05s ease, height 0.05s ease",
      display: "none"
    });
    document.documentElement.appendChild(pickerHighlightBox);

    // Create Apple Liquid Glass HUD Banner
    pickerHud = document.createElement("div");
    pickerHud.id = "slash-search-picker-hud";
    Object.assign(pickerHud.style, {
      position: "fixed",
      top: "16px",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: "2147483647",
      background: "rgba(24, 24, 28, 0.88)",
      backdropFilter: "blur(28px) saturate(180%)",
      WebkitBackdropFilter: "blur(28px) saturate(180%)",
      color: "#ffffff",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', sans-serif",
      fontSize: "13px",
      fontWeight: "500",
      padding: "10px 18px",
      borderRadius: "9999px",
      boxShadow: "0 12px 36px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.25)",
      display: "flex",
      alignItems: "center",
      gap: "10px",
      border: "1px solid rgba(255,255,255,0.18)",
      cursor: "default",
      userSelect: "none",
      pointerEvents: "auto"
    });

    pickerHud.innerHTML = `
      <span style="font-size: 16px;">🎯</span>
      <span>Click any search bar or input to pin it for this site</span>
      <span style="font-size: 11px; opacity: 0.8; background: rgba(255,255,255,0.15); padding: 2px 8px; border-radius: 6px;">Esc to cancel</span>
    `;
    document.documentElement.appendChild(pickerHud);

    // Capture phase listeners so SPA routers / Reddit handlers don't swallow events
    window.addEventListener("mousemove", handlePickerMouseMove, true);
    window.addEventListener("pointerdown", handlePickerPointerDown, true);
    window.addEventListener("mousedown", handlePickerPointerDown, true);
    window.addEventListener("click", handlePickerClick, true);
    window.addEventListener("keydown", handlePickerKeyDown, true);
  }

  function handlePickerMouseMove(e) {
    if (!isPickerActive || !pickerHighlightBox) return;

    const target = getDeepElementFromPoint(e.clientX, e.clientY);
    if (!target || target === pickerHud || pickerHud?.contains(target) || target === pickerHighlightBox) {
      return;
    }

    try {
      const rect = target.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        Object.assign(pickerHighlightBox.style, {
          display: "block",
          top: `${rect.top}px`,
          left: `${rect.left}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`
        });
      }
    } catch {}
  }

  function handlePickerPointerDown(e) {
    if (!isPickerActive) return;
    if (pickerHud && (e.target === pickerHud || pickerHud.contains(e.target))) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const target = getDeepElementFromPoint(e.clientX, e.clientY);
    if (target && target !== pickerHud && !pickerHud?.contains(target)) {
      const selector = generateUniqueSelector(target);
      const host = window.location.hostname.replace(/^www\./, "");

      // Save custom selector to local database
      currentSettings.customSelectors = currentSettings.customSelectors || {};
      currentSettings.customSelectors[host] = selector;

      if (storage) {
        storage.set({ customSelectors: currentSettings.customSelectors });
      }

      showToast(`🎯 Pinned search bar for ${host}! (${selector})`);

      // Immediately focus the selected search input
      setTimeout(() => {
        try {
          target.focus();
          if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
            target.select();
          }
        } catch {}
      }, 50);
    }

    stopElementPicker();
  }

  function handlePickerClick(e) {
    if (!isPickerActive) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }

  function handlePickerKeyDown(e) {
    if (!isPickerActive) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      stopElementPicker();
      showToast("Picker cancelled");
    }
  }

  function stopElementPicker() {
    isPickerActive = false;
    if (pickerHighlightBox) {
      pickerHighlightBox.remove();
      pickerHighlightBox = null;
    }
    if (pickerHud) {
      pickerHud.remove();
      pickerHud = null;
    }
    window.removeEventListener("mousemove", handlePickerMouseMove, true);
    window.removeEventListener("pointerdown", handlePickerPointerDown, true);
    window.removeEventListener("mousedown", handlePickerPointerDown, true);
    window.removeEventListener("click", handlePickerClick, true);
    window.removeEventListener("keydown", handlePickerKeyDown, true);
  }

  function showToast(message) {
    const toast = document.createElement("div");
    Object.assign(toast.style, {
      position: "fixed",
      bottom: "28px",
      left: "50%",
      transform: "translateX(-50%) translateY(20px)",
      zIndex: "2147483647",
      background: "rgba(20, 20, 24, 0.92)",
      backdropFilter: "blur(24px)",
      WebkitBackdropFilter: "blur(24px)",
      color: "#ffffff",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
      fontSize: "13px",
      fontWeight: "500",
      padding: "10px 20px",
      borderRadius: "9999px",
      boxShadow: "0 10px 28px rgba(0,0,0,0.35), inset 0 1px 1px rgba(255,255,255,0.2)",
      border: "1px solid rgba(255,255,255,0.18)",
      opacity: "0",
      transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
      pointerEvents: "none"
    });
    toast.textContent = message;
    document.documentElement.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateX(-50%) translateY(0)";
    });

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(-50%) translateY(20px)";
      setTimeout(() => toast.remove(), 350);
    }, 3000);
  }

  // Runtime message listener
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "UPDATE_SETTINGS" && request.settings) {
        currentSettings = { ...DEFAULT_SETTINGS, ...request.settings };
        sendResponse({ success: true });
        return true;
      }

      if (request.action === "START_ELEMENT_PICKER") {
        startElementPicker();
        sendResponse({ success: true });
        return true;
      }

      if (request.action === "GET_SEARCH_STATUS") {
        const field = findSearchField();
        const host = window.location.hostname.replace(/^www\./, "");
        const hasCustom = Boolean(currentSettings.customSelectors?.[host]);

        if (field) {
          sendResponse({
            found: true,
            isCustom: hasCustom,
            tag: field.tagName.toLowerCase(),
            placeholder: field.getAttribute("placeholder") || "",
            id: field.id || ""
          });
        } else {
          sendResponse({ found: false, isCustom: hasCustom });
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
