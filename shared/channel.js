var AD = AD || {};

AD.TWITCH_RESERVED = {
  directory: 1,
  videos: 1,
  settings: 1,
  p: 1,
  downloads: 1,
  jobs: 1,
  turbo: 1,
  search: 1,
  wallet: 1,
  inventory: 1,
  subscriptions: 1,
  drops: 1,
  store: 1,
  bits: 1,
  prime: 1,
  friends: 1,
  inventory: 1,
  pops: 1,
  privacy: 1,
  products: 1,
  activate: 1
};

AD.KICK_RESERVED = {
  categories: 1,
  search: 1,
  following: 1,
  subscriptions: 1,
  settings: 1,
  browse: 1,
  category: 1,
  videos: 1,
  clips: 1,
  dashboard: 1,
  messages: 1,
  payments: 1,
  legal: 1,
  community: 1
};

AD.X_RESERVED = {
  home: 1,
  explore: 1,
  search: 1,
  notifications: 1,
  messages: 1,
  settings: 1,
  compose: 1,
  i: 1,
  intent: 1,
  hashtag: 1,
  login: 1,
  signup: 1,
  tos: 1,
  privacy: 1,
  bookmarks: 1,
  lists: 1,
  communities: 1,
  jobs: 1,
  premium: 1,
  "premium-sign-up": 1
};

AD.YOUTUBE_RESERVED = {
  feed: 1,
  account: 1,
  gaming: 1,
  premium: 1,
  kids: 1,
  music: 1,
  tv: 1,
  upload: 1,
  results: 1,
  playlist: 1,
  playlists: 1,
  feed: 1,
  account: 1,
  reporthistory: 1
};

AD.channelKey = function (channel) {
  return AD.overrideKey(channel);
};

AD.overrideKey = function (channel) {
  if (!channel) return null;
  if (typeof channel === "string") return channel;
  if (channel.site === "x") return "x";
  if (!channel.id) return channel.site || null;
  return channel.site + ":" + channel.id;
};

AD.overridePlace = function (channel) {
  if (!channel) return "";
  if (channel.site === "x") return "X.com";
  var name = channel.label || channel.id;
  if (channel.site === "twitch") return name + " on Twitch";
  if (channel.site === "youtube") return name + " on YouTube";
  if (channel.site === "kick") return name + " on Kick";
  return name;
};

AD.parseChannel = function (href, doc) {
  if (doc === undefined) {
    doc = typeof document !== "undefined" ? document : null;
  }
  var url;
  try {
    url = new URL(href);
  } catch (err) {
    return null;
  }
  var host = url.hostname.replace(/^www\./, "").replace(/^m\./, "").replace(/^mobile\./, "");

  if (host === "twitch.tv" || host.endsWith(".twitch.tv")) {
    return parseTwitch(url, doc);
  }
  if (host === "kick.com" || host.endsWith(".kick.com")) {
    return parseKick(url, doc);
  }
  if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be") {
    return parseYouTube(url, doc);
  }
  if (host === "x.com" || host === "twitter.com" || host.endsWith(".x.com") || host.endsWith(".twitter.com")) {
    return parseX(url, doc);
  }
  return null;
};

AD.supportedHost = function (href) {
  try {
    var host = new URL(href).hostname.replace(/^www\./, "");
    return /(^|\.)(twitch\.tv|kick\.com|youtube\.com|youtu\.be|x\.com|twitter\.com)$/.test(host);
  } catch (err) {
    return false;
  }
};

function parseTwitch(url, doc) {
  var host = url.hostname.replace(/^www\./, "");
  if (host === "clips.twitch.tv") {
    return fromDomLink(doc, "twitch", 'a[href*="twitch.tv/"]:not([href*="clips.twitch.tv"])');
  }
  if (url.hostname.indexOf("player.twitch.tv") !== -1 || url.hostname.indexOf("embed.twitch.tv") !== -1) {
    var embedChannel = url.searchParams.get("channel");
    if (embedChannel) {
      return makeChannel("twitch", embedChannel.toLowerCase(), embedChannel);
    }
  }

  var parts = pathParts(url.pathname);
  if (!parts.length) return fromDomLink(doc, "twitch", 'a[data-a-target="watch-mode-to-home"], a[data-test-selector="stream-info-card-component__title-link"]');

  if (parts[0] === "popout" || parts[0] === "moderator" || parts[0] === "embed") {
    if (parts[1] && !AD.TWITCH_RESERVED[parts[1]]) {
      return makeChannel("twitch", parts[1].toLowerCase(), parts[1]);
    }
  }

  if (parts[0] === "videos" || parts[0] === "clip") {
    return fromDomLink(doc, "twitch", 'a[data-a-target="stream-title"], a.tw-link[href^="/"]');
  }

  if (!AD.TWITCH_RESERVED[parts[0]] && parts[0] !== "directory") {
    return makeChannel("twitch", parts[0].toLowerCase(), parts[0]);
  }
  return null;
}

