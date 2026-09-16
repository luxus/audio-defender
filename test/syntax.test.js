const { test } = require("node:test");
const assert = require("node:assert/strict");
const { read, contentScriptFiles } = require("./helpers");

test("all extension scripts parse", () => {
  const files = [...contentScriptFiles(), "popup.js", "background.js"];
  for (const file of files) {
    assert.doesNotThrow(() => new Function(read(file)), file + " must parse");
    assert.doesNotMatch(read(file), /^\s*import\s/m, file + " stays a classic script");
    assert.doesNotMatch(read(file), /^\s*export\s/m, file + " stays a classic script");
  }
});

test("renderPresetChips is a real function (regression)", () => {
  const panel = read("shared/panel.js");
  assert.match(panel, /function renderPresetChips\s*\(/);
  assert.doesNotMatch(panel, /function renderScopeHelp\(\) \{[\s\S]*\}\s+if \(!els\.presets\) return/);
});

test("content script never reloads the tab on disable", () => {
  assert.doesNotMatch(read("content.js"), /location\.reload/);
});

test("YouTube button pointerdown does not preventDefault", () => {
  const overlay = read("overlay/ui.js");
  assert.match(overlay, /pointerdown.*stopPropagation/);
  const pointerDown = overlay.split("pointerdown")[2] || overlay.split("pointerdown")[1];
  assert.ok(pointerDown, "pointerdown handler exists");
  const handler = overlay.match(/addEventListener\("pointerdown", \(event\) => event\.stopPropagation\(\)/);
  assert.ok(handler, "pointerdown only stops propagation");
});

test("selector helper must not double-hash ids", () => {
  const panel = read("shared/panel.js");
  assert.match(panel, /id\.charAt\(0\) === "#"/);
});
