(() => {
  if (window.__AD_AUDIO_PAGE__) return;
  window.__AD_AUDIO_PAGE__ = true;
  const MSG = "__audioDefender";
  const CMD = "ad-audio-cmd";
  const EQ_FREQS = [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  const attached = new WeakSet();
  const graphs = new WeakMap();
  const PREFERRED_MEDIA =
    "video.html5-main-video, video.video-stream, .html5-video-player video, [data-a-target='video-player'] video, .video-player video";
  let processor = null;
  let enabled = true;
  let armed = false;
  let pending = null;
  let currentEl = null;
  let agcTimer = 0;
  let kHistory = [];
  let loudHistory = [];

  function makeupGain(thr, ratio) {
    const outDb = thr * (1 - 1 / Math.max(1, ratio));
    const lin = Math.pow(10, outDb / 20);
    return Math.pow(1 / Math.max(1e-6, lin), 0.6);
  }

  function clipCurve() {
    const n = 2048;
    const curve = new Float32Array(n);
    const knee = 0.5;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      const a = Math.abs(x);
      curve[i] = a <= knee ? x : Math.sign(x) * (knee + 0.5 * Math.tanh((a - knee) / 0.5));
    }
    return curve;
  }

  class AudioProcessor {
    constructor() {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
      this.captured = false;
      this.conflict = false;
      this.tainted = false;
      this.engaged = false;
    }

    resume() {
      if (this.ctx.state === "suspended") return this.ctx.resume().catch(() => {});
    }

    graphFor(element) {
      return graphs.get(element);
    }

    makeGraph(element) {
      const ctx = this.ctx;
      const source = ctx.createMediaElementSource(element);
      attached.add(element);
      try {
        return this.buildGraph(ctx, element, source);
      } catch (err) {
        try { source.connect(ctx.destination); } catch (connectErr) {}
        throw err;
      }
    }

    buildGraph(ctx, element, source) {
      const preGain = ctx.createGain();
      const leveler = ctx.createDynamicsCompressor();
      const limiter = ctx.createDynamicsCompressor();
      const postGain = ctx.createGain();
      const softClip = ctx.createWaveShaper();
      softClip.curve = clipCurve();
      softClip.oversample = "4x";
      const outAnalyser = ctx.createAnalyser();
      outAnalyser.fftSize = 2048;
      const monoTail = ctx.createGain();
      const eq = EQ_FREQS.map((freq, index) => {
        const filter = ctx.createBiquadFilter();
        filter.type = index === 0 ? "lowshelf" : index === EQ_FREQS.length - 1 ? "highshelf" : "peaking";
        filter.frequency.value = freq;
        if (filter.type === "peaking") filter.Q.value = 1.41;
        filter.gain.value = 0;
        return filter;
      });
      const kShelf = ctx.createBiquadFilter();
      kShelf.type = "highshelf";
      kShelf.frequency.value = 1681.97;
      kShelf.gain.value = 3.99984;
      const kHp = ctx.createBiquadFilter();
      kHp.type = "highpass";
      kHp.frequency.value = 38.135;
      kHp.Q.value = 0.5003;
      const kAnalyser = ctx.createAnalyser();
      kAnalyser.fftSize = 2048;

      preGain.connect(eq[0]);
      for (let i = 0; i < eq.length - 1; i++) eq[i].connect(eq[i + 1]);
      eq[eq.length - 1].connect(leveler);
      leveler.connect(limiter);
      limiter.connect(postGain);
      postGain.connect(softClip);
      softClip.connect(outAnalyser);
      outAnalyser.connect(monoTail);
      monoTail.connect(ctx.destination);
      preGain.connect(kShelf);
      kShelf.connect(kHp);
      kHp.connect(kAnalyser);

      const graph = {
        source, preGain, leveler, limiter, postGain, softClip, outAnalyser, monoTail, eq, kShelf, kHp, kAnalyser,
        td: new Float32Array(outAnalyser.fftSize),
        ktd: new Float32Array(kAnalyser.fftSize)
      };
      graphs.set(element, graph);
      source.connect(preGain);
      this.engaged = true;
      return graph;
    }

    bypass(graph) {
      if (!graph) return;
      try { graph.source.disconnect(); } catch (err) {}
      try { graph.source.connect(this.ctx.destination); } catch (err) {}
      this.engaged = false;
    }

    engage(graph) {
      if (!graph) return;
      try { graph.source.disconnect(); } catch (err) {}
      try { graph.source.connect(graph.preGain); } catch (err) {}
      this.engaged = true;
    }

    pickMedia() {
      let best = null;
      let score = -1;
      document.querySelectorAll("video, audio").forEach((el) => {
        if (!el.isConnected) return;
        const rect = el.getBoundingClientRect();
        let s = Math.max(0, rect.width) * Math.max(0, rect.height);
        if (s <= 0 && el.tagName === "AUDIO") s = 80;
        else if (s <= 0) s = el.matches(PREFERRED_MEDIA) ? 10 : 1;
        if (el.muted) s *= 0.1;
        if (el.paused) s *= 0.5;
        if (el.readyState < 2) s *= 0.25;
        if (el.matches("video.html5-main-video, video.video-stream")) s *= 5;
        else if (el.matches(PREFERRED_MEDIA)) s *= 3;
        if (el === currentEl && this.graphFor(el)) s *= 1.05;
        if (s > score) {
          score = s;
          best = el;
        }
      });
      return best;
    }

    liveGraph(element) {
      if (!element || !element.isConnected) return null;
      return this.graphFor(element) || null;
    }

    attachBest() {
      this.resume();
      const el = this.pickMedia();
      if (!el) {
        if (currentEl && !currentEl.isConnected) {
          this.bypass(this.graphFor(currentEl));
          currentEl = null;
        }
        return this.liveGraph(currentEl);
      }
      if (currentEl === el) {
        const graph = this.liveGraph(el);
        if (graph) return graph;
      }
      this.tainted = false;
      if (currentEl && currentEl !== el) {
        this.bypass(this.graphFor(currentEl));
      }
      let graph = this.graphFor(el);
      if (!graph) {
        if (attached.has(el)) {
          this.conflict = true;
          return null;
        }
        try {
          graph = this.makeGraph(el);
          this.conflict = false;
        } catch (err) {
          attached.add(el);
          if (err && err.name === "InvalidStateError") this.conflict = true;
          return null;
        }
      }
      currentEl = el;
      this.captured = true;
      this.conflict = false;
      return graph;
    }

    setComp(node, params, passthrough) {
      const now = this.ctx.currentTime;
      const p = passthrough
        ? { thr: 0, knee: 0, ratio: 1, att: 0.003, rel: 0.25 }
        : params;
      node.threshold.setTargetAtTime(p.thr, now, 0.02);
      node.knee.setTargetAtTime(p.knee, now, 0.02);
      node.ratio.setTargetAtTime(p.ratio, now, 0.02);
      node.attack.setTargetAtTime(p.att, now, 0.02);
      node.release.setTargetAtTime(p.rel, now, 0.02);
    }

    apply(state, settings) {
      this.resume();
      const graph = this.attachBest();
      if (!graph) return;
      if (!state.enabled) {
        this.bypass(graph);
        stopAgc();
        return;
      }

      const c = settings.compressor;
      const boost = Math.max(0.25, Math.min(6, settings.boost / 100));
      const compOn = c.enabled !== false;
      const levOn = compOn && c.levelerOn !== false;
      const lev = { thr: c.threshold, knee: c.knee, ratio: c.ratio, att: c.attack, rel: c.release };
      const lim = {
        thr: c.limiterThreshold,
        knee: c.limiterKnee,
        ratio: c.limiterRatio,
        att: c.limiterAttack,
        rel: c.limiterRelease
      };
      if (compOn && boost > 1) {
        lim.thr = Math.max(-100, lim.thr - 20 * Math.log10(boost));
      }

      this.setComp(graph.leveler, lev, !levOn);
      this.setComp(graph.limiter, lim, !compOn);

      const now = this.ctx.currentTime;
      const gains = settings.equalizer.enabled ? settings.equalizer.gains : [];
      graph.eq.forEach((filter, i) => {
        const g = Number.isFinite(gains[i]) ? Math.max(-12, Math.min(12, gains[i])) : 0;
        filter.gain.setTargetAtTime(g, now, 0.03);
      });

      try {
        graph.monoTail.channelInterpretation = "speakers";
        graph.monoTail.channelCountMode = settings.mono ? "explicit" : "max";
        graph.monoTail.channelCount = settings.mono ? 1 : 2;
      } catch (err) {}

      let makeup = 1;
      if (compOn) {
        makeup *= makeupGain(lim.thr, lim.ratio);
        if (levOn) makeup *= makeupGain(lev.thr, lev.ratio);
      }
      makeup = Math.min(64, Math.max(1, makeup));
      const post = Math.min(8, Math.max(0.05, boost / makeup));
      graph.postGain.gain.setTargetAtTime(post, now, 0.05);

      if (!this.engaged) this.engage(graph);

      if (compOn && c.agcOn) {
        startAgc(graph, c);
      } else {
        stopAgc();
        graph.preGain.gain.setTargetAtTime(1, now, 0.5);
      }
    }

    kWeightedDb(graph, history, maxLen) {
      try {
        graph.kAnalyser.getFloatTimeDomainData(graph.ktd);
      } catch (err) {
        return -100;
      }
      let sum = 0;
      for (let i = 0; i < graph.ktd.length; i++) sum += graph.ktd[i] * graph.ktd[i];
      const mean = sum / graph.ktd.length;
      history.push(mean);
      if (history.length > maxLen) history.shift();
      let acc = 0;
      for (let i = 0; i < history.length; i++) acc += history[i];
      const avg = acc / history.length;
      return avg <= 0 ? -100 : 10 * Math.log10(avg) - 0.691;
    }

    getMeter() {
      const empty = { rms: 0, rmsDb: -100, loudDb: -100, grDb: 0, bands: [0, 0, 0] };
      if (!this.captured || !currentEl || !currentEl.isConnected) return empty;
      const graph = this.graphFor(currentEl);
      if (!graph) return empty;
      try {
        graph.outAnalyser.getFloatTimeDomainData(graph.td);
      } catch (err) {
        return empty;
      }
      let sum = 0;
      let peak = 0;
      for (let i = 0; i < graph.td.length; i++) {
        const v = graph.td[i];
        sum += v * v;
        const a = Math.abs(v);
        if (a > peak) peak = a;
      }
      const rms = Math.sqrt(sum / graph.td.length);
      const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -100;
      let grDb = 0;
      try {
        grDb = graph.limiter.reduction + graph.leveler.reduction;
      } catch (err) {}
      return {
        rms: Math.min(1, Math.max(0, (rmsDb + 60) / 60)),
        rmsDb,
        loudDb: this.kWeightedDb(graph, loudHistory, 8),
        grDb,
        bands: [0, 0, 0]
      };
    }
  }

  function startAgc(graph, c) {
    stopAgc();
    agcTimer = setInterval(() => {
      if (!processor || !graph) return;
      const loud = processor.kWeightedDb(graph, kHistory, 6);
      if (loud < -50) return;
      const target = c.agcTarget;
      const maxDb = c.agcMaxDb;
      const delta = target - loud;
      if (Math.abs(delta) < 1.25) return;
      const current = graph.preGain.gain.value || 1;
      const curDb = 20 * Math.log10(Math.max(1e-4, current));
      const wanted = Math.min(maxDb, Math.max(-maxDb, curDb + delta));
      const step = wanted > curDb ? 0.5 : 1.5;
      const next = curDb + Math.min(step, Math.max(-step, 0.5 * (wanted - curDb)));
      graph.preGain.gain.setTargetAtTime(Math.pow(10, next / 20), processor.ctx.currentTime, 0.5);
    }, 500);
  }

  function stopAgc() {
    if (agcTimer) {
      clearInterval(agcTimer);
      agcTimer = 0;
    }
    kHistory = [];
  }

  function getProcessor() {
    if (!processor) {
      try {
        processor = new AudioProcessor();
      } catch (err) {
        return null;
      }
    }
    return processor;
  }

  function post(payload) {
    const data = Object.assign({ [MSG]: true, from: "page" }, payload);
    window.postMessage(data, "*");
    try {
      window.dispatchEvent(new CustomEvent("ad-audio-evt", { detail: data }));
    } catch (err) {}
  }

  function notifyMeter() {
    const meter = processor ? processor.getMeter() : { rms: 0, rmsDb: -100, loudDb: -100, grDb: 0, bands: [0, 0, 0] };
    post({
      type: "meter",
      rms: meter.rms,
      rmsDb: meter.rmsDb,
      loudDb: meter.loudDb,
      grDb: meter.grDb,
      bands: meter.bands,
      conflict: Boolean(processor && processor.conflict),
      tainted: Boolean(processor && processor.tainted),
      captured: Boolean(processor && processor.captured && currentEl && currentEl.isConnected),
      ctxState: processor && processor.ctx ? processor.ctx.state : "none"
    });
  }

  function scan() {
    if (!armed || !enabled || !pending) return;
    const engine = getProcessor();
    if (!engine) return;
    engine.apply(pending.state, pending.settings);
    notifyMeter();
  }

  function applyFromExt(payload) {
    enabled = Boolean(payload.state && payload.state.enabled);
    armed = true;
    pending = { state: payload.state, settings: payload.settings };
    if (!enabled) {
      const engine = processor;
      if (engine && currentEl) engine.bypass(engine.graphFor(currentEl));
      stopAgc();
      notifyMeter();
      return;
    }
    scan();
  }

  function onCommand(data) {
    if (!data || data.from !== "ext") return;
    if (data.type === "apply") applyFromExt(data);
  }
  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || !event.data[MSG]) return;
    onCommand(event.data);
  });
  window.addEventListener(CMD, (event) => {
    onCommand(event.detail);
  });

  function onMediaEvent(event) {
    if (!(event.target instanceof HTMLMediaElement) || !armed || !enabled) return;
    scan();
    if (processor) processor.resume();
  }
  document.addEventListener("play", onMediaEvent, true);
  document.addEventListener("playing", onMediaEvent, true);
  document.addEventListener("loadeddata", onMediaEvent, true);

  function unlock() {
    if (processor) processor.resume();
    if (armed && enabled) scan();
  }
  document.addEventListener("pointerdown", unlock, true);
  document.addEventListener("keydown", unlock, true);

  function mediaChanged() {
    if (!processor || !currentEl || !currentEl.isConnected) return true;
    return processor.pickMedia() !== currentEl;
  }

  const observer = new MutationObserver(() => {
    if (armed && enabled && mediaChanged()) scan();
  });
  if (document.documentElement) {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  setInterval(() => {
    if (armed && enabled && mediaChanged()) scan();
    notifyMeter();
  }, 90);

  post({ type: "ready" });
})();
