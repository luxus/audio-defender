# Audio Defender — adversarial review

Review of the MV3 unpacked extension on `master` (`4d7152f` product commit; tests/CI later). This PR also lands a **tiny guard** for the overlay storage-wipe race. It is not a DSP rewrite.

`npm test`: **60 passed, 0 failed** on this branch (`node --test --test-force-exit test/*.test.js`). One new test covers the P0 wipe. CI on `master` already added SPA remount coverage for **disconnected** media nodes; a leftover **still-connected** element still sticks ([#6](https://github.com/luxus/audio-defender/issues/6)). The suite does not cover `all_frames` or a suspended `AudioContext`. Several tests **lock in** current bugs (disable does not reload; X is site-wide).

Repo labels `P0`/`P1`/`P2` did not exist; issues use those prefixes in the title plus `bug`. Parallel review PRs (#4 docs, #3/#31 attempted fixes) opened overlapping tickets; duplicates are marked on GitHub. Canonical index:

| Pri | Finding | Issue |
| --- | --- | --- |
| P0 | Overlay `refreshChannel` before `init()` wipes `chrome.storage` | [#5](https://github.com/luxus/audio-defender/issues/5) |
| P0 | DSP graph never leaves a still-connected media element | [#6](https://github.com/luxus/audio-defender/issues/6) |
| P0 | Overlay 200ms poll + unstable keys clobber panel/storage | [#7](https://github.com/luxus/audio-defender/issues/7) |
| P1 | Disable bypasses MES; README promises a reload | [#15](https://github.com/luxus/audio-defender/issues/15) |
| P1 | SPA remount leaks Web Audio graphs | [#16](https://github.com/luxus/audio-defender/issues/16) |
| P1 | `all_frames` + `tabs.sendMessage` first-wins | [#17](https://github.com/luxus/audio-defender/issues/17) |
| P1 | YouTube/Kick/Twitch override keys are not canonical | [#18](https://github.com/luxus/audio-defender/issues/18) |
| P1 | `persist` debounce vs `storage.onChanged` clobbers controls | [#19](https://github.com/luxus/audio-defender/issues/19) |
| P1 | MV3 CSP strips inline `onclick` on compressor/EQ switches | [#20](https://github.com/luxus/audio-defender/issues/20) |
| P1 | X advertised as `x:@user`, stored as one site-wide key | [#21](https://github.com/luxus/audio-defender/issues/21) |
| P1 | Isolated-world DSP listens on spoofable `window.postMessage` | [#22](https://github.com/luxus/audio-defender/issues/22) |
| P1 | Capturing media while `AudioContext` is suspended can mute autoplay | [#14](https://github.com/luxus/audio-defender/issues/14) |
| P2 | Meter bands hardcoded `[0,0,0]`; shield visualizer is dead | [#27](https://github.com/luxus/audio-defender/issues/27) |
| P2 | Sticky `captured` flag; SW meter map dies with the worker | [#28](https://github.com/luxus/audio-defender/issues/28) |
| P2 | Overlay mutates player `position`; `destroy` leaks storage listeners | [#29](https://github.com/luxus/audio-defender/issues/29) |
| P2 | Parser leftovers, unused WAR `page-audio.js`, test gaps | [#30](https://github.com/luxus/audio-defender/issues/30) |

---

## P0 (verified)

### Overlay first-open wipes storage — [#5](https://github.com/luxus/audio-defender/issues/5)

`AD.bindPanel` seeds `ui.state = emptyState()` and hydrates in async `init()`. `overlay.js` `togglePanel` calls `bound.refreshChannel()` on the same turn. `nextKey !== null` → `flushToState()` + `saveState` of empty `channelSettings` / `customPresets`.

jsdom: Voice global + `twitch:shroud` Night + Gym preset became Leveler / `{}` / `{}` after a same-turn `refreshChannel()`.

**This PR:** `hydrated` guard so `refreshChannel` / `persist` cannot save until `getState()` finishes. Regression: `test/panel.test.js` “refreshChannel before init must not wipe…”. Still needed: stop 200ms `refreshChannel` while closed; don’t treat `null → first key` as a switch ([#7](https://github.com/luxus/audio-defender/issues/7)).

Pointers: `shared/panel.js` (`refreshChannel`, `init`), `overlay.js` (`ensurePanel`, `togglePanel`).

### Graph sticks to the first connected element — [#6](https://github.com/luxus/audio-defender/issues/6)

```javascript
if (currentEl && currentEl.isConnected && this.graphFor(currentEl)) {
  return this.graphFor(currentEl);
}
```

jsdom: hide the captured `.html5-main-video` (still connected), append a new one, re-`apply` → old stays captured, new never gets a `MediaElementSource`. Observer/90ms scan only run when `!isConnected`.

Pointers: `page-audio.js` `attachBest`, `pickMedia`, `currentEl`.

### Unstable channel keys + overlay poll — [#7](https://github.com/luxus/audio-defender/issues/7), [#18](https://github.com/luxus/audio-defender/issues/18)

Same YouTube creator, different keys (verified):

| Input | Key |
| --- | --- |
| `/watch` no DOM | `null` |
| `ab_channel=Marques Brownlee` | `youtube:marques brownlee` |
| owner `/@mkbhd` | `youtube:mkbhd` |
| `/channel/UC…` | `youtube:UCBJycsmduvYI7KBqaKLPckQ` |
| `/user/marquesbrownlee` | `youtube:marquesbrownlee` |

After first panel open, overlay calls `refreshChannel()` every 200ms even when closed. Each key flicker flushes the visible sliders into the previous key.

---

## P1 (verified)

**MES exclusivity / disable** ([#15](https://github.com/luxus/audio-defender/issues/15)) — `bypass()` keeps the `MediaElementSource`. README says disable reloads the player. Tests assert the opposite (`test/audio.test.js`, `test/syntax.test.js`). Other EQ extensions cannot attach without a manual reload. `needsReload` only trips when `tabs.sendMessage` throws.

**Autoplay silence** ([#14](https://github.com/luxus/audio-defender/issues/14)) — `applyNow` at `document_idle` constructs an `AudioContext` and immediately `createMediaElementSource`. Native output is gone. If `ctx` is `suspended`, video is silent until a gesture; `play` from autoplay often does not count. Fake context in tests starts `running`. Do not capture until `ctx.state === "running"`.

**`all_frames: true`** ([#17](https://github.com/luxus/audio-defender/issues/17)) — every iframe runs DSP + overlay + 90ms `AD_LEVELS`. Popup `chrome.tabs.sendMessage` without `frameId` takes the first reply (`AD_GET_CHANNEL` from live chat / `player.twitch.tv` can win). `background.js` `metersByTab` is one slot per tab.

**Panel races** ([#19](https://github.com/luxus/audio-defender/issues/19), [#20](https://github.com/luxus/audio-defender/issues/20)) — `writing` is set only inside the persist timer; `storage.onChanged` rebuilds EQ sliders mid-drag. `popup.html` inline `onclick="event.stopPropagation()"` is inert under MV3 CSP.

**X** ([#21](https://github.com/luxus/audio-defender/issues/21)) — `parseX` always `{id:"site"}`; `overrideKey` → `"x"`. `xFromDom` is dead. README still says `x:@user`. Twitch `/login` parses as `twitch:login`.

**Spoofable bus** ([#22](https://github.com/luxus/audio-defender/issues/22)) — isolated-world `page-audio.js` still listens on `window.postMessage` / `ad-audio-cmd`. Page JS can send `{from:"ext", type:"apply"}`.

---

## P2

Dead meter bands (`getMeter` always `[0,0,0]`), sticky `captured`, in-memory SW meters, overlay `root.style.position = "relative"`, `bindPanel.destroy` not removing `storage.onChanged`, unused `YOUTUBE_RESERVED` / WAR `page-audio.js`, `ready` event fired before `content.js` listens. See [#27](https://github.com/luxus/audio-defender/issues/27)–[#30](https://github.com/luxus/audio-defender/issues/30).

---

## Suggested order

1. Keep the `hydrated` guard (this PR) and stop closed-panel `refreshChannel` ([#5](https://github.com/luxus/audio-defender/issues/5), [#7](https://github.com/luxus/audio-defender/issues/7)).
2. Canonical YouTube keys + debounce identity ([#18](https://github.com/luxus/audio-defender/issues/18)).
3. Retarget / teardown graphs; define disable vs release; don’t MES-capture a suspended context ([#6](https://github.com/luxus/audio-defender/issues/6), [#14](https://github.com/luxus/audio-defender/issues/14), [#15](https://github.com/luxus/audio-defender/issues/15), [#16](https://github.com/luxus/audio-defender/issues/16)).
4. Frame election for overlay/DSP/popup ([#17](https://github.com/luxus/audio-defender/issues/17)).
5. CSP-safe toggles, one storage writer, drop the page `postMessage` bus ([#19](https://github.com/luxus/audio-defender/issues/19)–[#22](https://github.com/luxus/audio-defender/issues/22)).
