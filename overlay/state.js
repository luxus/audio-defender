var AD = AD || {};
AD.overlay = AD.overlay || {};

AD.overlay.BUTTON_ID = AD.overlay.BUTTON_ID || "audio-defender-player-btn";
AD.overlay.PANEL_ID = AD.overlay.PANEL_ID || "audio-defender-player-panel";
if (AD.overlay.bound === undefined) AD.overlay.bound = null;
if (AD.overlay.open === undefined) AD.overlay.open = false;
if (AD.overlay.cssText === undefined) AD.overlay.cssText = "";
if (AD.overlay.popupDoc === undefined) AD.overlay.popupDoc = null;
if (AD.overlay.ready === undefined) AD.overlay.ready = false;
if (AD.overlay.tickTimer === undefined) AD.overlay.tickTimer = 0;
