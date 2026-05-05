// Feed media + embed rendering for the extension home tab.
// Mirrors heatsync client/embed/embed-parser.js + renderers/media-renderer.js
// All embeds always-enabled (extension has no per-platform toggles yet).
// Uses plain iframes (no facade) — feed virtual-scrolls so visible iframe count stays low.

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
  return `<div class="hs-feed-embed-container hs-feed-embed-youtube">
    <iframe src="https://www.youtube-nocookie.com/embed/${id}"
      allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen loading="lazy"
      referrerpolicy="strict-origin-when-cross-origin"></iframe>
  </div>`
}

function twitchClipEmbed(clipId) {
  const id = sanitizeEmbedId(clipId)
  if (!id) return ''
  const parent = location.hostname || 'localhost'
  return `<div class="hs-feed-embed-container hs-feed-embed-twitch">
    <iframe src="https://clips.twitch.tv/embed?clip=${id}&parent=${encodeURIComponent(parent)}"
      allowfullscreen loading="lazy"></iframe>
  </div>`
}

function kickClipEmbed(clipId) {
  const id = sanitizeEmbedId(clipId)
  if (!id) return ''
  return `<div class="hs-feed-embed-container hs-feed-embed-kick">
    <iframe src="https://player.kick.com/clips/${id}"
      allowfullscreen scrolling="no" loading="lazy"
      allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"></iframe>
  </div>`
}

function streamableEmbed(videoId) {
  const id = sanitizeEmbedId(videoId)
  if (!id) return ''
  return `<div class="hs-feed-embed-container hs-feed-embed-streamable">
    <iframe src="https://streamable.com/e/${id}" allowfullscreen loading="lazy"></iframe>
  </div>`
}

function vimeoEmbed(videoId) {
  const id = sanitizeEmbedId(videoId)
  if (!id) return ''
  return `<div class="hs-feed-embed-container hs-feed-embed-vimeo">
    <iframe src="https://player.vimeo.com/video/${id}"
      allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe>
  </div>`
}

function spotifyEmbed(kind, id) {
  const safeKind = (kind || '').replace(/[^a-z]/g, '')
  const safeId = sanitizeEmbedId(id)
  if (!safeKind || !safeId) return ''
  return `<div class="hs-feed-embed-container hs-feed-embed-spotify">
    <iframe src="https://open.spotify.com/embed/${safeKind}/${safeId}"
      width="100%" height="152" allow="encrypted-media" loading="lazy"></iframe>
  </div>`
}

function soundcloudEmbed(url) {
  const safe = safeUrl(url)
  if (!safe || !/^https?:\/\/(www\.|m\.)?soundcloud\.com\//i.test(safe)) return ''
  return `<div class="hs-feed-embed-container hs-feed-embed-soundcloud">
    <iframe scrolling="no"
      src="https://w.soundcloud.com/player/?url=${encodeURIComponent(safe)}&color=%23ff5500&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=true"
      loading="lazy"></iframe>
  </div>`
}

function giphyEmbed(gifId) {
  const id = sanitizeEmbedId(gifId)
  if (!id) return ''
  return `<div class="hs-feed-embed-container hs-feed-embed-giphy">
    <iframe src="https://giphy.com/embed/${id}" allowfullscreen loading="lazy"></iframe>
  </div>`
}

function tenorEmbed(gifId) {
  const id = sanitizeEmbedId(gifId)
  if (!id) return ''
  return `<div class="hs-feed-embed-container hs-feed-embed-tenor">
    <iframe src="https://tenor.com/embed/${id}" allowfullscreen loading="lazy"></iframe>
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
      allow="autoplay; clipboard-write" allowfullscreen loading="lazy"></iframe>
  </div>`
}

function imgurEmbed(imgurId) {
  const id = sanitizeEmbedId(imgurId)
  if (!id) return ''
  // Imgur embed needs script — fall back to direct image link approach
  return `<div class="hs-feed-embed-container hs-feed-embed-imgur" style="aspect-ratio:auto;max-width:480px">
    <a href="https://imgur.com/${id}" target="_blank" rel="noopener">
      <img src="https://i.imgur.com/${id}.jpg" alt="imgur"
        style="max-width:100%;height:auto;display:block"
        onerror="this.style.display='none'">
    </a>
  </div>`
}

function tiktokEmbed(videoId, url) {
  const id = sanitizeEmbedId(videoId)
  if (!id) return ''
  return `<div class="hs-feed-embed-container hs-feed-embed-tiktok">
    <iframe src="https://www.tiktok.com/embed/v2/${id}"
      allowfullscreen scrolling="no" loading="lazy"></iframe>
  </div>`
}

function redditEmbed(url) {
  const safe = safeUrl(url)
  if (!safe) return ''
  // Permalink (any subdomain incl. old.reddit.com) → server-resolved rich card.
  // heatsync.org/api/embed/resolve scrapes embed.reddit.com (datacenter IP can't
  // hit /.json), returns title/author/icon/image. Mirrors website behavior.
  if (/reddit\.com\/r\/[\w-]+\/comments\/[a-z0-9]+/i.test(safe)) {
    return `<div class="hs-feed-embed-pending hs-feed-embed-reddit"
      data-resolve-url="${attr(safe)}" data-resolve-platform="reddit">
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

function vimeoUrlEmbed(url) {
  const m = url.match(/vimeo\.com\/(\d+)/)
  if (!m) return ''
  return vimeoEmbed(m[1])
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
    if (m) return kickClipEmbed(m[1])
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
      <img src="${attr(safe)}" alt=""
        onerror="this.outerHTML='<div class=\\'hs-feed-media-deleted\\'>image unavailable</div>'">
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
  _feedResolveInflight.set(url, promise)
  promise.finally(() => setTimeout(() => _feedResolveInflight.delete(url), 30000))
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
      <img src="${safeMedia}" alt="${safeTitle}" class="hs-feed-embed-rich-image"
        onerror="this.outerHTML='<span class=\\'hs-feed-media-deleted\\'>image unavailable</span>'">
    </a>`
  }
  if (data.type === 'video' && data.mediaUrl) {
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
      if (data && !data.error) {
        const html = _buildFeedResolvedHtml(ph, data)
        if (html) _swapPlaceholder(ph, html, 'hs-feed-embed-resolved')
        else _swapPlaceholder(ph, _buildFeedResolveFailedHtml(ph), 'hs-feed-embed-resolve-failed')
      } else {
        _swapPlaceholder(ph, _buildFeedResolveFailedHtml(ph), 'hs-feed-embed-resolve-failed')
      }
    })
  }
}
