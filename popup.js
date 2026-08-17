(() => {
  "use strict";

  // Use chrome.storage.local as reliable local database for all persistent settings
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
  let currentTab = null;
  let currentDomain = "";
  let isRecordingShortcut = false;

  // DOM Elements
  const globalToggle = document.getElementById("global-toggle");
  const pausedCover = document.getElementById("paused-cover");
  const currentDomainEl = document.getElementById("current-domain");
  const customBadge = document.getElementById("custom-badge");
  const statusPill = document.getElementById("status-pill");
  const statusLabel = document.getElementById("status-label");
  const btnPickElement = document.getElementById("btn-pick-element");
  const pickBtnLabel = document.getElementById("pick-btn-label");
  const btnResetCustom = document.getElementById("btn-reset-custom");
  const btnFocusNow = document.getElementById("btn-focus-now");
  const siteToggle = document.getElementById("site-toggle");
  const shortcutBtn = document.getElementById("shortcut-btn");
  const shortcutDisplay = document.getElementById("shortcut-display");
  const shortcutSub = document.getElementById("shortcut-sub");
  const btnResetShortcut = document.getElementById("btn-reset-shortcut");
  const btnThemeToggle = document.getElementById("btn-theme-toggle");
  const sunIcon = btnThemeToggle.querySelector(".sun-icon");
  const moonIcon = btnThemeToggle.querySelector(".moon-icon");
  const themeSegmented = document.getElementById("theme-segmented");
  const prefAutoSelect = document.getElementById("pref-auto-select");
  const prefSmoothScroll = document.getElementById("pref-smooth-scroll");
  const moreTrigger = document.getElementById("more-trigger");
  const preferencesDrawer = document.getElementById("preferences-drawer");
  const pinnedSitesSection = document.getElementById("pinned-sites-section");
  const pinnedSitesList = document.getElementById("pinned-sites-list");
  const disabledSitesSection = document.getElementById("disabled-sites-section");
  const disabledSitesList = document.getElementById("disabled-sites-list");

  // Load Settings from Local Database
  async function loadSettings() {
    return new Promise((resolve) => {
      if (!storage) {
        applyTheme(DEFAULT_SETTINGS.theme);
        resolve(DEFAULT_SETTINGS);
        return;
      }
      storage.get(DEFAULT_SETTINGS, (data) => {
        currentSettings = { ...DEFAULT_SETTINGS, ...data };
        if (!currentSettings.customSelectors) currentSettings.customSelectors = {};
        if (!currentSettings.disabledDomains) currentSettings.disabledDomains = [];
        applyTheme(currentSettings.theme);
        resolve(currentSettings);
      });
    });
  }

  // Save Settings to Local Database & Broadcast Instantly to Open Tabs
  function saveAndBroadcastSettings(callback) {
    if (storage) {
      storage.set(currentSettings, () => {
        if (callback) callback();
      });
    }

    // Broadcast directly to tabs so changes apply with 0ms delay
    if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({}, (tabs) => {
        if (tabs && tabs.length) {
          tabs.forEach((tab) => {
            if (tab.id) {
              chrome.tabs.sendMessage(tab.id, {
                action: "UPDATE_SETTINGS",
                settings: currentSettings
              }, () => {
                if (chrome.runtime.lastError) {}
              });
            }
          });
        }
      });
    }
  }

  // Theme Management (System, Light, Dark)
  function applyTheme(theme) {
    if (theme === "light") {
      document.documentElement.setAttribute("data-theme", "light");
      sunIcon.style.display = "block";
      moonIcon.style.display = "none";
    } else if (theme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
      sunIcon.style.display = "none";
      moonIcon.style.display = "block";
    } else {
      document.documentElement.removeAttribute("data-theme");
      const isSystemDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      sunIcon.style.display = isSystemDark ? "none" : "block";
      moonIcon.style.display = isSystemDark ? "block" : "none";
    }

    // Update segmented control buttons
    if (themeSegmented) {
      const btns = themeSegmented.querySelectorAll(".segment-btn");
      btns.forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.themeVal === theme);
      });
    }
  }

  function cycleTheme() {
    const nextTheme = currentSettings.theme === "system" ? "dark" : currentSettings.theme === "dark" ? "light" : "system";
    currentSettings.theme = nextTheme;
    applyTheme(nextTheme);
    saveAndBroadcastSettings();
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
              btnPickElement.disabled = true;
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

    // Check if custom pinned selector exists for this domain
    const hasCustom = Boolean(currentSettings.customSelectors && currentSettings.customSelectors[currentDomain]);
    if (hasCustom) {
      customBadge.style.display = "inline-block";
      btnResetCustom.style.display = "inline-flex";
      pickBtnLabel.textContent = "Re-pick";
      setStatus("custom", "Custom search pinned");
      btnFocusNow.style.display = "inline-flex";
      return;
    } else {
      customBadge.style.display = "none";
      btnResetCustom.style.display = "none";
      pickBtnLabel.textContent = "Pick";
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
    } else if (state === "custom") {
      statusPill.classList.add("status-custom");
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

  // Render Saved Items in Drawer (Pinned & Disabled)
  function renderSavedItems() {
    // 1. Pinned Selectors List
    const customEntries = Object.entries(currentSettings.customSelectors || {});
    if (customEntries.length > 0) {
      pinnedSitesSection.style.display = "block";
      pinnedSitesList.innerHTML = "";
      customEntries.forEach(([domain, selector]) => {
        const row = document.createElement("div");
        row.className = "saved-item-row";

        const name = document.createElement("span");
        name.className = "saved-item-name";
        name.textContent = `${domain}: ${selector}`;
        name.title = `${domain} -> ${selector}`;

        const removeBtn = document.createElement("button");
        removeBtn.className = "btn-item-remove";
        removeBtn.innerHTML = "&times;";
        removeBtn.title = `Remove custom mapping for ${domain}`;
        removeBtn.addEventListener("click", () => {
          delete currentSettings.customSelectors[domain];
          saveAndBroadcastSettings(() => {
            renderUI();
          });
        });

        row.appendChild(name);
        row.appendChild(removeBtn);
        pinnedSitesList.appendChild(row);
      });
    } else {
      pinnedSitesSection.style.display = "none";
    }

    // 2. Disabled Domains List
    const disabledList = currentSettings.disabledDomains || [];
    if (disabledList.length > 0) {
      disabledSitesSection.style.display = "block";
      disabledSitesList.innerHTML = "";
      disabledList.forEach((domain) => {
        const row = document.createElement("div");
        row.className = "saved-item-row";

        const name = document.createElement("span");
        name.className = "saved-item-name";
        name.textContent = domain;

        const removeBtn = document.createElement("button");
        removeBtn.className = "btn-item-remove";
        removeBtn.innerHTML = "&times;";
        removeBtn.title = `Re-enable on ${domain}`;
        removeBtn.addEventListener("click", () => {
          currentSettings.disabledDomains = currentSettings.disabledDomains.filter((d) => d !== domain);
          saveAndBroadcastSettings(() => {
            renderUI();
          });
        });

        row.appendChild(name);
        row.appendChild(removeBtn);
        disabledSitesList.appendChild(row);
      });
    } else {
      disabledSitesSection.style.display = "none";
    }
  }

  // Render Full UI
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

    applyTheme(currentSettings.theme || "system");
    renderSavedItems();
    checkLiveStatus();
  }

  // Attach Event Listeners
  function attachListeners() {
    // Header Theme Toggle Button
    btnThemeToggle.addEventListener("click", () => {
      cycleTheme();
    });

    // Theme Segmented Control
    if (themeSegmented) {
      themeSegmented.addEventListener("click", (e) => {
        const btn = e.target.closest(".segment-btn");
        if (!btn) return;
        const themeVal = btn.dataset.themeVal;
        currentSettings.theme = themeVal;
        applyTheme(themeVal);
        saveAndBroadcastSettings();
      });
    }

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

    // Start Element Picker
    btnPickElement.addEventListener("click", () => {
      if (!currentTab || !currentTab.id) return;
      chrome.tabs.sendMessage(currentTab.id, { action: "START_ELEMENT_PICKER" }, () => {
        window.close();
      });
      setTimeout(() => window.close(), 120);
    });

    // Reset Custom Selector for Current Domain
    btnResetCustom.addEventListener("click", () => {
      if (!currentDomain || !currentSettings.customSelectors) return;
      delete currentSettings.customSelectors[currentDomain];
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
