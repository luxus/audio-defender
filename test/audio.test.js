const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { createDom, loadAD, runScripts, playerHtml, sleep } = require("./helpers");

let lastWindow = null;

afterEach(() => {
  if (lastWindow && lastWindow.__adClearTimers) lastWindow.__adClearTimers();
  lastWindow = null;
});

function defaultApply(AD) {
  return {
    type: "apply",
    state: { enabled: true },
    settings: AD.withStrength(AD.defaultSettings())
  };
}

function dispatchApply(window, payload) {
  window.dispatchEvent(new window.CustomEvent("ad-audio-cmd", {
    detail: Object.assign({ __audioDefender: true, from: "ext" }, payload)
  }));
}

function connectionChain(node) {
  const names = [];
  const seen = new Set();
  let cur = node;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    names.push(cur.name || "?");
    cur = Array.isArray(cur.connections) && cur.connections[0] ? cur.connections[0] : null;
  }
  return names;
}

test("apply captures the player and wires source into the graph", async () => {
  const { window, document } = createDom(playerHtml, "https://www.youtube.com/watch?v=1");
  lastWindow = window;
  const AD = loadAD(window);
  runScripts(window, ["page-audio.js"]);
  const video = document.querySelector("video");
  dispatchApply(window, defaultApply(AD));
  await sleep(20);

  assert.equal(video._adCaptured, true);
  assert.ok(video._adSource);
  assert.equal(video._adSource.connections.length, 1);
  assert.equal(video._adSource.connections[0].name, "gain");
});

test("disable bypasses to destination without dropping the MediaElementSource", async () => {
  const { window, document } = createDom(playerHtml);
  lastWindow = window;
  const AD = loadAD(window);
  runScripts(window, ["page-audio.js"]);
  const video = document.querySelector("video");
  dispatchApply(window, defaultApply(AD));
  await sleep(20);
  const source = video._adSource;

  dispatchApply(window, {
    type: "apply",
    state: { enabled: false },
    settings: AD.defaultSettings()
  });
  await sleep(20);

  assert.equal(video._adCaptured, true, "MES must stay captured");
  assert.equal(source.connections.length, 1);
  assert.equal(source.connections[0].name, "destination");
});

test("re-enable reconnects the same source into preGain", async () => {
  const { window, document } = createDom(playerHtml);
  lastWindow = window;
  const AD = loadAD(window);
  runScripts(window, ["page-audio.js"]);
  const video = document.querySelector("video");
  dispatchApply(window, defaultApply(AD));
  dispatchApply(window, { type: "apply", state: { enabled: false }, settings: AD.defaultSettings() });
  dispatchApply(window, defaultApply(AD));
  await sleep(20);

  assert.equal(video._adSource.connections[0].name, "gain");
});

test("a second MediaElementSource on the same video reports conflict", async () => {
  const { window, document } = createDom(playerHtml);
  lastWindow = window;
  const AD = loadAD(window);
  runScripts(window, ["page-audio.js"]);
  const video = document.querySelector("video");
  video._adCaptured = true;
  let conflict = false;
  window.addEventListener("ad-audio-evt", (event) => {
    if (event.detail && event.detail.type === "meter") conflict = Boolean(event.detail.conflict);
  });
  dispatchApply(window, defaultApply(AD));
  await sleep(40);
  assert.equal(conflict, true);
});

test("content script double inject still captures once", async () => {
  const { window, document, store } = createDom(playerHtml, "https://www.twitch.tv/shroud");
  lastWindow = window;
  const AD = loadAD(window);
  store.ad_state = AD.emptyState();
  runScripts(window, ["page-audio.js", "content.js", "content.js"]);
  await sleep(80);
  const video = document.querySelector("video");
  assert.equal(video._adMesCalls, 1);
  assert.equal(window.__AD_CONTENT__, true);
});

test("content script apply posts DSP settings to the page engine", async () => {
  const { window, document, store } = createDom(playerHtml, "https://www.twitch.tv/shroud");
  lastWindow = window;
  const AD = loadAD(window);
  store.ad_state = AD.emptyState();
  runScripts(window, ["page-audio.js", "content.js"]);
  await sleep(80);

  const video = document.querySelector("video");
  assert.equal(video._adCaptured, true);
  assert.ok(window.AD.engine);
  assert.equal(typeof window.AD.engine.getMeter, "function");
});

test("repeat apply reuses the same MediaElementSource", async () => {
  const { window, document } = createDom(playerHtml, "https://www.youtube.com/watch?v=1");
  lastWindow = window;
  const AD = loadAD(window);
  runScripts(window, ["page-audio.js"]);
  const video = document.querySelector("video");
  dispatchApply(window, defaultApply(AD));
  dispatchApply(window, defaultApply(AD));
  await sleep(20);
  assert.equal(video._adMesCalls, 1);
  assert.equal(video._adSource.connections[0].name, "gain");
});

