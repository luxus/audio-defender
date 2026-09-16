# Audio Defender — adversarial review

Review of `luxus/audio-defender` at `4d7152f` (single commit on `main`/`master`). Docs-only: **no fixes in this PR**.

Baseline: `npm test` on this tree is **43/43 passing** (`node --test --test-force-exit test/*.test.js`, jsdom). The suite does not cover the P0 races below; several tests encode today’s buggy behavior (disable does not reload; X is site-wide).

## How to read this

Priority in titles/issues:

| Pri | Meaning |
| --- | --- |
| **P0** | Ships broken: data loss, silent audio, or panel/state desync on normal use |
| **P1** | Correctness / SPA / MV3 bugs that will hit real users on Twitch/YT/Kick/X |
| **P2** | Edge parsers, leaks, hygiene, missing tests |

GitHub issues are opened 1:1 with the shippable findings below. This file is the indexed backlog with file:line evidence.

---

## P0

### P0-1 — Opening the player panel can wipe `chrome.storage.local`

`AD.bindPanel` starts `ui.state` as `AD.emptyState()` and loads real storage only in async `init()`. Overlay calls `refreshChannel()` **synchronously** after `bindPanel()` returns, before `getState()` resolves.

On a supported page `getChannel()` is non-null, `ui.channel` is still `null`, so `nextKey !== prevKey`. `refreshChannel` then `flushToState()` + `AD.saveState(ui.state)` of the in-memory empty state (`channelSettings: {}`, `customPresets: {}`).

**Effect:** first click of the player shield can delete every per-channel override and custom preset. UI may still paint the pre-wipe snapshot if `getState()` wins the race, so the user sees “correct” controls while disk is already empty. Next load is Leveler/defaults.

Evidence:

- `shared/panel.js:56-63` — `ui.state = AD.emptyState()`, `channel: null`
- `shared/panel.js:235-254` — key change always flushes and saves
- `shared/panel.js:435-449` — `init()` awaits `AD.getState()` after return
- `overlay.js:327-339` — `bound = AD.bindPanel(...)`
- `overlay.js:405-411` — `togglePanel` → `bound.refreshChannel()` on the same turn
- `overlay.js:516` and `overlay.js:530-533` — extra `refreshChannel` every 800ms / 200ms after first bind

Tests never call `refreshChannel` before `sleep(40)`, so this stays green.

**Fix direction:** do not `saveState` until `init()` finishes; treat `null → first key` as bind, not a channel switch; don’t persist on overlay open.

---

### P0-2 — `createMediaElementSource` attaches once, then never retargets

Web Audio allows **one** `MediaElementSource` per element. The engine correctly refuses a second call (`InvalidStateError` → conflict). It also **refuses to leave** the first connected element, even when a better/playing video exists.

```149:153:page-audio.js
    attachBest() {
      this.resume();
      if (currentEl && currentEl.isConnected && this.graphFor(currentEl)) {
        return this.graphFor(currentEl);
      }
```

`pickMedia()` (`page-audio.js:125-147`) uses `document.querySelector(...)` first-match for preferred selectors (last clause is plain `video`). Scoring of playing/unmuted media only runs if that query misses.

Scan/observer/interval **do not** re-pick while `captured && currentEl.isConnected` (`page-audio.js:415-425`).

**Effect:**

- **X timeline / multiple `<video>`:** first DOM video (often a muted preview) is captured forever; the video the user actually opened is unprocessed, and MES exclusivity is burned on the wrong node.
- **Twitch/YT ads or preroll:** ad `<video>` stays in DOM → main player never captured.
- **SPA remount that leaves the old node connected** (YouTube miniplayer + watch, hidden preload): graph stays on the dead/hidden element. New media plays through the element path, not the DSP graph — sounds like “extension stopped working” after navigation.

Disable only `bypass`es the same source (`page-audio.js:111-116`, `377-382`); it does not free the element for a later retarget.

**Fix direction:** score playing media every scan; if the winner ≠ `currentEl`, bypass (or fully tear down) the old graph and `makeGraph` the new element. Treat “still connected but paused/hidden/0×0” as eligible to abandon.

---

### P0-3 — Overlay channel polling + unstable keys clobber panel and storage