function parseKick(url, doc) {
  var parts = pathParts(url.pathname);
  if (!parts.length) return null;
  if (AD.KICK_RESERVED[parts[0]]) {
    return fromDomLink(doc, "kick", 'a[href^="/"][class*="username"], a[href^="/"][class*="channel"]');
  }
  return makeChannel("kick", parts[0].toLowerCase(), parts[0]);
}

function parseYouTube(url, doc) {
  var parts = pathParts(url.pathname);
  var first = parts[0] || "";

  if (first.startsWith("@")) {
    var handle = first.slice(1);
    return makeChannel("youtube", handle.toLowerCase(), "@" + handle);
  }
  if (first === "channel" && parts[1]) {
    return makeChannel("youtube", parts[1], youtubeLabel(doc, parts[1]));
  }
  if ((first === "c" || first === "user") && parts[1]) {
    return makeChannel("youtube", parts[1].toLowerCase(), parts[1]);
  }

  var ab = url.searchParams.get("ab_channel");
  if (ab) {
    return makeChannel("youtube", ab.toLowerCase(), ab);
  }

  return youtubeFromDom(doc);
}

function parseX(url, doc) {
  return makeChannel("x", "site", "X.com");
}

function youtubeFromDom(doc) {
  if (!doc) return null;
  var selectors = [
    "ytd-video-owner-renderer ytd-channel-name a",
    "#owner ytd-channel-name a",
    "ytd-channel-name#channel-name a",
    "ytd-reel-player-overlay-renderer ytd-channel-name a",
    "#channel-name a.yt-simple-endpoint",
    "ytd-video-owner-renderer a[href^='/@']",
    "a.ytp-title-channel-logo",
    "span[itemprop='author'] link[itemprop='url']",
    "ytd-video-owner-renderer a[href^='/channel/']"
  ];
  var i;
  for (i = 0; i < selectors.length; i++) {
    var el = doc.querySelector(selectors[i]);
    if (!el) continue;
    var href = el.getAttribute("href") || el.getAttribute("content") || "";
    var parsed = youtubeHref(href, textOf(el));
    if (parsed) return parsed;
  }
  return null;
}

function youtubeHref(href, label) {
  if (!href) return null;
  try {
    if (href.startsWith("/")) href = "https://www.youtube.com" + href;
    var url = new URL(href, "https://www.youtube.com");
    var parts = pathParts(url.pathname);
    if (!parts.length) return null;
    if (parts[0].startsWith("@")) {
      var handle = parts[0].slice(1);
      return makeChannel("youtube", handle.toLowerCase(), label || "@" + handle);
    }
    if (parts[0] === "channel" && parts[1]) {
      return makeChannel("youtube", parts[1], label || parts[1]);
    }
    if ((parts[0] === "c" || parts[0] === "user") && parts[1]) {
      return makeChannel("youtube", parts[1].toLowerCase(), label || parts[1]);
    }
  } catch (err) {
    return null;
  }
  return null;
}

function youtubeLabel(doc, fallback) {
  if (!doc) return fallback;
  var name = doc.querySelector("#channel-name, ytd-channel-name #text, #text.ytd-channel-name");
  var text = textOf(name);
  return text || fallback;
}

function xFromDom(doc) {
  if (!doc) return null;
  var el = doc.querySelector('[data-testid="User-Name"] a[href^="/"], [data-testid="Tweet-User-Avatar"] a[href^="/"]');
  if (!el) return null;
  var href = el.getAttribute("href") || "";
  var user = pathParts(href)[0];
  if (!user || AD.X_RESERVED[user]) return null;
  return makeChannel("x", user.toLowerCase(), "@" + user);
}

function fromDomLink(doc, site, selector) {
  if (!doc) return null;
  var el = doc.querySelector(selector);
  if (!el) return null;
  var href = el.getAttribute("href") || "";
  var slug = pathParts(href)[0];
  if (!slug) return null;
  return makeChannel(site, slug.toLowerCase(), textOf(el) || slug);
}

function pathParts(pathname) {
  return String(pathname || "")
    .split("/")
    .filter(Boolean);
}

function textOf(el) {
  return el && el.textContent ? el.textContent.trim() : "";
}

function makeChannel(site, id, label) {
  if (!id) return null;
  return { site: site, id: id, label: label || id };
}
