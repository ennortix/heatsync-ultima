// Runs in MAIN world at document_start BEFORE Twitch's JS
// Intercepts image src/srcset setters to fix heatsync emote URLs
(function() {
  'use strict'

  const DEBUG = false
  const log = DEBUG ? console.log.bind(console, '[heatsync-early]') : () => {}

  // Firefox marks some globals (WebSocket, fetch, Image) as read-only
  function safeOverride(obj, prop, value) {
    try { obj[prop] = value } catch {
      Object.defineProperty(obj, prop, { value, writable: true, configurable: true })
    }
  }

  // Store for emote URL mappings (populated by content script)
  window.__heatsyncEmoteUrls = window.__heatsyncEmoteUrls || {}

  // ═══ Hermes Event Bus Interception ═══
  // Twitch's internal real-time event bus (replaced PubSub Apr 2025).
  // Passively read notifications from topics Twitch already subscribes to.
  const OrigWebSocket = window.WebSocket
  const channelIdToLogin = {}
  function setChannelId(id, login) {
    if (Object.keys(channelIdToLogin).length >= 200) {
      delete channelIdToLogin[Object.keys(channelIdToLogin)[0]]
    }
    channelIdToLogin[id] = login
  }

  function handleHermesMessage(e) {
    try {
      const msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
      if (msg.type !== 'notification' || !msg.notification?.pubsub) return
      const pubsub = typeof msg.notification.pubsub === 'string'
        ? JSON.parse(msg.notification.pubsub)
        : msg.notification.pubsub
      const evtType = pubsub.type
      if (!evtType) return

      // Channel login from pubsub data or channelIdToLogin map
      const resolveChannel = (id) => channelIdToLogin[id] || location.pathname.split('/')[1]?.toLowerCase() || id

      if (evtType === 'raid_update_v5' && pubsub.raid) {
        const r = pubsub.raid
        window.postMessage({ type: 'heatsync-hermes-event', eventType: 'raid', channel: resolveChannel(r.source_id), data: {
          target: r.target_login || r.target_display_name || 'unknown',
          viewers: r.viewer_count || 0
        }}, location.origin)
      } else if (evtType === 'hype-train-start' && pubsub.data) {
        const d = pubsub.data
        window.postMessage({ type: 'heatsync-hermes-event', eventType: 'hype-train-start', channel: resolveChannel(d.channel_id), data: {
          level: d.progress?.level?.value || 1
        }}, location.origin)
      } else if (evtType === 'hype-train-progression' && pubsub.data) {
        // Skip progressions — too spammy, only show start/end
      } else if (evtType === 'hype-train-end' && pubsub.data) {
        const d = pubsub.data
        window.postMessage({ type: 'heatsync-hermes-event', eventType: 'hype-train-end', channel: resolveChannel(d.channel_id), data: {
          level: d.progress?.level?.value || 1
        }}, location.origin)
      } else if (evtType === 'reward-redeemed' && pubsub.data?.redemption) {
        const r = pubsub.data.redemption
        window.postMessage({ type: 'heatsync-hermes-event', eventType: 'redeem', channel: resolveChannel(r.channel_id), data: {
          user: r.user?.display_name || r.user?.login || 'unknown',
          title: r.reward?.title || 'reward',
          cost: r.reward?.cost || 0
        }}, location.origin)
      }
      // Sub gifts — exact payload TBD, add when discovered
    } catch (err) {
      log('Hermes parse error:', err)
    }
  }

  const HsWebSocket = function(url, protocols) {
    const ws = protocols !== undefined
      ? new OrigWebSocket(url, protocols)
      : new OrigWebSocket(url)
    if (typeof url === 'string' && url.includes('hermes.twitch.tv')) {
      ws.addEventListener('message', handleHermesMessage)
      log('Hermes WebSocket intercepted')
    }
    return ws
  }
  HsWebSocket.prototype = OrigWebSocket.prototype
  HsWebSocket.CONNECTING = OrigWebSocket.CONNECTING
  HsWebSocket.OPEN = OrigWebSocket.OPEN
  HsWebSocket.CLOSING = OrigWebSocket.CLOSING
  HsWebSocket.CLOSED = OrigWebSocket.CLOSED

  safeOverride(window, 'WebSocket', HsWebSocket)

  // ═══ Twitch GQL Interception ═══
  // Captures persisted query hashes, integrity tokens, and response data
  // from Twitch's own GQL calls. Proxies GQL requests from content scripts.
  const gql = {
    hashes: {},       // operationName → sha256Hash
    integrity: null,  // Client-Integrity token
    clientId: null,   // Client-Id
    authToken: null,  // OAuth token
    cache: {},        // operationName → { data, ts }
    pendingRequests: new Map() // queued requests waiting for hashes
  }

  const GQL_OPS_TO_CACHE = [
    'ChannelPointsPredictionContext', 'CommunityPointsContext',
    'ChannelPointsContext', 'ActivePoll', 'CreatePoll',
    'MakePrediction', 'ChannelPointsRewardRedemption'
  ]

  // Hook fetch to intercept Twitch GQL traffic
  const origFetch = window.fetch
  const hsFetch = function(input, init) {
    const url = typeof input === 'string' ? input : input?.url
    if (url && url.includes('gql.twitch.tv') && init?.method === 'POST') {
      // Capture headers
      try {
        const hdrs = init.headers
        if (hdrs) {
          const get = (k) => {
            if (hdrs instanceof Headers) return hdrs.get(k)
            if (typeof hdrs === 'object') return hdrs[k] || hdrs[k.toLowerCase()]
            return null
          }
          const integ = get('Client-Integrity')
          if (integ) gql.integrity = integ
          const cid = get('Client-Id') || get('Client-ID')
          if (cid) gql.clientId = cid
          const auth = get('Authorization')
          if (auth && auth.startsWith('OAuth ')) gql.authToken = auth.slice(6)
        }
      } catch(e) {}

      // Capture operation hashes from request body
      try {
        const body = typeof init.body === 'string' ? JSON.parse(init.body) : null
        if (body) {
          const ops = Array.isArray(body) ? body : [body]
          for (const op of ops) {
            const hash = op?.extensions?.persistedQuery?.sha256Hash
            if (hash && op.operationName) {
              gql.hashes[op.operationName] = hash
              log('GQL hash captured:', op.operationName)
            }
          }
        }
      } catch(e) {}

      // Intercept response to cache data
      const promise = origFetch.apply(this, arguments)
      promise.then(resp => {
        if (!resp.ok) return
        const clone = resp.clone()
        clone.json().then(data => {
          const items = Array.isArray(data) ? data : [data]
          for (const item of items) {
            const opName = item?.extensions?.operationName
            if (!opName) continue
            gql.cache[opName] = { data: item.data, ts: Date.now() }
            // Extract user ID → login mappings for Hermes channel resolution
            try {
              const u = item.data?.user || item.data?.channel?.owner
              if (u?.id && u?.login) setChannelId(u.id, u.login.toLowerCase())
            } catch {}
            // Forward prediction/poll/points data to content script
            if (GQL_OPS_TO_CACHE.some(n => opName.includes(n) || opName.toLowerCase().includes(n.toLowerCase()))) {
              window.postMessage({
                type: 'heatsync-gql-data',
                operation: opName,
                data: item.data,
                errors: item.errors || null
              }, location.origin)
            }
          }
          // Flush any pending requests that now have hashes
          for (const [id, req] of gql.pendingRequests) {
            if (gql.hashes[req.operation]) {
              gql.pendingRequests.delete(id)
              executeGqlProxy(req)
            }
          }
        }).catch(() => {})
      }).catch(() => {})

      return promise
    }

    // Capture integrity token from Twitch's own /integrity calls
    if (url && url.includes('gql.twitch.tv/integrity')) {
      const promise = origFetch.apply(this, arguments)
      promise.then(resp => {
        if (!resp.ok) return
        resp.clone().json().then(data => {
          if (data.token) {
            gql.integrity = data.token
            gql.integrityTs = Date.now()
          }
        }).catch(() => {})
      }).catch(() => {})
      return promise
    }

    return origFetch.apply(this, arguments)
  }
  safeOverride(window, 'fetch', hsFetch)

  function buildGqlHeaders() {
    const hdrs = { 'Content-Type': 'application/json' }
    if (gql.clientId) hdrs['Client-Id'] = gql.clientId
    else hdrs['Client-Id'] = 'kimne78kx3ncx6brgo4mv6wki5h1ko'
    if (gql.authToken) hdrs['Authorization'] = 'OAuth ' + gql.authToken
    if (gql.integrity) hdrs['Client-Integrity'] = gql.integrity
    return hdrs
  }

  // Use captured integrity token — it's grabbed from Twitch's own /integrity calls
  // which include proper Kasada proofs. We can't fetch our own.
  function hasValidIntegrity() {
    return gql.integrity && gql.integrityTs && (Date.now() - gql.integrityTs < 1800000) // 30min
  }

  async function executeGqlProxy(req) {
    const hash = gql.hashes[req.operation]
    if (!hash && !req.rawQuery) {
      window.postMessage({
        type: 'heatsync-gql-response', id: req.id,
        error: 'no hash for ' + req.operation
      }, location.origin)
      return
    }

    const body = req.rawQuery
      ? { query: req.rawQuery, variables: req.variables || {} }
      : {
          operationName: req.operation,
          extensions: { persistedQuery: { version: 1, sha256Hash: hash } },
          variables: req.variables || {}
        }

    // Support batched operations
    const payload = req.batch ? req.batch.map(op => ({
      operationName: op.operation,
      extensions: { persistedQuery: { version: 1, sha256Hash: gql.hashes[op.operation] || hash } },
      variables: op.variables || {}
    })) : body

    if (!gql.authToken) {
      window.postMessage({
        type: 'heatsync-gql-response', id: req.id,
        error: 'no twitch auth token captured — refresh the page'
      }, location.origin)
      return
    }

    // Mutations need valid integrity — reads work without it
    if (DEBUG && req.rawQuery && !hasValidIntegrity() && /mutation\s/i.test(req.rawQuery)) {
      console.warn('[heatsync-gql] integrity token stale/missing — mutations may fail')
    }

    const hdrs = buildGqlHeaders()
    if (DEBUG) console.log('[heatsync-gql] proxy request:', req.operation || 'rawQuery', 'auth:', !!gql.authToken, 'integrity:', !!gql.integrity, 'clientId:', !!gql.clientId)

    origFetch('https://gql.twitch.tv/gql', {
      method: 'POST',
      headers: hdrs,
      body: JSON.stringify(payload)
    })
    .then(r => {
      if (DEBUG) console.log('[heatsync-gql] response status:', r.status)
      return r.json()
    })
    .then(data => {
      if (DEBUG) console.log('[heatsync-gql] response data:', JSON.stringify(data).slice(0, 500))
      window.postMessage({
        type: 'heatsync-gql-response', id: req.id, data
      }, location.origin)
    })
    .catch(err => {
      console.error('[heatsync-gql] fetch error:', err.message)
      window.postMessage({
        type: 'heatsync-gql-response', id: req.id, error: err.message
      }, location.origin)
    })
  }

  // Handle GQL requests from content script
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin) return

    // Content script requesting cached GQL data
    if (e.data?.type === 'heatsync-gql-get-cache') {
      const ops = e.data.operations || []
      const result = {}
      for (const op of ops) {
        if (gql.cache[op]) result[op] = gql.cache[op]
      }
      window.postMessage({
        type: 'heatsync-gql-cache-response',
        id: e.data.id,
        data: result,
        hashes: Object.keys(gql.hashes)
      }, location.origin)
      return
    }

    // Generic Helix API proxy — content scripts route through MAIN world for OAuth
    if (e.data?.type === 'heatsync-helix') {
      const req = e.data
      ;(async () => {
        try {
          if (!gql.authToken) {
            window.postMessage({ type: 'heatsync-helix-response', id: req.id, error: 'not logged into twitch' }, location.origin)
            return
          }
          const cid = gql.clientId || 'kimne78kx3ncx6brgo4mv6wki5h1ko'

          // Resolve {me} placeholder in URL to cached user ID
          let url = req.url
          if (url.includes('{me}')) {
            if (!gql.userId) {
              // Use GQL (same-origin) instead of Helix (cross-origin, blocked by CORS)
              try {
                const gqlResp = await origFetch('https://gql.twitch.tv/gql', {
                  method: 'POST',
                  headers: buildGqlHeaders(),
                  body: JSON.stringify({ query: '{ currentUser { id login } }' })
                })
                if (gqlResp.ok) {
                  const gqlData = await gqlResp.json()
                  const cu = gqlData?.data?.currentUser
                  if (cu?.id) {
                    gql.userId = cu.id
                    gql.userLogin = cu.login
                    if (cu.id && cu.login) setChannelId(cu.id, cu.login.toLowerCase())
                  }
                }
              } catch {}
            }
            if (!gql.userId) {
              window.postMessage({ type: 'heatsync-helix-response', id: req.id, error: 'could not resolve user ID' }, location.origin)
              return
            }
            url = url.replace(/\{me\}/g, gql.userId)
          }

          const hdrs = { 'Authorization': 'Bearer ' + gql.authToken, 'Client-Id': cid }
          if (req.body) hdrs['Content-Type'] = 'application/json'
          const resp = await origFetch(url, {
            method: req.method || 'GET',
            headers: hdrs,
            body: req.body ? JSON.stringify(req.body) : undefined
          })
          if (resp.status === 204) {
            window.postMessage({ type: 'heatsync-helix-response', id: req.id, ok: true }, location.origin)
          } else {
            const data = await resp.json().catch(() => null)
            if (resp.ok) {
              window.postMessage({ type: 'heatsync-helix-response', id: req.id, ok: true, data }, location.origin)
            } else {
              window.postMessage({ type: 'heatsync-helix-response', id: req.id, error: `${resp.status}: ${data?.message || JSON.stringify(data)}` }, location.origin)
            }
          }
        } catch (err) {
          window.postMessage({ type: 'heatsync-helix-response', id: req.id, error: err.message }, location.origin)
        }
      })()
      return
    }

    // Content script requesting GQL proxy call
    if (e.data?.type === 'heatsync-gql-request') {
      const req = e.data
      if (req.rawQuery || gql.hashes[req.operation]) {
        executeGqlProxy(req)
      } else {
        // Queue request — hash might arrive soon from Twitch's own calls
        gql.pendingRequests.set(req.id, req)
        setTimeout(() => {
          if (gql.pendingRequests.has(req.id)) {
            gql.pendingRequests.delete(req.id)
            window.postMessage({
              type: 'heatsync-gql-response', id: req.id,
              error: 'hash not available for ' + req.operation
            }, location.origin)
          }
        }, 2000)
      }
      return
    }
  })
  let urlMapWasEmpty = true

  // Listen for URL map updates from content script
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin) return
    if (e.data?.type === 'heatsync-url-map' && e.data.urlMap) {
      const wasEmpty = urlMapWasEmpty
      Object.assign(window.__heatsyncEmoteUrls, e.data.urlMap)
      urlMapWasEmpty = Object.keys(window.__heatsyncEmoteUrls).length === 0

      if (wasEmpty && !urlMapWasEmpty) {
        fixExistingImages()
      }
    }
  })

  function fixExistingImages() {
    const images = document.querySelectorAll('img[src*="__FFZ__999999"]')
    images.forEach(img => {
      if (img.dataset.heatsyncFixed) return
      const fixedUrl = fixUrl(img.src)
      if (fixedUrl) {
        img.src = fixedUrl
        img.dataset.heatsyncFixed = 'true'
      }
    })
  }

  function fixUrl(value) {
    if (!value || typeof value !== 'string') return null

    if (value.includes('__FFZ__999999::')) {
      const match = value.match(/__FFZ__999999::([a-zA-Z0-9]+)__FFZ__/)
      if (match) {
        const url = window.__heatsyncEmoteUrls?.[match[1]]
        if (url) return url
      }
    }

    if (value.includes('jtvnw.net/emoticons/v2/__FFZ__')) {
      const match = value.match(/__FFZ__999999::([a-f0-9]+)__FFZ__/)
      if (match) {
        const url = window.__heatsyncEmoteUrls?.[match[1]]
        if (url) return url
      }
    }

    return null
  }

  // Override img.src setter
  const srcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')
  if (srcDesc) {
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      get: function() { return srcDesc.get.call(this) },
      set: function(value) {
        const fixed = fixUrl(value)
        if (fixed) {
          this.dataset.heatsyncFixed = 'true'
          return srcDesc.set.call(this, fixed)
        }
        return srcDesc.set.call(this, value)
      },
      configurable: true,
      enumerable: true
    })
  }

  // Override setAttribute for src and srcset
  const origSetAttr = Element.prototype.setAttribute
  const hsSetAttribute = function(name, value) {
    if (this.tagName === 'IMG' && (name === 'src' || name === 'srcset')) {
      const fixed = fixUrl(value)
      if (fixed) {
        this.dataset.heatsyncFixed = 'true'
        const fixedValue = name === 'srcset' ? fixed + ' 1x' : fixed
        return origSetAttr.call(this, name, fixedValue)
      }
    }
    return origSetAttr.call(this, name, value)
  }
  safeOverride(Element.prototype, 'setAttribute', hsSetAttribute)

  // Override srcset property setter
  const srcsetDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'srcset')
  if (srcsetDesc) {
    Object.defineProperty(HTMLImageElement.prototype, 'srcset', {
      get: function() { return srcsetDesc.get.call(this) },
      set: function(value) {
        const fixed = fixUrl(value)
        if (fixed) {
          this.dataset.heatsyncFixed = 'true'
          return srcsetDesc.set.call(this, fixed + ' 1x')
        }
        return srcsetDesc.set.call(this, value)
      },
      configurable: true,
      enumerable: true
    })
  }

  // Override Image constructor
  const OrigImage = window.Image
  const HsImage = function(width, height) {
    const img = new OrigImage(width, height)
    const instSrcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')
    Object.defineProperty(img, 'src', {
      get: function() { return instSrcDesc.get.call(img) },
      set: function(value) {
        const fixed = fixUrl(value)
        if (fixed) {
          img.dataset.heatsyncFixed = 'true'
          return instSrcDesc.set.call(img, fixed)
        }
        return instSrcDesc.set.call(img, value)
      },
      configurable: true,
      enumerable: true
    })
    return img
  }
  HsImage.prototype = OrigImage.prototype
  safeOverride(window, 'Image', HsImage)

  // Override createElement for img tags
  const origCreateElement = document.createElement.bind(document)
  const hsCreateElement = function(tag, options) {
    const el = origCreateElement(tag, options)
    if (tag.toLowerCase() === 'img') {
      const instSrcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')
      Object.defineProperty(el, 'src', {
        get: function() { return instSrcDesc.get.call(el) },
        set: function(value) {
          const fixed = fixUrl(value)
          if (fixed) {
            el.dataset.heatsyncFixed = 'true'
            return instSrcDesc.set.call(el, fixed)
          }
          return instSrcDesc.set.call(el, value)
        },
        configurable: true,
        enumerable: true
      })
    }
    return el
  }
  safeOverride(document, 'createElement', hsCreateElement)

})()
