var AD = AD || {};

AD.bindPanel = function (root, options) {
  options = options || {};
  const inPage = options.mode === "overlay";

  function $(id) {
    const scope = root.querySelector ? root : document;
    const sel = id.charAt(0) === "#" ? id : "#" + id;
    return scope.querySelector(sel);
  }

  function on(el, type, fn) {
    if (el) el.addEventListener(type, fn);
  }

  const els = {
    enabled: $("#enabled"),
    reloadHint: $("#reloadHint"),
    siteHint: $("#siteHint"),
    conflictHint: $("#conflictHint"),
    meterFill: $("#meterFill"),
    meterGr: $("#meterGr"),
    meterReadout: $("#meterReadout"),
    boost: $("#boost"),
    boostValue: $("#boostValue"),
    mono: $("#mono"),
    presets: $("#presets"),
    scopeDefault: $("#scopeDefault"),
    scopeOverwrite: $("#scopeOverwrite"),
    scopeHelp: $("#scopeHelp"),
    compressorEnabled: $("#compressorEnabled"),
    compressorTogglePanel: $("#compressorTogglePanel"),
    compressorPanel: $("#compressorPanel"),
    equalizerEnabled: $("#equalizerEnabled"),
    equalizerTogglePanel: $("#equalizerTogglePanel"),
    equalizerPanel: $("#equalizerPanel"),
    eqBands: $("#eqBands"),
    strength: $("#strength"),
    strengthValue: $("#strengthValue"),
    threshold: $("#threshold"),
    ratio: $("#ratio"),
    attack: $("#attack"),
    release: $("#release"),
    limiterThreshold: $("#limiterThreshold"),
    thresholdValue: $("#thresholdValue"),
    ratioValue: $("#ratioValue"),
    attackValue: $("#attackValue"),
    releaseValue: $("#releaseValue"),
    limiterThresholdValue: $("#limiterThresholdValue"),
    resetCompressor: $("#resetCompressor"),
    presetName: $("#presetName"),
    savePreset: $("#savePreset")
  };

  const ui = {
    state: AD.emptyState(),
    settings: AD.defaultSettings(),
    scope: "default",
    channel: null,
    tabId: null,
    needsReload: false
  };

  function shell() {
    return root.body || root.querySelector(".ad-root") || root;
  }

  function renderEq() {
    if (!els.eqBands) return;
    els.eqBands.innerHTML = "";
    AD.EQ_BANDS.forEach((band, index) => {
      const label = document.createElement("label");
      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = "-12";
      slider.max = "12";
      slider.step = "1";
      slider.value = String(ui.settings.equalizer.gains[index] || 0);
      slider.addEventListener("input", () => {
        ui.settings.equalizer.gains[index] = Number(slider.value);
        markCustom();
        persist();
      });
      const caption = document.createElement("span");
      caption.textContent = band.label;
      label.append(slider, caption);
      els.eqBands.append(label);
    });
  }

  function markCustom() {
    ui.settings.activePreset = AD.matchPreset(ui.settings, ui.state.customPresets);
  }

  function formatMs(seconds) {
    return Math.round(seconds * 1000) + " ms";
  }

  function syncControls() {
    try {
      ui.settings = AD.normalizeSettings(ui.settings);
      const s = ui.settings;
      const node = shell();
      if (node && node.classList) node.classList.toggle("disabled", !ui.state.enabled);
      if (els.enabled) els.enabled.checked = ui.state.enabled;
      if (els.boost) els.boost.value = String(s.boost);
      if (els.boostValue) els.boostValue.textContent = s.boost + "%";
      if (els.mono) els.mono.checked = s.mono;
      if (els.strength) els.strength.value = String(s.strength);
      if (els.compressorEnabled) els.compressorEnabled.checked = s.compressor.enabled;
      if (els.equalizerEnabled) els.equalizerEnabled.checked = s.equalizer.enabled;
      if (els.threshold) els.threshold.value = String(s.compressor.threshold);
      if (els.ratio) els.ratio.value = String(s.compressor.ratio);
      if (els.attack) els.attack.value = String(Math.round(s.compressor.attack * 1000));
      if (els.release) els.release.value = String(Math.round(s.compressor.release * 1000));
      if (els.limiterThreshold) els.limiterThreshold.value = String(s.compressor.limiterThreshold);
      if (els.scopeDefault) els.scopeDefault.classList.toggle("active", ui.scope !== "override");
      if (els.scopeOverwrite) {
        els.scopeOverwrite.classList.toggle("active", ui.scope === "override");
        els.scopeOverwrite.disabled = !AD.overrideKey(ui.channel);
      }
      syncCompressorLabels();
      renderPresetChips();
      renderEq();
      renderScopeHelp();
      refreshHints();
    } catch (err) {
      console.error(err);
      renderPresetChips();
    }
  }

  function refreshHints() {
    const status = options.getStatus ? options.getStatus() : null;
    if (els.conflictHint) {
      const conflict = Boolean(status && status.conflict);
      els.conflictHint.classList.toggle("hidden", !conflict);
    }
    if (els.reloadHint) {
      els.reloadHint.classList.toggle("hidden", !ui.needsReload);
    }
    if (els.siteHint) {
      const supported = ui.channel || inPage;
      els.siteHint.classList.toggle("hidden", Boolean(supported) || ui.needsReload);
    }
  }

  function renderScopeHelp() {
    if (!els.scopeHelp) return;
    const place = AD.overridePlace(ui.channel);
    if (!place) {
      els.scopeHelp.textContent = "Open Twitch, YouTube, Kick, or X to overwrite that page.";
      return;
    }
    if (ui.scope === "override") {
      els.scopeHelp.textContent = ui.channel.site === "x"
        ? "Overwrite is on for all of X.com. Other sites still use Default."
        : "Overwrite is on for " + place + ". Other channels still use Default.";
      return;
    }
    els.scopeHelp.textContent = "Editing Default — applies everywhere unless a channel has Overwrite on.";
  }

  function renderPresetChips() {
    if (!els.presets) return;
    els.presets.innerHTML = "";
    AD.PRESET_ORDER.forEach((id) => {
      els.presets.append(chipButton(AD.PRESET_LABELS[id], ui.settings.activePreset === id, () => applyPreset(id)));
    });
    Object.keys(ui.state.customPresets).forEach((name) => {
      const button = chipButton(name, ui.settings.activePreset === "custom:" + name, () => applyCustom(name));
      button.classList.add("custom");
      const x = document.createElement("span");
      x.className = "x";
      x.textContent = "×";
      x.addEventListener("click", (event) => {
        event.stopPropagation();
        delete ui.state.customPresets[name];
        if (ui.settings.activePreset === "custom:" + name) ui.settings.activePreset = null;
        persist(true);
      });
      button.append(x);
      els.presets.append(button);
    });
  }

  function chipButton(label, active, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip" + (active ? " active" : "");
    button.textContent = label;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      onClick();
    });
    return button;
  }

  function applyPreset(id) {
    ui.settings = AD.cloneSettings(AD.PRESETS[id]);
    persist(true);
  }

  function applyCustom(name) {
    ui.settings = AD.normalizeSettings(ui.state.customPresets[name]);
    ui.settings.activePreset = "custom:" + name;
    persist(true);
  }

  function flushToState() {
    ui.settings.activePreset = AD.matchPreset(ui.settings, ui.state.customPresets);
    const key = AD.overrideKey(ui.channel);
    if (ui.scope === "override" && key) {
      ui.state.channelSettings[key] = AD.cloneSettings(ui.settings);
    } else {
      ui.scope = "default";
      ui.state.global = AD.cloneSettings(ui.settings);
    }
  }

  function applyResolved() {
    const resolved = AD.resolveSettings(ui.state, ui.channel);
    ui.settings = resolved.settings;
    ui.scope = resolved.scope;
  }

  function sameOverrideChannel(a, b) {
    const keysA = AD.overrideKeys(a);
    const keysB = AD.overrideKeys(b);
    if (!keysA.length || !keysB.length) return false;
    return keysA.some((key) => keysB.indexOf(key) !== -1);
  }

  function currentChannel() {
    if (options.getChannel) return options.getChannel();
    const href = typeof location !== "undefined" ? location.href : "";
    const doc = typeof document !== "undefined" ? document : null;
    return AD.parseChannel(href, doc);
  }

  function refreshChannel() {
    const channel = currentChannel();
    const nextKey = AD.overrideKey(channel);
    const prevKey = AD.overrideKey(ui.channel);
    const nextPlace = AD.overridePlace(channel);
    const prevPlace = AD.overridePlace(ui.channel);
    const sameAlias = sameOverrideChannel(channel, ui.channel);
    if (nextKey === prevKey || sameAlias) {
      ui.channel = channel;
      if (nextPlace !== prevPlace) renderScopeHelp();
      return false;
    }
    flushToState();
    ui.channel = channel;
    applyResolved();
    syncControls();
    writing = true;
    AD.saveState(ui.state).then(pingTab).catch(() => {}).finally(() => {
      writing = false;
    });
    return true;
  }

  let persistTimer = 0;
  let writing = false;

  function persist(fullState) {
    flushToState();
    if (fullState) syncControls();
    else {
      if (els.boostValue) els.boostValue.textContent = ui.settings.boost + "%";
      if (els.strengthValue) els.strengthValue.textContent = Math.round(ui.settings.strength) + "%";
      renderPresetChips();
      renderScopeHelp();
    }
    clearTimeout(persistTimer);
    persistTimer = setTimeout(async () => {
      writing = true;
      try {
        await AD.saveState(ui.state);
        pingTab();
      } catch (err) {}
      writing = false;
    }, fullState ? 0 : 40);
  }

  function pingTab() {
    if (inPage) return;
    if (!ui.tabId) return;
    chrome.tabs.sendMessage(ui.tabId, { type: "AD_APPLY" }).catch(() => {});
  }

  function setOverwrite(on) {
    refreshChannel();
    const key = AD.overrideKey(ui.channel);
    if (on) {
      if (!key) return;
      if (!ui.state.channelSettings[key]) {
        ui.state.channelSettings[key] = AD.cloneSettings(ui.settings);
      }
      ui.settings = AD.cloneSettings(ui.state.channelSettings[key]);
      ui.scope = "override";
    } else {
      if (key) delete ui.state.channelSettings[key];
      ui.settings = AD.cloneSettings(ui.state.global);
      ui.scope = "default";
    }
    persist(true);
  }

  function setMeter(meter) {
    if (!meter) return;
    const rmsDb = Number.isFinite(meter.rmsDb)
      ? meter.rmsDb
      : 20 * Math.log10(Math.max(1e-6, Number(meter.rms) || 1e-6));
    const pct = Math.max(0, Math.min(100, ((rmsDb + 60) / 60) * 100));
    if (els.meterFill) els.meterFill.style.width = Math.round(pct) + "%";
    const gr = Math.max(0, Math.min(40, -(Number(meter.grDb) || 0))) / 40 * 100;
    if (els.meterGr) els.meterGr.style.width = (0.25 * gr).toFixed(1) + "%";
    if (els.meterReadout) {
      let text = "";
      if (Number.isFinite(meter.loudDb) && meter.loudDb > -80) {
        text = "≈ " + Math.round(meter.loudDb) + " LUFS";
      }
      if (Number.isFinite(meter.grDb) && meter.grDb < -0.5) {
        text += (text ? " · " : "") + "Limiting " + Math.round(-meter.grDb) + " dB";
      }
      els.meterReadout.textContent = text;
    }
  }

  on(els.enabled, "change", () => {
    ui.state.enabled = els.enabled.checked;
    persist(true);
  });
  on(els.boost, "input", () => {
    ui.settings.boost = Number(els.boost.value);
    markCustom();
    persist();
  });
  on(els.mono, "change", () => {
    ui.settings.mono = els.mono.checked;
    markCustom();
    persist();
  });
  on(els.compressorEnabled, "change", () => {
    ui.settings.compressor.enabled = els.compressorEnabled.checked;
    markCustom();
    persist();
  });
  on(els.equalizerEnabled, "change", () => {
    ui.settings.equalizer.enabled = els.equalizerEnabled.checked;
    markCustom();
    persist();
  });
  on(els.strength, "input", () => {
    ui.settings.strength = Number(els.strength.value);
    persist();
    syncCompressorLabels();
  });
  on(els.threshold, "input", () => {
    ui.settings.compressor.threshold = Number(els.threshold.value);
    markCustom();
    persist();
    syncCompressorLabels();
  });
  on(els.ratio, "input", () => {
    ui.settings.compressor.ratio = Number(els.ratio.value);
    markCustom();
    persist();
    syncCompressorLabels();
  });
  on(els.attack, "input", () => {
    ui.settings.compressor.attack = Number(els.attack.value) / 1000;
    markCustom();
    persist();
    syncCompressorLabels();
  });
  on(els.release, "input", () => {
    ui.settings.compressor.release = Number(els.release.value) / 1000;
    markCustom();
    persist();
    syncCompressorLabels();
  });
  on(els.limiterThreshold, "input", () => {
    ui.settings.compressor.limiterThreshold = Number(els.limiterThreshold.value);
    markCustom();
    persist();
    syncCompressorLabels();
  });
  on(els.resetCompressor, "click", () => {
    const id = ui.settings.activePreset;
    const base = id && AD.PRESETS[id] ? AD.PRESETS[id] : AD.PRESETS.leveler;
    ui.settings.compressor = AD.cloneSettings(base.compressor);
    ui.settings.strength = 50;
    persist(true);
  });
  on(els.scopeDefault, "click", () => setOverwrite(false));
  on(els.scopeOverwrite, "click", () => setOverwrite(true));
  on(els.compressorTogglePanel, "click", () => {
    if (els.compressorPanel) els.compressorPanel.classList.toggle("hidden");
  });
  on(els.equalizerTogglePanel, "click", () => {
    if (els.equalizerPanel) els.equalizerPanel.classList.toggle("hidden");
  });
  on(els.savePreset, "click", () => {
    const name = els.presetName.value.trim();
    if (!name) return;
    const saved = AD.cloneSettings(ui.settings);
    saved.activePreset = "custom:" + name;
    ui.state.customPresets[name] = saved;
    ui.settings.activePreset = saved.activePreset;
    els.presetName.value = "";
    persist(true);
  });

  function syncCompressorLabels() {
    const s = ui.settings.compressor;
    if (els.strengthValue) els.strengthValue.textContent = Math.round(ui.settings.strength) + "%";
    if (els.thresholdValue) els.thresholdValue.textContent = Math.round(s.threshold) + " dB";
    if (els.ratioValue) els.ratioValue.textContent = (Math.round(s.ratio * 10) / 10) + " : 1";
    if (els.attackValue) els.attackValue.textContent = formatMs(s.attack);
    if (els.releaseValue) els.releaseValue.textContent = formatMs(s.release);
    if (els.limiterThresholdValue) els.limiterThresholdValue.textContent = Math.round(s.limiterThreshold) + " dB";
  }

  async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0] || null;
  }

  async function detectChannel(tab) {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: "AD_GET_CHANNEL" });
      if (response && response.channel) return { channel: response.channel, attached: true };
      return { channel: AD.parseChannel(tab.url || "", null), attached: true };
    } catch (err) {
      return { channel: AD.parseChannel(tab.url || "", null), attached: false };
    }
  }

  async function init() {
    ui.state = await AD.getState();
    if (inPage) {
      ui.channel = currentChannel();
    } else {
      const tab = await getActiveTab();
      if (tab) {
        ui.tabId = tab.id;
        const detected = await detectChannel(tab);
        ui.channel = detected.channel;
        ui.needsReload = Boolean(tab.url && AD.supportedHost(tab.url) && !detected.attached);
      }
    }
    applyResolved();
    syncControls();
  }

  const meterTimer = setInterval(async () => {
    try {
      if (options.getMeter) {
        setMeter(options.getMeter());
        refreshHints();
        return;
      }
      const meter = await chrome.runtime.sendMessage({ type: "AD_GET_METER" });
      setMeter(meter);
      if (meter && meter.conflict !== undefined) {
        refreshHintsFromMeter(meter);
      }
    } catch (err) {}
  }, 80);

  function refreshHintsFromMeter(meter) {
    if (!els.conflictHint) return;
    els.conflictHint.classList.toggle("hidden", !meter.conflict);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[AD.STORAGE_KEY] || writing) return;
    ui.state = AD.normalizeState(changes[AD.STORAGE_KEY].newValue);
    applyResolved();
    syncControls();
  });

  init().catch((err) => {
    console.error(err);
    syncControls();
  });

  return {
    destroy: function () {
      clearInterval(meterTimer);
    },
    refreshChannel: refreshChannel
  };
};
