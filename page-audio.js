(() => {
  if (window.__AD_AUDIO_PAGE__) return;
  window.__AD_AUDIO_PAGE__ = true;
  const PA = AD.pageAudio;

  function getProcessor() {
    if (!PA.processor) {
      try {
        PA.processor = new PA.AudioProcessor();
      } catch (err) {
        return null;
      }
    }
    return PA.processor;
  }

  PA.getProcessor = getProcessor;
  PA.installMessaging();
  PA.installSpaHooks();
  PA.post({ type: "ready" });
})();
