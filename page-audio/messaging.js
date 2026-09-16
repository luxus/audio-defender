(() => {
  const PA = AD.pageAudio;
  const MSG = PA.MSG;

  function post(payload) {
    const data = Object.assign({ [MSG]: true, from: "page" }, payload);
    window.postMessage(data, "*");
    try {
      window.dispatchEvent(new CustomEvent("ad-audio-evt", { detail: data }));
    } catch (err) {}
  }

  function notifyMeter() {
    const meter = PA.processor ? PA.processor.getMeter() : { rms: 0, rmsDb: -100, loudDb: -100, grDb: 0, bands: [0, 0, 0] };
    post({
      type: "meter",
      rms: meter.rms,
      rmsDb: meter.rmsDb,
      loudDb: meter.loudDb,
      grDb: meter.grDb,
      bands: meter.bands,
      conflict: Boolean(PA.processor && PA.processor.conflict),
      tainted: Boolean(PA.processor && PA.processor.tainted),
      captured: Boolean(PA.processor && PA.processor.captured),
      ctxState: PA.processor && PA.processor.ctx ? PA.processor.ctx.state : "none"
    });
  }

  function applyFromExt(payload) {
    PA.enabled = Boolean(payload.state && payload.state.enabled);
    PA.armed = true;
    PA.pending = { state: payload.state, settings: payload.settings };
    if (!PA.enabled) {
      const engine = PA.processor;
      if (engine && PA.currentEl) engine.bypass(engine.graphFor(PA.currentEl));
      PA.stopAgc();
      notifyMeter();
      return;
    }
    PA.scan();
  }

  function onCommand(data) {
    if (!data || data.from !== "ext") return;
    if (data.type === "apply") applyFromExt(data);
  }

  function installMessaging() {
    window.addEventListener("message", (event) => {
      if (event.source !== window || !event.data || !event.data[MSG]) return;
      onCommand(event.data);
    });
    window.addEventListener(PA.CMD, (event) => {
      onCommand(event.detail);
    });
  }

  PA.post = post;
  PA.notifyMeter = notifyMeter;
  PA.applyFromExt = applyFromExt;
  PA.onCommand = onCommand;
  PA.installMessaging = installMessaging;
})();
