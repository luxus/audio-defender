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
