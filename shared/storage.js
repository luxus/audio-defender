var AD = AD || {};

AD.STORAGE_KEY = "ad_state";

AD.emptyState = function () {
  return {
    version: 1,
    enabled: true,
    global: AD.defaultSettings(),
    channelSettings: {},
    customPresets: {}
  };
};

AD.normalizeState = function (raw) {
  var state = AD.emptyState();
  if (!raw || typeof raw !== "object") return state;
  state.enabled = raw.enabled !== false;
  state.global = AD.normalizeSettings(raw.global);
  state.channelSettings = {};
  state.customPresets = {};

  var key;
  var channels = raw.channelSettings || {};
  for (key in channels) {
    if (Object.prototype.hasOwnProperty.call(channels, key)) {
      state.channelSettings[key] = AD.normalizeSettings(channels[key]);
    }
  }
  var presets = raw.customPresets || {};
  for (key in presets) {
    if (Object.prototype.hasOwnProperty.call(presets, key) && key.trim()) {
      state.customPresets[key] = AD.normalizeSettings(presets[key]);
      state.customPresets[key].activePreset = "custom:" + key;
    }
  }
  return state;
};

AD.getState = async function () {
  var result = await chrome.storage.local.get(AD.STORAGE_KEY);
  return AD.normalizeState(result[AD.STORAGE_KEY]);
};

AD.saveState = async function (state) {
  var normalized = AD.normalizeState(state);
  await chrome.storage.local.set({ [AD.STORAGE_KEY]: normalized });
  return normalized;
};

AD.resolveSettings = function (state, channel) {
  var key = AD.overrideKey(channel);
  if (key && state.channelSettings[key]) {
    return {
      settings: AD.normalizeSettings(state.channelSettings[key]),
      scope: "override"
    };
  }
  return {
    settings: AD.normalizeSettings(state.global),
    scope: "default"
  };
};
