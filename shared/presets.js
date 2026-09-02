var AD = AD || {};

AD.EQ_BANDS = [
  { freq: 63, type: "lowshelf", label: "63" },
  { freq: 125, type: "peaking", label: "125" },
  { freq: 250, type: "peaking", label: "250" },
  { freq: 500, type: "peaking", label: "500" },
  { freq: 1000, type: "peaking", label: "1k" },
  { freq: 2000, type: "peaking", label: "2k" },
  { freq: 4000, type: "peaking", label: "4k" },
  { freq: 8000, type: "peaking", label: "8k" },
  { freq: 16000, type: "highshelf", label: "16k" }
];

AD.equalizerDefaults = function (gains, enabled) {
  var zeros = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  return {
    enabled: Boolean(enabled),
    gains: gains ? gains.slice() : zeros.slice()
  };
};

function lev(on, thr, knee, ratio, att, rel) {
  return { on: on, thr: thr, knee: knee, ratio: ratio, att: att, rel: rel };
}

function lim(thr, knee, ratio, att, rel) {
  return { thr: thr, knee: knee, ratio: ratio, att: att, rel: rel };
}

function preset(boost, levOn, levP, limP, agc, eq) {
  return {
    boost: boost,
    strength: 50,
    mono: false,
    compressor: {
      enabled: true,
      levelerOn: levOn,
      threshold: levP.thr,
      knee: levP.knee,
      ratio: levP.ratio,
      attack: levP.att,
      release: levP.rel,
      limiterThreshold: limP.thr,
      limiterKnee: limP.knee,
      limiterRatio: limP.ratio,
      limiterAttack: limP.att,
      limiterRelease: limP.rel,
      agcOn: Boolean(agc && agc.on),
      agcTarget: agc ? agc.target : -18,
      agcMaxDb: agc ? agc.maxDb : 12
    },
    equalizer: eq,
    activePreset: null
  };
}

AD.PRESET_ORDER = ["leveler", "max", "audiobang", "boost", "night", "voice", "music", "cinema"];

AD.PRESET_LABELS = {
  leveler: "Leveler",
  max: "Max",
  audiobang: "AudioBang",
  boost: "Boost",
  night: "Night",
  voice: "Voice",
  music: "Music",
  cinema: "Cinema"
};

AD.PRESET_HELP = {
  leveler: "Evens out loudness for a steady level — the best default for most streams.",
  max: "Maximum evenness — everything lands at the same loudness.",
  audiobang: "Hands-off until a sudden spike, then clamps it instantly.",
  boost: "Makes quiet streams louder, with spike protection built in.",
  night: "Quiet voices come up, loud moments stay held down.",
  voice: "Talk streams — keeps speech clear and at a steady level.",
  music: "Gentle peak control that preserves musical dynamics.",
  cinema: "A light touch — only harsh peaks are tamed."
};

AD.PRESETS = {
  leveler: preset(100, true, lev(true, -28, 24, 4, 0.025, 0.4), lim(-10, 0, 20, 0.003, 0.1), { on: true, target: -18, maxDb: 12 }, AD.equalizerDefaults()),
  max: preset(100, true, lev(true, -40, 12, 8, 0.01, 0.25), lim(-14, 0, 20, 0.003, 0.08), { on: true, target: -16, maxDb: 15 }, AD.equalizerDefaults()),
  audiobang: preset(100, false, lev(false, -28, 24, 4, 0.025, 0.4), lim(-6, 0, 20, 0.003, 0.06), { on: false, target: -18, maxDb: 12 }, AD.equalizerDefaults()),
  boost: preset(200, false, lev(false, -28, 24, 4, 0.025, 0.4), lim(-6, 3, 20, 0.003, 0.08), { on: false, target: -18, maxDb: 12 }, AD.equalizerDefaults()),
  night: preset(100, true, lev(true, -35, 24, 6, 0.02, 0.4), lim(-12, 0, 20, 0.003, 0.1), { on: true, target: -20, maxDb: 12 }, AD.equalizerDefaults([-8, -5, -2, 0, 1, 2, 0, -3, -4], true)),
  voice: preset(100, true, lev(true, -30, 20, 3, 0.015, 0.3), lim(-8, 0, 20, 0.003, 0.08), { on: true, target: -16, maxDb: 12 }, AD.equalizerDefaults([-6, -2, -3, -1, 1, 3, 2, -2, -3], true)),
  music: preset(100, false, lev(false, -28, 24, 4, 0.025, 0.4), lim(-8, 6, 12, 0.005, 0.15), { on: false, target: -18, maxDb: 12 }, AD.equalizerDefaults([3, 2, 0, -1, 0, 1, 1, 2, 3], true)),
  cinema: preset(100, true, lev(true, -24, 30, 2.5, 0.05, 0.5), lim(-6, 0, 20, 0.003, 0.1), { on: false, target: -18, maxDb: 12 }, AD.equalizerDefaults([4, 1, -2, -1, 1, 2, 2, 2, 4], true))
};

