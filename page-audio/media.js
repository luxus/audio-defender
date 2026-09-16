(() => {
  const PA = AD.pageAudio;
  PA.PREFERRED_MEDIA =
    "video.html5-main-video, video.video-stream, .html5-video-player video, [data-a-target='video-player'] video, .video-player video";

  PA.AudioProcessor.prototype.pickMedia = function () {
    let best = null;
    let score = -1;
    document.querySelectorAll("video, audio").forEach((el) => {
      if (!el.isConnected) return;
      const rect = el.getBoundingClientRect();
      let s = Math.max(0, rect.width) * Math.max(0, rect.height);
      if (s <= 0 && el.tagName === "AUDIO") s = 80;
      else if (s <= 0) s = el.matches(PA.PREFERRED_MEDIA) ? 10 : 1;
      if (el.muted) s *= 0.1;
      if (el.paused) s *= 0.5;
      if (el.readyState < 2) s *= 0.25;
      if (el.matches("video.html5-main-video, video.video-stream")) s *= 5;
      else if (el.matches(PA.PREFERRED_MEDIA)) s *= 3;
      if (el === PA.currentEl && this.graphFor(el)) s *= 1.05;
      if (s > score) {
        score = s;
        best = el;
      }
    });
    return best;
  };

  PA.AudioProcessor.prototype.liveGraph = function (element) {
    if (!element || !element.isConnected) return null;
    return this.graphFor(element) || null;
  };

  PA.AudioProcessor.prototype.attachBest = function () {
    this.resume();
    const el = this.pickMedia();
    if (!el) {
      if (PA.currentEl && !PA.currentEl.isConnected) {
        this.bypass(this.graphFor(PA.currentEl));
        PA.currentEl = null;
      }
      return this.liveGraph(PA.currentEl);
    }
    if (PA.currentEl === el) {
      const graph = this.liveGraph(el);
      if (graph) return graph;
    }
    this.tainted = false;
    if (PA.currentEl && PA.currentEl !== el) {
      this.bypass(this.graphFor(PA.currentEl));
    }
    let graph = this.graphFor(el);
    if (!graph) {
      if (PA.attached.has(el)) {
        this.conflict = true;
        return null;
      }
      try {
        graph = this.makeGraph(el);
        this.conflict = false;
      } catch (err) {
        PA.attached.add(el);
        if (err && err.name === "InvalidStateError") this.conflict = true;
        return null;
      }
    }
    PA.currentEl = el;
    this.captured = true;
    this.conflict = false;
    return graph;
  };
})();
