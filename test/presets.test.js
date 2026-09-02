const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createDom, loadAD } = require("./helpers");

function ad() {
  const { window } = createDom("<!doctype html><body></body>");
  return loadAD(window);
}

test("default preset is Leveler with dual-stage compressor", () => {
  const AD = ad();
  const s = AD.defaultSettings();
  assert.equal(s.activePreset, "leveler");
  assert.equal(s.boost, 100);
  assert.equal(s.compressor.threshold, -28);
  assert.equal(s.compressor.ratio, 4);
  assert.equal(s.compressor.limiterThreshold, -10);
  assert.equal(s.compressor.limiterRatio, 20);
  assert.equal(s.compressor.agcOn, true);
  assert.equal(s.equalizer.gains.length, 9);
});

test("every factory preset round-trips through matchPreset", () => {
  const AD = ad();
  for (const id of AD.PRESET_ORDER) {
    assert.equal(AD.matchPreset(AD.PRESETS[id], {}), id, id);
  }
});

test("strength morphs leveler threshold and limiter without losing preset identity", () => {
  const AD = ad();
  const base = AD.cloneSettings(AD.PRESETS.leveler);
  base.strength = 100;
  const dsp = AD.withStrength(base);
  assert.ok(dsp.compressor.threshold < base.compressor.threshold);
  assert.ok(dsp.compressor.ratio > base.compressor.ratio);
  assert.ok(dsp.compressor.limiterThreshold < base.compressor.limiterThreshold);
  assert.equal(AD.matchPreset(base, {}), "leveler");
});

test("audiobang keeps the leveler off", () => {
  const AD = ad();
  assert.equal(AD.PRESETS.audiobang.compressor.levelerOn, false);
  const dsp = AD.withStrength(AD.PRESETS.audiobang);
  assert.equal(dsp.compressor.threshold, AD.PRESETS.audiobang.compressor.threshold);
});

test("old 7-band EQ storage is padded to 9 bands", () => {
  const AD = ad();
  const normalized = AD.normalizeSettings({
    boost: 100,
    compressor: { threshold: -28, ratio: 4 },
    equalizer: { enabled: true, gains: [1, 2, 3, 4, 5, 6, 7] }
  });
  assert.equal(normalized.equalizer.gains.length, 9);
  assert.equal(normalized.equalizer.gains[7], 0);
  assert.equal(normalized.compressor.limiterThreshold, -10);
});

test("Boost preset starts at 200%", () => {
  const AD = ad();
  assert.equal(AD.PRESETS.boost.boost, 200);
});
