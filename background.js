importScripts("shared/presets.js", "shared/channel.js", "shared/storage.js");

const metersByTab = new Map();

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(AD.STORAGE_KEY);
  if (!current[AD.STORAGE_KEY]) {
    await AD.saveState(AD.emptyState());
  }
});

async function refreshBadge() {
  try {
    const state = await AD.getState();
    await chrome.action.setBadgeBackgroundColor({ color: "#7d6eae" });
    await chrome.action.setBadgeText({ text: state.enabled ? "" : "OFF" });
  } catch (err) {}
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[AD.STORAGE_KEY]) refreshBadge();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "AD_LEVELS" && sender.tab) {
    const prev = metersByTab.get(sender.tab.id) || {};
    if (message.captured || !prev.captured) {
      metersByTab.set(sender.tab.id, message);
    }
    return;
  }
  if (message && message.type === "AD_GET_METER") {
    chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      sendResponse(metersByTab.get(tabs[0] && tabs[0].id) || { rms: 0, bands: [0, 0, 0], conflict: false });
    });
    return true;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => metersByTab.delete(tabId));

refreshBadge();
