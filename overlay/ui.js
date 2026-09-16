(() => {
  const ov = AD.overlay;

  function placeButton() {
    const slot = ov.findSlot();
    const existing = document.getElementById(ov.BUTTON_ID);
    if (!slot) {
      if (existing && (ov.isXHost() || existing.classList.contains("ad-fallback-btn"))) {
        existing.remove();
        closePanel();
      }
      return null;
    }
    const fs = ov.fullscreenRoot();
    const outsideFullscreen = Boolean(existing && fs && !fs.contains(existing));
    if (existing && ov.isInSlot(existing, slot) && !outsideFullscreen) return existing;
    const button = existing || makeButton();
    ov.applySlot(button, slot);
    return button;
  }

  function svgEl(name, attrs) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.keys(attrs).forEach((key) => el.setAttribute(key, attrs[key]));
    return el;
  }

  function makeButton() {
    const existing = document.getElementById(ov.BUTTON_ID);
    if (existing) existing.remove();
    const button = document.createElement("button");
    button.id = ov.BUTTON_ID;
    button.type = "button";
    const onYouTube = /youtube\.com|youtu\.be/i.test(location.hostname) || Boolean(document.querySelector(".html5-video-player"));
    button.className = "ad-player-btn" + (onYouTube ? " ytp-button" : "");
    button.setAttribute("aria-label", "Audio Defender");
    button.title = "Audio Defender";

    const inner = document.createElement("span");
    inner.className = "ad-player-btn-inner";
    const svg = svgEl("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" });
    svg.append(
      svgEl("path", { d: "M12 2.1 4.2 5.2v6.2c0 5 3.3 9.8 7.8 11.1 4.5-1.3 7.8-6.1 7.8-11.1V5.2L12 2.1z" }),
      svgEl("rect", { class: "ad-bar", "data-bar": "0", x: "8.2", y: "13", width: "1.8", height: "3.2", rx: "0.4" }),
      svgEl("rect", { class: "ad-bar", "data-bar": "1", x: "11.1", y: "10.4", width: "1.8", height: "5.8", rx: "0.4" }),
      svgEl("rect", { class: "ad-bar", "data-bar": "2", x: "14", y: "11.6", width: "1.8", height: "4.6", rx: "0.4" })
    );
    inner.append(svg);
    button.append(inner);

    let lastToggle = 0;
    function onToggle(event) {
      event.stopPropagation();
      event.preventDefault();
      const now = Date.now();
      if (now - lastToggle < 300) return;
      lastToggle = now;
      togglePanel();
    }
    button.addEventListener("pointerup", onToggle, true);
    button.addEventListener("click", onToggle, true);
    button.addEventListener("pointerdown", (event) => event.stopPropagation(), true);
    button.addEventListener("mousedown", (event) => event.stopPropagation(), true);
    button.addEventListener("dblclick", (event) => event.stopPropagation(), true);
    return button;
  }

  function fillPanel(wrap) {
    wrap.replaceChildren();
    if (!ov.popupDoc) return;
    [...ov.popupDoc.body.children].forEach((el) => {
      if (el.tagName === "SCRIPT") return;
      wrap.appendChild(document.importNode(el, true));
    });
  }

  function ensurePanel() {
    if (!ov.ready || !ov.popupDoc) return null;
    let host = document.getElementById(ov.PANEL_ID);
    const root = ov.playerRoot() || document.documentElement;
    if (host && !host.isConnected) host = null;
    if (!host) {
      host = document.createElement("div");
      host.id = ov.PANEL_ID;
      root.append(host);
      const shadow = host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = ov.cssText + overlayExtraCss();
      const dismiss = document.createElement("div");
      dismiss.className = "ad-dismiss";
      dismiss.addEventListener("pointerdown", closeFromDismiss, true);
      dismiss.addEventListener("click", closeFromDismiss, true);
      const wrap = document.createElement("div");
      wrap.className = "ad-root";
      fillPanel(wrap);
      wrap.addEventListener("pointerdown", (event) => event.stopPropagation());
      wrap.addEventListener("click", (event) => event.stopPropagation());
      shadow.append(style, dismiss, wrap);
      if (ov.bound) ov.bound.destroy();
      ov.bound = AD.bindPanel(wrap, ov.engineOptions());
    } else if (host.parentElement !== root) {
      root.append(host);
    }
    return host;
  }

  function overlayExtraCss() {
    return `
      :host {
        display: none;
        pointer-events: none;
      }
      :host(.open) {
        display: block;
        pointer-events: auto;
      }
      .ad-dismiss {
        position: absolute;
        inset: 0;
        z-index: 0;
        background: transparent;
        pointer-events: auto;
        cursor: default;
      }
      .ad-root {
        pointer-events: auto;
        position: absolute;
        z-index: 1;
        left: 12px;
        bottom: 52px;
        width: 280px;
        max-height: calc(100% - 60px);
        overflow: auto;
        padding: 10px 12px;
        border-radius: 8px;
        box-shadow: 0 6px 24px rgba(0,0,0,.45);
        background: var(--bg);
        color: var(--text);
        font-size: 11px;
      }
      .ad-root .header {
        position: sticky;
        top: 0;
        z-index: 3;
        background: var(--bg);
      }
      .ad-root.disabled .block,
      .ad-root.disabled .save-row {
        opacity: .45;
        pointer-events: none;
      }
    `;
  }

  function closePanel() {
    ov.open = false;
    document.getElementById(ov.PANEL_ID)?.classList.remove("open");
  }

  function closeFromDismiss(event) {
    event.preventDefault();
    event.stopPropagation();
    closePanel();
  }

  async function togglePanel() {
    await ov.loadAssets();
    const host = ensurePanel();
    if (!host) return;
    ov.open = !ov.open;
    host.classList.toggle("open", ov.open);
    if (ov.open && ov.bound) ov.bound.refreshChannel();
  }

  function injectButtonCss() {
    if (document.getElementById("audio-defender-btn-css")) return;
    const style = document.createElement("style");
    style.id = "audio-defender-btn-css";
    style.textContent = `
      #audio-defender-player-btn {
        display: inline-flex !important;
        align-items: center;
        justify-content: center;
        box-sizing: border-box !important;
        position: relative !important;
        z-index: 60 !important;
        pointer-events: auto !important;
        width: 30px !important;
        height: 30px !important;
        min-width: 30px !important;
        max-width: 30px !important;
        min-height: 30px !important;
        padding: 0 !important;
        margin: 0 4px !important;
        border: 0 !important;
        border-radius: 4px !important;
        background: transparent !important;
        color: #fff !important;
        cursor: pointer !important;
        flex: 0 0 30px !important;
        line-height: 0 !important;
        opacity: .9;
        overflow: hidden;
      }
      #audio-defender-player-btn svg {
        width: 18px !important;
        height: 18px !important;
        display: block;
        fill: currentColor;
      }
      #audio-defender-player-btn .ad-bar {
        fill: #111;
      }
      #audio-defender-player-btn:hover { opacity: 1; }
      #audio-defender-player-btn.ad-fallback-btn {
        position: absolute;
        left: 8px;
        bottom: 48px;
        z-index: 2147483000;
        filter: drop-shadow(0 1px 2px rgba(0,0,0,.6));
      }
      :fullscreen #audio-defender-player-btn,
      :-webkit-full-screen #audio-defender-player-btn,
      .video-player--fullscreen #audio-defender-player-btn,
      .ytp-fullscreen #audio-defender-player-btn {
        display: inline-flex !important;
        pointer-events: auto !important;
        opacity: .95;
        overflow: visible !important;
      }
      #audio-defender-player-panel {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }
    `;
    document.documentElement.append(style);
  }

  function updateBars() {
    const button = document.getElementById(ov.BUTTON_ID);
    if (!button || !AD.engine) return;
    const meter = AD.engine.getMeter();
    const bands = meter.bands || [0, 0, 0];
    const rects = button.querySelectorAll(".ad-bar");
    const bases = [3.2, 5.8, 4.6];
    const ys = [13, 10.4, 11.6];
    rects.forEach((rect, i) => {
      const h = 1.6 + bases[i] * Math.max(0.12, bands[i] || 0);
      rect.setAttribute("height", h.toFixed(2));
      rect.setAttribute("y", (ys[i] + bases[i] - h + 1.6).toFixed(2));
    });
  }

  ov.placeButton = placeButton;
  ov.makeButton = makeButton;
  ov.ensurePanel = ensurePanel;
  ov.closePanel = closePanel;
  ov.togglePanel = togglePanel;
  ov.injectButtonCss = injectButtonCss;
  ov.updateBars = updateBars;
})();
