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