test("second page-audio inject does not capture the same video again", async () => {
  const { window, document } = createDom(playerHtml, "https://www.youtube.com/watch?v=1");
  lastWindow = window;
  const AD = loadAD(window);
  runScripts(window, ["page-audio.js"]);
  const video = document.querySelector("video");
  dispatchApply(window, defaultApply(AD));
  await sleep(20);
  runScripts(window, ["page-audio.js"]);
  dispatchApply(window, defaultApply(AD));
  await sleep(20);
  assert.equal(video._adMesCalls, 1);
  assert.equal(video._adSource.connections[0].name, "gain");
});

test("SPA remount captures the new player and bypasses the old source", async () => {
  const { window, document } = createDom(playerHtml, "https://www.youtube.com/watch?v=1");
  lastWindow = window;
  const AD = loadAD(window);
  runScripts(window, ["page-audio.js"]);
  const player = document.getElementById("movie_player");
  const oldVideo = document.querySelector("video");
  dispatchApply(window, defaultApply(AD));
  await sleep(20);
  assert.equal(oldVideo._adCaptured, true);

  oldVideo.className = "";
  Object.defineProperty(oldVideo, "paused", { configurable: true, get: () => true });
  const newVideo = document.createElement("video");
  newVideo.className = "html5-main-video";
  Object.defineProperty(newVideo, "paused", { configurable: true, get: () => false });
  player.insertBefore(newVideo, player.firstChild);

  dispatchApply(window, defaultApply(AD));
  await sleep(40);

  assert.equal(newVideo._adCaptured, true, "new main video must be captured after remount");
  assert.equal(newVideo._adMesCalls, 1);
  assert.equal(oldVideo._adMesCalls, 1, "old video must not be recaptured");
  assert.equal(oldVideo._adSource.connections[0].name, "destination");
  assert.equal(newVideo._adSource.connections[0].name, "gain");
});

test("InvalidStateError is not retried on later applies", async () => {
  const { window, document } = createDom(playerHtml);
  lastWindow = window;
  const AD = loadAD(window);
  runScripts(window, ["page-audio.js"]);
  const video = document.querySelector("video");
  video._adCaptured = true;
  dispatchApply(window, defaultApply(AD));
  dispatchApply(window, defaultApply(AD));
  await sleep(40);
  assert.equal(video._adMesCalls, 1);
});

test("disconnected currentEl reports not captured", async () => {
  const { window, document } = createDom(playerHtml);
  lastWindow = window;
  const AD = loadAD(window);
  runScripts(window, ["page-audio.js"]);
  const video = document.querySelector("video");
  let captured = true;
  window.addEventListener("ad-audio-evt", (event) => {
    if (event.detail && event.detail.type === "meter") captured = Boolean(event.detail.captured);
  });
  dispatchApply(window, defaultApply(AD));
  await sleep(20);
  video.remove();
  dispatchApply(window, defaultApply(AD));
  await sleep(40);
  assert.equal(captured, false);
});

test("content script disable does not reload the page", async () => {
  const { window, document, store } = createDom(playerHtml, "https://www.twitch.tv/shroud");
  lastWindow = window;
  const AD = loadAD(window);
  store.ad_state = AD.emptyState();
  runScripts(window, ["page-audio.js", "content.js"]);
  await sleep(40);
  const video = document.querySelector("video");
  assert.equal(video._adCaptured, true);
  await window.chrome.storage.local.set({
    ad_state: Object.assign(AD.emptyState(), { enabled: false })
  });
  await sleep(80);
  assert.equal(video._adCaptured, true);
  assert.equal(video._adSource.connections[0].name, "destination");
});

test("apply wires source through EQ, compressors, and destination", async () => {
  const { window, document } = createDom(playerHtml, "https://www.youtube.com/watch?v=1");
  lastWindow = window;
  const AD = loadAD(window);
  runScripts(window, ["page-audio.js"]);
  const video = document.querySelector("video");
  dispatchApply(window, defaultApply(AD));
  await sleep(20);

  const chain = connectionChain(video._adSource);
  assert.equal(chain[0], "source");
  assert.equal(chain[1], "gain");
  assert.equal(chain.filter((name) => name === "filter").length, 9);
  assert.equal(chain.filter((name) => name === "compressor").length, 2);
  assert.ok(chain.includes("shaper"));
  assert.ok(chain.includes("analyser"));
  assert.equal(chain[chain.length - 1], "destination");
  assert.equal(video._adMesCalls, 1);
});

