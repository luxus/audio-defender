const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createDom, loadAD } = require("./helpers");

function ad() {
  const { window } = createDom("<!doctype html><body></body>");
  return loadAD(window);
}

test("YouTube watch DOM prefers @handle over /channel/ id and ab_channel", () => {
  const html = `<!doctype html><body>
    <ytd-video-owner-renderer>
      <ytd-channel-name><a href="/channel/UC123abcdefghijklmnopqrstuv">MKBHD</a></ytd-channel-name>
      <a href="/@mkbhd">MKBHD</a>
    </ytd-video-owner-renderer>
    <a class="ytp-title-channel-logo" href="/channel/UC123abcdefghijklmnopqrstuv"></a>
  </body>`;
  const { window, document } = createDom(
    html,
    "https://www.youtube.com/watch?v=1&ab_channel=Marques%20Brownlee"
  );
  const AD = loadAD(window);
  const channel = AD.parseChannel(window.location.href, document);
  assert.equal(channel.id, "mkbhd");
  assert.equal(AD.overrideKey(channel), "youtube:mkbhd");
  assert.ok(channel.aliases.includes("youtube:UC123abcdefghijklmnopqrstuv"));
  assert.ok(channel.aliases.includes("youtube:marques brownlee"));
  assert.equal(
    AD.overrideKey(AD.parseChannel("https://www.youtube.com/watch?v=1", document)),
    "youtube:mkbhd"
  );
});

test("YouTube /@handle path stays a handle even if DOM has a UC id", () => {
  const html = `<!doctype html><body>
    <ytd-video-owner-renderer>
      <ytd-channel-name><a href="/channel/UC123abcdefghijklmnopqrstuv">MKBHD</a></ytd-channel-name>
    </ytd-video-owner-renderer>
  </body>`;
  const { window, document } = createDom(html, "https://www.youtube.com/@mkbhd");
  const AD = loadAD(window);
  const channel = AD.parseChannel(window.location.href, document);
  assert.equal(channel.id, "mkbhd");
  assert.equal(AD.overrideKey(channel), "youtube:mkbhd");
});

test("parses Twitch, Kick, YouTube, and X channel URLs", () => {
  const AD = ad();
  const twitch = AD.parseChannel("https://www.twitch.tv/thebausffs", null);
  assert.equal(twitch.site, "twitch");
  assert.equal(twitch.id, "thebausffs");
  assert.equal(twitch.label, "thebausffs");
  assert.equal(AD.channelKey(AD.parseChannel("https://player.twitch.tv/?channel=shroud", null)), "twitch:shroud");
  assert.equal(AD.parseChannel("https://kick.com/xqc", null).id, "xqc");
  assert.equal(AD.parseChannel("https://www.youtube.com/@mkbhd", null).label, "@mkbhd");
  assert.equal(AD.parseChannel("https://x.com/jack/status/1", null).id, "site");
  assert.equal(AD.parseChannel("https://x.com/jack/status/1", null).label, "X.com");
  assert.equal(AD.overrideKey(AD.parseChannel("https://x.com/home", null)), "x");
});

test("ignores reserved Twitch directory paths", () => {
  const AD = ad();
  assert.equal(AD.parseChannel("https://www.twitch.tv/directory/game/Art", null), null);
});

test("X is always a site-wide override target", () => {
  const AD = ad();
  const home = AD.parseChannel("https://x.com/home", null);
  const status = AD.parseChannel("https://x.com/jack/status/1", null);
  assert.equal(home.site, "x");
  assert.equal(AD.overrideKey(home), "x");
  assert.equal(AD.overrideKey(status), "x");
  assert.equal(AD.overridePlace(home), "X.com");
});

test("supportedHost matches apex and www hosts", () => {
  const AD = ad();
  assert.equal(AD.supportedHost("https://www.youtube.com/watch?v=1"), true);
  assert.equal(AD.supportedHost("https://kick.com/x"), true);
  assert.equal(AD.supportedHost("https://example.com"), false);
});

test("override keys match site-specific URL parsers", () => {
  const AD = ad();
  assert.equal(AD.overrideKey(AD.parseChannel("https://www.twitch.tv/shroud", null)), "twitch:shroud");
  assert.equal(AD.overrideKey(AD.parseChannel("https://www.twitch.tv/popout/shroud/chat", null)), "twitch:shroud");
  assert.equal(AD.overrideKey(AD.parseChannel("https://kick.com/xqc", null)), "kick:xqc");
  assert.equal(AD.overrideKey(AD.parseChannel("https://www.youtube.com/@MKBHD", null)), "youtube:mkbhd");
  assert.equal(
    AD.overrideKey(AD.parseChannel("https://www.youtube.com/channel/UCBJycsmduvYEL83R_U4JriQ", null)),
    "youtube:UCBJycsmduvYEL83R_U4JriQ"
  );
  assert.equal(
    AD.overrideKey(AD.parseChannel("https://www.youtube.com/watch?v=1&ab_channel=MKBHD", null)),
    "youtube:mkbhd"
  );
  assert.equal(AD.overrideKey(AD.parseChannel("https://x.com/jack/status/1", null)), "x");
  assert.equal(AD.overrideKey(AD.parseChannel("https://twitter.com/home", null)), "x");
});
