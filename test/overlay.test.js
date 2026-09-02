const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { createDom, loadAD, runScripts, playerHtml, twitchPlayerHtml, xPlayerHtml, sleep, read } = require("./helpers");

let lastWindow = null;

afterEach(() => {
  if (lastWindow && lastWindow.__adClearTimers) lastWindow.__adClearTimers();
  lastWindow = null;
});

test("overlay places the shield after the YouTube volume panel", async () => {
  const { window, document } = createDom(playerHtml, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  lastWindow = window;
  loadAD(window);
  runScripts(window, ["overlay.js"]);
  await sleep(40);

  const button = document.getElementById("audio-defender-player-btn");
  assert.ok(button);
  assert.equal(button.previousElementSibling.className, "ytp-volume-area");
  assert.ok(button.classList.contains("ytp-button"));
  assert.notEqual(document.querySelector(".ytp-mute-button").nextElementSibling.id, "audio-defender-player-btn");
});

test("Twitch shield sits after the volume slider, not between mute and the track", async () => {
  const { window, document } = createDom(twitchPlayerHtml(), "https://www.twitch.tv/lol_nemesis");
  lastWindow = window;
  loadAD(window);
  runScripts(window, ["overlay.js"]);
  await sleep(40);

  const button = document.getElementById("audio-defender-player-btn");
  assert.ok(button);
  assert.equal(button.previousElementSibling.className, "volume-wrapper");
  assert.equal(button.nextElementSibling.className, "player-time");
  const mute = document.querySelector('[data-a-target="player-mute-unmute-button"]');
  assert.notEqual(mute.nextElementSibling.id, "audio-defender-player-btn");
});

test("Twitch fullscreen keeps the shield after the volume widget", async () => {
  const { window, document } = createDom(twitchPlayerHtml(), "https://www.twitch.tv/lol_nemesis");
  lastWindow = window;
  loadAD(window);
  runScripts(window, ["overlay.js"]);
  await sleep(40);

  const player = document.querySelector('[data-a-target="video-player"]');
  player.classList.add("video-player--fullscreen");
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => player
  });
  document.dispatchEvent(new window.Event("fullscreenchange"));
  await sleep(120);

  const button = document.getElementById("audio-defender-player-btn");
  assert.ok(button);
  assert.ok(player.contains(button));
  assert.equal(button.previousElementSibling.className, "volume-wrapper");
});

test("clicking the shield opens a shadow panel with preset chips", async () => {
  const { window, document } = createDom(playerHtml, "https://www.youtube.com/watch?v=1");
  lastWindow = window;
  loadAD(window);
  runScripts(window, ["overlay.js"]);
  await sleep(40);

  const button = document.getElementById("audio-defender-player-btn");
  button.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  await sleep(60);

  const host = document.getElementById("audio-defender-player-panel");
  assert.ok(host);
  assert.ok(host.classList.contains("open"));
  const chips = host.shadowRoot.querySelectorAll("#presets button.chip");
  assert.equal(chips.length, 8);
  assert.equal(chips[0].textContent, "Leveler");
});

test("pointerdown on the shield does not call preventDefault", () => {
  const overlay = read("overlay.js");
  const down = overlay.match(/addEventListener\("pointerdown", \(event\) => ([^)]+)\)/);
  assert.ok(down);
  assert.equal(down[1].includes("preventDefault"), false);
  assert.match(down[1], /stopPropagation/);
});

test("X timeline does not pin the shield to the persistent unmute overlay", async () => {
  const { window, document } = createDom(xPlayerHtml(false), "https://x.com/home");
  lastWindow = window;
  loadAD(window);
  runScripts(window, ["overlay.js"]);
  await sleep(80);

  assert.equal(document.getElementById("audio-defender-player-btn"), null);
  const unmute = document.querySelector('button[aria-label="Unmute"]');
  assert.ok(unmute);
  assert.notEqual(unmute.nextElementSibling && unmute.nextElementSibling.id, "audio-defender-player-btn");
});

test("X control bar gets the shield next to Full screen, not next to Unmute", async () => {
  const { window, document } = createDom(xPlayerHtml(true), "https://x.com/home");
  lastWindow = window;
  loadAD(window);
  runScripts(window, ["overlay.js"]);
  await sleep(80);

  const button = document.getElementById("audio-defender-player-btn");
  assert.ok(button);
  assert.equal(button.parentElement.className, "css-controls");
  assert.equal(button.nextElementSibling.getAttribute("aria-label"), "Full screen");
  assert.notEqual(document.querySelector('button[aria-label="Unmute"]').nextElementSibling.id, "audio-defender-player-btn");
});

test("X fullscreen moves the shield into the fullscreen player's controls", async () => {
  const { window, document } = createDom(xPlayerHtml(true), "https://x.com/home");
  lastWindow = window;
  loadAD(window);
  runScripts(window, ["overlay.js"]);
  await sleep(80);

  const timelineBtn = document.getElementById("audio-defender-player-btn");
  assert.ok(timelineBtn);

  const fsPlayer = document.createElement("div");
  fsPlayer.setAttribute("data-testid", "videoPlayer");
  fsPlayer.innerHTML = `
    <video></video>
    <div class="fs-controls">
      <button aria-label="Pause" type="button"></button>
      <button aria-label="Mute" type="button"></button>
      <button aria-label="Exit full screen" type="button"></button>
    </div>
  `;
  document.body.append(fsPlayer);

  let fsEl = fsPlayer;
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => fsEl
  });
  document.dispatchEvent(new window.Event("fullscreenchange"));
  await sleep(120);

  const button = document.getElementById("audio-defender-player-btn");
  assert.ok(button);
  assert.equal(button.parentElement.className, "fs-controls");
  assert.equal(button.nextElementSibling.getAttribute("aria-label"), "Exit full screen");
  assert.ok(fsPlayer.contains(button));
});
