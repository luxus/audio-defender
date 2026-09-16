(() => {
  const PA = AD.pageAudio;

  PA.AudioProcessor.prototype.pickMedia = function () {
    const preferred = document.querySelector(
      "video.html5-main-video, video.video-stream, .html5-video-player video, [data-a-target='video-player'] video, .video-player video, video"
    );
    if (preferred && preferred.isConnected) return preferred;
    let best = null;
    let score = 0;
    document.querySelectorAll("video, audio").forEach((el) => {
      if (!el.isConnected) return;
      const rect = el.getBoundingClientRect();
      let s = rect.width * rect.height;
      if (s <= 0 && el.tagName === "AUDIO") s = 80;
      if (s <= 0) return;
      if (el.muted) s *= 0.1;
      if (el.paused) s *= 0.5;
      if (el.readyState < 2) s *= 0.25;
      if (s > score) {
        score = s;
        best = el;
      }
    });
    return best;
  };

  PA.AudioProcessor.prototype.attachBest = function () {
    this.resume();
    if (PA.currentEl && PA.currentEl.isConnected && this.graphFor(PA.currentEl)) {
      return this.graphFor(PA.currentEl);
    }
    const el = this.pickMedia();
    if (!el) return null;
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
        if (err && err.name === "InvalidStateError") this.conflict = true;
        return null;
      }
    }
    PA.currentEl = el;
    this.captured = true;
    return graph;
  };
})();
