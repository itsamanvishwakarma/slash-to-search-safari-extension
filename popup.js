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
  const disabledOverlay = document.getElementById("disabled-overlay");
  const currentDomainEl = document.getElementById("current-domain");
  const statusCard = document.getElementById("status-card");
  const statusText = document.getElementById("status-text");
  const statusDetails = document.getElementById("status-details");
  const detectedInfo = document.getElementById("detected-info");
  const btnTestFocus = document.getElementById("btn-test-focus");
  const siteToggle = document.getElementById("site-toggle");
  const siteToggleDesc = document.getElementById("site-toggle-desc");
  const shortcutBtn = document.getElementById("shortcut-btn");
  const shortcutDisplay = document.getElementById("shortcut-display");
  const btnResetShortcut = document.getElementById("btn-reset-shortcut");
  const shortcutHelper = document.getElementById("shortcut-helper");
  const prefAutoSelect = document.getElementById("pref-auto-select");
  const prefSmoothScroll = document.getElementById("pref-smooth-scroll");
  const accordionDisabledSites = document.getElementById("accordion-disabled-sites");
  const disabledSitesListContainer = document.getElementById("disabled-sites-list-container");
  const disabledCountDesc = document.getElementById("disabled-count-desc");
  const disabledSitesList = document.getElementById("disabled-sites-list");

  // Load Settings
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

  // Save Settings
  function saveSettings(callback) {
    if (storage) {
      storage.set(currentSettings, () => {
        if (callback) callback();
      });
    }
  }

  // Initialize Active Tab & Domain
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
              currentDomain = url.hostname;
              currentDomainEl.textContent = currentDomain;
              siteToggleDesc.textContent = `Enable for ${currentDomain}`;
            } else {
              currentDomain = "";
              currentDomainEl.textContent = "Browser System Page";
              siteToggleDesc.textContent = "Cannot modify browser pages";
              siteToggle.disabled = true;
            }
          } catch {
            currentDomain = "";
            currentDomainEl.textContent = "Unknown Page";
          }
        }
        resolve(currentTab);
      });
    });
  }

  // Check Search Bar on Active Page
  function checkPageSearchStatus() {
    if (!currentTab || !currentDomain) {
      updateStatusDisplay("none", "Cannot run on this page");
      return;
    }

    if (!currentSettings.globalEnabled) {
      updateStatusDisplay("disabled", "Extension paused globally");
      return;
    }

    if (currentSettings.disabledDomains.includes(currentDomain)) {
      updateStatusDisplay("disabled", `Disabled on ${currentDomain}`);
      return;
    }

    statusText.textContent = "Checking search bar...";
    statusCard.className = "card status-card";

    chrome.tabs.sendMessage(currentTab.id, { action: "GET_SEARCH_STATUS" }, (response) => {
      if (chrome.runtime.lastError || !response) {
        updateStatusDisplay("none", "No response from page");
        return;
      }

      if (response.found) {
        const desc = response.tag + (response.placeholder ? ` [placeholder="${response.placeholder}"]` : "") + (response.id ? ` #${response.id}` : "");
        updateStatusDisplay("found", "Search bar detected", desc);
      } else {
        updateStatusDisplay("none", "No search bar found on this page");
      }
    });
  }

  function updateStatusDisplay(state, text, details = "") {
    statusCard.className = "card status-card";
    if (state === "found") {
      statusCard.classList.add("status-found");
      statusText.textContent = text;
      if (details) {
        detectedInfo.textContent = details;
        statusDetails.style.display = "flex";
      } else {
        statusDetails.style.display = "none";
      }
    } else if (state === "disabled") {
      statusCard.classList.add("status-disabled");
      statusText.textContent = text;
      statusDetails.style.display = "none";
    } else {
      statusCard.classList.add("status-none");
      statusText.textContent = text;
      statusDetails.style.display = "none";
    }
  }

  // Update UI with Settings
  function renderUI() {
    // Global Toggle
    globalToggle.checked = currentSettings.globalEnabled;
    disabledOverlay.style.display = currentSettings.globalEnabled ? "none" : "flex";

    // Site Toggle
    if (currentDomain) {
      const isDomainDisabled = currentSettings.disabledDomains.includes(currentDomain);
      siteToggle.checked = !isDomainDisabled;
    }

    // Shortcut
    shortcutDisplay.textContent = currentSettings.shortcutKey || "/";

    // Preferences
    prefAutoSelect.checked = currentSettings.autoSelect !== false;
    prefSmoothScroll.checked = currentSettings.smoothScroll !== false;

    // Disabled Sites List
    renderDisabledList();

    // Re-check live status
    checkPageSearchStatus();
  }

  function renderDisabledList() {
    const list = currentSettings.disabledDomains || [];
    disabledCountDesc.textContent = `${list.length} site${list.length === 1 ? "" : "s"} paused`;
    disabledSitesList.innerHTML = "";

    if (list.length === 0) {
      const emptyLi = document.createElement("li");
      emptyLi.className = "empty-list-item";
      emptyLi.textContent = "No sites currently disabled.";
      disabledSitesList.appendChild(emptyLi);
      return;
    }

    list.forEach((domain) => {
      const li = document.createElement("li");
      li.className = "disabled-item";

      const span = document.createElement("span");
      span.textContent = domain;

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn-remove-site";
      removeBtn.innerHTML = "&times;";
      removeBtn.title = `Enable on ${domain}`;
      removeBtn.addEventListener("click", () => {
        currentSettings.disabledDomains = currentSettings.disabledDomains.filter((d) => d !== domain);
        saveSettings(() => {
          renderUI();
        });
      });

      li.appendChild(span);
      li.appendChild(removeBtn);
      disabledSitesList.appendChild(li);
    });
  }

  // Event Listeners
  function attachListeners() {
    // Master Global Toggle
    globalToggle.addEventListener("change", () => {
      currentSettings.globalEnabled = globalToggle.checked;
      saveSettings(() => {
        renderUI();
      });
    });

    // Site Toggle
    siteToggle.addEventListener("change", () => {
      if (!currentDomain) return;
      const isEnabledOnSite = siteToggle.checked;
      const list = new Set(currentSettings.disabledDomains || []);

      if (isEnabledOnSite) {
        list.delete(currentDomain);
      } else {
        list.add(currentDomain);
      }

      currentSettings.disabledDomains = Array.from(list);
      saveSettings(() => {
        renderUI();
      });
    });

    // Test Focus Button
    btnTestFocus.addEventListener("click", () => {
      if (!currentTab) return;
      chrome.tabs.sendMessage(currentTab.id, { action: "TRIGGER_FOCUS" }, () => {
        window.close();
      });
    });

    // Shortcut Recorder
    shortcutBtn.addEventListener("click", () => {
      if (isRecordingShortcut) {
        stopRecordingShortcut();
        return;
      }
      startRecordingShortcut();
    });

    btnResetShortcut.addEventListener("click", () => {
      currentSettings.shortcutKey = "/";
      saveSettings(() => {
        stopRecordingShortcut();
        renderUI();
      });
    });

    // Preferences
    prefAutoSelect.addEventListener("change", () => {
      currentSettings.autoSelect = prefAutoSelect.checked;
      saveSettings();
    });

    prefSmoothScroll.addEventListener("change", () => {
      currentSettings.smoothScroll = prefSmoothScroll.checked;
      saveSettings();
    });

    // Accordion for Disabled Sites
    accordionDisabledSites.addEventListener("click", () => {
      const isClosed = disabledSitesListContainer.style.display === "none";
      disabledSitesListContainer.style.display = isClosed ? "block" : "none";
      accordionDisabledSites.classList.toggle("open", isClosed);
    });
  }

  function startRecordingShortcut() {
    isRecordingShortcut = true;
    shortcutBtn.classList.add("recording");
    shortcutDisplay.textContent = "...";
    shortcutHelper.textContent = "Press any single key on your keyboard (e.g. /, s, f, space)...";
    window.addEventListener("keydown", handleShortcutKeyCapture, true);
  }

  function stopRecordingShortcut() {
    isRecordingShortcut = false;
    shortcutBtn.classList.remove("recording");
    shortcutDisplay.textContent = currentSettings.shortcutKey || "/";
    shortcutHelper.textContent = "Click the key above, then press your desired key on your keyboard.";
    window.removeEventListener("keydown", handleShortcutKeyCapture, true);
  }

  function handleShortcutKeyCapture(e) {
    e.preventDefault();
    e.stopPropagation();

    // Ignore standalone modifiers
    if (["Control", "Shift", "Alt", "Meta", "CapsLock", "Tab"].includes(e.key)) {
      return;
    }

    if (e.key === "Escape") {
      stopRecordingShortcut();
      return;
    }

    const recordedKey = e.key === " " ? "Space" : e.key;
    currentSettings.shortcutKey = recordedKey;

    saveSettings(() => {
      stopRecordingShortcut();
      renderUI();
    });
  }

  // Initialization
  async function init() {
    await loadSettings();
    await initTab();
    attachListeners();
    renderUI();
  }

  init();
})();
