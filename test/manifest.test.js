const fs = require("fs");
const path = require("path");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { read, ROOT } = require("./helpers");

test("single isolated-world content script list, page-audio before content", () => {
  const manifest = JSON.parse(read("manifest.json"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.content_scripts.length, 1);
  const js = manifest.content_scripts[0].js;
  assert.equal(js.indexOf("page-audio.js") < js.indexOf("content.js"), true);
  assert.equal(js.includes("overlay.js"), true);
  assert.equal(manifest.content_scripts[0].world, undefined);
  assert.ok(manifest.web_accessible_resources[0].resources.includes("popup.html"));
});

test("hosts cover Twitch, YouTube, Kick, X, and Twitter", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const matches = manifest.content_scripts[0].matches.join(" ");
  ["twitch.tv", "youtube.com", "kick.com", "x.com", "twitter.com"].forEach((host) => {
    assert.match(matches, new RegExp(host.replace(".", "\\.")));
  });
});

test("service worker, popup, storage, and declared files exist", () => {
  const manifest = JSON.parse(read("manifest.json"));
  assert.equal(manifest.background.service_worker, "background.js");
  assert.equal(manifest.action.default_popup, "popup.html");
  assert.ok(manifest.permissions.includes("storage"));

  const files = new Set([
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...manifest.content_scripts[0].js,
    ...manifest.web_accessible_resources[0].resources,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon)
  ]);
  files.forEach((file) => {
    assert.ok(fs.existsSync(path.join(ROOT, file)), file + " exists");
  });
});

