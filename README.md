# Audio Defender

Chrome extension that boosts, compresses, and equalizes site audio, with **free per-channel setups** for Twitch, YouTube, Kick, and X.

Independent project — not affiliated with the commercial Audio Defender extension.

## Install (unpacked)

1. Open Chrome and go to `chrome://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked**
4. Choose this folder (`audio-defender`)
5. Open a Twitch, YouTube, Kick, or X video/stream
6. Click the **shield icon in the player controls** (next to volume), or the toolbar icon

If a tab was already open, reload it once so the processor and player button can attach.

Turning the extension **off** reloads the player so another audio extension can take over. Web Audio's `createMediaElementSource` can only be used by one extension at a time.

## Per-channel setups

On a supported player:

- **All channels** — one shared setup everywhere
- **This channel** — settings saved only for that creator (`twitch:shroud`, `youtube:@handle`, `kick:name`, `x:@user`)

Switching back to **All channels** removes the override for the current channel.

## Notes

- The page volume slider still works. Boost is extra gain on top.
- Custom presets are stored in the extension locally.
- Audio is processed with the Web Audio API in the page (gain, compressor, EQ, optional mono).
