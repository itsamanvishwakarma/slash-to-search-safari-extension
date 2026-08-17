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
    // 1. Check custom mapped selector for this website first
    const host = window.location.hostname.replace(/^www\./, "");
    const customSelector =
      currentSettings.customSelectors?.[host] ||
      currentSettings.customSelectors?.[window.location.hostname];

    if (customSelector) {
      try {
        const customEl = document.querySelector(customSelector);
        if (customEl && isVisible(customEl)) {
          return customEl;
        }
      } catch {}
    }

    // 2. Automatic Smart Scoring Detection
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
      } catch {}
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

  // ==========================================
  // ELEMENT PICKER / CUSTOM SELECTOR PINNING
  // ==========================================

  let isPickerActive = false;
  let pickerHighlightBox = null;
  let pickerHud = null;

  function generateUniqueSelector(el) {
    if (!el || !(el instanceof Element)) return "";

    // 1. Unique ID
    if (el.id && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) {
      return `#${CSS.escape(el.id)}`;
    }

    const tag = el.tagName.toLowerCase();

    // 2. Unique Name attribute
    const name = el.getAttribute("name");
    if (name) {
      const sel = `${tag}[name="${CSS.escape(name)}"]`;
      if (document.querySelectorAll(sel).length === 1) return sel;
    }

    // 3. Unique placeholder
    const placeholder = el.getAttribute("placeholder");
    if (placeholder) {
      const sel = `${tag}[placeholder="${CSS.escape(placeholder)}"]`;
      if (document.querySelectorAll(sel).length === 1) return sel;
    }

    // 4. Unique aria-label
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel) {
      const sel = `${tag}[aria-label="${CSS.escape(ariaLabel)}"]`;
      if (document.querySelectorAll(sel).length === 1) return sel;
    }

    // 5. Unique data-testid
    const testId = el.getAttribute("data-testid");
    if (testId) {
      const sel = `[data-testid="${CSS.escape(testId)}"]`;
      if (document.querySelectorAll(sel).length === 1) return sel;
    }

    // 6. Build clean path with class/parent
    let path = [];
    let current = el;
    while (current && current.nodeType === Node.ELEMENT_NODE && path.length < 4) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        selector = `#${CSS.escape(current.id)}`;
        path.unshift(selector);
        break;
      }
      if (current.className && typeof current.className === "string") {
        const classes = current.className
          .trim()
          .split(/\s+/)
          .filter((c) => c && !c.includes(":") && !c.includes("[") && !c.includes("/"))
          .slice(0, 2);
        if (classes.length) {
          selector += "." + classes.map((c) => CSS.escape(c)).join(".");
        }
      }
      path.unshift(selector);
      current = current.parentElement;
    }

    const fullPath = path.join(" > ");
    return fullPath || tag;
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
      border: "2px solid #0071e3",
      background: "rgba(0, 113, 227, 0.15)",
      borderRadius: "6px",
      boxShadow: "0 0 16px rgba(0, 113, 227, 0.4)",
      transition: "all 0.08s cubic-bezier(0.16, 1, 0.3, 1)",
      display: "none"
    });
    document.body.appendChild(pickerHighlightBox);

    // Create Apple Liquid Glass HUD Banner
    pickerHud = document.createElement("div");
    pickerHud.id = "slash-search-picker-hud";
    Object.assign(pickerHud.style, {
      position: "fixed",
      top: "16px",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: "2147483647",
      background: "rgba(30, 30, 34, 0.85)",
      backdropFilter: "blur(24px)",
      WebkitBackdropFilter: "blur(24px)",
      color: "#ffffff",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
      fontSize: "13px",
      fontWeight: "500",
      padding: "10px 18px",
      borderRadius: "9999px",
      boxShadow: "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 1px rgba(255,255,255,0.2)",
      display: "flex",
      alignItems: "center",
      gap: "10px",
      border: "1px solid rgba(255,255,255,0.15)",
      cursor: "default",
      userSelect: "none"
    });

    pickerHud.innerHTML = `
      <span style="font-size: 15px;">🎯</span>
      <span>Click any search box or input to pin it for this site</span>
      <span style="font-size: 11px; opacity: 0.7; background: rgba(255,255,255,0.12); padding: 2px 7px; border-radius: 5px;">Esc to cancel</span>
    `;
    document.body.appendChild(pickerHud);

    // Event Listeners for Picker
    window.addEventListener("mousemove", handlePickerMouseMove, true);
    window.addEventListener("click", handlePickerClick, true);
    window.addEventListener("keydown", handlePickerKeyDown, true);
  }

  function handlePickerMouseMove(e) {
    if (!isPickerActive || !pickerHighlightBox) return;

    // Get element under cursor
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (!target || target === pickerHud || pickerHud.contains(target) || target === pickerHighlightBox) {
      return;
    }

    const rect = target.getBoundingClientRect();
    Object.assign(pickerHighlightBox.style, {
      display: "block",
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`
    });
  }

  function handlePickerClick(e) {
    if (!isPickerActive) return;
    e.preventDefault();
    e.stopPropagation();

    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (target && target !== pickerHud && !pickerHud.contains(target)) {
      const selector = generateUniqueSelector(target);
      const host = window.location.hostname.replace(/^www\./, "");

      // Save custom selector to storage
      currentSettings.customSelectors = currentSettings.customSelectors || {};
      currentSettings.customSelectors[host] = selector;

      if (storage) {
        storage.set({ customSelectors: currentSettings.customSelectors });
      }

      showToast(`🎯 Pinned search bar for ${host}! (${selector})`);
      target.focus();
    }

    stopElementPicker();
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
    window.removeEventListener("click", handlePickerClick, true);
    window.removeEventListener("keydown", handlePickerKeyDown, true);
  }

  function showToast(message) {
    const toast = document.createElement("div");
    Object.assign(toast.style, {
      position: "fixed",
      bottom: "24px",
      left: "50%",
      transform: "translateX(-50%) translateY(20px)",
      zIndex: "2147483647",
      background: "rgba(20, 20, 24, 0.88)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      color: "#ffffff",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
      fontSize: "13px",
      fontWeight: "500",
      padding: "9px 18px",
      borderRadius: "9999px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.2)",
      border: "1px solid rgba(255,255,255,0.15)",
      opacity: "0",
      transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
      pointerEvents: "none"
    });
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateX(-50%) translateY(0)";
    });

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(-50%) translateY(20px)";
      setTimeout(() => toast.remove(), 350);
    }, 2800);
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
