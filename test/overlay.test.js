const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { createDom, loadAD, loadOverlay, playerHtml, twitchPlayerHtml, xPlayerHtml, sleep, read } = require("./helpers");

let lastWindow = null;

afterEach(() => {
  if (lastWindow && lastWindow.__adClearTimers) lastWindow.__adClearTimers();
  lastWindow = null;
});

test("overlay double inject keeps a single shield button", async () => {
  const { window, document } = createDom(playerHtml, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  lastWindow = window;
  loadAD(window);
  loadOverlay(window);
  loadOverlay(window);
  await sleep(40);
  assert.equal(document.querySelectorAll("#audio-defender-player-btn").length, 1);
  assert.equal(window.__AD_OVERLAY__, true);
});

test("overlay places the shield after the YouTube volume panel", async () => {
  const { window, document } = createDom(playerHtml, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  lastWindow = window;
  loadAD(window);
  loadOverlay(window);
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
  loadOverlay(window);
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
  loadOverlay(window);
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

function clickShield(window) {
  const button = window.document.getElementById("audio-defender-player-btn");
  assert.ok(button, "shield button should exist");
  button.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
}

function panelHost(document) {
  return document.getElementById("audio-defender-player-panel");
}

async function mountOverlay(href, html) {
  const ctx = createDom(html || playerHtml, href || "https://www.youtube.com/watch?v=1");
  lastWindow = ctx.window;
  loadAD(ctx.window);
  loadOverlay(ctx.window);
  await sleep(40);
  return ctx;
}

async function openOverlayPanel(window) {
  clickShield(window);
  await sleep(60);
  const host = panelHost(window.document);
  assert.ok(host, "panel host should exist");
  assert.ok(host.classList.contains("open"), "panel should be open");
  return host;
}

test("clicking the shield opens a shadow panel with preset chips", async () => {
  const { window, document } = await mountOverlay();
  const host = await openOverlayPanel(window);
  const chips = host.shadowRoot.querySelectorAll("#presets button.chip");
  assert.equal(chips.length, 8);
  assert.equal(chips[0].textContent, "Leveler");
  assert.ok(document.getElementById("audio-defender-player-btn"));
});

test("clicking the shield again after the toggle debounce closes the panel", async () => {
  const { window } = await mountOverlay();
  const host = await openOverlayPanel(window);
  await sleep(350);
  clickShield(window);
  await sleep(40);
  assert.equal(host.classList.contains("open"), false);
  assert.ok(window.document.getElementById("audio-defender-player-btn"));
});

test("a second click inside the toggle debounce does not close the panel", async () => {
  const { window } = await mountOverlay();
  const host = await openOverlayPanel(window);
  clickShield(window);
  await sleep(20);
  assert.ok(host.classList.contains("open"));
});

test("Escape closes an open overlay panel", async () => {
  const { window } = await mountOverlay();
  const host = await openOverlayPanel(window);
  window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(host.classList.contains("open"), false);
});

test("dismiss overlay closes the panel without removing the shield", async () => {
  const { window, document } = await mountOverlay();
  const host = await openOverlayPanel(window);
  const dismiss = host.shadowRoot.querySelector(".ad-dismiss");
  assert.ok(dismiss);
  dismiss.dispatchEvent(new window.Event("pointerdown", { bubbles: true, cancelable: true }));
  assert.equal(host.classList.contains("open"), false);
  assert.ok(document.getElementById("audio-defender-player-btn"));
});

test("clicking a preset chip does not close the overlay panel", async () => {
  const { window } = await mountOverlay();
  const host = await openOverlayPanel(window);
  const chip = host.shadowRoot.querySelector("#presets button.chip");
  chip.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  await sleep(30);
  assert.ok(host.classList.contains("open"));
});

test("closed overlay panel can be opened again", async () => {
  const { window } = await mountOverlay();
  await openOverlayPanel(window);
  window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await sleep(350);
  const host = await openOverlayPanel(window);
  assert.ok(host.shadowRoot.querySelectorAll("#presets button.chip").length > 0);
});

test("pointerdown on the shield does not call preventDefault", () => {
  const overlay = read("overlay/ui.js");
  const down = overlay.match(/addEventListener\("pointerdown", \(event\) => ([^)]+)\)/);
  assert.ok(down);
  assert.equal(down[1].includes("preventDefault"), false);
  assert.match(down[1], /stopPropagation/);
});

test("X timeline does not pin the shield to the persistent unmute overlay", async () => {
  const { window, document } = createDom(xPlayerHtml(false), "https://x.com/home");
  lastWindow = window;
  loadAD(window);
  loadOverlay(window);
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
  loadOverlay(window);
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
  loadOverlay(window);
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

test("SPA player remount places a new shield that can open the panel", async () => {
  const { window, document } = await mountOverlay("https://www.youtube.com/watch?v=1");
  const firstBtn = document.getElementById("audio-defender-player-btn");
  assert.ok(firstBtn);

  document.getElementById("movie_player").remove();
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div id="movie_player" class="html5-video-player">
      <video class="html5-main-video"></video>
      <div class="ytp-left-controls">
        <button class="ytp-play-button" aria-label="Pause" type="button"></button>
        <span class="ytp-volume-area">
          <button class="ytp-mute-button" aria-label="Mute" type="button"></button>
          <div class="ytp-volume-panel"></div>
        </span>
      </div>
    </div>`
  );
  await sleep(150);

  const button = document.getElementById("audio-defender-player-btn");
  assert.ok(button);
  assert.equal(button.previousElementSibling.className, "ytp-volume-area");
  assert.ok(document.getElementById("movie_player").contains(button));

  const host = await openOverlayPanel(window);
  assert.equal(host.shadowRoot.querySelectorAll("#presets button.chip").length, 8);
});
