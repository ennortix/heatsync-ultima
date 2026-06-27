// Feed media + embed rendering for the extension home tab.
// Mirrors heatsync client/embed/embed-parser.js + renderers/media-renderer.js
// All embeds always-enabled (extension has no per-platform toggles yet).
// Uses plain iframes (no facade) — feed virtual-scrolls so visible iframe count stays low.

// Defence-in-depth sandbox for third-party iframes. allow-scripts/same-origin
// are required by every embed provider (player JS + auth cookies); the rest
// preserves user-clickable share/popup flows. What this BLOCKS: top-level
// nav, modals, pointer-lock, downloads — i.e. defang most providers if they
// ship malicious payload.
const EMBED_SANDBOX = 'allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox allow-forms'

function sanitizeEmbedId(id) {
  if (!id || typeof id !== 'string') return ''
  return id.replace(/[^a-zA-Z0-9_-]/g, '')
}

function attr(s) {
  return escapeHtml(s)
}

function ytEmbed(videoId) {
  const id = sanitizeEmbedId(videoId)
  if (!id) return ''
  // YT refuses to embed when parent is youtube.com (Error 153 "Video player
  // configuration error" — self-embed guard). Fall back to a thumbnail card
  // that opens the video in a new tab.
  if (/(^|\.)youtube\.com$/i.test(location.hostname)) {
    return `<a href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener" class="hs-feed-embed-yt-thumb">
      <img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" loading="lazy" data-fb="hide">
      <span class="hs-feed-embed-yt-play">▶</span>
    </a>`
  }
  return `<div class="hs-feed-embed-container hs-feed-embed-youtube">
    <iframe src="https://www.youtube-nocookie.com/embed/${id}?modestbranding=1&playsinline=1&rel=0&enablejsapi=1"
      sandbox="${EMBED_SANDBOX}"
      allow="autoplay; accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
      loading="lazy"
      referrerpolicy="strict-origin-when-cross-origin"></iframe>
  </div>`
}

function twitchClipEmbed(clipId) {
  const id = sanitizeEmbedId(clipId)
  if (!id) return ''
  const parent = location.hostname || 'localhost'
  return `<div class="hs-feed-embed-container hs-feed-embed-twitch">
    <iframe src="https://clips.twitch.tv/embed?clip=${id}&parent=${encodeURIComponent(parent)}"
      sandbox="${EMBED_SANDBOX}"
      allow="fullscreen" loading="lazy"></iframe>
  </div>`
}

function kickClipEmbed(clipId, fullUrl) {
  const id = sanitizeEmbedId(clipId)
  if (!id) return ''
  // player.kick.com sends X-Frame-Options: SAMEORIGIN — iframe always blank.
  // Route through server-resolve to get thumbnail+title from kick.com/api/v2.
  const safe = safeUrl(fullUrl) || `https://kick.com/clips/${id}`
  return `<div class="hs-feed-embed-pending hs-feed-embed-kick"
    data-resolve-url="${attr(safe)}" data-resolve-platform="kick">
    <span class="hs-feed-embed-pending-label">loading kick clip…</span>
  </div>`
}

function streamableEmbed(videoId) {
  const id = sanitizeEmbedId(videoId)
  if (!id) return ''
  return `<div class="hs-feed-embed-container hs-feed-embed-streamable">
    <iframe src="https://streamable.com/e/${id}" sandbox="${EMBED_SANDBOX}" allow="fullscreen" loading="lazy"></iframe>
  </div>`
}

function vimeoEmbed(videoId) {
  const id = sanitizeEmbedId(videoId)
  if (!id) return ''
  return `<div class="hs-feed-embed-container hs-feed-embed-vimeo">
    <iframe src="https://player.vimeo.com/video/${id}"
      sandbox="${EMBED_SANDBOX}"
      allow="autoplay; fullscreen; picture-in-picture" loading="lazy"></iframe>
  </div>`
}

