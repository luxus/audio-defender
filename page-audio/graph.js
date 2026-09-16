var AD = AD || {};
AD.pageAudio = AD.pageAudio || {};

(() => {
  const PA = AD.pageAudio;
  PA.MSG = PA.MSG || "__audioDefender";
  PA.CMD = PA.CMD || "ad-audio-cmd";
  PA.EQ_FREQS = PA.EQ_FREQS || [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  if (!PA.attached) PA.attached = new WeakSet();
  if (!PA.graphs) PA.graphs = new WeakMap();
  if (PA.enabled === undefined) PA.enabled = true;
  if (PA.armed === undefined) PA.armed = false;
  if (PA.pending === undefined) PA.pending = null;
  if (PA.currentEl === undefined) PA.currentEl = null;
  if (PA.processor === undefined) PA.processor = null;
  PA.agcTimer = PA.agcTimer || 0;
  PA.kHistory = PA.kHistory || [];
  PA.loudHistory = PA.loudHistory || [];

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
      return PA.graphs.get(element);
    }

    makeGraph(element) {
      const ctx = this.ctx;
      const source = ctx.createMediaElementSource(element);
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
      const eq = PA.EQ_FREQS.map((freq, index) => {
        const filter = ctx.createBiquadFilter();
        filter.type = index === 0 ? "lowshelf" : index === PA.EQ_FREQS.length - 1 ? "highshelf" : "peaking";
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
      PA.graphs.set(element, graph);
      PA.attached.add(element);
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
      if (!this.captured || !PA.currentEl) return empty;
      const graph = this.graphFor(PA.currentEl);
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
        loudDb: this.kWeightedDb(graph, PA.loudHistory, 8),
        grDb,
        bands: [0, 0, 0]
      };
    }
  }

  function startAgc(graph, c) {
    stopAgc();
    PA.agcTimer = setInterval(() => {
      if (!PA.processor || !graph) return;
      const loud = PA.processor.kWeightedDb(graph, PA.kHistory, 6);
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
      graph.preGain.gain.setTargetAtTime(Math.pow(10, next / 20), PA.processor.ctx.currentTime, 0.5);
    }, 500);
  }

  function stopAgc() {
    if (PA.agcTimer) {
      clearInterval(PA.agcTimer);
      PA.agcTimer = 0;
    }
    PA.kHistory = [];
  }

  PA.makeupGain = makeupGain;
  PA.clipCurve = clipCurve;
  PA.AudioProcessor = AudioProcessor;
  PA.startAgc = startAgc;
  PA.stopAgc = stopAgc;
})();
