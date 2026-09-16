(() => {
  const PA = AD.pageAudio;

  function scan() {
    if (!PA.armed || !PA.enabled || !PA.pending) return;
    const engine = PA.getProcessor();
    if (!engine) return;
    engine.apply(PA.pending.state, PA.pending.settings);
    PA.notifyMeter();
  }

  function onMediaEvent(event) {
    if (!(event.target instanceof HTMLMediaElement) || !PA.armed || !PA.enabled) return;
    scan();
    if (PA.processor) PA.processor.resume();
  }

  function unlock() {
    if (PA.processor) PA.processor.resume();
    if (PA.armed && PA.enabled) scan();
  }

  function installSpaHooks() {
    document.addEventListener("play", onMediaEvent, true);
    document.addEventListener("playing", onMediaEvent, true);
    document.addEventListener("loadeddata", onMediaEvent, true);
    document.addEventListener("pointerdown", unlock, true);
    document.addEventListener("keydown", unlock, true);

    const observer = new MutationObserver(() => {
      if (PA.armed && PA.enabled && (!PA.processor || !PA.processor.captured || (PA.currentEl && !PA.currentEl.isConnected))) scan();
    });
    if (document.documentElement) {
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    setInterval(() => {
      if (PA.armed && PA.enabled && (!PA.processor || !PA.processor.captured || (PA.currentEl && !PA.currentEl.isConnected))) scan();
      PA.notifyMeter();
    }, 90);
  }

  PA.scan = scan;
  PA.installSpaHooks = installSpaHooks;
})();
