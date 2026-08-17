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
  let currentTab = null;
  let currentDomain = "";
  let isRecordingShortcut = false;

  // DOM Elements
  const globalToggle = document.getElementById("global-toggle");
  const pausedCover = document.getElementById("paused-cover");
  const currentDomainEl = document.getElementById("current-domain");
  const statusRow = document.getElementById("status-row");
  const statusPill = document.getElementById("status-pill");
  const statusLabel = document.getElementById("status-label");
  const btnFocusNow = document.getElementById("btn-focus-now");
  const siteToggle = document.getElementById("site-toggle");
  const shortcutBtn = document.getElementById("shortcut-btn");
  const shortcutDisplay = document.getElementById("shortcut-display");
  const shortcutSub = document.getElementById("shortcut-sub");
  const btnResetShortcut = document.getElementById("btn-reset-shortcut");
  const prefAutoSelect = document.getElementById("pref-auto-select");
  const prefSmoothScroll = document.getElementById("pref-smooth-scroll");
  const moreTrigger = document.getElementById("more-trigger");
  const preferencesDrawer = document.getElementById("preferences-drawer");

  // Load Settings from Storage
  async function loadSettings() {
    return new Promise((resolve) => {
      if (!storage) {
        resolve(DEFAULT_SETTINGS);
        return;
      }
      storage.get(DEFAULT_SETTINGS, (data) => {
        currentSettings = { ...DEFAULT_SETTINGS, ...data };
        resolve(currentSettings);
      });
    });
  }

  // Save Settings & Broadcast Instantly to Open Tabs (No reload required!)
  function saveAndBroadcastSettings(callback) {
    if (storage) {
      storage.set(currentSettings, () => {
        if (callback) callback();
      });
    }

    // Broadcast directly to active tab so changes take effect instantly with 0ms delay
    if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({}, (tabs) => {
        if (tabs && tabs.length) {
          tabs.forEach((tab) => {
            if (tab.id) {
              chrome.tabs.sendMessage(tab.id, {
                action: "UPDATE_SETTINGS",
                settings: currentSettings
              }, () => {
                if (chrome.runtime.lastError) {
                  // Silent catch for browser special pages
                }
              });
            }
          });
        }
      });
    }
  }

  // Initialize Active Tab
  async function initTab() {
    return new Promise((resolve) => {
      if (typeof chrome === "undefined" || !chrome.tabs || !chrome.tabs.query) {
        currentDomainEl.textContent = "Current Webpage";
        resolve(null);
        return;
      }

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0) {
          currentTab = tabs[0];
          try {
            const url = new URL(currentTab.url);
            if (url.protocol === "http:" || url.protocol === "https:") {
              currentDomain = url.hostname.replace(/^www\./, "");
              currentDomainEl.textContent = currentDomain;
            } else {
              currentDomain = "";
              currentDomainEl.textContent = "Safari System Page";
              siteToggle.disabled = true;
            }
          } catch {
            currentDomain = "";
            currentDomainEl.textContent = "Current Page";
          }
        }
        resolve(currentTab);
      });
    });
  }

  // Query Live Search Status on Active Tab
  function checkLiveStatus() {
    if (!currentTab || !currentDomain) {
      setStatus("none", "Cannot run on page");
      return;
    }

    if (!currentSettings.globalEnabled) {
      setStatus("disabled", "Extension paused");
      return;
    }

    if (currentSettings.disabledDomains.includes(currentDomain)) {
      setStatus("disabled", "Disabled on this site");
      return;
    }

    statusLabel.textContent = "Checking search...";
    statusPill.className = "status-pill";

    chrome.tabs.sendMessage(currentTab.id, { action: "GET_SEARCH_STATUS" }, (response) => {
      if (chrome.runtime.lastError || !response) {
        setStatus("none", "No search found");
        return;
      }

      if (response.found) {
        setStatus("found", "Ready to search");
        btnFocusNow.style.display = "inline-flex";
      } else {
        setStatus("none", "No search found");
        btnFocusNow.style.display = "none";
      }
    });
  }

  function setStatus(state, label) {
    statusPill.className = "status-pill";
    if (state === "found") {
      statusPill.classList.add("status-found");
      statusLabel.textContent = label;
    } else if (state === "disabled") {
      statusPill.classList.add("status-disabled");
      statusLabel.textContent = label;
      btnFocusNow.style.display = "none";
    } else {
      statusPill.classList.add("status-none");
      statusLabel.textContent = label;
      btnFocusNow.style.display = "none";
    }
  }

  // Render UI
  function renderUI() {
    globalToggle.checked = currentSettings.globalEnabled;
    pausedCover.style.display = currentSettings.globalEnabled ? "none" : "flex";

    if (currentDomain) {
      const isDomainDisabled = currentSettings.disabledDomains.includes(currentDomain);
      siteToggle.checked = !isDomainDisabled;
    }

    shortcutDisplay.textContent = currentSettings.shortcutKey || "/";
    prefAutoSelect.checked = currentSettings.autoSelect !== false;
    prefSmoothScroll.checked = currentSettings.smoothScroll !== false;

    checkLiveStatus();
  }

  // Event Listeners
  function attachListeners() {
    // Global Master Switch
    globalToggle.addEventListener("change", () => {
      currentSettings.globalEnabled = globalToggle.checked;
      saveAndBroadcastSettings(() => {
        renderUI();
      });
    });

    // Site Switch
    siteToggle.addEventListener("change", () => {
      if (!currentDomain) return;
      const isEnabled = siteToggle.checked;
      const list = new Set(currentSettings.disabledDomains || []);

      if (isEnabled) {
        list.delete(currentDomain);
      } else {
        list.add(currentDomain);
      }

      currentSettings.disabledDomains = Array.from(list);
      saveAndBroadcastSettings(() => {
        renderUI();
      });
    });

    // Focus Now Button
    btnFocusNow.addEventListener("click", () => {
      if (!currentTab) return;
      chrome.tabs.sendMessage(currentTab.id, { action: "TRIGGER_FOCUS" }, () => {
        window.close();
      });
    });

    // Shortcut Key Recorder
    shortcutBtn.addEventListener("click", () => {
      if (isRecordingShortcut) {
        stopRecordingShortcut();
        return;
      }
      startRecordingShortcut();
    });

    btnResetShortcut.addEventListener("click", () => {
      currentSettings.shortcutKey = "/";
      saveAndBroadcastSettings(() => {
        stopRecordingShortcut();
        renderUI();
      });
    });

    // Preferences
    prefAutoSelect.addEventListener("change", () => {
      currentSettings.autoSelect = prefAutoSelect.checked;
      saveAndBroadcastSettings();
    });

    prefSmoothScroll.addEventListener("change", () => {
      currentSettings.smoothScroll = prefSmoothScroll.checked;
      saveAndBroadcastSettings();
    });

    // More Preferences Drawer
    moreTrigger.addEventListener("click", () => {
      const isClosed = preferencesDrawer.style.display === "none";
      preferencesDrawer.style.display = isClosed ? "flex" : "none";
      moreTrigger.classList.toggle("open", isClosed);
    });
  }

  function startRecordingShortcut() {
    isRecordingShortcut = true;
    shortcutBtn.classList.add("recording");
    shortcutDisplay.textContent = "...";
    shortcutSub.textContent = "Press any key...";
    window.addEventListener("keydown", handleKeyCapture, true);
  }

  function stopRecordingShortcut() {
    isRecordingShortcut = false;
    shortcutBtn.classList.remove("recording");
    shortcutDisplay.textContent = currentSettings.shortcutKey || "/";
    shortcutSub.textContent = "Press key to trigger";
    window.removeEventListener("keydown", handleKeyCapture, true);
  }

  function handleKeyCapture(e) {
    e.preventDefault();
    e.stopPropagation();

    if (["Control", "Shift", "Alt", "Meta", "CapsLock", "Tab"].includes(e.key)) {
      return;
    }

    if (e.key === "Escape") {
      stopRecordingShortcut();
      return;
    }

    const recordedKey = e.key === " " ? "Space" : e.key;
    currentSettings.shortcutKey = recordedKey;

    saveAndBroadcastSettings(() => {
      stopRecordingShortcut();
      renderUI();
    });
  }

  // Init
  async function init() {
    await loadSettings();
    await initTab();
    attachListeners();
    renderUI();
  }

  init();
})();