Object.keys(AD.PRESETS).forEach(function (id) {
  AD.PRESETS[id].activePreset = id;
});

AD.cloneSettings = function (settings) {
  return JSON.parse(JSON.stringify(settings));
};

AD.defaultSettings = function () {
  return AD.cloneSettings(AD.PRESETS.leveler);
};

AD.withStrength = function (settings) {
  var out = AD.cloneSettings(settings);
  var n = (out.strength - 50) / 50;
  var c = out.compressor;
  if (c.levelerOn) {
    c.threshold = clampNumber(c.threshold - 8 * n, -100, 0, c.threshold);
    c.ratio = clampNumber(c.ratio * (1 + 0.75 * n), 1.5, 20, c.ratio);
  }
  c.limiterThreshold = clampNumber(c.limiterThreshold - 4 * n, -100, 0, c.limiterThreshold);
  return out;
};

AD.normalizeSettings = function (raw) {
  var base = AD.defaultSettings();
  if (!raw || typeof raw !== "object") return base;
  var compressor = Object.assign({}, base.compressor, raw.compressor || {});
  var equalizer = Object.assign({}, base.equalizer, raw.equalizer || {});
  var gains = Array.isArray(equalizer.gains) ? equalizer.gains.slice() : [];
  while (gains.length < AD.EQ_BANDS.length) gains.push(0);
  gains = gains.slice(0, AD.EQ_BANDS.length);
  return {
    boost: clampNumber(raw.boost, 25, 600, base.boost),
    strength: clampNumber(raw.strength, 0, 100, 50),
    mono: Boolean(raw.mono),
    compressor: {
      enabled: compressor.enabled !== false,
      levelerOn: compressor.levelerOn !== false,
      threshold: clampNumber(compressor.threshold, -100, 0, -28),
      knee: clampNumber(compressor.knee, 0, 40, 24),
      ratio: clampNumber(compressor.ratio, 1, 20, 4),
      attack: clampNumber(compressor.attack, 0, 1, 0.025),
      release: clampNumber(compressor.release, 0.01, 1, 0.4),
      limiterThreshold: clampNumber(compressor.limiterThreshold, -30, 0, -10),
      limiterKnee: clampNumber(compressor.limiterKnee, 0, 40, 0),
      limiterRatio: clampNumber(compressor.limiterRatio, 1, 20, 20),
      limiterAttack: clampNumber(compressor.limiterAttack, 0, 1, 0.003),
      limiterRelease: clampNumber(compressor.limiterRelease, 0.01, 1, 0.1),
      agcOn: Boolean(compressor.agcOn),
      agcTarget: clampNumber(compressor.agcTarget, -30, -10, -18),
      agcMaxDb: clampNumber(compressor.agcMaxDb, 3, 18, 12)
    },
    equalizer: {
      enabled: Boolean(equalizer.enabled),
      gains: gains.map(function (gain) {
        return clampNumber(gain, -12, 12, 0);
      })
    },
    activePreset: typeof raw.activePreset === "string" ? raw.activePreset : null
  };
};

AD.settingsSignature = function (settings) {
  var normalized = AD.normalizeSettings(settings);
  normalized.strength = 50;
  return JSON.stringify({
    boost: normalized.boost,
    mono: normalized.mono,
    compressor: normalized.compressor,
    equalizer: normalized.equalizer
  });
};

AD.matchPreset = function (settings, customPresets) {
  var atFifty = AD.cloneSettings(settings);
  atFifty.strength = 50;
  var signature = AD.settingsSignature(atFifty);
  var name;
  for (name of AD.PRESET_ORDER) {
    if (AD.settingsSignature(AD.PRESETS[name]) === signature) return name;
  }
  customPresets = customPresets || {};
  for (name in customPresets) {
    if (Object.prototype.hasOwnProperty.call(customPresets, name) &&
        AD.settingsSignature(customPresets[name]) === signature) {
      return "custom:" + name;
    }
  }
  return null;
};

function clampNumber(value, min, max, fallback) {
  var n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
