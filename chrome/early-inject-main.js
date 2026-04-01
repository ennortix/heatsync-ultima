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
          cost: r.reward?.cost || 0,
          rewardId: r.reward?.id || ''
        }}, location.origin)
      }
      // Pinned messages
      else if ((evtType === 'pin-message' || evtType === 'pinned-chat') && pubsub.data) {
        const d = pubsub.data
        const text = d.message?.message?.text || d.message?.text || d.text || ''
        const sender = d.message?.sender?.displayName || d.message?.sender?.login || d.pinned_by?.display_name || ''
        if (text) {
          window.postMessage({ type: 'heatsync-hermes-event', eventType: 'pin', channel: resolveChannel(d.channel_id || ''), data: {
            message: text, sender, id: d.id || d.message?.id || ''
          }}, location.origin)
        }
      } else if (evtType === 'unpin-message' || evtType === 'unpinned-chat') {
        window.postMessage({ type: 'heatsync-hermes-event', eventType: 'unpin', channel: resolveChannel(pubsub.data?.channel_id || ''), data: {} }, location.origin)
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
    hashes: {         // operationName → sha256Hash (seeded with known working hashes)
      MakePrediction: 'b44682ecc88358817009f20e69d75081b1e58825bb40aa53d5dbadcc17c881d8',
      ChannelPointsPredictionContext: 'beb846598256b75bd7c1fe54a80431335996153e358ca9c7837ce7bb83d7d383'
    },
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
            if (Object.keys(gql.cache).length > 50) {
              const oldest = Object.entries(gql.cache).reduce((a, b) => a[1].ts < b[1].ts ? a : b)
              delete gql.cache[oldest[0]]
            }
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

  // Read auth-token cookie as fallback when fetch interception missed it
  function getAuthToken() {
    if (gql.authToken) return gql.authToken
    try {
      const m = document.cookie.match(/(?:^|;\s*)auth-token=([^;]+)/)
      if (m) { gql.authToken = m[1]; return m[1] }
    } catch {}
    return null
  }

  function buildGqlHeaders() {
    const hdrs = { 'Content-Type': 'application/json' }
    if (gql.clientId) hdrs['Client-Id'] = gql.clientId
    else hdrs['Client-Id'] = 'kimne78kx3ncx6brgo4mv6wki5h1ko'
    const token = getAuthToken()
    if (token) hdrs['Authorization'] = 'OAuth ' + token
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

    if (!getAuthToken()) {
      window.postMessage({
        type: 'heatsync-gql-response', id: req.id,
        error: 'no twitch auth token captured — refresh the page'
      }, location.origin)
      return
    }

    // Mutations need valid integrity — reads work without it
    const hdrs = buildGqlHeaders()

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

    // ═══ Apollo mutation proxy ═══
    // Generic handler: find Twitch's Apollo client + webpack mutation document,
    // call client.mutate() with full auth/integrity context.
    // Used for AcceptPredictionTerms and any mutation that needs persisted query hashes.
    if (e.data?.type === 'heatsync-apollo-mutate') {
      const reqId = e.data.id
      const searchTerm = e.data.searchTerm   // string to find in webpack module factory source
      const variables = e.data.variables || {}
      const resultField = e.data.resultField  // e.g. 'updateUserPredictionSettings'
      ;(async () => {
        const respond = (data) => window.postMessage({
          type: 'heatsync-apollo-mutate-response', id: reqId, data
        }, location.origin)
        try {
          // Find Apollo client from React fiber tree
          // React 18 uses __reactContainer$, React 17 uses __reactFiber$
          // Apollo client lives in a context provider's props.value (BFS down from root)
          const root = document.getElementById('root')
          const fiberKey = root && Object.keys(root).find(k => k.startsWith('__reactContainer$') || k.startsWith('__reactFiber$'))
          let apolloClient = null
          if (fiberKey) {
            const queue = [root[fiberKey]]
            const visited = new Set()
            let steps = 0
            while (queue.length && steps < 500 && !apolloClient) {
              const node = queue.shift()
              if (!node || visited.has(node)) continue
              visited.add(node)
              steps++
              // Check memoizedState chain
              let state = node.memoizedState
              while (state) {
                const val = state.memoizedState
                if (val?.client?.mutate && val?.client?.query) { apolloClient = val.client; break }
                state = state.next
              }
              // Check context provider props
              if (!apolloClient) {
                const ctx = node.memoizedProps?.value
                if (ctx?.client?.mutate && ctx?.client?.query) apolloClient = ctx.client
              }
              if (!apolloClient) {
                if (node.child) queue.push(node.child)
                if (node.sibling) queue.push(node.sibling)
              }
            }
          }

          if (apolloClient && searchTerm) {
            // Load the mutation document from Twitch's webpack modules
            const chunks = window.webpackChunktwitch_twilight || []
            let doc = null
            for (const chunk of chunks) {
              const mods = chunk[1]
              if (!mods || typeof mods !== 'object') continue
              for (const [, factory] of Object.entries(mods)) {
                if (typeof factory !== 'function') continue
                const src = factory.toString()
                if (!src.includes(searchTerm)) continue
                const m = { exports: {} }
                try { factory(m, m.exports, function() { return {} }) } catch {}
                if (m.exports?.kind === 'Document') { doc = m.exports; break }
              }
              if (doc) break
            }
            log('apollo-mutate[' + searchTerm + ']: doc=' + !!doc)

            if (doc) {
              const result = await apolloClient.mutate({ mutation: doc, variables })
              log('apollo-mutate[' + searchTerm + ']: result=' + JSON.stringify(result?.data).slice(0, 200))
              if (resultField) {
                const field = result?.data?.[resultField]
                const err = field?.error
                respond(err ? { error: err.code || 'mutation error' } : { ok: true, data: result.data })
              } else {
                respond({ ok: true, data: result.data })
              }
              return
            }
          }

          // Fallback: raw query with integrity (works for some mutations)
          if (e.data.rawQuery) {
            log('apollo-mutate[' + searchTerm + ']: fallback to raw query')
            const hdrs = buildGqlHeaders()
            const resp = await origFetch('https://gql.twitch.tv/gql', {
              method: 'POST', headers: hdrs,
              body: JSON.stringify({ query: e.data.rawQuery, variables })
            })
            const data = await resp.json()
            if (data?.errors?.length) {
              respond({ error: data.errors[0].message })
            } else if (resultField && data?.data?.[resultField]?.error) {
              respond({ error: data.data[resultField].error.code })
            } else {
              respond({ ok: true, data: data?.data })
            }
          } else {
            respond({ error: 'apollo client or webpack module not found' })
          }
        } catch (err) {
          log('apollo-mutate: exception=' + err.message)
          respond({ error: err.message })
        }
      })()
      return
    }

    // Generic Helix API proxy — content scripts route through MAIN world for OAuth
    if (e.data?.type === 'heatsync-helix') {
      const req = e.data
      ;(async () => {
        try {
          if (!getAuthToken()) {
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

          const hdrs = { 'Authorization': 'Bearer ' + getAuthToken(), 'Client-Id': cid }
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

  // ========== NAVIGATION INTERCEPTION ==========
  // Hook history.pushState/replaceState + popstate BEFORE Twitch loads.
  // Content scripts listen for 'heatsync-nav' messages instead of polling location.href.

  const origPushState = history.pushState.bind(history)
  const origReplaceState = history.replaceState.bind(history)

  function notifyNav() {
    window.postMessage({ type: 'heatsync-nav', url: location.href }, location.origin)
  }

  history.pushState = function(...args) {
    origPushState(...args)
    notifyNav()
  }

  history.replaceState = function(...args) {
    origReplaceState(...args)
    notifyNav()
  }

  window.addEventListener('popstate', notifyNav)

  // ═══ Stamp Twitch user IDs on chat messages (for cosmetics in content script) ═══
  // Content scripts can't see __reactFiber$ (isolated world), so we stamp data-user-id
  // from MAIN world where fibers are accessible.
  function stampUserIds(container) {
    const msgs = container.querySelectorAll('.chat-line__message:not([data-user-id])')
    for (const msg of msgs) {
      const key = Object.keys(msg).find(k => k.startsWith('__reactFiber$'))
      if (!key) continue
      let fiber = msg[key]
      let depth = 0
      while (fiber && depth < 20) {
        const uid = fiber.memoizedProps?.message?.user?.userID
        if (uid) { msg.setAttribute('data-user-id', uid); break }
        fiber = fiber.return
        depth++
      }
    }
  }

  const uidObserver = new MutationObserver(mutations => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue
        if (node.classList?.contains('chat-line__message')) {
          const key = Object.keys(node).find(k => k.startsWith('__reactFiber$'))
          if (key) {
            let fiber = node[key], depth = 0
            while (fiber && depth < 20) {
              const uid = fiber.memoizedProps?.message?.user?.userID
              if (uid) { node.setAttribute('data-user-id', uid); break }
              fiber = fiber.return
              depth++
            }
          }
        } else if (node.querySelector) {
          stampUserIds(node)
        }
      }
    }
  })

  // Start observing once chat container appears
  function startUidObserver() {
    const container = document.querySelector('[class*="chat-scrollable-area__message-container"], [data-test-selector="chat-scrollable-area__message-container"]')
    if (container) {
      stampUserIds(container)
      uidObserver.observe(container, { childList: true, subtree: true })
      return true
    }
    return false
  }

  // Poll for chat container (SPA — may not exist yet)
  let uidPollCount = 0
  let uidPollId = setInterval(() => {
    if (startUidObserver() || ++uidPollCount > 60) {
      clearInterval(uidPollId)
      uidPollId = null
    }
  }, 1000)

  window.addEventListener('pagehide', () => {
    if (uidPollId !== null) {
      clearInterval(uidPollId)
      uidPollId = null
    }
    uidObserver.disconnect()
  })

})()
