(() => {
  const ov = AD.overlay;

  async function loadAssets() {
    if (ov.ready) return;
    const [cssRes, htmlRes] = await Promise.all([
      fetch(chrome.runtime.getURL("popup.css")),
      fetch(chrome.runtime.getURL("popup.html"))
    ]);
    ov.cssText = await cssRes.text();
    ov.popupDoc = new DOMParser().parseFromString(await htmlRes.text(), "text/html");
    ov.ready = true;
  }

  function engineOptions() {
    return {
      mode: "overlay",
      getMeter: function () {
        return AD.engine ? AD.engine.getMeter() : { rms: 0, bands: [0, 0, 0] };
      },
      getStatus: function () {
        return AD.engine ? AD.engine.getStatus() : { conflict: false };
      },
      getChannel: function () {
        return AD.engine ? AD.engine.getChannel() : AD.parseChannel(location.href, document);
      }
    };
  }

  ov.loadAssets = loadAssets;
  ov.engineOptions = engineOptions;
})();