test("disable tears the processing chain down to destination without a second MES", async () => {
  const { window, document } = createDom(playerHtml);
  lastWindow = window;
  const AD = loadAD(window);
  runScripts(window, ["page-audio.js"]);
  const video = document.querySelector("video");
  dispatchApply(window, defaultApply(AD));
  await sleep(20);
  dispatchApply(window, {
    type: "apply",
    state: { enabled: false },
    settings: AD.defaultSettings()
  });
  await sleep(20);

  assert.deepEqual(connectionChain(video._adSource), ["source", "destination"]);
  assert.equal(video._adCaptured, true);
  assert.equal(video._adMesCalls, 1);
});

test("re-apply reuses the captured MediaElementSource instead of attaching again", async () => {
  const { window, document } = createDom(playerHtml);
  lastWindow = window;
  const AD = loadAD(window);
  runScripts(window, ["page-audio.js"]);
  const video = document.querySelector("video");
  let conflict = false;
  window.addEventListener("ad-audio-evt", (event) => {
    if (event.detail && event.detail.type === "meter") conflict = Boolean(event.detail.conflict);
  });
  dispatchApply(window, defaultApply(AD));
  dispatchApply(window, defaultApply(AD));
  dispatchApply(window, { type: "apply", state: { enabled: false }, settings: AD.defaultSettings() });
  dispatchApply(window, defaultApply(AD));
  await sleep(40);

  assert.equal(video._adMesCalls, 1);
  assert.equal(conflict, false);
  assert.equal(video._adSource.connections[0].name, "gain");
});

test("createMediaElementSource is exclusive after Audio Defender captures the element", async () => {
  const { window, document } = createDom(playerHtml);
  lastWindow = window;
  const AD = loadAD(window);
  runScripts(window, ["page-audio.js"]);
  const video = document.querySelector("video");
  dispatchApply(window, defaultApply(AD));
  await sleep(20);

  assert.equal(video._adCaptured, true);
  const other = new window.AudioContext();
  assert.throws(
    () => other.createMediaElementSource(video),
    (err) => err && err.name === "InvalidStateError"
  );
});

test("replacing the media element recaptures the new node and bypasses the old graph", async () => {
  const { window, document } = createDom(playerHtml, "https://www.youtube.com/watch?v=1");
  lastWindow = window;
  const AD = loadAD(window);
  runScripts(window, ["page-audio.js"]);
  const oldVideo = document.querySelector("video");
  dispatchApply(window, defaultApply(AD));
  await sleep(20);
  const oldSource = oldVideo._adSource;
  assert.equal(oldVideo._adMesCalls, 1);

  oldVideo.remove();
  const newVideo = document.createElement("video");
  newVideo.className = "html5-main-video";
  document.getElementById("movie_player").prepend(newVideo);
  newVideo.dispatchEvent(new window.Event("play", { bubbles: true }));
  await sleep(150);

  assert.equal(newVideo._adCaptured, true);
  assert.equal(newVideo._adMesCalls, 1);
  assert.equal(oldVideo._adMesCalls, 1);
  assert.equal(oldSource.connections[0].name, "destination");
  assert.equal(newVideo._adSource.connections[0].name, "gain");
  assert.equal(connectionChain(newVideo._adSource)[connectionChain(newVideo._adSource).length - 1], "destination");
});

test("SPA navigation reapplies the matching per-channel setup", async () => {
  const { window, document, store } = createDom(playerHtml, "https://www.twitch.tv/shroud");
  lastWindow = window;
  const AD = loadAD(window);
  const state = AD.emptyState();
  state.channelSettings["twitch:xqc"] = AD.cloneSettings(AD.PRESETS.max);
  store.ad_state = state;
  const applies = [];
  window.addEventListener("ad-audio-cmd", (event) => {
    if (event.detail && event.detail.type === "apply") applies.push(event.detail);
  });
  runScripts(window, ["page-audio.js", "content.js"]);
  await sleep(80);
  assert.equal(applies.at(-1).settings.activePreset, "leveler");
  assert.equal(AD.overrideKey(window.AD.engine.getChannel()), "twitch:shroud");

  window.history.pushState({}, "", "/xqc");
  document.body.append(document.createElement("span"));
  await sleep(220);
  assert.equal(window.location.pathname, "/xqc");
  assert.equal(AD.overrideKey(window.AD.engine.getChannel()), "twitch:xqc");
  assert.equal(applies.at(-1).settings.activePreset, "max");
  assert.equal(applies.at(-1).settings.compressor.threshold, -40);

  window.history.pushState({}, "", "/shroud");
  document.body.append(document.createElement("span"));
  await sleep(220);
  assert.equal(AD.overrideKey(window.AD.engine.getChannel()), "twitch:shroud");
  assert.equal(applies.at(-1).settings.activePreset, "leveler");
});