After the panel is created once, overlay calls `refreshChannel()` on an 800ms tick **and** a 200ms interval **even while closed** (`overlay.js:516`, `530-533`).

Any `overrideKey` change:

1. `flushToState()` writes the **currently displayed** sliders into the **previous** key (or `global`)
2. loads the new key
3. `syncControls()` rebuilds EQ/preset DOM
4. `saveState`

YouTube `/watch` identity is not stable:

- `ab_channel` (display name) wins over DOM (`shared/channel.js:197-202`) → key `youtube:linus tech tips`
- channel page `/ @handle` → `youtube:linustechtips` (`shared/channel.js:186-188`)
- owner renderer also has `/channel/UC…` (`shared/channel.js:209-220`)

During SPA navigation the DOM lags the URL, so keys flicker `handle ↔ UC ↔ ab_channel ↔ null`. Each flicker persists. That is the historical “panel jumps / Overwrite forgets / Default got my channel EQ” class of bugs.

Twitch VODs/clips use `fromDomLink` with a broad `a.tw-link[href^="/"]` (`shared/channel.js:163-165`), which can briefly resolve a nav link as the channel id.

`test/panel.test.js` only switches Twitch keys **once**, with a stable `getChannel()` stub, after init has completed.

**Fix direction:** debounce identity until it is stable; never flush on `null` flicker; canonicalize YouTube to one id (handle or UC, not `ab_channel`); don’t poll `refreshChannel` while the panel is closed; don’t `saveState` unless settings actually changed.

---

## P1

### P1-1 — Disable does not release MES; README is false

README: “Turning the extension **off** reloads the player so another audio extension can take over.”

Code: disable `bypass`es `source → destination` and **keeps** the `MediaElementSource` (`page-audio.js:111-116`, `191-198`, `377-382`). Tests **require** this (`test/audio.test.js` “disable bypasses… without dropping”, `test/syntax.test.js` “never reloads the tab on disable”).

`createMediaElementSource` still cannot be called by another extension (or by a later retarget of this one) until the media element is destroyed. Off is not off.

**Fix direction:** either honor the README (reload / recreate the media node on disable) or change the README and expose “release / reload player”. Bypass-only cannot share the element.

---

### P1-2 — SPA remount leaks the entire Web Audio graph

When `currentEl` is finally replaced, `attachBest` only `bypass`es the old source (`page-audio.js:157-159`). It never disconnects the rest of the graph from `ctx.destination` or drops the `MediaElementSource`.

`MediaElementAudioSourceNode` holds the element, so the `WeakMap`/`WeakSet` (`page-audio.js:7-8`) never GC. Each Twitch channel switch / YT player rebuild leaves another compressor/EQ/analyser chain connected to the destination.

**Fix direction:** on abandon, fully `disconnect()` every node in the graph, `graphs.delete(el)`, and drop the source. You still cannot reuse that **same** element; you can stop leaking.

---

### P1-3 — `all_frames: true` + `tabs.sendMessage` first-wins

`manifest.json:40-58` injects the full stack (DSP, overlay, panel) into **every** matching iframe (`live_chat`, embeds, ads, player.twitch.tv, …).

`chrome.tabs.sendMessage(tabId, {type:"AD_GET_CHANNEL"})` has no `frameId` (`shared/panel.js:425-432`). Chrome delivers to all frames; **the first `sendResponse` wins**. A chat iframe with `channel: null` (or a wrong parse) makes the toolbar popup think Overwrite is unavailable, or binds the wrong channel. `AD_APPLY` at least broadcasts (usually OK).

Meters: every frame posts `AD_LEVELS` every 90ms (`content.js:114-124`). Background keeps one blob per tab and prefers `captured` (`background.js:25-29`) but **last captured writer wins** — an iframe that captured a tiny video fights the main player.

Duplicate overlays: every frame with a `<video>` runs `overlay.js` and may inject a shield.

**Fix direction:** `all_frames` only where the player actually lives, or gate DSP/overlay to top + known player frames; popup should query frames and pick `frame === "top"` or `captured`.

---

### P1-4 — YouTube (and Kick/Twitch edge) channel keys are not canonical

Even without flicker, one creator gets multiple storage rows:

