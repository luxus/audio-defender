const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

function mockChrome(store) {
  store = store || {};
  const changeListeners = [];
  const messageListeners = [];
  return {
    storage: {
      local: {
        get: async (key) => {
          if (typeof key === "string") return { [key]: store[key] };
          if (Array.isArray(key)) {
            const out = {};
            key.forEach((k) => {
              out[k] = store[k];
            });
            return out;
          }
          return { ...store };
        },
        set: async (obj) => {
          const changes = {};
          Object.keys(obj).forEach((k) => {
            changes[k] = { oldValue: store[k], newValue: obj[k] };
            store[k] = obj[k];
          });
          changeListeners.forEach((fn) => fn(changes, "local"));
        }
      },
      onChanged: {
        addListener(fn) {
          changeListeners.push(fn);
        }
      }
    },
    runtime: {
      getURL: (p) => "chrome-extension://test/" + p,
      sendMessage: async () => ({ rms: 0, bands: [0, 0, 0], conflict: false }),
      onMessage: {
        addListener(fn) {
          messageListeners.push(fn);
        }
      },
      _messageListeners: messageListeners
    },
    tabs: {
      query: async () => [{ id: 1, url: "https://www.twitch.tv/shroud" }],
      sendMessage: async () => ({
        ok: true,
        channel: { site: "twitch", id: "shroud", label: "shroud" }
      })
    },
    action: {
      setBadgeBackgroundColor: async () => {},
      setBadgeText: async () => {}
    }
  };
}

function fakeAudioNode(name) {
  const node = {
    name: name || "node",
    connections: [],
    connect(dest) {
      node.connections.push(dest);
      return dest || node;
    },
    disconnect() {
      node.connections.length = 0;
    },
    gain: { value: 1, setTargetAtTime() {} },
    threshold: { value: 0, setTargetAtTime() {} },
    knee: { value: 0, setTargetAtTime() {} },
    ratio: { value: 1, setTargetAtTime() {} },
    attack: { value: 0, setTargetAtTime() {} },
    release: { value: 0, setTargetAtTime() {} },
    frequency: { value: 1000, setTargetAtTime() {} },
    Q: { value: 1, setTargetAtTime() {} },
    type: "peaking",
    curve: null,
    oversample: "none",
    fftSize: 2048,
    reduction: 0,
    channelInterpretation: "speakers",
    channelCountMode: "max",
    channelCount: 2,
    getFloatTimeDomainData(buf) {
      for (let i = 0; i < buf.length; i++) buf[i] = 0.05;
    }
  };
  return node;
}

function FakeAudioContext() {
  this.state = "running";
  this.currentTime = 0;
  this.destination = fakeAudioNode("destination");
  this.createGain = () => fakeAudioNode("gain");
  this.createDynamicsCompressor = () => fakeAudioNode("compressor");
  this.createWaveShaper = () => fakeAudioNode("shaper");
  this.createAnalyser = () => fakeAudioNode("analyser");
  this.createBiquadFilter = () => fakeAudioNode("filter");
  this.createMediaElementSource = (el) => {
    el._adMesCalls = (el._adMesCalls || 0) + 1;
    if (el._adCaptured) {
      const err = new Error("already captured");
      err.name = "InvalidStateError";
      throw err;
    }
    el._adCaptured = true;
    const source = fakeAudioNode("source");
    el._adSource = source;
    return source;
  };
  this.resume = async () => {
    this.state = "running";
  };
}

function installTimers(window) {
  const ids = [];
  const origInterval = window.setInterval.bind(window);
  const origTimeout = window.setTimeout.bind(window);
  window.setInterval = (fn, ms, ...rest) => {
    const id = origInterval(fn, ms, ...rest);
    ids.push({ type: "interval", id });
    return id;
  };
  window.setTimeout = (fn, ms, ...rest) => {
    const id = origTimeout(fn, ms, ...rest);
    ids.push({ type: "timeout", id });
    return id;
  };
  window.__adClearTimers = () => {
    ids.forEach((item) => {
      if (item.type === "interval") window.clearInterval(item.id);
      else window.clearTimeout(item.id);
    });
    ids.length = 0;
  };
}

function createDom(html, href) {
  const dom = new JSDOM(html || "<!doctype html><body></body>", {
    url: href || "https://www.twitch.tv/shroud",
    pretendToBeVisual: true,
    runScripts: "dangerously"
  });
  const window = dom.window;
  const store = {};
  window.chrome = mockChrome(store);
  window.chrome._store = store;
  window.AudioContext = FakeAudioContext;
  window.webkitAudioContext = FakeAudioContext;
  window.fetch = async (url) => {
    const file = String(url).replace(/^chrome-extension:\/\/test\//, "");
    return {
      ok: true,
      text: async () => read(file)
    };
  };
  installTimers(window);
  return { dom, window, document: window.document, store };
}

function runScripts(window, files) {
  files.forEach((file) => {
    const script = window.document.createElement("script");
    script.textContent = read(file);
    window.document.documentElement.appendChild(script);
  });
}

function loadAD(window) {
  runScripts(window, [
    "shared/presets.js",
    "shared/channel.js",
    "shared/storage.js",
    "shared/panel.js"
  ]);
  return window.AD;
}

function playerHtml() {
  return `<!doctype html>
    <html><body>
      <div id="movie_player" class="html5-video-player">
        <video class="html5-main-video"></video>
        <div class="ytp-left-controls">
          <button class="ytp-play-button" aria-label="Pause" type="button"></button>
          <span class="ytp-volume-area">
            <button class="ytp-mute-button" aria-label="Mute" type="button"></button>
            <div class="ytp-volume-panel"></div>
          </span>
        </div>
      </div>
    </body></html>`;
}

function twitchPlayerHtml() {
  return `<!doctype html>
    <html><body>
      <div data-a-target="video-player" class="video-player">
        <video></video>
        <div data-a-target="player-controls">
          <div class="player-controls__left-control-group">
            <button data-a-target="player-play-pause-button" aria-label="Pause" type="button"></button>
            <div class="volume-wrapper">
              <button data-a-target="player-mute-unmute-button" aria-label="Mute" type="button"></button>
              <div data-a-target="player-volume-slider"></div>
            </div>
            <div class="player-time">0:45:50</div>
          </div>
          <button aria-label="Full screen" type="button"></button>
        </div>
      </div>
    </body></html>`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function xPlayerHtml(withControls) {
  const controls = withControls
    ? `<div class="css-controls">
         <button aria-label="Pause" type="button"></button>
         <button aria-label="Mute" type="button"></button>
         <button aria-label="Full screen" type="button"></button>
       </div>`
    : "";
  return `<!doctype html>
    <html><body>
      <article data-testid="tweet">
        <div data-testid="videoPlayer">
          <video></video>
          <button aria-label="Unmute" type="button"></button>
          ${controls}
        </div>
      </article>
    </body></html>`;
}

module.exports = {
  ROOT,
  read,
  mockChrome,
  FakeAudioContext,
  createDom,
  runScripts,
  loadAD,
  playerHtml,
  twitchPlayerHtml,
  xPlayerHtml,
  sleep
};
