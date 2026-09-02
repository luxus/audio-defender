(() => {
  const MSG = "__audioDefender";
  let lastHref = location.href;
  let lastChannelKey = null;
  let applyTimer = 0;
  let enabled = true;
  let lastMeter = { rms: 0, bands: [0, 0, 0], conflict: false, captured: false };
  let captured = false;

  function currentChannel() {
    return AD.parseChannel(location.href, document);
  }

  function postToPage(payload) {
    const data = Object.assign({ [MSG]: true, from: "ext" }, payload);
    window.postMessage(data, "*");
    try {
      window.dispatchEvent(new CustomEvent("ad-audio-cmd", { detail: data }));
    } catch (err) {}
  }

  function meterPayload() {
    return {
      type: "AD_LEVELS",
      rms: lastMeter.rms || 0,
      rmsDb: lastMeter.rmsDb,
      loudDb: lastMeter.loudDb,
      grDb: lastMeter.grDb,
      bands: lastMeter.bands || [0, 0, 0],
      conflict: Boolean(lastMeter.conflict),
      captured: Boolean(lastMeter.captured || captured)
    };
  }

  async function applyNow() {
    const state = await AD.getState();
    enabled = state.enabled;
    const channel = currentChannel();
    lastChannelKey = AD.overrideKey(channel);
    const resolved = AD.resolveSettings(state, channel);
    postToPage({
      type: "apply",
      state: { enabled: state.enabled },
      settings: AD.withStrength(resolved.settings)
    });
  }

  function scheduleApply() {
    clearTimeout(applyTimer);
    applyTimer = setTimeout(() => {
      applyNow().catch(() => {});
    }, 50);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || !event.data[MSG] || event.data.from !== "page") return;
    onPageEvent(event.data);
  });
  window.addEventListener("ad-audio-evt", (event) => {
    if (event.detail && event.detail.from === "page") onPageEvent(event.detail);
  });

  function onPageEvent(data) {
    if (data.type === "ready") {
      scheduleApply();
      return;
    }
    if (data.type === "meter") {
      lastMeter = data;
      if (data.captured) captured = true;
      try {
        chrome.runtime.sendMessage(meterPayload()).catch(() => {});
      } catch (err) {}
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[AD.STORAGE_KEY]) return;
    scheduleApply();
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === "AD_GET_CHANNEL") {
      sendResponse({
        ok: true,
        href: location.href,
        channel: currentChannel(),
        frame: window === window.top ? "top" : "frame",
        captured: captured
      });
      return;
    }
    if (message && message.type === "AD_APPLY") {
      applyNow().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
      return true;
    }
    if (message && message.type === "AD_GET_STATUS") {
      sendResponse({
        conflict: Boolean(lastMeter.conflict),
        captured: captured,
        enabled: enabled
      });
    }
  });

  const observer = new MutationObserver(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      scheduleApply();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  setInterval(() => {
    const channel = currentChannel();
    const key = AD.overrideKey(channel);
    if (location.href !== lastHref || key !== lastChannelKey) {
      lastHref = location.href;
      scheduleApply();
    }
    try {
      chrome.runtime.sendMessage(meterPayload()).catch(() => {});
    } catch (err) {}
  }, 90);

  AD.engine = {
    getMeter: function () {
      return meterPayload();
    },
    getStatus: function () {
      return {
        conflict: Boolean(lastMeter.conflict),
        captured: captured,
        enabled: enabled
      };
    },
    getChannel: currentChannel
  };

  applyNow().catch(() => {});
})();