| Surface | Key |
| --- | --- |
| `youtube.com/@mkbhd` | `youtube:mkbhd` |
| `/watch?v=…&ab_channel=Marques%20Brownlee` | `youtube:marques brownlee` |
| owner link `/channel/UC…` | `youtube:UCxxxx` |
| `/c/Name` or `/user/Name` | yet another slug |

`AD.overrideKey` (`shared/channel.js:88-94`) is `site:id` with whatever `parseYouTube` happened to see. Overwrite on a channel page does not apply on that creator’s VODs.

Kick `kick.com/video/…` is **not** reserved (`shared/channel.js:27-42`, `173-179`) → bogus `kick:video`. Twitch `fromDomLink` does not apply `TWITCH_RESERVED`.

**Fix direction:** persist a canonical id (prefer UC or handle, resolve via DOM, ignore `ab_channel` for the key, keep it as label only).

---

### P1-5 — Panel `writing` flag does not cover persist debounce or dual UI

`persist()` flushes into `ui.state` immediately but sets `writing = true` only inside the 0ms/40ms timer (`shared/panel.js:260-277`). Until then `chrome.storage.onChanged` (`shared/panel.js:472-477`) reloads storage and `syncControls()`, which **rebuilds EQ sliders** (`shared/panel.js:69-90`, `100-125`).

Sources of mid-drag `onChanged`:

- overlay `refreshChannel` save (P0-3)
- toolbar popup and in-page panel both bound (`popup.js` + overlay)
- own `saveState` completing after `writing = false` (SW / async ordering)

This is the other historical panel-break: sliders snap back, EQ thumb disappears, preset chip selection jumps.

**Fix direction:** generation counters / ignore `onChanged` for self-writes; don’t `syncControls()` from storage while a persist timer is pending; one writer.

---

### P1-6 — MV3 CSP strips inline `onclick` on module toggles

```74:77:popup.html
            <label class="toggle tiny" onclick="event.stopPropagation()">
              <input id="compressorEnabled" type="checkbox" checked />
```

Same for the EQ toggle (`popup.html:100`). Default extension CSP is `script-src 'self'` — **inline event handlers do not run** in the toolbar popup. Clicks bubble to `#compressorTogglePanel` / `#equalizerTogglePanel`, so enabling compressor also opens/closes the advanced panel.

Cloned into the page shadow tree, YouTube’s page CSP is similarly hostile to inline handlers.

**Fix direction:** `addEventListener` in `bindPanel`; drop inline JS from `popup.html`.

---

### P1-7 — X “per-channel” is advertised, implemented as one site-wide key

README: setups for `x:@user`. Tests and code disagree:

- `parseX` always `{ site:"x", id:"site" }` (`shared/channel.js:205-207`)
- `overrideKey` short-circuits `channel.site === "x"` → `"x"` (`shared/channel.js:91`)
- `xFromDom` exists and is **never called** (`shared/channel.js:263-271`)
- Panel copy: “Overwrite is on for all of X.com” (`shared/panel.js:157-158`)
- `test/channel.test.js` / `test/panel.test.js` assert site-wide

Combined with P0-2, X is the worst site: one shared setup **and** the wrong video captured.

**Fix direction:** either wire `xFromDom` into `parseX` (and stop special-casing `"x"` in `overrideKey`) or fix README/UI to “site-wide on X”.

---

### P1-8 — Content-script `postMessage` / `CustomEvent` bus is spoofable

`page-audio.js` and `content.js` live in the **same isolated world** (`manifest.json` content_scripts, no `"world": "MAIN"`; `test/manifest.test.js` asserts this). The `window.postMessage(..., "*")` + `ad-audio-cmd` / `ad-audio-evt` bridge is unnecessary and visible to the page.

Page JS (or XSS, or another extension’s MAIN-world script) can `postMessage` `{ __audioDefender: true, from: "ext", type: "apply", ... }` (`page-audio.js:387-397`) or spoof meter events (`content.js:55-61`).

**Fix direction:** in-world function calls / `chrome.runtime` messages only; do not listen on `window` for DSP commands.

---

## P2

### P2-1 — Meter bands are hardcoded `[0,0,0]`; shield “EQ bars” don’t move

