const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { createDom, loadAD, read, sleep } = require("./helpers");

const popupHtml = read("popup.html");
let lastWindow = null;

afterEach(() => {
  if (lastWindow && lastWindow.__adClearTimers) lastWindow.__adClearTimers();
  lastWindow = null;
});

function idsIn(html) {
  return [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
}

test("popup markup has every panel control id", () => {
  const ids = new Set(idsIn(popupHtml));
  [
    "enabled",
    "reloadHint",
    "siteHint",
    "conflictHint",
    "meterFill",
    "meterGr",
    "meterReadout",
    "boost",
    "boostValue",
    "mono",
    "presets",
    "scopeDefault",
    "scopeOverwrite",
    "scopeHelp",
    "compressorEnabled",
    "compressorTogglePanel",
    "compressorPanel",
    "equalizerEnabled",
    "equalizerTogglePanel",
    "equalizerPanel",
    "eqBands",
    "strength",
    "strengthValue",
    "threshold",
    "ratio",
    "attack",
    "release",
    "limiterThreshold",
    "resetCompressor",
    "presetName",
    "savePreset"
  ].forEach((id) => {
    assert.ok(ids.has(id), "missing #" + id);
  });
});

test("bindPanel paints 8 factory chips and clicking Max persists it", async () => {
  const { window, document, store } = createDom(popupHtml);
  lastWindow = window;
  const AD = loadAD(window);
  const panel = AD.bindPanel(document, { mode: "popup" });
  await sleep(40);

  const chips = [...document.querySelectorAll("#presets button.chip")];
  assert.equal(chips.length, 8);
  assert.equal(chips[0].textContent, "Leveler");
  assert.ok(chips[0].classList.contains("active"));
  assert.equal(document.querySelector("#enabled").checked, true);
  assert.equal(document.querySelector("#boostValue").textContent, "100%");

  chips[1].click();
  await sleep(30);
  assert.equal(store.ad_state.global.activePreset, "max");
  assert.ok(document.querySelectorAll("#presets button.chip")[1].classList.contains("active"));
  assert.equal(document.querySelector("#boostValue").textContent, "100%");

  panel.destroy();
});

test("hash and bare ids both resolve after bind", async () => {
  const { window, document } = createDom(popupHtml);
  lastWindow = window;
  const AD = loadAD(window);
  const panel = AD.bindPanel(document, { mode: "popup" });
  await sleep(40);
  assert.ok(document.querySelector("#presets").children.length > 0);
  assert.ok(document.querySelector("#meterFill"));
  panel.destroy();
});

test("Overwrite writes a channel setup; Default deletes it", async () => {
  const { window, document, store } = createDom(popupHtml, "https://www.twitch.tv/shroud");
  lastWindow = window;
  const AD = loadAD(window);
  const panel = AD.bindPanel(document, {
    mode: "overlay",
    getChannel: () => ({ site: "twitch", id: "shroud", label: "shroud" }),
    getMeter: () => ({ rms: 0, bands: [0, 0, 0] })
  });
  await sleep(40);

  document.querySelector("#scopeOverwrite").click();
  await sleep(30);
  assert.ok(store.ad_state.channelSettings["twitch:shroud"]);

  const max = [...document.querySelectorAll("#presets button.chip")].find((el) => el.textContent === "Max");
  max.click();
  await sleep(30);
  assert.equal(store.ad_state.channelSettings["twitch:shroud"].activePreset, "max");
  assert.equal(store.ad_state.global.activePreset, "leveler");
  assert.match(document.querySelector("#scopeHelp").textContent, /shroud on Twitch/);

  document.querySelector("#scopeDefault").click();
  await sleep(30);
  assert.equal(store.ad_state.channelSettings["twitch:shroud"], undefined);
  panel.destroy();
});

test("switching Twitch channels updates the overwrite target and keeps the previous override", async () => {
  const { window, document, store } = createDom(popupHtml, "https://www.twitch.tv/shroud");
  lastWindow = window;
  const AD = loadAD(window);
  let channel = { site: "twitch", id: "shroud", label: "shroud" };
  const panel = AD.bindPanel(document, {
    mode: "overlay",
    getChannel: () => channel,
    getMeter: () => ({ rms: 0, bands: [0, 0, 0] })
  });
  await sleep(40);

  document.querySelector("#scopeOverwrite").click();
  await sleep(20);
  [...document.querySelectorAll("#presets button.chip")].find((el) => el.textContent === "Max").click();
  await sleep(30);
  assert.equal(store.ad_state.channelSettings["twitch:shroud"].activePreset, "max");

  channel = { site: "twitch", id: "xqc", label: "xqc" };
  panel.refreshChannel();
  await sleep(30);

  assert.match(document.querySelector("#scopeHelp").textContent, /Default/);
  assert.equal(document.querySelector("#scopeOverwrite").classList.contains("active"), false);
  document.querySelector("#scopeOverwrite").click();
  await sleep(20);
  [...document.querySelectorAll("#presets button.chip")].find((el) => el.textContent === "Night").click();
  await sleep(30);

  assert.equal(store.ad_state.channelSettings["twitch:shroud"].activePreset, "max");
  assert.equal(store.ad_state.channelSettings["twitch:xqc"].activePreset, "night");
  assert.equal(store.ad_state.global.activePreset, "leveler");
  assert.match(document.querySelector("#scopeHelp").textContent, /xqc on Twitch/);
  panel.destroy();
});

test("same-turn refreshChannel does not wipe presets or channel overrides", async () => {
  const { window, document, store } = createDom(popupHtml, "https://www.twitch.tv/shroud");
  lastWindow = window;
  const AD = loadAD(window);
  const seeded = AD.emptyState();
  seeded.global = AD.cloneSettings(AD.PRESETS.voice);
  seeded.customPresets.Gym = AD.cloneSettings(AD.PRESETS.night);
  seeded.channelSettings["twitch:shroud"] = AD.cloneSettings(AD.PRESETS.night);
  store.ad_state = seeded;

  const panel = AD.bindPanel(document, {
    mode: "overlay",
    getChannel: () => ({ site: "twitch", id: "shroud", label: "shroud" }),
    getMeter: () => ({ rms: 0, bands: [0, 0, 0] })
  });
  panel.refreshChannel();
  await sleep(40);

  assert.ok(store.ad_state.customPresets.Gym);
  assert.equal(store.ad_state.channelSettings["twitch:shroud"].activePreset, "night");
  assert.equal(store.ad_state.global.activePreset, "voice");
  panel.destroy();
});

test("null channel flicker does not flush an overwrite onto Default", async () => {
  const { window, document, store } = createDom(popupHtml, "https://www.twitch.tv/shroud");
  lastWindow = window;
  const AD = loadAD(window);
  let channel = { site: "twitch", id: "shroud", label: "shroud" };
  const panel = AD.bindPanel(document, {
    mode: "overlay",
    getChannel: () => channel,
    getMeter: () => ({ rms: 0, bands: [0, 0, 0] })
  });
  await sleep(40);
  document.querySelector("#scopeOverwrite").click();
  await sleep(20);
  [...document.querySelectorAll("#presets button.chip")].find((el) => el.textContent === "Max").click();
  await sleep(30);
  assert.equal(store.ad_state.channelSettings["twitch:shroud"].activePreset, "max");

  channel = null;
  panel.refreshChannel();
  await sleep(30);
  assert.equal(store.ad_state.channelSettings["twitch:shroud"].activePreset, "max");
  assert.equal(store.ad_state.global.activePreset, "leveler");
  panel.destroy();
});

test("YouTube handle hydration keeps an existing UC override", async () => {
  const { window, document, store } = createDom(popupHtml, "https://www.youtube.com/watch?v=1");
  lastWindow = window;
  const AD = loadAD(window);
  let channel = {
    site: "youtube",
    id: "UC123abcdefghijklmnopqrstuv",
    label: "MKBHD",
    aliases: ["youtube:UC123abcdefghijklmnopqrstuv"]
  };
  const panel = AD.bindPanel(document, {
    mode: "overlay",
    getChannel: () => channel,
    getMeter: () => ({ rms: 0, bands: [0, 0, 0] })
  });
  await sleep(40);
  document.querySelector("#scopeOverwrite").click();
  await sleep(20);
  [...document.querySelectorAll("#presets button.chip")].find((el) => el.textContent === "Max").click();
  await sleep(30);
  assert.equal(store.ad_state.channelSettings["youtube:UC123abcdefghijklmnopqrstuv"].activePreset, "max");

  channel = {
    site: "youtube",
    id: "mkbhd",
    label: "@mkbhd",
    aliases: ["youtube:mkbhd", "youtube:UC123abcdefghijklmnopqrstuv"]
  };
  panel.refreshChannel();
  await sleep(30);

  assert.equal(store.ad_state.channelSettings["youtube:UC123abcdefghijklmnopqrstuv"].activePreset, "max");
  assert.equal(store.ad_state.global.activePreset, "leveler");
  assert.equal(document.querySelector("#scopeOverwrite").classList.contains("active"), true);
  panel.destroy();
});

test("X overwrite stores one site-wide setup", async () => {
  const { window, document, store } = createDom(popupHtml, "https://x.com/home");
  lastWindow = window;
  const AD = loadAD(window);
  const panel = AD.bindPanel(document, {
    mode: "overlay",
    getChannel: () => ({ site: "x", id: "site", label: "X.com" }),
    getMeter: () => ({ rms: 0, bands: [0, 0, 0] })
  });
  await sleep(40);
  document.querySelector("#scopeOverwrite").click();
  await sleep(20);
  [...document.querySelectorAll("#presets button.chip")].find((el) => el.textContent === "Voice").click();
  await sleep(30);
  assert.equal(store.ad_state.channelSettings.x.activePreset, "voice");
  assert.equal(store.ad_state.global.activePreset, "leveler");
  assert.match(document.querySelector("#scopeHelp").textContent, /X\.com/);
  panel.destroy();
});

test("saving a custom preset adds a chip", async () => {
  const { window, document, store } = createDom(popupHtml);
  lastWindow = window;
  const AD = loadAD(window);
  const panel = AD.bindPanel(document, { mode: "popup" });
  await sleep(40);
  document.querySelector("#presetName").value = "Gym";
  document.querySelector("#savePreset").click();
  await sleep(30);
  assert.ok(store.ad_state.customPresets.Gym);
  const labels = [...document.querySelectorAll("#presets button.chip")].map((el) => el.textContent.replace("×", ""));
  assert.ok(labels.includes("Gym"));
  panel.destroy();
});

test("meter maps LUFS and limiting into the readout", async () => {
  const { window, document } = createDom(popupHtml);
  lastWindow = window;
  const AD = loadAD(window);
  let meter = { rmsDb: -18, loudDb: -16, grDb: -6, bands: [0, 0, 0] };
  const panel = AD.bindPanel(document, {
    mode: "overlay",
    getChannel: () => null,
    getMeter: () => meter
  });
  await sleep(120);
  assert.match(document.querySelector("#meterReadout").textContent, /LUFS/);
  assert.match(document.querySelector("#meterReadout").textContent, /Limiting/);
  assert.notEqual(document.querySelector("#meterFill").style.width, "0%");
  panel.destroy();
});
