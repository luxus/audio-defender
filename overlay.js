(() => {
  if (window.__AD_OVERLAY__) return;
  window.__AD_OVERLAY__ = true;
  const BUTTON_ID = "audio-defender-player-btn";
  const PANEL_ID = "audio-defender-player-panel";
  let bound = null;
  let open = false;
  let cssText = "";
  let popupDoc = null;
  let ready = false;

  const AFTER_SELECTORS = [
    '[data-a-target="player-volume-slider"]',
    ".ytp-volume-panel",
    '[data-a-target="player-mute-unmute-button"]',
    ".ytp-mute-button",
    'button[aria-label="Mute"]',
    'button[aria-label="Unmute"]',
    'button[aria-label="Mute video"]',
    'button[aria-label="Unmute video"]',
    'button[aria-label^="Volume"]',
    'button[aria-label*="volume" i]',
    'button[aria-label*="Mute" i]'
  ];

  const INTO_SELECTORS = [
    ".ytp-left-controls",
    '[data-a-target="player-controls"] .player-controls__left-control-group',
    '[data-a-target="player-controls"]',
    ".ytp-right-controls",
    '[data-testid="videoPlayer"] [role="group"]'
  ];

  const PLAYER_ROOT_SELECTORS = [
    "#movie_player",
    ".html5-video-player",
    ".video-player__container",
    ".video-player",
    '[data-a-target="video-player"]',
    '[data-testid="videoPlayer"]',
    '[data-testid="videoComponent"]',
    ".player-overlay-background",
    '[class*="video-player"]'
  ];

  const PLAYER_CLOSEST = PLAYER_ROOT_SELECTORS.join(", ");
  const FS_LABEL = /full[\s-]*screen|fullscreen|vollbild|plein[\s-]*écran|pantalla completa|全画面|전체 ?화면/i;
  const PLAY_LABEL = /play|pause|wiedergabe|lecture|reproducción/i;
  const MUTE_LABEL = /mute|unmute|volume|stumm|son/i;

  async function loadAssets() {
    if (ready) return;
    const [cssRes, htmlRes] = await Promise.all([
      fetch(chrome.runtime.getURL("popup.css")),
      fetch(chrome.runtime.getURL("popup.html"))
    ]);
    cssText = await cssRes.text();
    popupDoc = new DOMParser().parseFromString(await htmlRes.text(), "text/html");
    ready = true;
  }

  function isXHost() {
    return /(^|\.)(x\.com|twitter\.com)$/i.test(location.hostname);
  }

  function fullscreenRoot() {
    return (
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.querySelector(".video-player--fullscreen, .html5-video-player.ytp-fullscreen") ||
      null
    );
  }

  function playerFrom(node) {
    if (!node) return null;
    if (node.nodeType !== 1) return node.parentElement && playerFrom(node.parentElement);
    if (node.matches && node.matches(PLAYER_CLOSEST)) return node;
    return node.closest ? node.closest(PLAYER_CLOSEST) : null;
  }

  function videoScore(video) {
    const rect = video.getBoundingClientRect();
    const w = Math.max(video.clientWidth || 0, rect.width || 0);
    const h = Math.max(video.clientHeight || 0, rect.height || 0);
    let s = w * h;
    if (!video.paused) s += 1e9;
    if (video.muted) s *= 0.85;
    return s;
  }

  function activePlayer() {
    const fs = fullscreenRoot();
    if (fs) {
      if (fs.tagName === "VIDEO") return playerFrom(fs) || fs.parentElement || fs;
      return playerFrom(fs) || fs.querySelector(PLAYER_CLOSEST) || fs;
    }
    const videos = [...document.querySelectorAll("video")].filter((el) => el.isConnected);
    videos.sort((a, b) => videoScore(b) - videoScore(a));
    const video = videos[0];
    if (video) return playerFrom(video) || video.parentElement;
    for (const selector of PLAYER_ROOT_SELECTORS) {
      const node = document.querySelector(selector);
      if (node) return node;
    }
    return null;
  }

  function playerRoot() {
    return activePlayer();
  }

  function buttonLabel(node) {
    return (
      (node.getAttribute && (node.getAttribute("aria-label") || node.getAttribute("title"))) ||
      ""
    );
  }

  function controlButtons(scope) {
    return [...scope.querySelectorAll("button, [role='button']")].filter((el) => el.id !== BUTTON_ID);
  }

  function looksLikeHideableBar(node) {
    if (!node || node.id === BUTTON_ID) return false;
    const player = playerFrom(node);
    if (player && node === player) return false;
    const labels = controlButtons(node).map(buttonLabel).join(" ");
    if (controlButtons(node).length < 2) return false;
    return FS_LABEL.test(labels) || PLAY_LABEL.test(labels);
  }

  function isLonelyMute(node) {
    if (!MUTE_LABEL.test(buttonLabel(node))) return false;
    const bar = node.parentElement;
    if (!bar) return true;
    return !looksLikeHideableBar(bar);
  }

  function findFullscreenButton(scope) {
    return controlButtons(scope).find((el) => FS_LABEL.test(buttonLabel(el))) || null;
  }

  function slotFromNode(place, node, fallback) {
    if (!node) return null;
    return { place: place, node: node, fallback: Boolean(fallback) };
  }

  function xControlSlot(scope) {
    const fsBtn = findFullscreenButton(scope);
    if (fsBtn && fsBtn.parentElement && fsBtn.parentElement !== scope) {
      return slotFromNode("before", fsBtn);
    }
    const bars = [...scope.querySelectorAll("div, nav, [role='group']")].filter(looksLikeHideableBar);
    const bar = bars.sort((a, b) => controlButtons(a).length - controlButtons(b).length)[0];
    if (bar) return slotFromNode("append", bar);
    return null;
  }

  function hasPlayControl(node) {
    if (!node || !node.querySelector) return false;
    return Boolean(
      node.querySelector(
        '[data-a-target="player-play-pause-button"], .ytp-play-button, button[aria-label="Play"], button[aria-label="Pause"]'
      )
    );
  }

  function volumeWidget(scope) {
    const ytpPanel = scope.querySelector(".ytp-volume-panel");
    const ytpMute = scope.querySelector(".ytp-mute-button");
    if (ytpPanel) {
      const wrap = ytpMute && ytpPanel.parentElement && ytpPanel.parentElement.contains(ytpMute)
        ? ytpPanel.parentElement
        : ytpPanel;
      return hasPlayControl(wrap) ? ytpPanel : wrap;
    }
    const slider = scope.querySelector('[data-a-target="player-volume-slider"]');
    const mute = scope.querySelector('[data-a-target="player-mute-unmute-button"]');
    if (slider && mute) {
      let best = slider;
      let node = slider.parentElement;
      while (node && node !== scope) {
        if (!node.contains(mute)) break;
        if (hasPlayControl(node)) break;
        best = node;
        node = node.parentElement;
      }
      return best;
    }
    return slider || null;
  }

  function genericSlot(scope) {
    const vol = volumeWidget(scope);
    if (vol) return slotFromNode("after", vol);
    for (const selector of AFTER_SELECTORS) {
      const node = scope.querySelector(selector);
      if (!node || node.closest("#" + BUTTON_ID) || isLonelyMute(node)) continue;
      return slotFromNode("after", node);
    }
    for (const selector of INTO_SELECTORS) {
      const node = scope.querySelector(selector);
      if (!node) continue;
      return slotFromNode("append", node);
    }
    return null;
  }

  function findSlot() {
    const player = activePlayer();
    const scope = player || document;
    if (isXHost()) return xControlSlot(scope);
    const generic = genericSlot(scope);
    if (generic) return generic;
    if (!player) return null;
    return slotFromNode("append", player, true);
  }

  function isInSlot(button, slot) {
    if (!button || !slot || !button.isConnected) return false;
    if (slot.place === "before") return button.nextElementSibling === slot.node && button.parentNode === slot.node.parentNode;
    if (slot.place === "after") return button.previousElementSibling === slot.node;
    return button.parentNode === slot.node;
  }

  function applySlot(button, slot) {
    if (slot.place === "before") slot.node.parentNode.insertBefore(button, slot.node);
    else if (slot.place === "after") slot.node.insertAdjacentElement("afterend", button);
    else slot.node.append(button);
    button.classList.toggle("ad-fallback-btn", Boolean(slot.fallback));
  }

  function placeButton() {
    const slot = findSlot();
    const existing = document.getElementById(BUTTON_ID);
    if (!slot) {
      if (existing && (isXHost() || existing.classList.contains("ad-fallback-btn"))) {
        existing.remove();
        closePanel();
      }
      return null;
    }
    const fs = fullscreenRoot();
    const outsideFullscreen = Boolean(existing && fs && !fs.contains(existing));
    if (existing && isInSlot(existing, slot) && !outsideFullscreen) return existing;
    const button = existing || makeButton();
    applySlot(button, slot);
    return button;
  }

  function svgEl(name, attrs) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.keys(attrs).forEach((key) => el.setAttribute(key, attrs[key]));
    return el;
  }

  function makeButton() {
    const existing = document.getElementById(BUTTON_ID);
    if (existing) existing.remove();
    const button = document.createElement("button");
    button.id = BUTTON_ID;
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
    if (!popupDoc) return;
    [...popupDoc.body.children].forEach((el) => {
      if (el.tagName === "SCRIPT") return;
      wrap.appendChild(document.importNode(el, true));
    });
  }

  function ensurePanel() {
    if (!ready || !popupDoc) return null;
    let host = document.getElementById(PANEL_ID);
    const root = playerRoot() || document.documentElement;
    if (host && !host.isConnected) host = null;
    if (!host) {
      host = document.createElement("div");
      host.id = PANEL_ID;
      root.append(host);
      const shadow = host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = cssText + overlayExtraCss();
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
      if (bound) bound.destroy();
      bound = AD.bindPanel(wrap, {
        mode: "overlay",
        getMeter: function () {
          return AD.engine ? AD.engine.getMeter() : { rms: 0, bands: [0, 0, 0] };
        },
        getStatus: function () {
          return AD.engine ? AD.engine.getStatus() : { conflict: false };
        },
        getChannel: function () {
          return AD.engine ? AD.engine.getChannel() : AD.parseChannel(location.href, document);
        }
      });
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
    open = false;
    document.getElementById(PANEL_ID)?.classList.remove("open");
  }

  function closeFromDismiss(event) {
    event.preventDefault();
    event.stopPropagation();
    closePanel();
  }

  async function togglePanel() {
    await loadAssets();
    const host = ensurePanel();
    if (!host) return;
    open = !open;
    host.classList.toggle("open", open);
    if (open && bound) bound.refreshChannel();
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
    const button = document.getElementById(BUTTON_ID);
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

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && open) closePanel();
  });

  async function tick() {
    try {
      const hasVideo = [...document.querySelectorAll("video, audio")].some((el) => el.clientWidth >= 160 || !el.paused);
      if (
        !hasVideo &&
        !fullscreenRoot() &&
        !document.querySelector(".html5-video-player, .video-player, [data-testid='videoPlayer'], [data-testid='videoComponent']")
      ) {
        return;
      }
      await loadAssets();
      injectButtonCss();
      placeButton();
      const root = playerRoot();
      if (root && getComputedStyle(root).position === "static") {
        root.style.position = "relative";
      }
      if (open) ensurePanel();
      if (bound) bound.refreshChannel();
      updateBars();
    } catch (err) {}
  }

  let tickTimer = 0;
  function scheduleTick() {
    clearTimeout(tickTimer);
    tickTimer = setTimeout(() => {
      tick().catch(() => {});
    }, 50);
  }

  loadAssets().then(tick).catch(() => {});
  setInterval(tick, 800);
  setInterval(() => {
    if (bound) bound.refreshChannel();
  }, 200);
  window.addEventListener("popstate", scheduleTick);
  document.addEventListener("fullscreenchange", scheduleTick);
  document.addEventListener("webkitfullscreenchange", scheduleTick);
  document.addEventListener(
    "pointerover",
    (event) => {
      if (!isXHost()) return;
      const t = event.target;
      if (t && t.closest && t.closest('[data-testid="videoPlayer"], [data-testid="videoComponent"]')) {
        scheduleTick();
      }
    },
    true
  );
  const observer = new MutationObserver(() => {
    const button = document.getElementById(BUTTON_ID);
    if (!button || !button.isConnected || isXHost() || fullscreenRoot()) scheduleTick();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