`page-audio.js:299` always `bands: [0,0,0]`. `overlay.js:479-491` sizes `.ad-bar` from those bands. Visualizer is dead by construction. `tainted` is set `false` in `attachBest` and never `true`.

LUFS (`kAnalyser`) is tapped at **preGain** (pre EQ/comp/limit) while the bar uses `outAnalyser`. `loudHistory` is not reset on graph switch (`page-audio.js:16`, `252-267`).

### P2-2 — Sticky `captured` / conflict; service worker meters die with the worker

`content.js:70` and `page-audio.js:175`: `captured` latches true. Home / no-video still reports captured. `background.js:3` `metersByTab` is in-memory; MV3 SW sleep clears it until the 90ms ping. `AD_GET_METER` uses `active: true, currentWindow: true` (`background.js:32-36`) — wrong tab if the popup’s window isn’t the player.

### P2-3 — Overlay mutates host CSS and leaks listeners

`overlay.js:512-514` forces `position: relative` on the player root. `bindPanel.destroy` only `clearInterval(meterTimer)` (`shared/panel.js:485-487`) — `storage.onChanged` and control listeners remain if the host is recreated. `ensurePanel` may `bound.destroy()` then bind again (`overlay.js:327-328`) without removing the old listener.

### P2-4 — Parser / host leftovers

- `YOUTUBE_RESERVED` / `TWITCH_RESERVED` duplicate keys (`feed`, `inventory`).
- `supportedHost` + matches include `music.youtube.com`, `studio.youtube.com`.
- No `match_about_blank` — some players in `about:blank` iframes will not get the script.
- `page-audio.js` listed in `web_accessible_resources` but never injected as a page script.
- YouTube Shorts / embed / `youtu.be` depend on DOM selectors that often miss.
- Compressor Reset on a custom preset falls back to Leveler (`shared/panel.js:384-389`).
- 90ms timers in **every** frame (`content.js`, `page-audio.js`) + 200ms overlay poll: idle CPU.

### P2-5 — Test gap (why 43/43 does not mean safe)

Missing coverage that would have failed this review:

- `refreshChannel` before `init()` completes (P0-1)
- second `<video>` while `currentEl` still connected (P0-2)
- YouTube `ab_channel` vs `@handle` vs `/channel/UC` key equality (P0-3 / P1-4)
- `tabs.sendMessage` with multiple frames (P1-3)
- persist-in-flight vs `storage.onChanged` (P1-5)
- popup.html contains no inline handlers (P1-6)

Existing tests lock in P1-1 and P1-7.

---

## Suggested fix order (do not do it in this PR)

1. **P0-1** — gate `refreshChannel` / `saveState` on init; never persist empty state.
2. **P0-3 / P1-5** — stop 200ms overlay polling; debounce identity; ignore self `onChanged`.
3. **P0-2 / P1-2 / P1-1** — retarget + teardown graphs; define disable vs release.
4. **P1-4 / P1-7** — canonical channel keys; X product decision.
5. **P1-3 / P1-6 / P1-8** — frames, CSP, messaging.
6. Tests for the above before more DSP work.

---

## Issue index

Filled in after GitHub issues are opened.

| Pri | Finding | Issue |
| --- | --- | --- |
| P0 | Overlay init race wipes storage | _pending_ |
| P0 | MES never retargets connected media | _pending_ |
| P0 | Channel-key flicker + overlay poll clobbers state | _pending_ |
| P1 | Disable does not release MES | _pending_ |
| P1 | Graph leak on SPA remount | _pending_ |
| P1 | `all_frames` + sendMessage first-wins | _pending_ |
| P1 | Non-canonical YouTube/Kick/Twitch keys | _pending_ |
| P1 | persist / `onChanged` panel clobber | _pending_ |
| P1 | MV3 inline `onclick` CSP | _pending_ |
| P1 | X per-channel vs site-wide | _pending_ |
| P1 | Spoofable page message bus | _pending_ |
| P2 | Dead meter bands / inconsistent LUFS | _pending_ |
| P2 | Sticky captured + SW meters | _pending_ |
| P2 | Overlay host CSS + listener leak | _pending_ |
| P2 | Parser leftovers + test gap | _pending_ |
