(() => {
  if (window.__AD_OVERLAY__) return;
  window.__AD_OVERLAY__ = true;
  const ov = AD.overlay;

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && ov.open) ov.closePanel();
  });

  async function tick() {
    try {
      const hasVideo = [...document.querySelectorAll("video, audio")].some((el) => el.clientWidth >= 160 || !el.paused);
      if (
        !hasVideo &&
        !ov.fullscreenRoot() &&
        !document.querySelector(".html5-video-player, .video-player, [data-testid='videoPlayer'], [data-testid='videoComponent']")
      ) {
        return;
      }
      await ov.loadAssets();
      ov.injectButtonCss();
      ov.placeButton();
      const root = ov.playerRoot();
      if (root && getComputedStyle(root).position === "static") {
        root.style.position = "relative";
      }
      if (ov.open) ov.ensurePanel();
      if (ov.open && ov.bound) ov.bound.refreshChannel();
      ov.updateBars();
    } catch (err) {}
  }

  function scheduleTick() {
    clearTimeout(ov.tickTimer);
    ov.tickTimer = setTimeout(() => {
      tick().catch(() => {});
    }, 50);
  }

  ov.loadAssets().then(tick).catch(() => {});
  setInterval(tick, 800);
  setInterval(() => {
    if (ov.bound && ov.open) ov.bound.refreshChannel();
  }, 200);
  window.addEventListener("popstate", scheduleTick);
  document.addEventListener("fullscreenchange", scheduleTick);
  document.addEventListener("webkitfullscreenchange", scheduleTick);
  document.addEventListener(
    "pointerover",
    (event) => {
      if (!ov.isXHost()) return;
      const t = event.target;
      if (t && t.closest && t.closest('[data-testid="videoPlayer"], [data-testid="videoComponent"]')) {
        scheduleTick();
      }
    },
    true
  );
  const observer = new MutationObserver(() => {
    const button = document.getElementById(ov.BUTTON_ID);
    if (!button || !button.isConnected || ov.isXHost() || ov.fullscreenRoot()) scheduleTick();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
