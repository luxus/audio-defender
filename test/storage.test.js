const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createDom, loadAD } = require("./helpers");

function ad() {
  const { window } = createDom("<!doctype html><body></body>");
  return loadAD(window);
}

test("empty state is enabled with Leveler global settings", () => {
  const AD = ad();
  const state = AD.emptyState();
  assert.equal(state.enabled, true);
  assert.equal(state.global.activePreset, "leveler");
  assert.equal(Object.keys(state.channelSettings).length, 0);
});

test("resolveSettings prefers a per-channel override", () => {
  const AD = ad();
  const state = AD.emptyState();
  const night = AD.cloneSettings(AD.PRESETS.night);
  state.channelSettings["twitch:shroud"] = night;
  const resolved = AD.resolveSettings(state, { site: "twitch", id: "shroud", label: "shroud" });
  assert.equal(resolved.scope, "override");
  assert.equal(resolved.settings.activePreset, "night");
  assert.equal(AD.resolveSettings(state, { site: "twitch", id: "other", label: "other" }).scope, "default");
});

test("X override is site-wide, not per user", () => {
  const AD = ad();
  const state = AD.emptyState();
  state.channelSettings.x = AD.cloneSettings(AD.PRESETS.max);
  assert.equal(AD.resolveSettings(state, { site: "x", id: "site", label: "X.com" }).scope, "override");
  assert.equal(AD.resolveSettings(state, { site: "x", id: "site", label: "X.com" }).settings.activePreset, "max");
});

test("normalizeState treats missing enabled as on", () => {
  const AD = ad();
  const state = AD.normalizeState({ global: AD.PRESETS.voice });
  assert.equal(state.enabled, true);
  assert.equal(state.global.activePreset, "voice");
});

test("storage key is ad_state and override keys are per channel except X", () => {
  const AD = ad();
  assert.equal(AD.STORAGE_KEY, "ad_state");
  assert.equal(AD.overrideKey({ site: "twitch", id: "shroud", label: "shroud" }), "twitch:shroud");
  assert.equal(AD.overrideKey({ site: "youtube", id: "mkbhd", label: "@mkbhd" }), "youtube:mkbhd");
  assert.equal(AD.overrideKey({ site: "kick", id: "xqc", label: "xqc" }), "kick:xqc");
  assert.equal(AD.overrideKey({ site: "x", id: "jack", label: "@jack" }), "x");
  assert.equal(
    AD.channelKey({ site: "twitch", id: "shroud" }),
    AD.overrideKey({ site: "twitch", id: "shroud" })
  );
});

test("saveState round-trips isolated per-channel setups under ad_state", async () => {
  const { window, store } = createDom("<!doctype html><body></body>");
  const AD = loadAD(window);
  const state = AD.emptyState();
  state.channelSettings["twitch:shroud"] = AD.cloneSettings(AD.PRESETS.max);
  state.channelSettings["kick:xqc"] = AD.cloneSettings(AD.PRESETS.night);
  state.channelSettings["youtube:mkbhd"] = AD.cloneSettings(AD.PRESETS.voice);
  state.channelSettings.x = AD.cloneSettings(AD.PRESETS.cinema);
  await AD.saveState(state);

  assert.deepEqual(Object.keys(store), ["ad_state"]);
  const loaded = await AD.getState();
  assert.equal(loaded.channelSettings["twitch:shroud"].activePreset, "max");
  assert.equal(loaded.channelSettings["kick:xqc"].activePreset, "night");
  assert.equal(loaded.channelSettings["youtube:mkbhd"].activePreset, "voice");
  assert.equal(loaded.channelSettings.x.activePreset, "cinema");
  assert.equal(AD.resolveSettings(loaded, { site: "twitch", id: "shroud" }).scope, "override");
  assert.equal(AD.resolveSettings(loaded, { site: "twitch", id: "other" }).scope, "default");
  assert.equal(AD.resolveSettings(loaded, { site: "kick", id: "xqc" }).settings.activePreset, "night");
  assert.equal(AD.resolveSettings(loaded, { site: "x", id: "anyone" }).settings.activePreset, "cinema");
  assert.equal(AD.resolveSettings(loaded, { site: "youtube", id: "other" }).scope, "default");
});
