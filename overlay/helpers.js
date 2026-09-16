(() => {
  const ov = AD.overlay;

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
    return [...scope.querySelectorAll("button, [role='button']")].filter((el) => el.id !== ov.BUTTON_ID);
  }

  function looksLikeHideableBar(node) {
    if (!node || node.id === ov.BUTTON_ID) return false;
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
      if (!node || node.closest("#" + ov.BUTTON_ID) || isLonelyMute(node)) continue;
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

  ov.isXHost = isXHost;
  ov.fullscreenRoot = fullscreenRoot;
  ov.playerFrom = playerFrom;
  ov.activePlayer = activePlayer;
  ov.playerRoot = playerRoot;
  ov.findSlot = findSlot;
  ov.isInSlot = isInSlot;
  ov.applySlot = applySlot;
})();