function spotifyEmbed(kind, id) {
  const safeKind = (kind || '').replace(/[^a-z]/g, '')
  const safeId = sanitizeEmbedId(id)
  if (!safeKind || !safeId) return ''
  return `<div class="hs-feed-embed-container hs-feed-embed-spotify">
    <iframe src="https://open.spotify.com/embed/${safeKind}/${safeId}"
      sandbox="${EMBED_SANDBOX}"
      width="100%" height="152" allow="encrypted-media" loading="lazy"></iframe>
  </div>`
}

function soundcloudEmbed(url) {
  const safe = safeUrl(url)
  if (!safe || !/^https?:\/\/(www\.|m\.)?soundcloud\.com\//i.test(safe)) return ''
  return `<div class="hs-feed-embed-container hs-feed-embed-soundcloud">
    <iframe scrolling="no"
      sandbox="${EMBED_SANDBOX}"
      src="https://w.soundcloud.com/player/?url=${encodeURIComponent(safe)}&color=%23ff5500&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=true"
      loading="lazy"></iframe>
  </div>`
}

function giphyEmbed(gifId) {
  const id = sanitizeEmbedId(gifId)
  if (!id) return ''
  return `<div class="hs-feed-embed-container hs-feed-embed-giphy">
    <iframe src="https://giphy.com/embed/${id}" sandbox="${EMBED_SANDBOX}" allow="fullscreen" loading="lazy"></iframe>
  </div>`
}

function tenorEmbed(gifId) {
  const id = sanitizeEmbedId(gifId)
  if (!id) return ''
  return `<div class="hs-feed-embed-container hs-feed-embed-tenor">
    <iframe src="https://tenor.com/embed/${id}" sandbox="${EMBED_SANDBOX}" allow="fullscreen" loading="lazy"></iframe>
  </div>`
}

function twitterEmbed(tweetId, url) {
  const id = sanitizeEmbedId(tweetId)
  if (!id) return ''
  // platform.twitter.com/embed/Tweet.html renders the tweet in an iframe with no
  // widgets.js needed (script tags injected via innerHTML never execute, so the
  // blockquote+script approach the website uses is broken in extension context).
  return `<div class="hs-feed-embed-container hs-feed-embed-twitter">
    <iframe src="https://platform.twitter.com/embed/Tweet.html?id=${id}&theme=dark&dnt=true"
      sandbox="${EMBED_SANDBOX}"
      allow="autoplay; clipboard-write; fullscreen" loading="lazy"></iframe>
  </div>`
}

function imgurEmbed(imgurId) {
  const id = sanitizeEmbedId(imgurId)
  if (!id) return ''
  // Imgur embed needs script — fall back to direct image link approach.
  // data-fb="hide" is the host-CSP-safe replacement for inline onerror;
  // attachFeedFallbacks() wires the listener post-render.
  return `<div class="hs-feed-embed-container hs-feed-embed-imgur" style="aspect-ratio:auto;max-width:480px">
    <a href="https://imgur.com/${id}" target="_blank" rel="noopener">
      <img src="https://i.imgur.com/${id}.jpg" alt="imgur"
        style="max-width:100%;height:auto;display:block"
        data-fb="hide">
    </a>
  </div>`
}

function tiktokEmbed(videoId, url) {
  const id = sanitizeEmbedId(videoId)
  if (!id) return ''
  return `<div class="hs-feed-embed-container hs-feed-embed-tiktok">
    <iframe src="https://www.tiktok.com/embed/v2/${id}"
      sandbox="${EMBED_SANDBOX}"
      allow="fullscreen" scrolling="no" loading="lazy"></iframe>
  </div>`
}

function redditEmbed(url) {
  const safe = safeUrl(url)
  if (!safe) return ''
  // Permalink → server-resolved rich card with image/icon when reachable.
  // Reddit blocks the VPS IP ~half the time so we also bake in slug-derived
  // fallback metadata; the resolver uses it when the server returns nothing.
  const m = safe.match(/reddit\.com\/r\/([\w-]+)\/comments\/[a-z0-9]+(?:\/([\w-]+))?/i)
  if (m) {
    const sub = m[1]
    const slug = m[2] || ''
    const title = slug
      ? slug.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      : `r/${sub}`
    return `<div class="hs-feed-embed-pending hs-feed-embed-reddit"
      data-resolve-url="${attr(safe)}" data-resolve-platform="reddit"
      data-fb-title="${attr(title)}" data-fb-author="r/${attr(sub)}">
      <span class="hs-feed-embed-pending-label">loading reddit…</span>
    </div>`
  }
  // Non-permalink (subreddit, user) → link card.
  return `<div class="hs-feed-link-card">
    <a href="${attr(safe)}" target="_blank" rel="noopener" class="hs-feed-link-card-link">
      <span class="hs-feed-link-card-icon">[reddit]</span>
      <span class="hs-feed-link-card-url">${attr(safe.length > 60 ? safe.slice(0, 60) + '...' : safe)}</span>
    </a>
  </div>`
}

function instagramEmbed(url) {
  const safe = safeUrl(url)
  if (!safe) return ''
  return `<div class="hs-feed-link-card">
    <a href="${attr(safe)}" target="_blank" rel="noopener" class="hs-feed-link-card-link">
      <span class="hs-feed-link-card-icon">[ig]</span>
      <span class="hs-feed-link-card-url">${attr(safe.length > 60 ? safe.slice(0, 60) + '...' : safe)}</span>
    </a>
  </div>`
}

// Convert a single URL → embed HTML, or '' if not embeddable
function parseFeedEmbed(url) {
  if (!url || typeof url !== 'string') return ''
  const cleanUrl = url.replace(/[.,;!?]+$/, '')

  // YouTube
  if (cleanUrl.includes('youtube.com/watch?v=') || cleanUrl.includes('youtu.be/')) {
    let videoId
    if (cleanUrl.includes('youtube.com/watch?v=')) {
      videoId = cleanUrl.split('v=')[1].split('&')[0]
    } else {
      videoId = cleanUrl.split('youtu.be/')[1].split('?')[0]
    }
    return ytEmbed(videoId)
  }

  // Twitch clips (clips.twitch.tv/...)
  if (cleanUrl.includes('clips.twitch.tv/')) {
    const clipId = cleanUrl.split('clips.twitch.tv/')[1].split(/[?#]/)[0]
    return twitchClipEmbed(clipId)
  }

  // Twitch clips alt format (twitch.tv/user/clip/id)
  if (cleanUrl.includes('twitch.tv/') && cleanUrl.includes('/clip/')) {
    const clipId = cleanUrl.split('/clip/')[1].split(/[?#]/)[0]
    return twitchClipEmbed(clipId)
  }

  // Kick clips
  if (cleanUrl.includes('kick.com/') && cleanUrl.includes('/clips/')) {
    const m = cleanUrl.match(/clips\/([a-zA-Z0-9_-]+)/)
    if (m) return kickClipEmbed(m[1], cleanUrl)
  }

  // Streamable
  if (cleanUrl.includes('streamable.com/')) {
    const videoId = cleanUrl.split('streamable.com/')[1].split(/[?#]/)[0]
    if (videoId && !videoId.startsWith('test')) return streamableEmbed(videoId)
  }

  // Vimeo
  if (cleanUrl.includes('vimeo.com/')) {
    const m = cleanUrl.match(/vimeo\.com\/(\d+)/)
    if (m) return vimeoEmbed(m[1])
  }

  // Spotify
  if (cleanUrl.includes('open.spotify.com/')) {
    const parts = cleanUrl.split('spotify.com/')[1].split('/')
    const kind = parts[0]
    const id = parts[1]?.split('?')[0]
    if (kind && id) return spotifyEmbed(kind, id)
  }

  // SoundCloud
  if (cleanUrl.includes('soundcloud.com/')) {
    return soundcloudEmbed(cleanUrl)
  }

  // Twitter/X
  if (cleanUrl.includes('twitter.com/') || cleanUrl.includes('x.com/')) {
    const m = cleanUrl.match(/status\/(\d+)/)
    if (m) return twitterEmbed(m[1], cleanUrl)
  }

  // Giphy (gif page)
  if (cleanUrl.includes('giphy.com/gifs/')) {
    const m = cleanUrl.match(/gifs\/(?:.*-)?([a-zA-Z0-9]+)$/)
    if (m) return giphyEmbed(m[1])
  }

  // Tenor
  if (cleanUrl.includes('tenor.com/view/')) {
    const m = cleanUrl.match(/view\/.*-(\d+)$/)
    if (m) return tenorEmbed(m[1])
  }

  // TikTok
  if (cleanUrl.includes('tiktok.com/') && cleanUrl.includes('/video/')) {
    const m = cleanUrl.match(/video\/(\d+)/)
    if (m) return tiktokEmbed(m[1], cleanUrl)
  }

  // Imgur
  if (cleanUrl.includes('imgur.com/')) {
    const m = cleanUrl.match(/imgur\.com\/(?:a\/|gallery\/)?([a-zA-Z0-9]+)/)
    if (m) return imgurEmbed(m[1])
  }

  // Reddit
  if (cleanUrl.includes('reddit.com/r/')) {
    return redditEmbed(cleanUrl)
  }

  // Instagram
  if (cleanUrl.includes('instagram.com/p/') || cleanUrl.includes('instagram.com/reel/')) {
    return instagramEmbed(cleanUrl)
  }

  // Direct media files
  if (/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(cleanUrl)) {
    const safe = safeUrl(cleanUrl)
    if (!safe) return ''
    return `<div class="hs-feed-media-direct">
      <img src="${attr(safe)}" alt="" data-fb="deleted">
    </div>`
  }
  if (/\.(mp4|webm|mov)(\?.*)?$/i.test(cleanUrl)) {
    const safe = safeUrl(cleanUrl)
    if (!safe) return ''
    return `<div class="hs-feed-media-direct">
      <video controls muted preload="metadata" src="${attr(safe)}"></video>
    </div>`
  }

  return ''
}

// Extract first embeddable URL from message content (OP only, mirrors website)
function extractFeedEmbed(content) {
  if (!content || typeof content !== 'string') return ''
  // Same priority order as website _extractEmbed
  const priorityPatterns = [
    /https?:\/\/(?:www\.)?streamable\.com\/\w+/,
    /https?:\/\/(?:www\.)?youtu(?:\.be\/|be\.com\/watch\?v=)[\w-]+/,
    /https?:\/\/clips\.twitch\.tv\/[\w-]+/,
    /https?:\/\/(?:www\.)?twitch\.tv\/[\w_]+\/clip\/[\w-]+/,
    /https?:\/\/kick\.com\/[\w_-]+\/clips\/[\w-]+/,
    /https?:\/\/open\.spotify\.com\/(?:track|album|playlist)\/\w+/,
    /https?:\/\/(?:www\.)?vimeo\.com\/\d+/,
    /https?:\/\/(?:www\.)?giphy\.com\/gifs\/[\w-]+/,
    /https?:\/\/(?:www\.)?tenor\.com\/view\/[\w-]+-\d+/,
    /https?:\/\/(?:www\.)?tiktok\.com\/[@\w.]+\/video\/\d+/,
    /https?:\/\/(?:www\.)?imgur\.com\/(?:a\/|gallery\/)?[a-zA-Z0-9]+/,
    /https?:\/\/(?:twitter|x)\.com\/[\w_]+\/status\/\d+/,
    /https?:\/\/(?:[\w-]+\.)?reddit\.com\/r\/\w+\/[\w/]+/,
    /https?:\/\/(?:www\.|m\.)?soundcloud\.com\/[\w-]+\/[\w-]+/,
    /https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel)\/[\w-]+/,
    /https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|mp4|webm|mov)(?:\?[^\s]*)?/i,
  ]

  for (const p of priorityPatterns) {
    const m = content.match(p)
    if (m) {
      const html = parseFeedEmbed(m[0])
      if (html) return html
    }
  }
  return ''
}

// ── CHAT INLINE EMBEDS ──────────────────────────────────────────────────────
// Chat is high-volume and lives on low-RAM / passive-cooled hardware, so chat
// NEVER renders live iframes the way the feed does (the feed virtual-scrolls, so
// its visible iframe count stays tiny — chat has no such bound). Chat media is
// therefore always lightweight: an inline direct image/video, a YouTube
// thumbnail card, or a server-resolved rich card. One embed per message. Every
// branch emits ONLY safeUrl()-validated + attr()-escaped strings — never raw
// message text — so the holder's insertAdjacentHTML in main.js stays XSS-safe.
const _CHAT_URL_RE = /https?:\/\/[^\s<>"']+/i

function extractChatEmbed(text) {
  if (!text || typeof text !== 'string') return ''
  const m = text.match(_CHAT_URL_RE)
  if (!m) return ''
  return chatEmbedForUrl(m[0])
}

function chatEmbedForUrl(rawUrl) {
  // Strip trailing sentence punctuation, but only strip a trailing ) or ] when
  // it's UNBALANCED — otherwise wikipedia/github URLs like .../Foo_(bar) lose
  // their closing paren and the embed/link breaks.
  let cleanUrl = rawUrl.replace(/[.,;!?]+$/, '')
  while (/[)\]]$/.test(cleanUrl)) {
    const opens = (cleanUrl.match(/[([]/g) || []).length
    const closes = (cleanUrl.match(/[)\]]/g) || []).length
    if (closes <= opens) break
    cleanUrl = cleanUrl.slice(0, -1).replace(/[.,;!?]+$/, '')
  }
  const safe = safeUrl(cleanUrl)
  if (!safe) return ''
  // Direct image / gif → inline, lazy, error-guarded (data-fb hides on 404/blocked).
  if (/\.(jpg|jpeg|png|gif|webp|avif)(\?.*)?$/i.test(cleanUrl)) {
    return `<div class="hs-mc-media"><img src="${attr(safe)}" alt="" loading="lazy" decoding="async" data-fb="hide"></div>`
  }
  // Direct video → inline, preload=none (no bytes until play — critical at chat volume).
  if (/\.(mp4|webm|mov)(\?.*)?$/i.test(cleanUrl)) {
    return `<div class="hs-mc-media"><video controls muted preload="none" playsinline src="${attr(safe)}" data-fb="hide"></video></div>`
  }
  // YouTube → thumbnail card that opens the video. Never an iframe in chat.
  let ytId = ''
  let ym
  if ((ym = cleanUrl.match(/youtu\.be\/([\w-]{11})/))) ytId = ym[1]
  else if ((ym = cleanUrl.match(/youtube\.com\/watch\?v=([\w-]{11})/))) ytId = ym[1]
  else if ((ym = cleanUrl.match(/youtube\.com\/shorts\/([\w-]{11})/))) ytId = ym[1]
  if (ytId) {
    const id = sanitizeEmbedId(ytId)
    if (id) return `<a href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener" class="hs-mc-media hs-feed-embed-yt-thumb">
      <img src="https://i.ytimg.com/vi/${id}/mqdefault.jpg" alt="" loading="lazy" decoding="async" data-fb="hide">
      <span class="hs-feed-embed-yt-play">▶</span>
    </a>`
  }
  // Providers the server resolver handles (oEmbed) → lightweight pending card.
  // Server returns image/video/audio/rich; unsupported → graceful link card.
  // No iframes. data-resolve-url drives resolvePendingFeedEmbeds().
  if (/(?:reddit\.com\/r\/|(?:twitter|x)\.com\/[\w_]+\/status\/|open\.spotify\.com\/(?:track|album|playlist|episode|show)\/|(?:www\.)?vimeo\.com\/\d|tiktok\.com\/@[\w.]+\/video\/|instagram\.com\/(?:p|reel)\/|soundcloud\.com\/[\w-]+\/[\w-]+|kick\.com\/[\w_-]+\/clips\/|clips\.twitch\.tv\/|streamable\.com\/\w)/i.test(cleanUrl)) {
    return `<div class="hs-mc-media hs-feed-embed-pending" data-resolve-url="${attr(safe)}" data-resolve-platform="link"><span class="hs-feed-embed-pending-label">loading preview…</span></div>`
  }
  return ''
}

// Main entry: build full media HTML for a feed message.
// Handles direct uploads (image/video), multi-image (media[]), and content-extracted embeds.
function buildFeedMediaHtml(m) {
  if (!m) return ''
  const isReply = !!m.reply_to
  const mediaUrl = m.media_url
  const mediaType = m.media_type
  const mediaArr = Array.isArray(m.media) ? m.media : []

  // Multi-item media (uploads)
  if (mediaArr.length > 1) {
    const items = mediaArr.map(med => {
      const url = safeUrl(med.url)
      if (!url) return ''
      if (med.type === 'video') {
        return `<video controls muted preload="metadata" src="${attr(url)}" class="hs-feed-media-item"></video>`
      }
      return `<img src="${attr(url)}" alt="" class="hs-feed-media-item">`
    }).filter(Boolean).join('')
    if (items) return `<div class="hs-feed-media hs-feed-media-multi">${items}</div>`
  }

  // Single direct upload
  if (mediaUrl) {
    const safe = safeUrl(mediaUrl)
    if (!safe) return ''

    const isVideo = mediaType === 'video' || (mediaType || '').startsWith('video/')
    const isEmbedType = mediaType === 'embed' ||
      /^https?:\/\/(?:(?:www\.)?(?:youtube\.com|youtu\.be|twitch\.tv|clips\.twitch\.tv|streamable\.com|vimeo\.com|twitter\.com|x\.com|kick\.com|tiktok\.com|open\.spotify\.com|soundcloud\.com|giphy\.com|tenor\.com|imgur\.com|instagram\.com)|(?:[\w-]+\.)?reddit\.com)/i.test(safe)
    const isImage = mediaType === 'image' || /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(safe)

    if (isEmbedType) {
      const embedHtml = parseFeedEmbed(safe)
      if (embedHtml) return `<div class="hs-feed-media">${embedHtml}</div>`
    }

    if (isVideo) {
      return `<div class="hs-feed-media"><video controls muted preload="metadata" src="${attr(safe)}"></video></div>`
    }

    if (isImage) {
      return `<div class="hs-feed-media"><img src="${attr(safe)}" alt="" class="hs-feed-media-img"></div>`
    }

    return ''
  }

  // No direct media — for OPs, scan content for embeddable URL
  if (!isReply && m.content) {
    const embedHtml = extractFeedEmbed(m.content)
    if (embedHtml) return `<div class="hs-feed-media">${embedHtml}</div>`
  }

  return ''
}

// Resolve `.hs-feed-embed-pending[data-resolve-url]` placeholders via
// heatsync.org/api/embed/resolve. All HTML built from server fields is escaped
// via attr() (escapeHtml). Idempotent — safe to call repeatedly.
const _feedResolveInflight = new Map()
const FEED_RESOLVE_INFLIGHT_MAX = 200

function _fetchFeedResolve(url) {
  if (_feedResolveInflight.has(url)) return _feedResolveInflight.get(url)
  // Route via background SW — content script fetches in MV3 still go through
  // page-origin CORS, but the SW has full host_permissions and bypasses it.
  const promise = (async () => {
    try {
      const data = await safeSendMessage({ type: 'fetch_embed_resolve', url })
      if (!data || data.error || data.ok === false) return null
      return data
    } catch (_) { return null }
  })()
  if (_feedResolveInflight.size >= FEED_RESOLVE_INFLIGHT_MAX) {
    _feedResolveInflight.delete(_feedResolveInflight.keys().next().value)
  }
  _feedResolveInflight.set(url, promise)
  promise.finally(() => cleanup.setTimeout(() => _feedResolveInflight.delete(url), 30000))
  return promise
}

function _buildFeedResolvedHtml(ph, data) {
  const url = ph.dataset.resolveUrl || ''
  const platform = ph.dataset.resolvePlatform || ''
  const safeUrlStr = attr(url)
  const safeTitle = attr(data.title || '')
  const safeAuthor = attr(data.author || '')
  const safeThumb = attr(data.thumbnail || '')
  const safeMedia = attr(data.mediaUrl || '')
  const safePlat = attr(platform)

  if (data.type === 'image' && data.mediaUrl) {
    return `<a href="${safeUrlStr}" target="_blank" rel="noopener" class="hs-feed-embed-rich-imglink">
      <img src="${safeMedia}" alt="${safeTitle}" class="hs-feed-embed-rich-image" data-fb="deleted-span">
    </a>`
  }
  if (data.type === 'video' && data.mediaUrl) {
    // m3u8 (kick clip) needs hls.js which we don't bundle — render as a
    // thumbnail card that opens the clip page on click. mp4 plays natively.
    if (data.mediaUrl.includes('.m3u8')) {
      const thumbHtml = safeThumb
        ? `<img src="${safeThumb}" alt="${safeTitle || safePlat}" class="hs-feed-embed-rich-thumb">`
        : `<div class="hs-feed-embed-rich-thumb-placeholder">[${safePlat}]</div>`
      return `<a href="${safeUrlStr}" target="_blank" rel="noopener" class="hs-feed-embed-rich-card">
        ${thumbHtml}
        <div class="hs-feed-embed-rich-meta">
          <div class="hs-feed-embed-rich-platform">${safePlat}</div>
          <div class="hs-feed-embed-rich-title">${safeTitle}</div>
          ${safeAuthor ? `<div class="hs-feed-embed-rich-author">${safeAuthor}</div>` : ''}
        </div>
      </a>`
    }
    const poster = safeThumb ? `poster="${safeThumb}"` : ''
    return `<video controls preload="metadata" ${poster} src="${safeMedia}" class="hs-feed-embed-rich-video"></video>`
  }
  if (data.type === 'rich') {
    const thumbHtml = safeThumb
      ? `<img src="${safeThumb}" alt="${safeTitle || safePlat}" class="hs-feed-embed-rich-thumb">`
      : `<div class="hs-feed-embed-rich-thumb-placeholder">[${safePlat}]</div>`
    return `<a href="${safeUrlStr}" target="_blank" rel="noopener" class="hs-feed-embed-rich-card">
      ${thumbHtml}
      <div class="hs-feed-embed-rich-meta">
        <div class="hs-feed-embed-rich-platform">${safePlat}</div>
        <div class="hs-feed-embed-rich-title">${safeTitle}</div>
        ${safeAuthor ? `<div class="hs-feed-embed-rich-author">${safeAuthor}</div>` : ''}
      </div>
    </a>`
  }
  return ''
}

function _buildFeedResolveFailedHtml(ph) {
  const url = ph.dataset.resolveUrl || ''
  const platform = ph.dataset.resolvePlatform || ''
  // Placeholder may carry baked-in fallback metadata (data-fb-title/-author)
  // so we can still render a rich card when the server can't reach the source.
  const fbTitle = ph.dataset.fbTitle || ''
  const fbAuthor = ph.dataset.fbAuthor || ''
  if (fbTitle || fbAuthor) {
    return `<a href="${attr(url)}" target="_blank" rel="noopener" class="hs-feed-embed-rich-card">
      <div class="hs-feed-embed-rich-thumb-placeholder">[${attr(platform)}]</div>
      <div class="hs-feed-embed-rich-meta">
        <div class="hs-feed-embed-rich-platform">${attr(platform)}</div>
        <div class="hs-feed-embed-rich-title">${attr(fbTitle)}</div>
        ${fbAuthor ? `<div class="hs-feed-embed-rich-author">${attr(fbAuthor)}</div>` : ''}
      </div>
    </a>`
  }
  const truncated = url.length > 60 ? url.slice(0, 60) + '…' : url
  return `<div class="hs-feed-link-card">
    <a href="${attr(url)}" target="_blank" rel="noopener" class="hs-feed-link-card-link">
      <span class="hs-feed-link-card-icon">[${attr(platform)}]</span>
      <span class="hs-feed-link-card-url">${attr(truncated)}</span>
    </a>
  </div>`
}

function _swapPlaceholder(ph, html, resolvedClass) {
  // Replace placeholder children via fragment to satisfy the security hook
  // (avoids ph.innerHTML = …); html is built from escaped server fields only.
  const tmp = document.createElement('div')
  tmp.insertAdjacentHTML('afterbegin', html)
  while (ph.firstChild) ph.removeChild(ph.firstChild)
  while (tmp.firstChild) ph.appendChild(tmp.firstChild)
  ph.classList.remove('hs-feed-embed-pending')
  ph.classList.add(resolvedClass)
}

function resolvePendingFeedEmbeds(root) {
  if (!root || !root.querySelectorAll) return
  const placeholders = root.querySelectorAll('.hs-feed-embed-pending[data-resolve-url]')
  if (!placeholders.length) return
  for (const ph of placeholders) {
    if (ph.dataset.resolving === '1') continue
    ph.dataset.resolving = '1'
    const url = ph.dataset.resolveUrl
    if (!url) continue
    _fetchFeedResolve(url).then(data => {
      // The row may have been culled (chat trimMessagesEl, or a feed re-render)
      // during the async resolve — don't mutate a detached node or wire dead
      // listeners. Matches the isConnected guard pattern used elsewhere.
      if (!ph.isConnected) return
      if (data && !data.error) {
        const html = _buildFeedResolvedHtml(ph, data)
        if (html) _swapPlaceholder(ph, html, 'hs-feed-embed-resolved')
        else _swapPlaceholder(ph, _buildFeedResolveFailedHtml(ph), 'hs-feed-embed-resolve-failed')
      } else {
        _swapPlaceholder(ph, _buildFeedResolveFailedHtml(ph), 'hs-feed-embed-resolve-failed')
      }
      attachFeedFallbacks(ph)
    })
  }
}

// Wire load-fail fallbacks for images/avatars in the feed. Replaces the inline
// onerror= patterns that host-page CSP (twitch) silently strips. Idempotent.
//   data-fb="hide"          → display:none
//   data-fb="deleted"       → swap node for <div class="hs-feed-media-deleted">image unavailable</div>
//   data-fb="deleted-span"  → swap node for <span class="hs-feed-media-deleted">image unavailable</span>
//   data-fallback-anon      → swap src to /anon.webp (avatars)
function attachFeedFallbacks(root) {
  if (!root || !root.querySelectorAll) return
  root.querySelectorAll('img[data-fallback-anon]').forEach((img) => {
    img.addEventListener('error', () => {
      img.removeAttribute('data-fallback-anon')
      img.src = 'https://heatsync.org/anon.webp'
    }, { once: true })
  })
  root.querySelectorAll('img[data-fb]').forEach((img) => {
    const mode = img.dataset.fb
    img.removeAttribute('data-fb')
    img.addEventListener('error', () => {
      if (mode === 'hide') {
        img.style.display = 'none'
      } else if (mode === 'deleted' || mode === 'deleted-span') {
        const tag = mode === 'deleted-span' ? 'span' : 'div'
        const replacement = document.createElement(tag)
        replacement.className = 'hs-feed-media-deleted'
        replacement.textContent = 'image unavailable'
        img.replaceWith(replacement)
      }
    }, { once: true })
  })
  // Inline <video> (direct chat media) — a dead source must hide, not leave a
  // broken player. <video> 'error' doesn't bubble, so wire it directly here.
  root.querySelectorAll('video[data-fb="hide"]').forEach((video) => {
    video.removeAttribute('data-fb')
    video.addEventListener('error', () => { video.style.display = 'none' }, { once: true })
  })
}
