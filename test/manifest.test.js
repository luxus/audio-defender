const { test } = require("node:test");
const assert = require("node:assert/strict");
const { read } = require("./helpers");

test("single isolated-world content script list, page-audio before content", () => {
  const manifest = JSON.parse(read("manifest.json"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.content_scripts.length, 1);
  const js = manifest.content_scripts[0].js;
  const pageAudio = js.filter((file) => file === "page-audio.js" || file.startsWith("page-audio/"));
  const overlay = js.filter((file) => file === "overlay.js" || file.startsWith("overlay/"));
  assert.deepEqual(pageAudio, [
    "page-audio/graph.js",
    "page-audio/media.js",
    "page-audio/messaging.js",
    "page-audio/spa.js",
    "page-audio.js"
  ]);
  assert.deepEqual(overlay, [
    "overlay/state.js",
    "overlay/helpers.js",
    "overlay/messaging.js",
    "overlay/ui.js",
    "overlay.js"
  ]);
  assert.equal(js.indexOf("page-audio.js") < js.indexOf("content.js"), true);
  assert.equal(js.indexOf("content.js") < js.indexOf("overlay/state.js"), true);
  assert.equal(js.includes("overlay.js"), true);
  assert.equal(manifest.content_scripts[0].world, undefined);
  assert.equal(manifest.content_scripts[0].type, undefined);
  assert.ok(manifest.web_accessible_resources[0].resources.includes("popup.html"));
});

test("hosts cover Twitch, YouTube, Kick, and X", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const matches = manifest.content_scripts[0].matches.join(" ");
  ["twitch.tv", "youtube.com", "kick.com", "x.com"].forEach((host) => {
    assert.match(matches, new RegExp(host.replace(".", "\\.")));
  });
});
