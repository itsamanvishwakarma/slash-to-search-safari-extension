(() => {
  "use strict";

  const EDITABLE_SELECTOR =
    'input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"], [role="searchbox"]';

  /**
   * Returns true when the given element is an editable field where the user
   * is likely typing text. We check `contenteditable` both as an attribute
   * (for elements without a `matches` implementation or before upgrade)
   * and via `isContentEditable` (covers inherited contenteditable).
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

    // Skip non-text input types entirely — buttons, checkboxes, etc.
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

    // Strongest signal: native search input.
    if (type === "search") score += 100;

    // role="searchbox" is an explicit ARIA signal.
    if (el.getAttribute("role") === "searchbox") score += 90;

    // Common search-related attributes.
    if (/\bsearch\b/.test(attrs)) score += 80;
    if (/\b(query|find|keyword|keywords|q)\b/.test(attrs)) score += 45;

    // Search-like autocomplete.
    if (el.getAttribute("autocomplete") === "search") score += 60;

    // Prefer inputs over textareas/contenteditable fallbacks.
    if (tag === "INPUT") score += 10;

    // Penalize things that are obviously not page search.
    if (
      /\b(email|password|tel|phone|address|username|user|login|signup|register|credit|card|cvv|ssn|zip|postal)\b/.test(
        attrs
      )
    ) {
      score -= 200;
    }

    // Penalize hidden-by-type inputs that slipped through.
    if (type === "hidden") return -Infinity;

    // Inputs near common search UI containers/labels.
    const parent = el.closest("form, nav, header, [role='search']");
    if (parent) {
      if (parent.getAttribute("role") === "search") score += 70;
      const parentTag = parent.tagName;
      if (parentTag === "NAV" || parentTag === "HEADER") score += 15;
    }

    // Check nearby text for search-related words (limited to avoid perf issues).
    const parentText = (el.parentElement?.textContent || "").slice(0, 200).toLowerCase();
    if (/\bsearch\b/.test(parentText)) score += 20;

    // Prefer elements higher up the page (likely the main search bar).
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

    // Only return if we have some positive signal it's a search field.
    return bestScore > 0 ? best : null;
  }

  function focusSearchField() {
    const field = findSearchField();
    if (!field) return false;

    try {
      field.focus({ preventScroll: false });
    } catch {
      field.focus();
    }

    // Scroll the field into view if it's off-screen.
    if (!isInViewport(field)) {
      field.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    // Select existing text only for a normal text/search input.
    if (
      field instanceof HTMLInputElement ||
      field instanceof HTMLTextAreaElement
    ) {
      try {
        field.select();
      } catch {
        // Some input types (e.g. email in some browsers) throw on select().
      }
    }

    return document.activeElement === field;
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

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "/") return;

      // Keep "/" normal inside text-entry controls and when modified.
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        isEditable(event.target)
      ) {
        return;
      }

      // Ignore if another script already handled the event.
      if (event.defaultPrevented) return;

      if (focusSearchField()) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    true
  );
})();
