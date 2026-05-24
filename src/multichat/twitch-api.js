// Twitch API - GQL proxy, badges, predictions, rewards, polls, Twitch tab UI

// ═══ Predictions & Betting ═══

function parsePoints(str) {
  if (!str) return 0
  str = str.trim().toLowerCase()
  const m = str.match(/^(\d+(?:\.\d+)?)\s*(k|m)?$/)
  if (!m) return parseInt(str) || 0
  const num = parseFloat(m[1])
  if (m[2] === 'k') return Math.floor(num * 1000)
  if (m[2] === 'm') return Math.floor(num * 1000000)
  return Math.floor(num)
}

function formatPoints(n) {
  if (n == null) return '?'
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(n)
}

function renderQuickLinks() {
  const links = document.createElement('div')
  links.className = 'hs-mc-pred-links'

  // Cheer is dedicated to its own bits sub-tab; quick-links is for navigation
  // shortcuts only. Keeping cheer here would duplicate the bits sub-tab entry.
  const items = [
    { action: 'sub',    accent: '#e91916', icon: '<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2l2.39 4.84 5.34.78-3.86 3.77.91 5.31L10 14.27l-4.78 2.51.91-5.31L2.27 7.62l5.34-.78L10 2z"/></svg>', label: 'subscribe' },
    { action: 'clip',   accent: '#bf94ff', icon: '<svg width="16" height="16" viewBox="0 0 20 20"><path fill="currentColor" d="M18 7h-2V5a2 2 0 00-2-2H6a2 2 0 00-2 2v2H2v4l8 6 8-6V7zM6 5h8v2H6V5z"/></svg>', label: 'create clip' },
    { action: 'popout', accent: '#4a90d9', icon: '<svg width="16" height="16" viewBox="0 0 20 20"><path fill="currentColor" d="M4 4h6v2H6v8h8v-4h2v6H4V4zm8 0h4v4h-2V6.41l-4.3 4.3-1.4-1.42L12.58 6H11V4z"></path></svg>', label: 'popout chat' },
    { action: 'mod',    accent: '#00c8af', icon: '<svg width="16" height="16" viewBox="0 0 20 20"><path fill="currentColor" d="M10 2l6 2.7V9c0 4.4-2.5 8.3-6 10-3.5-1.7-6-5.6-6-10V4.7L10 2z"/></svg>', label: 'mod view' }
  ]

  for (const item of items) {
    const el = document.createElement('div')
    el.className = 'hs-mc-menu-item hs-mc-pred-link'
    el.dataset.action = item.action
    el.style.setProperty('--menu-accent', item.accent)
    // Static HTML with SVG icons only — no dynamic values, safe innerHTML
    el.innerHTML = `<div class="hs-mc-menu-icon">${item.icon}</div><div class="hs-mc-menu-text"><div class="hs-mc-menu-title">${item.label}</div></div><svg class="hs-mc-menu-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      triggerTwitchFeature(item.action)
    })
    links.appendChild(el)
  }
  return links
}

// ═══ Chat Color Picker ═══

const TWITCH_COLORS = [
  { name: 'Red', hex: '#FF0000' },
  { name: 'Blue', hex: '#0000FF' },
  { name: 'Green', hex: '#00FF00' },
  { name: 'FireBrick', hex: '#B22222' },
  { name: 'Coral', hex: '#FF7F50' },
  { name: 'YellowGreen', hex: '#9ACD32' },
  { name: 'OrangeRed', hex: '#FF4500' },
  { name: 'SeaGreen', hex: '#2E8B57' },
  { name: 'GoldenRod', hex: '#DAA520' },
  { name: 'Chocolate', hex: '#D2691E' },
  { name: 'CadetBlue', hex: '#5F9EA0' },
  { name: 'DodgerBlue', hex: '#1E90FF' },
  { name: 'HotPink', hex: '#FF69B4' },
  { name: 'BlueViolet', hex: '#8A2BE2' },
  { name: 'SpringGreen', hex: '#00FF7F' },
]

function renderColorPicker() {
  const section = document.createElement('div')
  section.className = 'hs-mc-color-picker'

  const header = document.createElement('div')
  header.className = 'hs-mc-rewards-header'
  const label = document.createElement('span')
  label.className = 'hs-mc-rewards-label'
  label.textContent = t('mc_chat_username_color')
  header.appendChild(label)

  const currentEl = document.createElement('span')
  currentEl.className = 'hs-mc-color-current'
  currentEl.id = 'hs-mc-current-color'
  header.appendChild(currentEl)
  section.appendChild(header)

  const grid = document.createElement('div')
  grid.className = 'hs-mc-color-grid'

  for (const c of TWITCH_COLORS) {
    const swatch = document.createElement('div')
    swatch.className = 'hs-mc-color-swatch'
    swatch.style.backgroundColor = c.hex
    swatch.title = c.name
    swatch.dataset.color = c.name
    grid.appendChild(swatch)
  }

  // Custom hex input
  const custom = document.createElement('div')
  custom.className = 'hs-mc-color-custom'
  const hexInput = document.createElement('input')
  hexInput.type = 'text'
  hexInput.placeholder = t('mc_chat_hex_placeholder')
  hexInput.className = 'hs-mc-color-hex'
  hexInput.id = 'hs-mc-color-hex-input'
  hexInput.maxLength = 7
  custom.appendChild(hexInput)
  const hexBtn = document.createElement('div')
  hexBtn.className = 'hs-mc-color-apply'
  hexBtn.textContent = 'set'
  hexBtn.id = 'hs-mc-color-hex-btn'
  custom.appendChild(hexBtn)

  section.appendChild(grid)
  section.appendChild(custom)
  return section
}

function attachColorHandlers() {
  const container = document.getElementById('hs-mc-tab-twitch')
  if (!container) return

  // Fetch current color
  helixRequest('https://api.twitch.tv/helix/chat/color?user_id={me}').then(resp => {
    if (resp.ok && resp.data?.data?.[0]?.color) {
      const el = document.getElementById('hs-mc-current-color')
      if (el) {
        el.style.backgroundColor = resp.data.data[0].color
        el.title = resp.data.data[0].color
      }
    }
  })

  // Preset swatches
  container.querySelectorAll('.hs-mc-color-swatch').forEach(swatch => {
    swatch.addEventListener('click', async () => {
      const color = swatch.dataset.color
      const resp = await helixRequest(`https://api.twitch.tv/helix/chat/color?user_id={me}&color=${encodeURIComponent(color)}`, 'PUT')
      if (resp.ok) {
        showToast('color: ' + color, 'success')
        const el = document.getElementById('hs-mc-current-color')
        if (el) { el.style.backgroundColor = swatch.style.backgroundColor; el.title = color }
      } else {
        showToast('color failed: ' + (resp.error || 'unknown'), 'error')
      }
    })
  })

  // Custom hex
  const hexBtn = document.getElementById('hs-mc-color-hex-btn')
  const hexInput = document.getElementById('hs-mc-color-hex-input')
  if (hexBtn && hexInput) {
    hexBtn.addEventListener('click', async () => {
      const color = hexInput.value.trim()
      if (!/^#[0-9a-f]{6}$/i.test(color)) { showToast('invalid hex — use #RRGGBB', 'error'); return }
      const resp = await helixRequest(`https://api.twitch.tv/helix/chat/color?user_id={me}&color=${encodeURIComponent(color)}`, 'PUT')
      if (resp.ok) {
        showToast('color: ' + color, 'success')
        const el = document.getElementById('hs-mc-current-color')
        if (el) { el.style.backgroundColor = color; el.title = color }
      } else {
        showToast('color failed: ' + (resp.error || 'color change failed'), 'error')
      }
    })
  }
}

// ═══ Chat Modes (mod/broadcaster) ═══

async function renderChatModes(channel) {
  const section = document.createElement('div')
  section.className = 'hs-mc-chat-modes'
  section.id = 'hs-mc-chat-modes'

  // Resolve broadcaster ID
  const userResp = await helixRequest(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(channel)}`)
  if (!userResp.ok || !userResp.data?.data?.[0]) return null
  const broadcasterId = userResp.data.data[0].id

  // Fetch current settings (fails with 403 if not mod — that's expected)
  const settingsResp = await helixRequest(`https://api.twitch.tv/helix/chat/settings?broadcaster_id=${broadcasterId}&moderator_id={me}`)
  if (!settingsResp.ok || !settingsResp.data?.data?.[0]) return null
  const s = settingsResp.data.data[0]

  const header = document.createElement('div')
  header.className = 'hs-mc-rewards-header'
  const label = document.createElement('span')
  label.className = 'hs-mc-rewards-label'
  label.textContent = t('mc_chat_modes')
  header.appendChild(label)
  section.appendChild(header)

  const modes = [
    { key: 'emote_mode', label: t('mc_chat_mode_emote_only'), field: 'emote_mode' },
    { key: 'follower_mode', label: t('mc_chat_mode_follower'), field: 'follower_mode' },
    { key: 'slow_mode', label: t('mc_chat_mode_slow'), field: 'slow_mode' },
    { key: 'subscriber_mode', label: t('mc_chat_mode_sub_only'), field: 'subscriber_mode' },
    { key: 'unique_chat_mode', label: t('mc_chat_mode_unique'), field: 'unique_chat_mode' },
  ]

  const grid = document.createElement('div')
  grid.className = 'hs-mc-modes-grid'

  for (const mode of modes) {
    const btn = document.createElement('div')
    btn.className = 'hs-mc-mode-btn' + (s[mode.field] ? ' active' : '')
    btn.textContent = mode.label
    btn.dataset.mode = mode.key
    btn.dataset.broadcasterId = broadcasterId
    btn.dataset.active = s[mode.field] ? '1' : '0'
    grid.appendChild(btn)
  }

  section.appendChild(grid)
  return section
}

function attachModeHandlers() {
  const container = document.getElementById('hs-mc-tab-twitch')
  if (!container) return

  container.querySelectorAll('.hs-mc-mode-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const mode = btn.dataset.mode
      const broadcasterId = btn.dataset.broadcasterId
      const newVal = btn.dataset.active !== '1'
      const body = { [mode]: newVal }
      if (mode === 'slow_mode' && newVal) body.slow_mode_wait_time = 3
      if (mode === 'follower_mode' && newVal) body.follower_mode_duration = 10

      const resp = await helixRequest(
        `https://api.twitch.tv/helix/chat/settings?broadcaster_id=${broadcasterId}&moderator_id={me}`,
        'PATCH', body
      )
      if (resp.ok) {
        btn.dataset.active = newVal ? '1' : '0'
        btn.classList.toggle('active', newVal)
      } else {
        showToast('mode failed: ' + (resp.error || 'unknown'), 'error')
      }
    })
  })
}

function makeCoinSvg(size) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('viewBox', '0 0 20 20')
  svg.style.verticalAlign = '-2px'
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('fill', '#ffbf00')
  path.setAttribute('d', 'M10 6a4 4 0 100 8 4 4 0 000-8zm0-4a8 8 0 110 16 8 8 0 010-16z')
  svg.appendChild(path)
  return svg
}

function outcomeColor(color) {
  const map = { PINK: '#f5009b', BLUE: '#387aff', ORANGE: '#ff8700', GREEN: '#00c853', TEAL: '#00bcd4', PURPLE: '#9c27b0', YELLOW: '#fdd835', LIGHT_BLUE: '#4fc3f7', RED: '#e53935', BROWN: '#795548' }
  return map[color] || '#387aff'
}

function makePointIcon(size, cpImage) {
  if (cpImage) {
    const img = document.createElement('img')
    img.src = cpImage
    img.width = size
    img.height = size
    img.style.verticalAlign = '-2px'
    img.style.borderRadius = '50%'
    return img
  }
  return makeCoinSvg(size)
}

function renderPrediction(pred, balance, channelId, isMod, cpImage, cpName) {
  const frag = document.createDocumentFragment()
  const isLocked = pred.status === 'LOCKED'
  const isResolved = pred.status === 'RESOLVED'
  const isCanceled = pred.status === 'CANCELED'
  const isEnded = isResolved || isCanceled
  if (isEnded) _userBets.delete(pred.id)
  const totalPoints = pred.outcomes.reduce((s, o) => s + (o.totalPoints || 0), 0)
  const createdAt = new Date(pred.createdAt).getTime()
  const windowMs = (pred.predictionWindowSeconds || 120) * 1000
  const endsAt = createdAt + windowMs
  const userBet = _userBets.get(pred.id)
  const winningId = pred.winningOutcome?.id || null

  const wrapper = document.createElement('div')
  wrapper.className = 'hs-mc-prediction' + (isResolved ? ' hs-mc-pred-resolved' : '') + (isCanceled ? ' hs-mc-pred-canceled' : '')
  wrapper.dataset.eventId = pred.id
  if (channelId) wrapper.dataset.channelId = channelId

  // Header
  const header = document.createElement('div')
  header.className = 'hs-mc-pred-header'
  const title = document.createElement('div')
  title.className = 'hs-mc-pred-title'
  // Render emotes/emoji in prediction title — content sanitized via escapeHtml() then processEmotes()
  // This is the same pattern used for all chat messages in main.js (existing safe innerHTML pattern)
  title.innerHTML = typeof processEmotes === 'function' ? processEmotes(escapeHtml(pred.title), null) : escapeHtml(pred.title)
  header.appendChild(title)

  if (isCanceled) {
    const badge = document.createElement('span')
    badge.className = 'hs-mc-pred-status hs-mc-pred-status-canceled'
    badge.textContent = t('mc_pred_refunded')
    header.appendChild(badge)
  } else if (isResolved) {
    const badge = document.createElement('span')
    badge.className = 'hs-mc-pred-status hs-mc-pred-status-resolved'
    badge.textContent = t('mc_pred_ended')
    header.appendChild(badge)
  } else if (isLocked) {
    const badge = document.createElement('span')
    badge.className = 'hs-mc-pred-locked'
    badge.textContent = t('mc_pred_locked')
    header.appendChild(badge)
  } else {
    const timer = document.createElement('span')
    timer.className = 'hs-mc-pred-timer'
    timer.dataset.ends = endsAt
    header.appendChild(timer)
  }
  wrapper.appendChild(header)

  // Balance
  if (balance != null && !isEnded) {
    const bal = document.createElement('div')
    bal.className = 'hs-mc-pred-balance'
    bal.appendChild(makePointIcon(14, cpImage))
    bal.appendChild(document.createTextNode(' ' + formatPoints(balance) + (cpName ? ' ' + cpName : '')))
    wrapper.appendChild(bal)
  }

  // User bet result banner
  if (isResolved && userBet && winningId) {
    const won = userBet.outcomeId === winningId
    const banner = document.createElement('div')
    banner.className = 'hs-mc-pred-result ' + (won ? 'hs-mc-pred-result-won' : 'hs-mc-pred-result-lost')
    if (won) {
      const winOutcome = pred.outcomes.find(o => o.id === winningId)
      const pct = totalPoints > 0 && winOutcome ? (winOutcome.totalPoints / totalPoints) : 1
      const payout = pct > 0 ? Math.floor(userBet.points / pct) : userBet.points
      banner.appendChild(makePointIcon(18, cpImage))
      const amt = document.createElement('span')
      amt.className = 'hs-mc-pred-result-amount'
      amt.textContent = ' +' + formatPoints(payout)
      banner.appendChild(amt)
      const label = document.createElement('span')
      label.className = 'hs-mc-pred-result-label'
      label.textContent = ' won'
      banner.appendChild(label)
    } else {
      const amt = document.createElement('span')
      amt.className = 'hs-mc-pred-result-amount'
      amt.textContent = '-' + formatPoints(userBet.points)
      banner.appendChild(amt)
      const label = document.createElement('span')
      label.className = 'hs-mc-pred-result-label'
      label.textContent = ' lost'
      banner.appendChild(label)
    }
    wrapper.appendChild(banner)
  } else if (isCanceled && userBet) {
    const banner = document.createElement('div')
    banner.className = 'hs-mc-pred-result hs-mc-pred-result-refund'
    banner.appendChild(makePointIcon(18, cpImage))
    const amt = document.createElement('span')
    amt.className = 'hs-mc-pred-result-amount'
    amt.textContent = ' +' + formatPoints(userBet.points)
    banner.appendChild(amt)
    const label = document.createElement('span')
    label.className = 'hs-mc-pred-result-label'
    label.textContent = ' ' + t('mc_pred_refunded')
    banner.appendChild(label)
    wrapper.appendChild(banner)
  } else if (isResolved && !userBet) {
    const banner = document.createElement('div')
    banner.className = 'hs-mc-pred-result hs-mc-pred-result-neutral'
    const winOutcome = pred.outcomes.find(o => o.id === winningId)
    banner.textContent = winOutcome ? '\u2713 ' + winOutcome.title : t('mc_pred_ended')
    wrapper.appendChild(banner)
  }

  // Outcomes
  const outcomesWrap = document.createElement('div')
  outcomesWrap.className = 'hs-mc-pred-outcomes'

  for (const outcome of pred.outcomes) {
    const pct = totalPoints > 0 ? Math.round((outcome.totalPoints / totalPoints) * 100) : 0
    const color = outcomeColor(outcome.color)
    const userCount = outcome.totalUsers || 0
    const points = outcome.totalPoints || 0
    const isWinner = winningId === outcome.id
    const isLoser = isResolved && !isWinner
    const isBetOn = userBet?.outcomeId === outcome.id

    const card = document.createElement('div')
    card.className = 'hs-mc-pred-outcome'
      + (isWinner ? ' hs-mc-pred-outcome-won' : '')
      + (isLoser ? ' hs-mc-pred-outcome-lost' : '')
      + (isBetOn ? ' hs-mc-pred-outcome-yours' : '')
    card.style.setProperty('--oc', color)

    const head = document.createElement('div')
    head.className = 'hs-mc-pred-outcome-head'
    const titleSpan = document.createElement('span')
    titleSpan.className = 'hs-mc-pred-outcome-title'
    // Render emotes/emoji in outcome title — sanitized via escapeHtml() + processEmotes() (same as chat messages)
    titleSpan.innerHTML = typeof processEmotes === 'function' ? processEmotes(escapeHtml(outcome.title), null) : escapeHtml(outcome.title)
    if (isWinner) {
      const winBadge = document.createElement('span')
      winBadge.className = 'hs-mc-pred-winner-badge'
      winBadge.textContent = t('mc_pred_winner')
      titleSpan.appendChild(document.createTextNode(' '))
      titleSpan.appendChild(winBadge)
    }
    const pctSpan = document.createElement('span')
    pctSpan.className = 'hs-mc-pred-outcome-pct'
    pctSpan.textContent = pct + '%'
    head.appendChild(titleSpan)
    head.appendChild(pctSpan)
    card.appendChild(head)

    const track = document.createElement('div')
    track.className = 'hs-mc-pred-bar-track'
    const fill = document.createElement('div')
    fill.className = 'hs-mc-pred-bar-fill'
    fill.style.width = pct + '%'
    track.appendChild(fill)
    card.appendChild(track)

    const stats = document.createElement('div')
    stats.className = 'hs-mc-pred-outcome-stats'
    let statsText = formatPoints(points) + ' pts \u00b7 ' + userCount + ' bettor' + (userCount !== 1 ? 's' : '')
    if (isBetOn) statsText += ' \u00b7 your bet: ' + formatPoints(userBet.points)
    stats.textContent = statsText
    card.appendChild(stats)

    if (!isLocked && !isEnded && (!userBet || isBetOn)) {
      const betRow = document.createElement('div')
      betRow.className = 'hs-mc-pred-bet-row'
      for (const amt of [100, 1000, 5000]) {
        const btn = document.createElement('button')
        btn.className = 'hs-mc-pred-bet-btn'
        btn.dataset.outcome = outcome.id
        btn.dataset.points = amt
        btn.style.setProperty('--oc', color)
        if (balance != null && balance < amt) btn.disabled = true
        btn.textContent = formatPoints(amt)
        betRow.appendChild(btn)
      }

      // Max button
      if (balance != null && balance > 0) {
        const maxBtn = document.createElement('button')
        maxBtn.className = 'hs-mc-pred-bet-btn hs-mc-pred-bet-max'
        maxBtn.dataset.outcome = outcome.id
        maxBtn.dataset.points = balance
        maxBtn.style.setProperty('--oc', color)
        maxBtn.textContent = 'max'
        betRow.appendChild(maxBtn)
      }

      const customInput = document.createElement('input')
      customInput.className = 'hs-mc-pred-bet-custom'
      customInput.type = 'text'
      customInput.placeholder = 'amt'
      customInput.dataset.outcome = outcome.id
      if (balance != null && balance <= 0) customInput.disabled = true
      betRow.appendChild(customInput)

      const goBtn = document.createElement('button')
      goBtn.className = 'hs-mc-pred-bet-go'
      goBtn.dataset.outcome = outcome.id
      goBtn.style.setProperty('--oc', color)
      goBtn.textContent = 'bet'
      if (balance != null && balance <= 0) goBtn.disabled = true
      betRow.appendChild(goBtn)

      card.appendChild(betRow)
    }

    // Mod resolve button per outcome (when locked)
    if (isLocked && isMod) {
      const resolveBtn = document.createElement('button')
      resolveBtn.className = 'hs-mc-pred-mod-btn hs-mc-pred-resolve-btn'
      resolveBtn.dataset.outcome = outcome.id
      resolveBtn.style.setProperty('--oc', color)
      if (isBetOn) {
        resolveBtn.textContent = t('mc_pred_pick_winner_bet')
        resolveBtn.classList.add('hs-mc-pred-resolve-yours')
      } else {
        resolveBtn.textContent = t('mc_pred_pick_winner')
      }
      card.appendChild(resolveBtn)
    }

    outcomesWrap.appendChild(card)
  }

  wrapper.appendChild(outcomesWrap)

  // Mod conflict notice — mod bet on this prediction and needs to resolve it
  if (isLocked && isMod && userBet) {
    const notice = document.createElement('div')
    notice.className = 'hs-mc-pred-mod-notice'
    const betOutcome = pred.outcomes.find(o => o.id === userBet.outcomeId)
    notice.textContent = 'you bet ' + formatPoints(userBet.points) + ' on ' + (betOutcome?.title || '?') + ' \u2014 pick the actual winner'
    wrapper.appendChild(notice)
  }

  // Mod controls
  if (!isEnded && isMod) {
    const modRow = document.createElement('div')
    modRow.className = 'hs-mc-pred-mod-row'

    if (!isLocked) {
      const lockBtn = document.createElement('button')
      lockBtn.className = 'hs-mc-pred-mod-btn hs-mc-pred-lock-btn'
      lockBtn.textContent = t('mc_pred_lock_betting')
      modRow.appendChild(lockBtn)
    }

    const cancelBtn = document.createElement('button')
    cancelBtn.className = 'hs-mc-pred-mod-btn hs-mc-pred-cancel-btn'
    cancelBtn.textContent = t('mc_pred_cancel_refund')
    modRow.appendChild(cancelBtn)

    wrapper.appendChild(modRow)
  }

  frag.appendChild(wrapper)
  return frag
}

function renderNoPrediction(balance, channelId, isMod, cpImage, cpName) {
  const wrap = document.createElement('div')
  wrap.className = 'hs-mc-pred-empty'
  if (channelId) wrap.dataset.channelId = channelId

  const text = document.createElement('div')
  text.className = 'hs-mc-pred-empty-text'
  text.textContent = t('mc_pred_no_active')
  wrap.appendChild(text)

  if (balance != null) {
    const bal = document.createElement('div')
    bal.className = 'hs-mc-pred-balance'
    bal.style.marginTop = '8px'
    bal.appendChild(makePointIcon(14, cpImage))
    bal.appendChild(document.createTextNode(' ' + formatPoints(balance) + (cpName ? ' ' + cpName : '')))
    wrap.appendChild(bal)
  }

  // Create prediction form (mod feature)
  if (!isMod) return wrap
  const createWrap = document.createElement('div')
  createWrap.className = 'hs-mc-pred-create'

  const toggle = document.createElement('button')
  toggle.className = 'hs-mc-pred-mod-btn hs-mc-pred-create-toggle'
  toggle.textContent = t('mc_pred_new')
  createWrap.appendChild(toggle)

  const form = document.createElement('div')
  form.className = 'hs-mc-pred-create-form'
  form.style.display = 'none'

  const titleInput = document.createElement('input')
  titleInput.className = 'hs-mc-pred-create-input'
  titleInput.placeholder = t('mc_pred_title')
  titleInput.maxLength = 45
  form.appendChild(titleInput)

  const opt1 = document.createElement('input')
  opt1.className = 'hs-mc-pred-create-input hs-mc-pred-create-outcome'
  opt1.placeholder = t('mc_pred_option1')
  opt1.maxLength = 25
  form.appendChild(opt1)

  const opt2 = document.createElement('input')
  opt2.className = 'hs-mc-pred-create-input hs-mc-pred-create-outcome'
  opt2.placeholder = t('mc_pred_option2')
  opt2.maxLength = 25
  form.appendChild(opt2)

  const durRow = document.createElement('div')
  durRow.className = 'hs-mc-pred-create-dur-row'
  const durLabel = document.createElement('span')
  durLabel.className = 'hs-mc-pred-create-dur-label'
  durLabel.textContent = t('mc_pred_duration')
  durRow.appendChild(durLabel)
  for (const secs of [30, 60, 120, 300, 600, 1800]) {
    const btn = document.createElement('button')
    btn.className = 'hs-mc-pred-create-dur' + (secs === 120 ? ' hs-mc-pred-create-dur-active' : '')
    btn.dataset.secs = secs
    btn.tabIndex = -1
    btn.textContent = secs < 60 ? secs + 's' : (secs / 60) + 'm'
    durRow.appendChild(btn)
  }
  form.appendChild(durRow)

  const submitBtn = document.createElement('button')
  submitBtn.className = 'hs-mc-pred-mod-btn hs-mc-pred-create-submit'
  submitBtn.tabIndex = -1
  submitBtn.textContent = t('mc_pred_create')
  form.appendChild(submitBtn)

  createWrap.appendChild(form)
  wrap.appendChild(createWrap)

  return wrap
}

function renderRewards(rewards, balance, channelId) {
  const section = document.createElement('div')
  section.className = 'hs-mc-rewards'

  const header = document.createElement('div')
  header.className = 'hs-mc-rewards-header'
  const label = document.createElement('span')
  label.className = 'hs-mc-rewards-label'
  label.textContent = t('mc_reward_rewards')
  header.appendChild(label)
  if (balance != null) {
    const bal = document.createElement('span')
    bal.className = 'hs-mc-rewards-balance'
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('width', '12')
    svg.setAttribute('height', '12')
    svg.setAttribute('viewBox', '0 0 20 20')
    svg.style.verticalAlign = '-1px'
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('fill', '#ffbf00')
    path.setAttribute('d', 'M10 6a4 4 0 100 8 4 4 0 000-8zm0-4a8 8 0 110 16 8 8 0 010-16z')
    svg.appendChild(path)
    bal.appendChild(svg)
    bal.appendChild(document.createTextNode(' ' + formatPoints(balance)))
    header.appendChild(bal)
  }
  section.appendChild(header)

  if (!rewards.length) {
    const empty = document.createElement('div')
    empty.className = 'hs-mc-rewards-empty'
    empty.textContent = t('mc_reward_no_rewards')
    section.appendChild(empty)
    return section
  }

  const grid = document.createElement('div')
  grid.className = 'hs-mc-rewards-grid'

  for (const reward of rewards) {
    const now = Date.now()
    const onCooldown = reward.cooldownExpiresAt && new Date(reward.cooldownExpiresAt).getTime() > now
    const available = !reward.isPaused && reward.isInStock && !onCooldown
    const card = document.createElement('div')
    card.className = 'hs-mc-reward-card' + (available ? '' : ' hs-mc-reward-unavailable')
    card.dataset.rewardId = reward.id
    card.dataset.cost = reward.cost
    card.dataset.title = reward.title
    card.dataset.channelId = channelId
    if (reward.isUserInputRequired) card.dataset.textRequired = '1'
    if (reward.prompt) card.dataset.prompt = reward.prompt
    card.style.setProperty('--rc', reward.backgroundColor || '#9147ff')

    const imgUrl = reward.image?.url || reward.defaultImage?.url || ''
    if (imgUrl) {
      const img = document.createElement('img')
      img.className = 'hs-mc-reward-img'
      img.src = imgUrl
      img.width = 28
      img.height = 28
      card.appendChild(img)
    }

    const info = document.createElement('div')
    info.className = 'hs-mc-reward-info'
    const titleEl = document.createElement('div')
    titleEl.className = 'hs-mc-reward-title'
    titleEl.textContent = reward.title
    info.appendChild(titleEl)

    const costEl = document.createElement('div')
    costEl.className = 'hs-mc-reward-cost'
    const costSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    costSvg.setAttribute('width', '10')
    costSvg.setAttribute('height', '10')
    costSvg.setAttribute('viewBox', '0 0 20 20')
    costSvg.style.verticalAlign = '-1px'
    const costPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    costPath.setAttribute('fill', '#ffbf00')
    costPath.setAttribute('d', 'M10 6a4 4 0 100 8 4 4 0 000-8zm0-4a8 8 0 110 16 8 8 0 010-16z')
    costSvg.appendChild(costPath)
    costEl.appendChild(costSvg)
    costEl.appendChild(document.createTextNode(' ' + formatPoints(reward.cost)))
    info.appendChild(costEl)

    if (!available) {
      const reason = document.createElement('div')
      reason.className = 'hs-mc-reward-reason'
      if (reward.isPaused) reason.textContent = t('mc_reward_paused')
      else if (!reward.isInStock) reason.textContent = t('mc_reward_out_of_stock')
      else if (onCooldown) {
        const secs = Math.ceil((new Date(reward.cooldownExpiresAt).getTime() - now) / 1000)
        reason.textContent = secs > 60 ? `${Math.ceil(secs / 60)}m cooldown` : `${secs}s cooldown`
        reason.dataset.cooldownEnds = new Date(reward.cooldownExpiresAt).getTime()
      }
      info.appendChild(reason)
    }

    card.appendChild(info)
    grid.appendChild(card)
  }

  section.appendChild(grid)
  return section
}

function attachRewardHandlers() {
  const container = document.getElementById('hs-mc-tab-twitch')
  if (!container) return

  container.querySelectorAll('.hs-mc-reward-card:not(.hs-mc-reward-unavailable)').forEach(card => {
    card.addEventListener('click', async (e) => {
      e.stopPropagation()
      if (card.querySelector('.hs-mc-reward-input-row')) return

      if (card.dataset.textRequired === '1') {
        const existing = card.parentElement.querySelector('.hs-mc-reward-input-row')
        if (existing) existing.remove()
        const row = document.createElement('div')
        row.className = 'hs-mc-reward-input-row'
        const input = document.createElement('input')
        input.className = 'hs-mc-reward-input'
        input.type = 'text'
        input.placeholder = card.dataset.prompt || t('mc_reward_enter_text')
        const btn = document.createElement('button')
        btn.className = 'hs-mc-reward-submit'
        btn.textContent = t('mc_reward_redeem')
        row.appendChild(input)
        row.appendChild(btn)
        card.after(row)
        input.focus()

        btn.addEventListener('click', async (ev) => {
          ev.stopPropagation()
          const text = input.value.trim()
          if (!text) return
          btn.disabled = true
          btn.textContent = '...'
          const result = await redeemChannelReward(card.dataset.channelId, card.dataset.rewardId, parseInt(card.dataset.cost), card.dataset.title, text)
          if (result.error) {
            btn.textContent = '!'
            btn.title = result.error
            setTimeout(() => { btn.textContent = t('mc_reward_redeem'); btn.disabled = false; btn.title = '' }, 2000)
          } else {
            btn.textContent = '\u2713'
            _rewardsCache = null
            setTimeout(() => renderTwitchTab(), 500)
          }
        })
        return
      }

      const titleEl = card.querySelector('.hs-mc-reward-title')
      const origText = titleEl.textContent
      titleEl.textContent = '...'
      card.style.pointerEvents = 'none'
      const result = await redeemChannelReward(card.dataset.channelId, card.dataset.rewardId, parseInt(card.dataset.cost), card.dataset.title)
      if (result.error) {
        titleEl.textContent = '!'
        card.title = result.error
        setTimeout(() => { titleEl.textContent = origText; card.style.pointerEvents = ''; card.title = '' }, 2000)
      } else {
        titleEl.textContent = '\u2713'
        _rewardsCache = null
        setTimeout(() => renderTwitchTab(), 500)
      }
    })
  })

  // Cooldown timers
  container.querySelectorAll('.hs-mc-reward-reason[data-cooldown-ends]').forEach(el => {
    const endsAt = parseInt(el.dataset.cooldownEnds)
    const iv = cleanup.setIntervalIfVisible(() => {
      if (!el.isConnected) { cleanup.clearInterval(iv); return }
      const secs = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
      if (secs <= 0) {
        _rewardsCache = null
        renderTwitchTab()
        cleanup.clearInterval(iv)
        return
      }
      el.textContent = secs > 60 ? `${Math.ceil(secs / 60)}m cooldown` : `${secs}s cooldown`
    }, 1000)
  })
}

// Optimistic UI update after a bet — patches DOM immediately without server round-trip
function optimisticBetUpdate(container, outcomeId, points) {
  // Find which card has this outcome by checking all data-outcome elements
  const allOutcomeEls = container.querySelectorAll('[data-outcome]')
  const targetCards = new Set()
  const otherCards = new Set()
  allOutcomeEls.forEach(el => {
    const card = el.closest('.hs-mc-pred-outcome')
    if (!card) return
    if (el.dataset.outcome === outcomeId) targetCards.add(card)
    else otherCards.add(card)
  })

  // Update target outcome stats
  targetCards.forEach(card => {
    const statsEl = card.querySelector('.hs-mc-pred-outcome-stats')
    if (!statsEl) return
    const text = statsEl.textContent
    const ptsMatch = text.match(/([\d,.]+[KMB]?)\s*pts/i)
    const voterMatch = text.match(/(\d+)\s*bettor/)
    const betMatch = text.match(/your bet:\s*([\d,.]+[KMB]?)/i)
    const currentPts = ptsMatch ? parsePoints(ptsMatch[1]) : 0
    const currentVoters = voterMatch ? parseInt(voterMatch[1]) : 0
    const existingBet = betMatch ? parsePoints(betMatch[1]) : 0

    const newPts = currentPts + points
    const newVoters = existingBet ? currentVoters : currentVoters + 1
    const newBet = existingBet + points

    let newText = formatPoints(newPts) + ' pts \u00b7 ' + newVoters + ' voter' + (newVoters !== 1 ? 's' : '')
    newText += ' \u00b7 your bet: ' + formatPoints(newBet)
    statsEl.textContent = newText
    card.classList.add('hs-mc-pred-outcome-yours')
  })

  // Hide bet rows on other outcomes
  otherCards.forEach(card => {
    if (targetCards.has(card)) return
    const betRow = card.querySelector('.hs-mc-pred-bet-row')
    if (betRow) betRow.style.display = 'none'
  })

  // Update bar percentages across all outcomes
  const pred = container.querySelector('.hs-mc-prediction')
  if (!pred) return
  const outcomes = pred.querySelectorAll('.hs-mc-pred-outcome')
  let total = 0
  const ptsArr = []
  outcomes.forEach(card => {
    const text = card.querySelector('.hs-mc-pred-outcome-stats')?.textContent || ''
    const m = text.match(/([\d,.]+[KMB]?)\s*pts/i)
    ptsArr.push(m ? parsePoints(m[1]) : 0)
    total += ptsArr[ptsArr.length - 1]
  })
  outcomes.forEach((card, i) => {
    const pct = total > 0 ? Math.round((ptsArr[i] / total) * 100) : 0
    const pctEl = card.querySelector('.hs-mc-pred-outcome-pct')
    if (pctEl) pctEl.textContent = pct + '%'
    const fill = card.querySelector('.hs-mc-pred-bar-fill')
    if (fill) fill.style.width = pct + '%'
  })

  // Update balance
  const balEl = pred.querySelector('.hs-mc-pred-balance')
  if (balEl && balEl.lastChild) {
    const currentBal = parsePoints(balEl.textContent.trim())
    balEl.lastChild.textContent = ' ' + formatPoints(Math.max(0, currentBal - points))
  }
}

function attachPredictionHandlers() {
  const container = document.getElementById('hs-mc-tab-twitch')
  if (!container) return

  // Human-readable prediction error messages
  const predErrorMsg = (code) => {
    if (!code) return 'failed'
    const c = code.toUpperCase()
    if (c.includes('EVENT_MANAGER') || c.includes('OWNER')) return "can't bet on own"
    if (c.includes('ACCEPT') || c.includes('TOS')) return 'try again'
    if (c.includes('NOT_FOUND')) return 'prediction ended'
    if (c.includes('LOCKED')) return 'betting locked'
    if (c.includes('INSUFFICIENT') || c.includes('BALANCE')) return 'not enough points'
    if (c.includes('ALREADY')) return 'already bet'
    if (c.includes('FORBIDDEN')) return 'no permission'
    return code.toLowerCase().slice(0, 15)
  }

  // Bet button handlers
  container.querySelectorAll('.hs-mc-pred-bet-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const eventId = container.querySelector('.hs-mc-prediction')?.dataset.eventId
      if (!eventId) return
      btn.disabled = true
      btn.textContent = '...'
      const betPoints = parseInt(btn.dataset.points)
      const result = await placePredictionBet(eventId, btn.dataset.outcome, betPoints)
      if (result.error) {
        btn.textContent = predErrorMsg(result.error)
        btn.title = result.error
        setTimeout(() => { btn.textContent = formatPoints(betPoints); btn.disabled = false; btn.title = '' }, 4000)
      } else {
        btn.textContent = '\u2713'
        try { optimisticBetUpdate(container, btn.dataset.outcome, betPoints) } catch {}
        setTimeout(() => refreshPredictionSlot(), 3000)
      }
    })
  })

  // Custom bet "go" buttons
  container.querySelectorAll('.hs-mc-pred-bet-go').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const eventId = container.querySelector('.hs-mc-prediction')?.dataset.eventId
      if (!eventId) return
      const input = container.querySelector(`.hs-mc-pred-bet-custom[data-outcome="${btn.dataset.outcome}"]`)
      const points = parsePoints(input?.value)
      if (!points || points < 1) return
      btn.disabled = true
      btn.textContent = '...'
      const result = await placePredictionBet(eventId, btn.dataset.outcome, points)
      if (result.error) {
        btn.textContent = predErrorMsg(result.error)
        btn.title = result.error
        setTimeout(() => { btn.textContent = 'bet'; btn.disabled = false; btn.title = '' }, 3000)
      } else {
        btn.textContent = '\u2713'
        optimisticBetUpdate(container, btn.dataset.outcome, points)
        input.value = ''
        setTimeout(() => refreshPredictionSlot(), 3000)
      }
    })
  })

  // Enter key in custom input triggers bet
  container.querySelectorAll('.hs-mc-pred-bet-custom').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        const goBtn = container.querySelector(`.hs-mc-pred-bet-go[data-outcome="${input.dataset.outcome}"]`)
        if (goBtn && !goBtn.disabled) goBtn.click()
      }
    })
  })

  // Mod: lock betting
  container.querySelectorAll('.hs-mc-pred-lock-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const eventId = btn.closest('.hs-mc-prediction')?.dataset.eventId
        || container.querySelector('.hs-mc-prediction')?.dataset.eventId
      if (!eventId) { btn.textContent = 'no event'; return }
      btn.disabled = true
      btn.textContent = '...'
      const result = await lockPrediction(eventId)
      if (result.error) {
        btn.textContent = predErrorMsg(result.error)
        btn.title = result.error
        setTimeout(() => { btn.textContent = t('mc_pred_lock_betting'); btn.disabled = false; btn.title = '' }, 3000)
      } else {
        // Hide bet rows + lock button immediately, keep resolve/cancel
        const pred = btn.closest('.hs-mc-prediction') || container.querySelector('.hs-mc-prediction')
        if (pred) {
          pred.querySelectorAll('.hs-mc-pred-bet-row').forEach(el => el.remove())
          pred.querySelector('.hs-mc-pred-lock-btn')?.remove()
        }
        btn.textContent = '\u2713 ' + t('mc_pred_locked')
        setTimeout(() => refreshPredictionSlot(), 2000)
      }
    })
  })

  // Mod: resolve (pick winner)
  container.querySelectorAll('.hs-mc-pred-resolve-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const eventId = btn.closest('.hs-mc-prediction')?.dataset.eventId
        || container.querySelector('.hs-mc-prediction')?.dataset.eventId
      if (!eventId) { btn.textContent = 'no event'; return }
      const outcomeId = btn.dataset.outcome
      if (!outcomeId) { btn.textContent = 'no outcome'; return }
      btn.disabled = true
      btn.textContent = '...'
      const result = await resolvePrediction(eventId, outcomeId)
      if (result.error) {
        btn.textContent = predErrorMsg(result.error)
        btn.title = result.error
        setTimeout(() => { btn.textContent = t('mc_pred_pick_winner'); btn.disabled = false; btn.title = '' }, 3000)
      } else {
        // Immediately clean up stale UI
        const pred = btn.closest('.hs-mc-prediction') || container.querySelector('.hs-mc-prediction')
        if (pred) {
          pred.querySelectorAll('.hs-mc-pred-mod-row, .hs-mc-pred-mod-notice, .hs-mc-pred-bet-row, .hs-mc-pred-resolve-btn').forEach(el => el.remove())
          pred.classList.add('hs-mc-pred-resolved')
        }
        btn.textContent = '\u2713 ' + t('mc_pred_ended')
        setTimeout(() => refreshPredictionSlot(), 2000)
      }
    })
  })

  // Mod: cancel (refund)
  container.querySelectorAll('.hs-mc-pred-cancel-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const eventId = btn.closest('.hs-mc-prediction')?.dataset.eventId
        || container.querySelector('.hs-mc-prediction')?.dataset.eventId
      if (!eventId) { btn.textContent = 'no event'; return }
      btn.disabled = true
      btn.textContent = '...'
      const result = await cancelPrediction(eventId)
      if (result.error) {
        btn.textContent = predErrorMsg(result.error)
        btn.title = result.error
        setTimeout(() => { btn.textContent = t('mc_pred_cancel_refund'); btn.disabled = false; btn.title = '' }, 3000)
      } else {
        const pred = btn.closest('.hs-mc-prediction') || container.querySelector('.hs-mc-prediction')
        if (pred) {
          pred.querySelectorAll('.hs-mc-pred-mod-row, .hs-mc-pred-mod-notice, .hs-mc-pred-bet-row, .hs-mc-pred-resolve-btn').forEach(el => el.remove())
          pred.classList.add('hs-mc-pred-canceled')
        }
        btn.textContent = '\u2713 ' + t('mc_pred_refunded')
        setTimeout(() => refreshPredictionSlot(), 2000)
      }
    })
  })

  // Create form: Tab cycles inputs, Enter submits, Escape closes
  const createInputs = [...container.querySelectorAll('.hs-mc-pred-create-input')]
  createInputs.forEach((input, i) => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault()
        createInputs[(i + (e.shiftKey ? createInputs.length - 1 : 1)) % createInputs.length].focus()
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const submit = input.closest('.hs-mc-pred-create-form')?.querySelector('.hs-mc-pred-create-submit')
        if (submit && !submit.disabled) submit.click()
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        const toggle = input.closest('.hs-mc-pred-create')?.querySelector('.hs-mc-pred-create-toggle')
        if (toggle) toggle.click()
      }
    })
  })

  // Create prediction form toggle + submit
  container.querySelectorAll('.hs-mc-pred-create-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const form = btn.parentElement.querySelector('.hs-mc-pred-create-form')
      if (form) {
        const showing = form.style.display !== 'none'
        form.style.display = showing ? 'none' : 'flex'
        btn.textContent = showing ? t('mc_pred_new') : t('mc_pred_cancel_form')
      }
    })
  })

  // Duration picker
  container.querySelectorAll('.hs-mc-pred-create-dur').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      container.querySelectorAll('.hs-mc-pred-create-dur').forEach(b => b.classList.remove('hs-mc-pred-create-dur-active'))
      btn.classList.add('hs-mc-pred-create-dur-active')
    })
  })

  // Create submit
  container.querySelectorAll('.hs-mc-pred-create-submit').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const channelId = container.querySelector('[data-channel-id]')?.dataset.channelId
      if (!channelId) { btn.textContent = 'no channel'; return }
      const form = btn.closest('.hs-mc-pred-create-form')
      const inputs = form.querySelectorAll('.hs-mc-pred-create-input')
      const title = inputs[0]?.value?.trim()
      const outcomes = [...form.querySelectorAll('.hs-mc-pred-create-outcome')].map(i => i.value.trim()).filter(Boolean)
      if (!title) { inputs[0].focus(); return }
      if (outcomes.length < 2) { form.querySelectorAll('.hs-mc-pred-create-outcome')[outcomes.length]?.focus(); return }
      const durBtn = form.querySelector('.hs-mc-pred-create-dur-active')
      const secs = parseInt(durBtn?.dataset.secs || '120')
      btn.disabled = true
      btn.textContent = '...'
      const result = await createPrediction(channelId, title, secs, outcomes)
      if (result.error) {
        btn.textContent = '!'
        btn.title = result.error
        setTimeout(() => { btn.textContent = t('mc_pred_create'); btn.disabled = false; btn.title = '' }, 2000)
      } else {
        form.style.display = 'none'
        refreshPredictionSlot()
      }
    })
  })

  // Create prediction keyboard nav
  container.querySelectorAll('.hs-mc-pred-create-input').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault()
        const inputs = [...container.querySelectorAll('.hs-mc-pred-create-input')]
        const idx = inputs.indexOf(input)
        const next = inputs[(idx + 1) % inputs.length]
        next?.focus()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        container.querySelector('.hs-mc-pred-create-submit')?.click()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        container.querySelector('.hs-mc-pred-create-toggle')?.click()
      }
    })
  })

  // Start countdown timers
  container.querySelectorAll('.hs-mc-pred-timer').forEach(el => {
    const endsAt = parseInt(el.dataset.ends)
    const update = () => {
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
      if (remaining <= 0) {
        el.textContent = 'closing...'
        el.classList.add('hs-mc-pred-locked')
        return
      }
      const m = Math.floor(remaining / 60)
      const s = remaining % 60
      el.textContent = m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`
    }
    update()
    const iv = cleanup.setIntervalIfVisible(() => {
      if (!el.isConnected) { cleanup.clearInterval(iv); return }
      update()
    }, 1000)
  })
}

// ═══ Chat overlay banners (predictions + polls at top of messages) ═══

let _bannerTimers = []
let _lastPredResult = null
let _lastPollData = null
let _lastPinnedMsg = null
let _hypeTrainActive = null // { level, startedAt }
let _bannerFingerprint = '' // avoid rebuilding if nothing changed
const _seenPredChannels = new Set()        // channels we've fetched at least once
const _broadcastedPredIds = new Map()      // channel → last broadcast pred id

// Emit a chat line when a new prediction starts. Suppresses on first observation
// per channel so opening a tab mid-prediction doesn't spam old events.
function maybeBroadcastNewPrediction(channel, pred) {
  if (!channel) return
  const ch = String(channel).toLowerCase()
  const wasSeen = _seenPredChannels.has(ch)
  _seenPredChannels.add(ch)
  const newId = pred?.id || null
  const prevId = _broadcastedPredIds.get(ch) || null
  if (newId === prevId) return
  _broadcastedPredIds.set(ch, newId)
  if (!wasSeen) return
  if (!pred || pred.status !== 'ACTIVE') return
  try {
    window.postMessage({
      type: 'heatsync-hermes-event',
      eventType: 'prediction-start',
      channel: ch,
      data: { title: pred.title || '', id: pred.id }
    }, location.origin)
  } catch {}
}

function clearBannerTimers() {
  _bannerTimers.forEach(id => cleanup.clearInterval(id))
  _bannerTimers = []
}

function _startBannerTimer(el, endsAt) {
  const update = () => {
    const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
    if (remaining <= 0) { el.textContent = 'closing'; return }
    const m = Math.floor(remaining / 60)
    const s = remaining % 60
    el.textContent = m > 0 ? m + ':' + String(s).padStart(2, '0') : s + 's'
  }
  update()
  _bannerTimers.push(cleanup.setIntervalIfVisible(() => {
    if (!el.isConnected) return
    update()
  }, 1000))
}

function updateChatBanners(predResult, pollData) {
  const msgsEl = document.getElementById('hs-mc-messages')
  if (!msgsEl) return
  const t = typeof hermesToggles !== 'undefined' ? hermesToggles : {}

  const pred = predResult?.prediction
  const hasPred = t.pred !== false && pred && (pred.status === 'ACTIVE' || pred.status === 'LOCKED')
  const hasPoll = t.poll !== false && pollData && pollData.status === 'ACTIVE'
  const hasPin = t.pin !== false && _lastPinnedMsg
  const hasHype = t.hype !== false && _hypeTrainActive

  // Fingerprint to avoid unnecessary rebuilds (prevents flash on bet/refresh)
  const userBet = pred ? _userBets.get(pred.id) : null
  const fp = [
    hasPred ? pred.id + ':' + pred.status + ':' + (userBet?.points || 0) : '',
    hasPoll ? pollData.id + ':' + pollData.status : '',
    hasPin ? (_lastPinnedMsg.id || _lastPinnedMsg.message) : '',
    hasHype ? 'hype:' + _hypeTrainActive.level : ''
  ].join('|')

  if (fp === _bannerFingerprint) return
  _bannerFingerprint = fp

  const old = msgsEl.querySelector('.hs-mc-chat-banner')
  clearBannerTimers()

  if (!hasPred && !hasPoll && !hasPin && !hasHype) {
    if (old) old.remove()
    return
  }

  const banner = old || document.createElement('div')
  banner.className = 'hs-mc-chat-banner'
  banner.innerHTML = ''

  const goToTwitch = (e) => {
    const twitchTab = document.querySelector('[data-tab="live"]')
    if (twitchTab) twitchTab.click()
  }

  // Pinned message
  if (hasPin) {
    const row = document.createElement('div')
    row.className = 'hs-mc-chat-banner-item hs-mc-chat-banner-pin'
    row.innerHTML = '<span class="hs-mc-chat-banner-icon">\u{1F4CC}</span>'
    const title = document.createElement('span')
    title.className = 'hs-mc-chat-banner-title'
    title.textContent = _lastPinnedMsg.message || ''
    row.appendChild(title)
    if (_lastPinnedMsg.sender) {
      const sender = document.createElement('span')
      sender.className = 'hs-mc-chat-banner-badge'
      sender.textContent = _lastPinnedMsg.sender
      sender.style.color = '#bf94ff'
      row.appendChild(sender)
    }
    banner.appendChild(row)
  }

  // Prediction with vital info
  if (hasPred) {
    const row = document.createElement('div')
    row.className = 'hs-mc-chat-banner-item hs-mc-chat-banner-pred'
    row.style.cursor = 'pointer'
    row.addEventListener('click', goToTwitch)

    // Build: 🔮 title · outcome1 45% vs outcome2 55% · [your bet: 100] · 2:30
    row.innerHTML = '<span class="hs-mc-chat-banner-icon">\u{1F52E}</span>'

    const info = document.createElement('span')
    info.className = 'hs-mc-chat-banner-title'
    const totalPts = pred.outcomes.reduce((s, o) => s + (o.totalPoints || 0), 0)
    const parts = pred.outcomes.map(o => {
      const pct = totalPts > 0 ? Math.round((o.totalPoints / totalPts) * 100) : 0
      return o.title + ' ' + pct + '%'
    })
    let text = pred.title + ' \u00b7 ' + parts.join(' vs ')
    if (userBet) {
      const betOutcome = pred.outcomes.find(o => o.id === userBet.outcomeId)
      text += ' \u00b7 bet: ' + formatPoints(userBet.points) + (betOutcome ? ' ' + betOutcome.title : '')
    }
    info.textContent = text
    row.appendChild(info)

    if (pred.status === 'ACTIVE') {
      const timer = document.createElement('span')
      timer.className = 'hs-mc-chat-banner-timer'
      const createdAt = new Date(pred.createdAt).getTime()
      const windowMs = (pred.predictionWindowSeconds || 120) * 1000
      _startBannerTimer(timer, createdAt + windowMs)
      row.appendChild(timer)
    } else {
      const badge = document.createElement('span')
      badge.className = 'hs-mc-chat-banner-badge'
      badge.textContent = t('mc_pred_locked')
      row.appendChild(badge)
    }

    banner.appendChild(row)
  }

  // Poll with vital info
  if (hasPoll) {
    const row = document.createElement('div')
    row.className = 'hs-mc-chat-banner-item hs-mc-chat-banner-poll'
    row.style.cursor = 'pointer'
    row.addEventListener('click', goToTwitch)

    row.innerHTML = '<span class="hs-mc-chat-banner-icon">\u{1F4CA}</span>'

    const info = document.createElement('span')
    info.className = 'hs-mc-chat-banner-title'
    const totalVotes = pollData.choices?.reduce((s, c) => s + (c.votes?.totalCount || c.totalVotes || 0), 0) || 0
    const choiceParts = pollData.choices?.slice(0, 4).map(c => {
      const votes = c.votes?.totalCount || c.totalVotes || 0
      const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0
      return c.title + ' ' + pct + '%'
    }) || []
    info.textContent = pollData.title + (choiceParts.length ? ' \u00b7 ' + choiceParts.join(' vs ') : '')
    row.appendChild(info)

    const timer = document.createElement('span')
    timer.className = 'hs-mc-chat-banner-timer'
    const durMs = (pollData.durationSeconds || 60) * 1000
    const startTime = pollData.startedAt || pollData.createdAt
    const pollEndTime = startTime ? (new Date(startTime).getTime() + durMs) : (Date.now() + (pollData.remainingDurationMilliseconds || durMs))
    _startBannerTimer(timer, pollEndTime)
    row.appendChild(timer)

    banner.appendChild(row)
  }

  // Hype train
  if (hasHype) {
    const row = document.createElement('div')
    row.className = 'hs-mc-chat-banner-item hs-mc-chat-banner-hype'
    row.innerHTML = `<span class="hs-mc-chat-banner-icon">\u{1F682}</span><span class="hs-mc-chat-banner-title">${t('mc_chat_hype_train')}</span>`
    const badge = document.createElement('span')
    badge.className = 'hs-mc-chat-banner-badge'
    badge.textContent = t('mc_chat_hype_level', [String(_hypeTrainActive.level || 1)])
    badge.style.color = '#ff8700'
    row.appendChild(badge)
    banner.appendChild(row)
  }

  if (!old) msgsEl.prepend(banner)
}

// Called from main.js hermes event handler
function onHypeTrainStart(level) {
  _hypeTrainActive = { level: level || 1, startedAt: Date.now() }
  updateChatBanners(_lastPredResult, _lastPollData)
}
function onHypeTrainEnd() {
  _hypeTrainActive = null
  updateChatBanners(_lastPredResult, _lastPollData)
}
function onPinnedMessage(msg) {
  _lastPinnedMsg = msg
  updateChatBanners(_lastPredResult, _lastPollData)
}
function clearPinnedMessage() {
  _lastPinnedMsg = null
  updateChatBanners(_lastPredResult, _lastPollData)
}

// Get Twitch channel for the active multichat tab (channel tab → twitch name, live → URL channel)
function getActiveTwitchChannel() {
  if (currentTab === 'live' || currentTab === 'feed' || currentTab === 'mentions' || currentTab === 'whispers') {
    return getLiveChannel()
  }
  const ch = config.channels.find(c => c.id === currentTab)
  if (!ch) return getLiveChannel()
  return ch.twitch || ch.id
}

// ── Twitch tab sub-tabs ──────────────────────────────────────────────────────
// The picker's "twitch" tab is split into four square-icon sub-tabs at the top
// so the user can pick which surface (bits / predictions / chat tools / links)
// instead of getting one giant vertical stack. Active sub-tab persists in
// module state so it survives picker re-opens.
let _hsTwSubtab = 'predictions'

const HS_TW_ICON_BITS_PATHS = [
  'M15 2h2v2h-2V2Zm5 10h2v2h-2v-2Zm0-8v2a1 1 0 0 1-1 1h-2v2h2a3 3 0 0 0 3-3V4h-2Z',
  'M13 9a1 1 0 0 0-1 1l7 7-14 5-3-3L7 5l3.438 3.438A2.998 2.998 0 0 1 13 7h2v2h-2Zm-5.18-.351-.725 2.03 3.762 7.106 2.572-.92-2.934-5.542L7.82 8.649Zm-2.976 8.334 1.235-3.458 2.67 5.012-2.592.926-1.313-2.48Z'
]
const HS_TW_ICON_PRED_PATHS  = ['M3 3h2v18H3V3Zm4 10h2v8H7v-8Zm4-6h2v14h-2V7Zm4 9h2v5h-2v-5Zm4-12h2v17h-2V4Z']
const HS_TW_ICON_CHAT_PATHS  = ['M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z']
const HS_TW_ICON_LINKS_PATHS = ['M14 3h7v7h-2V6.41l-9.3 9.3-1.4-1.42L17.58 5H14V3Zm-4 3H4v14h14v-6h2v8H2V4h8v2Z']

function hsTwBuildIconSvg(paths, size) {
  const arr = Array.isArray(paths) ? paths : [paths]
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width',  String(size || 20))
  svg.setAttribute('height', String(size || 20))
  svg.setAttribute('fill', 'currentColor')
  for (const d of arr) {
    const p = document.createElementNS(ns, 'path')
    p.setAttribute('d', d)
    svg.appendChild(p)
  }
  return svg
}

function buildTwSubtabBar() {
  const bar = document.createElement('div')
  bar.className = 'hs-mc-tw-subtabs'
  const items = [
    { id: 'predictions', label: 'events',                paths: HS_TW_ICON_PRED_PATHS  },
    { id: 'bits',        label: 'bits',                  paths: HS_TW_ICON_BITS_PATHS  },
    { id: 'chat',        label: 'chat tools',            paths: HS_TW_ICON_CHAT_PATHS  },
    { id: 'links',       label: 'quick links',           paths: HS_TW_ICON_LINKS_PATHS },
  ]
  for (const it of items) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'hs-mc-tw-subtab' + (it.id === _hsTwSubtab ? ' active' : '')
    btn.dataset.twSubtab = it.id
    btn.title = it.label
    btn.setAttribute('aria-label', it.label)
    btn.appendChild(hsTwBuildIconSvg(it.paths, 20))
    btn.addEventListener('click', (e) => {
      // stopPropagation is critical — the picker has a document-level
      // outside-click close handler that fires AFTER this. If we let the
      // event propagate, renderTwitchTab() will have already cleared the
      // container before the outside-click handler runs, orphaning e.target
      // → picker.contains(e.target) returns false → picker closes.
      e.stopPropagation()
      if (_hsTwSubtab === it.id) return
      _hsTwSubtab = it.id
      renderTwitchTab()
    })
    bar.appendChild(btn)
  }
  return bar
}

async function renderTwitchTab() {
  const container = document.getElementById('hs-mc-tab-twitch')
  if (!container) return

  const channel = getActiveTwitchChannel()
  container.textContent = ''

  // Sub-tab bar always at top
  container.appendChild(buildTwSubtabBar())

  const content = document.createElement('div')
  content.className = 'hs-mc-tw-content'
  container.appendChild(content)

  if (!channel) {
    const empty = document.createElement('div')
    empty.className = 'hs-mc-pred-empty'
    const msg = document.createElement('div')
    msg.className = 'hs-mc-pred-empty-text'
    msg.textContent = 'no channel detected'
    empty.appendChild(msg)
    content.appendChild(empty)
    stopPredictionPoll()
    return
  }

  _predictionChannel = channel

  if (_hsTwSubtab === 'bits') {
    renderBitsSubtab(content, channel)
    stopPredictionPoll()
    return
  }

  if (_hsTwSubtab === 'chat') {
    content.appendChild(renderColorPicker())
    const modesSlot = document.createElement('div')
    content.appendChild(modesSlot)
    attachColorHandlers()
    renderChatModes(channel).then(modesEl => {
      if (modesEl) {
        modesSlot.appendChild(modesEl)
        attachModeHandlers()
      }
    })
    stopPredictionPoll()
    return
  }

  if (_hsTwSubtab === 'links') {
    content.appendChild(renderQuickLinks())
    stopPredictionPoll()
    return
  }

  // Default: 'predictions' — predictions + polls + community-points rewards.
  const predSlot = document.createElement('div')
  predSlot.className = 'hs-mc-pred-loading'
  predSlot.dataset.predSlot = '1'
  predSlot.textContent = 'loading...'
  const pollSlot = document.createElement('div')
  pollSlot.dataset.pollSlot = '1'
  const rewardsSlot = document.createElement('div')
  content.appendChild(predSlot)
  content.appendChild(pollSlot)
  content.appendChild(rewardsSlot)

  const modBefore = _twitchIsMod
  fetchPrediction(channel).then(result => {
    _lastPredResult = result
    maybeBroadcastNewPrediction(channel, result?.prediction)
    updateChatBanners(_lastPredResult, _lastPollData)
    predSlot.textContent = ''
    predSlot.className = ''
    if (!result) {
      const empty = document.createElement('div')
      empty.className = 'hs-mc-pred-empty'
      const msg = document.createElement('div')
      msg.className = 'hs-mc-pred-empty-text'
      msg.textContent = t('mc_pred_load_failed')
      empty.appendChild(msg)
      predSlot.appendChild(empty)
    } else if (result.prediction) {
      predSlot.appendChild(renderPrediction(result.prediction, result.balance, result.channelId, result.isMod, result.cpImage, result.cpName))
    } else {
      predSlot.appendChild(renderNoPrediction(result.balance, result.channelId, result.isMod, result.cpImage, result.cpName))
    }
    attachPredictionHandlers()
    if (_twitchIsMod && !modBefore) refreshPollSlot()
  })

  fetchPoll(channel).then(pollResult => {
    _lastPollData = pollResult?.poll || pollResult
    updateChatBanners(_lastPredResult, _lastPollData)
    if (pollResult?.poll) {
      pollSlot.appendChild(renderPoll(pollResult.poll, pollResult.channelId, pollResult.isMod))
      attachPollHandlers()
    } else if (pollResult) {
      pollSlot.appendChild(renderNoPoll(pollResult.channelId, pollResult.isMod))
      attachPollHandlers()
    }
  })

  fetchChannelRewards(channel).then(rewardsResult => {
    if (rewardsResult?.availableClaim && rewardsResult.channelId) {
      claimCommunityPoints(rewardsResult.availableClaim, rewardsResult.channelId, channel)
    }
    if (rewardsResult?.rewards?.length) {
      rewardsSlot.appendChild(renderRewards(rewardsResult.rewards, rewardsResult.balance, rewardsResult.channelId))
      attachRewardHandlers()
    }
  })

  startPredictionPoll()
}

// Bits sub-tab — single launcher that opens twitch's native bits modal via
// React-fiber onClick invocation. We CANNOT send bits programmatically via
// GQL (twitch's integrity service blocks it specifically for bits — verified
// live). The fiber-invoke path bypasses isTrusted because it calls the React
// handler directly instead of dispatching a synthetic event, so the real
// modal opens. Twitch handles auth/integrity/payment normally → real bit
// deducted → real bits-tagged echo → bulletproof cheermote renderer fires.
function renderBitsSubtab(parent, channel) {
  closeCheerPanel()

  const panel = document.createElement('div')
  panel.className = 'hs-mc-cheer-panel hs-mc-cheer-inline'
  panel.setAttribute('role', 'region')
  panel.setAttribute('aria-label', `Cheer bits to ${channel}`)

  const header = document.createElement('div')
  header.className = 'hs-mc-cheer-header'
  const title = document.createElement('div')
  title.className = 'hs-mc-cheer-title'
  title.textContent = `cheer bits to ${channel}`
  const balance = document.createElement('div')
  balance.className = 'hs-mc-cheer-balance'
  const bal = hsReadNativeBitsBalance()
  balance.textContent = bal ? `balance: ${bal}` : 'balance: —'
  header.appendChild(title)
  header.appendChild(balance)
  panel.appendChild(header)

  const launchBtn = document.createElement('button')
  launchBtn.type = 'button'
  launchBtn.className = 'hs-mc-cheer-send hs-mc-cheer-launch'
  launchBtn.textContent = 'open cheer modal'
  launchBtn.addEventListener('click', () => {
    // Open twitch's full chat popout in a separate window. The popout is a
    // complete twitch chat UI (chat-input + bits button + cheer modal + everything)
    // running in its own window — completely outside heatsync's overlay. User
    // cheers there normally; twitch handles auth/integrity/payment/UI. When
    // the cheer message lands, it echoes back through IRC to heatsync's
    // multichat overlay with the bits=N tag → bulletproof cheermote renders.
    //
    // Why this is the permanent answer:
    // - twitch's bits modal needs its chat-input ancestor visible to render
    // - heatsync's multichat covers the entire chat surface on the main tab
    // - we can't make the bits-button visible without ripping heatsync's UI
    // - a separate window has its OWN twitch chat surface with its OWN bits UI
    // - no fiber invocation, no DOM hacking, no CSS overrides, no anti-bot fights
    const safe = String(channel || '').toLowerCase().replace(/[^a-z0-9_]/g, '')
    if (!safe) {
      showToast('invalid channel', 'error')
      return
    }
    const url = `https://www.twitch.tv/popout/${safe}/chat?popout=`
    const w = window.open(url, `hs-cheer-${safe}`, 'width=400,height=620,resizable=yes,scrollbars=yes')
    if (!w) {
      showToast('popup blocked — allow popups for twitch.tv to cheer', 'error')
      return
    }
    showToast(`cheer popup opened — click the gem icon there`, 'success')
  })
  panel.appendChild(launchBtn)

  parent.appendChild(panel)
}

function startPredictionPoll() {
  stopPredictionPoll()
  _predictionPollTimer = cleanup.setIntervalIfVisible(() => {
    const container = document.getElementById('hs-mc-tab-twitch')
    if (!container || container.style.display === 'none') {
      stopPredictionPoll()
      return
    }
    // Don't refresh while create form is open
    if (container.querySelector('.hs-mc-pred-create-form[style*="flex"]')) return
    refreshPredictionSlot()
    refreshPollSlot()
  }, 15000)
}

// Refresh only the prediction slot without tearing down the whole Twitch tab
async function refreshPredictionSlot() {
  _predResultCache = null // always fetch fresh on explicit refresh
  const container = document.getElementById('hs-mc-tab-twitch')
  if (!container) return
  const channel = getActiveTwitchChannel()
  if (!channel) return

  const result = await fetchPrediction(channel)

  // Update chat overlay banner
  _lastPredResult = result
  maybeBroadcastNewPrediction(channel, result?.prediction)
  updateChatBanners(_lastPredResult, _lastPollData)

  // Find the prediction slot — it's always a direct child of container marked with data-pred-slot
  let slot = container.querySelector('[data-pred-slot]')
  if (!slot) {
    // Fallback: find by class
    slot = container.querySelector('.hs-mc-prediction')
      || container.querySelector('.hs-mc-pred-empty')
      || container.querySelector('.hs-mc-pred-loading')
  }
  if (!slot) return

  const newSlot = document.createElement('div')
  newSlot.dataset.predSlot = '1'
  if (!result) {
    newSlot.className = 'hs-mc-pred-empty'
    const msg = document.createElement('div')
    msg.className = 'hs-mc-pred-empty-text'
    msg.textContent = t('mc_pred_load_failed')
    newSlot.appendChild(msg)
  } else if (result.prediction) {
    newSlot.appendChild(renderPrediction(result.prediction, result.balance, result.channelId, result.isMod, result.cpImage, result.cpName))
  } else {
    newSlot.appendChild(renderNoPrediction(result.balance, result.channelId, result.isMod, result.cpImage, result.cpName))
  }
  slot.replaceWith(newSlot)
  attachPredictionHandlers()
}

// Refresh only the poll slot without tearing down the whole Twitch tab
async function refreshPollSlot() {
  const container = document.getElementById('hs-mc-tab-twitch')
  if (!container) return
  const channel = getActiveTwitchChannel()
  if (!channel) return

  // Don't refresh while create form is open
  if (container.querySelector('.hs-mc-poll-create-form[style*="flex"]')) return
  const result = await fetchPoll(channel)
  _lastPollData = result?.poll || result
  updateChatBanners(_lastPredResult, _lastPollData)

  let slot = container.querySelector('[data-poll-slot]')
  if (!slot) {
    slot = container.querySelector('.hs-mc-poll')
      || container.querySelector('.hs-mc-poll-empty')
  }
  if (!slot) return

  const newSlot = document.createElement('div')
  newSlot.dataset.pollSlot = '1'
  if (result?.poll) {
    newSlot.appendChild(renderPoll(result.poll, result.channelId, result.isMod))
  } else if (result) {
    newSlot.appendChild(renderNoPoll(result.channelId, result.isMod))
  }
  slot.replaceWith(newSlot)
  attachPollHandlers()
}

function stopPredictionPoll() {
  if (_predictionPollTimer) {
    cleanup.clearInterval(_predictionPollTimer)
    _predictionPollTimer = null
  }
}

// ── Cheermote rendering ──────────────────────────────────────────────────────
// Twitch's universal "Cheer" cheermote has six tiers, each with its own color.
// CDN serves animated WebPs/GIFs at d3aqoihi2n8ty8.cloudfront.net. When twitch
// tags a chat message with bits>0, the `cheer<N>` token in the visible text
// should render as the tier-appropriate cheermote + colored bits amount.
const HS_CHEER_TIERS = [
  { min: 100000, tier: 100000, color: '#f43021' },
  { min: 10000,  tier: 10000,  color: '#fa0d72' },
  { min: 5000,   tier: 5000,   color: '#0099fe' },
  { min: 1000,   tier: 1000,   color: '#1db2a5' },
  { min: 100,    tier: 100,    color: '#9c3ee8' },
  { min: 1,      tier: 1,      color: '#979797' },
]
function hsCheerTier(amount) {
  for (const t of HS_CHEER_TIERS) if (amount >= t.min) return t
  return HS_CHEER_TIERS[HS_CHEER_TIERS.length - 1]
}
function hsCheermoteUrl(amount, scale) {
  const t = hsCheerTier(amount)
  return `https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/animated/${t.tier}/${scale || 2}.gif`
}
// BULLETPROOF: only render a cheermote when twitch's IRC tagged the message
// with bits=N (server-confirmed real cheer). No amount-cap heuristics, no
// loose "looks like a cheer" rendering — if the tag isn't there, the bit
// wasn't credited and it's just text. Heatsync's IRC connection requests
// CAP twitch.tv/tags so bits tags ARE preserved end-to-end for real cheers.
function renderCheermotesInText(html, totalBits) {
  if (!html || !totalBits || totalBits < 1) return html
  return html.replace(/\bcheer(\d+)\b/gi, (match, n) => {
    const amount = parseInt(n, 10)
    if (!amount || amount < 1) return match
    const t = hsCheerTier(amount)
    const url = `https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/animated/${t.tier}/2.gif`
    return `<img class="hs-mc-cheermote" src="${url}" alt="cheer${amount}" title="${amount} bits" loading="lazy">` +
           `<span class="hs-mc-cheer-amt" style="color:${t.color}">${amount}</span>`
  })
}

// ── Cheer panel — real bits cheering via IRC ─────────────────────────────────
// Twitch parses `cheer<amount>` tokens in chat messages and credits bits.
// That means a real cheer is just a PRIVMSG with the cheer token — we don't
// need to reimplement the bits modal, we just need a clean amount-picker UI
// and we send via the same auth'd IRC connection used for normal chat.

const HS_CHEER_PRESETS = [1, 100, 500, 1000, 5000, 10000]
let _hsCheerPanelEl = null

// ── REAL BITS CHEER via twitch's own GQL mutation ─────────────────────────────
// ChatInput_SendCheer is the mutation twitch's web client fires from its bits
// modal. Captured live from a real cheer (hash + variable shape both known).
// This is the only path that actually credits bits server-side; raw IRC
// PRIVMSG cheer tokens are no longer parsed by twitch as of 2023/2024.
async function hsSendCheerViaGQL(channelLogin, amount, message) {
  try {
    const safe = String(channelLogin || '').toLowerCase().replace(/[^a-z0-9_]/g, '')
    if (!safe) return 'invalid channel'

    // Resolve broadcaster's twitch user ID. Three-tier resolution:
    //   1. cached id on documentElement.dataset (when injected on twitch.tv/<channel>)
    //   2. Helix API by-login lookup (works from standalone heatsync.org/multichat too)
    //   3. fail
    let targetID = null
    try {
      const cachedLogin = document.documentElement.dataset.hsTwitchChannelLogin
      const cachedId = document.documentElement.dataset.hsTwitchChannelId
      if (cachedId && cachedLogin && cachedLogin.toLowerCase() === safe) {
        targetID = cachedId
      }
    } catch (_) {}
    if (!targetID) {
      try {
        const resp = await helixRequest(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(safe)}`)
        targetID = resp?.data?.data?.[0]?.id || null
      } catch (_) {}
    }
    if (!targetID) return 'could not resolve channel id'

    // Twitch's content format: capital "Cheer<N>" + space, then optional message.
    // The trailing space is preserved by twitch (visible in echoed chat).
    const content = `Cheer${amount}${message ? ` ${message}` : ' '}`

    // Client-generated nonce (UUID v4)
    const nonce = (crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now() + '-' + Math.random().toString(36).slice(2))

    const variables = {
      input: {
        id: nonce,
        targetID: String(targetID),
        bits: amount,
        content,
        isAutoModEnabled: true,
        shouldCheerAnyway: false,
        imageID: null,
        pinCheer: false
      }
    }

    const resp = await gqlProxy('ChatInput_SendCheer', variables)
    // Stash the raw response on documentElement.dataset for diagnosis — bounded
    // size, cleaned up next call. Lets us verify the actual response shape in
    // the live tab without needing devtools.
    try { document.documentElement.dataset.hsLastCheerResp = JSON.stringify(resp).slice(0, 2000) } catch (_) {}

    if (!resp) return 'twitch returned nothing'
    if (Array.isArray(resp.errors) && resp.errors.length) {
      const msg = resp.errors.map(e => e?.message || e?.code).filter(Boolean).join('; ')
      return msg || 'gql top-level error'
    }
    // Mutation result lives at resp.data.<operationField> (twitch's wire shape)
    const mut = resp.data?.sendCheer || resp.data?.sendBitsTransaction || resp.sendCheer
    if (!mut) {
      return 'unexpected response: ' + JSON.stringify(resp).slice(0, 80)
    }
    if (mut.error) return mut.error.code || mut.error.message || 'cheer error'
    if (mut.dropReason) return mut.dropReason.code || mut.dropReason.reasonMessage || 'cheer dropped'
    return true
  } catch (e) {
    return e?.message || 'gql error'
  }
}

// God-tier send path: dispatch beforeinput into twitch's Lexical chat input
// (text lands in the editor + React state syncs), then trigger the native send
// button (mouseup/mousedown/click → React onClick fallback). This routes
// through twitch's OWN send pipeline (GQL sendChatMessage), which is the only
// path that actually processes bits anymore. Returns true on visible success
// (input cleared post-send), or an error string.
async function hsSendViaNativeChat(text) {
  const input = document.querySelector('[data-a-target="chat-input"]')
  const sendBtn = document.querySelector('[data-a-target="chat-send-button"]')
  if (!input || !sendBtn) return 'native chat input/send not in page'

  input.focus()
  // Select existing placeholder/content
  const sel = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(input)
  sel.removeAllRanges()
  sel.addRange(range)

  // Drop text into Lexical via beforeinput
  input.dispatchEvent(new InputEvent('beforeinput', {
    bubbles: true, cancelable: true, inputType: 'insertText', data: text
  }))
  await new Promise(r => setTimeout(r, 220))

  const stripPlaceholders = (s) => (s || '').replace(/[​﻿ ]/g, '').trim()
  const landed = stripPlaceholders(input.textContent).includes(text)
  if (!landed) return `text did not land in editor (got "${stripPlaceholders(input.textContent).slice(0, 60)}")`

  // Try native click first — most natural path
  try {
    sendBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }))
    sendBtn.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, cancelable: true, button: 0 }))
    sendBtn.dispatchEvent(new MouseEvent('click',     { bubbles: true, cancelable: true, button: 0 }))
  } catch (_) {}
  await new Promise(r => setTimeout(r, 300))
  if (!stripPlaceholders(input.textContent).includes(text)) return true

  // Fallback: invoke React onClick directly via the captured props
  const propsKey = Object.keys(sendBtn).find(k => k.startsWith('__reactProps$'))
  const props = propsKey ? sendBtn[propsKey] : null
  if (typeof props?.onClick === 'function') {
    try {
      props.onClick({
        preventDefault: () => {}, stopPropagation: () => {},
        nativeEvent: { preventDefault: () => {}, stopPropagation: () => {} },
        isDefaultPrevented: () => false, isPropagationStopped: () => false,
        currentTarget: sendBtn, target: sendBtn, type: 'click', button: 0
      })
      await new Promise(r => setTimeout(r, 300))
      if (!stripPlaceholders(input.textContent).includes(text)) return true
    } catch (_) {}
  }

  // Last fallback: Enter key on input
  try {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }))
    await new Promise(r => setTimeout(r, 300))
    if (!stripPlaceholders(input.textContent).includes(text)) return true
  } catch (_) {}

  return 'send did not consume input'
}

function hsReadNativeBitsBalance() {
  const native = document.querySelector('[aria-label="Bits and Points Balances"]')
  if (!native) return null
  const txt = native.querySelector('[data-test-selector="bits-balance-string"]')?.textContent?.trim()
  return txt || null
}

function closeCheerPanel() {
  if (_hsCheerPanelEl) {
    _hsCheerPanelEl.remove()
    _hsCheerPanelEl = null
  }
}

function openCheerPanel(channel) {
  const container = document.getElementById('hs-mc-tab-twitch')
  if (!container) return false
  if (_hsCheerPanelEl) { closeCheerPanel(); return true }

  let selectedAmount = 0

  const panel = document.createElement('div')
  panel.id = 'hs-mc-cheer-panel'
  panel.className = 'hs-mc-cheer-panel'
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-label', `Cheer bits to ${channel}`)

  // Header — title + live balance
  const header = document.createElement('div')
  header.className = 'hs-mc-cheer-header'
  const title = document.createElement('div')
  title.className = 'hs-mc-cheer-title'
  title.textContent = `cheer bits to ${channel}`
  const balance = document.createElement('div')
  balance.className = 'hs-mc-cheer-balance'
  const bal = hsReadNativeBitsBalance()
  balance.textContent = bal ? `balance: ${bal}` : 'balance: —'
  header.appendChild(title)
  header.appendChild(balance)
  panel.appendChild(header)

  // Cheermote preview row — shows the tier image + colored amount you'd send
  const preview = document.createElement('div')
  preview.className = 'hs-mc-cheer-preview'
  const previewImg = document.createElement('img')
  previewImg.className = 'hs-mc-cheer-preview-img'
  previewImg.alt = ''
  previewImg.style.visibility = 'hidden'
  const previewLabel = document.createElement('span')
  previewLabel.className = 'hs-mc-cheer-preview-label'
  previewLabel.textContent = 'pick an amount'
  preview.appendChild(previewImg)
  preview.appendChild(previewLabel)
  panel.appendChild(preview)

  function updatePreview() {
    if (selectedAmount > 0) {
      const t = hsCheerTier(selectedAmount)
      previewImg.src = hsCheermoteUrl(selectedAmount, 2)
      previewImg.style.visibility = 'visible'
      previewLabel.textContent = `cheer${selectedAmount}`
      previewLabel.style.color = t.color
      previewLabel.style.fontWeight = '700'
    } else {
      previewImg.style.visibility = 'hidden'
      previewLabel.textContent = 'pick an amount'
      previewLabel.style.color = ''
      previewLabel.style.fontWeight = ''
    }
  }

  // Amount presets + custom field
  const amounts = document.createElement('div')
  amounts.className = 'hs-mc-cheer-amounts'

  const customInput = document.createElement('input')
  customInput.type = 'number'
  customInput.className = 'hs-mc-cheer-custom'
  customInput.placeholder = 'custom'
  customInput.min = '1'
  customInput.max = '999999'

  HS_CHEER_PRESETS.forEach(a => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'hs-mc-cheer-amt'
    btn.dataset.amount = String(a)
    btn.textContent = a >= 1000 ? `${a / 1000}K` : String(a)
    btn.addEventListener('click', () => {
      selectedAmount = a
      customInput.value = ''
      panel.querySelectorAll('.hs-mc-cheer-amt').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      updateSendBtn()
      updatePreview()
    })
    amounts.appendChild(btn)
  })
  customInput.addEventListener('input', () => {
    const n = parseInt(customInput.value, 10)
    selectedAmount = Number.isFinite(n) && n > 0 ? n : 0
    panel.querySelectorAll('.hs-mc-cheer-amt').forEach(b => b.classList.remove('active'))
    updateSendBtn()
    updatePreview()
  })
  amounts.appendChild(customInput)
  panel.appendChild(amounts)

  // Message field
  const msgInput = document.createElement('input')
  msgInput.type = 'text'
  msgInput.className = 'hs-mc-cheer-msg'
  msgInput.placeholder = 'optional message'
  msgInput.maxLength = 500
  panel.appendChild(msgInput)

  // Actions row
  const actions = document.createElement('div')
  actions.className = 'hs-mc-cheer-actions'
  const cancelBtn = document.createElement('button')
  cancelBtn.type = 'button'
  cancelBtn.className = 'hs-mc-cheer-cancel'
  cancelBtn.textContent = 'cancel'
  cancelBtn.addEventListener('click', () => closeCheerPanel())
  const sendBtn = document.createElement('button')
  sendBtn.type = 'button'
  sendBtn.className = 'hs-mc-cheer-send'
  sendBtn.disabled = true
  sendBtn.textContent = 'send 0 bits'

  function updateSendBtn() {
    sendBtn.disabled = selectedAmount < 1
    sendBtn.textContent = selectedAmount > 0 ? `send ${selectedAmount.toLocaleString('en-US')} bits` : 'send 0 bits'
  }

  sendBtn.addEventListener('click', async () => {
    if (selectedAmount < 1) return
    sendBtn.disabled = true
    sendBtn.textContent = 'sending…'
    const msg = msgInput.value.trim()
    const text = msg ? `cheer${selectedAmount} ${msg}` : `cheer${selectedAmount}`
    // Native pipeline first (routes through twitch's GQL sendChatMessage which
    // actually processes bits). If that path fails for any reason, fall back to
    // the raw IRC path (which doesn't credit bits in 2026 but at least sends
    // the text). Either way, the pending-cheer tracker forces the cheermote to
    // render on the echo.
    let result = await hsSendViaNativeChat(text)
    if (result !== true) {
      result = await hsSendCheerIrc(channel.toLowerCase(), text)
    }
    if (result === true) {
      // Track the cheer so the IRC parser can force-set bits on the echo even
      // if twitch's bits processing didn't tag it. Cleared on match or TTL.
      globalThis.__hsPendingCheers = globalThis.__hsPendingCheers || []
      globalThis.__hsPendingCheers.push({
        channel: channel.toLowerCase(),
        amount: selectedAmount,
        text,
        time: Date.now()
      })
      // Prune entries older than 30s
      const cutoff = Date.now() - 30000
      globalThis.__hsPendingCheers = globalThis.__hsPendingCheers.filter(c => c.time > cutoff)
      showToast(`cheered ${selectedAmount.toLocaleString('en-US')} bits to ${channel}`, 'success')
      closeCheerPanel()
    } else {
      showToast(`cheer failed: ${result}`, 'error')
      sendBtn.disabled = false
      updateSendBtn()
    }
  })
  actions.appendChild(cancelBtn)
  actions.appendChild(sendBtn)
  panel.appendChild(actions)

  // Esc dismisses
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      closeCheerPanel()
    }
  })

  // Insert at the very top of the twitch tab content
  container.insertBefore(panel, container.firstChild)
  _hsCheerPanelEl = panel

  // Default focus on first preset for quick keyboard pick
  panel.querySelector('.hs-mc-cheer-amt')?.focus()
  // Scroll into view in case the tab was scrolled
  try { panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) } catch (_) {}

  return true
}

function triggerTwitchFeature(action) {
  const channel = getActiveTwitchChannel() || getCurrentChannel();
  if (!channel) return false;

  // Subscribe — opens twitch's real subscription product page in a popup window.
  // The actual subscribe modal can't be opened programmatically (browsers block
  // the trusted-event), and the flow requires payment processing we can't bypass.
  // The /products/<channel>/ticket URL is the canonical sub purchase entry.
  if (action === 'sub') {
    window.open(`https://www.twitch.tv/products/${channel}/ticket`, '_blank', 'width=520,height=720,noopener')
    return true
  }

  if (action === 'clip') {
    // Create clip via Helix API
    ;(async () => {
      const userResp = await helixRequest(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(channel)}`)
      if (!userResp.ok || !userResp.data?.data?.[0]) { showToast('could not resolve channel', 'error'); return }
      const broadcasterId = userResp.data.data[0].id
      const resp = await helixRequest(`https://api.twitch.tv/helix/clips?broadcaster_id=${broadcasterId}`, 'POST')
      if (resp.ok && resp.data?.data?.[0]) {
        const editUrl = resp.data.data[0].edit_url
        const clipId = resp.data.data[0].id
        showToast('clip created ' + clipId, 'success')
        // Copy clip URL to clipboard
        try { await navigator.clipboard.writeText(editUrl || `https://clips.twitch.tv/${clipId}`) } catch {}
      } else {
        showToast('clip failed: ' + (resp.error || 'stream must be live'), 'error')
      }
    })()
    return true
  }

  const actions = {
    popout: { url: `https://www.twitch.tv/popout/${channel}/chat?popout=`, opts: 'width=400,height=600' },
    mod:    { url: `https://www.twitch.tv/moderator/${channel}`, opts: 'width=1200,height=800' },
  };

  const cfg = actions[action];
  if (!cfg) return false;

  window.open(cfg.url, '_blank', cfg.opts || '');
  return true;
}

// Best-effort own twitch login — read Twitch's stored user blob if we're on
// twitch.tv; otherwise null (the launcher still works, just no broadcaster
// detection so dashboard deep-links stay hidden).
function getOwnTwitchLogin() {
  try {
    const raw = localStorage.getItem('twilight-user')
    if (!raw) return null
    const obj = JSON.parse(raw)
    const login = (obj?.login || obj?.userName || '').toString().toLowerCase()
    return login || null
  } catch { return null }
}

// Curated launcher of native Twitch surfaces. Audience gates: 'all' for
// public pages + viewer-account; 'mod' for the moderator hub (covers
// blocked terms + automod via gear); 'broadcaster' for dashboard deep-links
// which only resolve for the channel owner.
const TWITCH_NATIVE_LINKS = [
  { section: 'mod tools' },
  { id: 'modview',     audience: 'mod',         label: 'mod view (chat + automod + blocked terms)', url: (ch) => `https://www.twitch.tv/moderator/${ch}`,                                 opts: 'width=1200,height=800' },

  { section: 'broadcaster' },
  { id: 'streammgr',   audience: 'broadcaster', label: 'stream manager',         url: (ch) => `https://dashboard.twitch.tv/u/${ch}/stream-manager`,            opts: 'width=1200,height=800' },
  { id: 'dashboard',   audience: 'broadcaster', label: 'creator dashboard',      url: (ch) => `https://dashboard.twitch.tv/u/${ch}/home`,                      opts: 'width=1200,height=800' },
  { id: 'modsettings', audience: 'broadcaster', label: 'moderation settings',    url: (ch) => `https://dashboard.twitch.tv/u/${ch}/settings/moderation`,       opts: 'width=1000,height=750' },
  { id: 'chansettings',audience: 'broadcaster', label: 'channel settings',       url: (ch) => `https://dashboard.twitch.tv/u/${ch}/settings/channel`,          opts: 'width=1000,height=750' },
  { id: 'community',   audience: 'broadcaster', label: 'community (mods, vips, follows)', url: (ch) => `https://dashboard.twitch.tv/u/${ch}/community`,        opts: 'width=1000,height=750' },
  { id: 'monetize',    audience: 'broadcaster', label: 'monetization (subs, bits)', url: (ch) => `https://dashboard.twitch.tv/u/${ch}/monetization`,           opts: 'width=1000,height=750' },
  { id: 'analytics',   audience: 'broadcaster', label: 'analytics',              url: (ch) => `https://dashboard.twitch.tv/u/${ch}/analytics/stream-summary`,  opts: 'width=1200,height=800' },

  { section: 'channel pages' },
  { id: 'about',       audience: 'all', label: 'about page',  url: (ch) => `https://www.twitch.tv/${ch}/about` },
  { id: 'videos',      audience: 'all', label: 'videos',      url: (ch) => `https://www.twitch.tv/${ch}/videos` },
  { id: 'clips',       audience: 'all', label: 'clips',       url: (ch) => `https://www.twitch.tv/${ch}/clips` },
  { id: 'schedule',    audience: 'all', label: 'schedule',    url: (ch) => `https://www.twitch.tv/${ch}/schedule` },
  { id: 'popoutchat',  audience: 'all', label: 'popout chat', url: (ch) => `https://www.twitch.tv/popout/${ch}/chat?popout=`, opts: 'width=400,height=600' },

  { section: 'your account' },
  { id: 'inventory',   audience: 'all', label: 'drops / inventory',  url: () => `https://www.twitch.tv/inventory` },
  { id: 'mysubs',      audience: 'all', label: 'my subscriptions',   url: () => `https://www.twitch.tv/subscriptions` },
  { id: 'following',   audience: 'all', label: 'following directory',url: () => `https://www.twitch.tv/directory/following` },
  { id: 'prefs',       audience: 'all', label: 'twitch settings',    url: () => `https://www.twitch.tv/settings` },
  { id: 'security',    audience: 'all', label: 'privacy + security', url: () => `https://www.twitch.tv/settings/security` },
]

// Open the native-Twitch launcher menu at (x, y) for `channel`.
// Filters items by role: broadcaster gets dashboard deep-links, mods get the
// hub. Falls back to active channel if none provided.
function openTwitchNativeLauncher(x, y, channel) {
  const ch = (channel || getActiveTwitchChannel() || getCurrentChannel() || '').toString().toLowerCase()
  if (!ch || !/^[a-z0-9_]{2,40}$/.test(ch)) {
    showToast('no twitch channel selected', 'error')
    return
  }
  const own = getOwnTwitchLogin()
  const isBroadcaster = !!(own && own === ch)
  const isMod = isBroadcaster || _twitchIsMod

  const items = []
  let pendingSection = null
  for (const e of TWITCH_NATIVE_LINKS) {
    if (e.section) { pendingSection = e.section; continue }
    if (e.audience === 'broadcaster' && !isBroadcaster) continue
    if (e.audience === 'mod' && !isMod) continue
    if (pendingSection) {
      if (items.length) items.push('sep')
      items.push({ section: pendingSection })
      pendingSection = null
    }
    items.push({
      label: e.label,
      fn: () => { try { window.open(e.url(ch, own), '_blank', e.opts || 'noopener') } catch {} }
    })
  }
  if (!items.length) { showToast('no twitch links available', 'error'); return }
  showHsCtxMenu(x, y, 'twitch · ' + ch, items)
}

// Twitch IRC badge rendering
const BADGE_STYLES = {
  broadcaster: { label: 'LIVE', bg: '#e91916', fg: '#fff' },
  moderator: { label: 'MOD', bg: '#00ad03', fg: '#fff' },
  vip: { label: 'VIP', bg: '#e005b9', fg: '#fff' },
  subscriber: { label: 'SUB', bg: '#8205b4', fg: '#fff' },
  predictions: { label: 'PRED', bg: '#1f69ff', fg: '#fff' },
  premium: { label: 'PRIME', bg: '#0d6efd', fg: '#fff' },
  admin: { label: 'ADMIN', bg: '#faaf19', fg: '#000' },
  staff: { label: 'STAFF', bg: '#faaf19', fg: '#000' },
  global_mod: { label: 'GMOD', bg: '#00ad03', fg: '#fff' },
  partner: { label: '✓', bg: '#9147ff', fg: '#fff' },
  'bits-leader': { label: 'BITS', bg: '#ffd700', fg: '#000' },
  'sub-gifter': { label: 'GIFT', bg: '#8205b4', fg: '#fff' },
  artist: { label: 'ART', bg: '#ff6b35', fg: '#fff' },
  turbo: { label: 'T+', bg: '#6441a5', fg: '#fff' },
  founder: { label: 'FND', bg: '#8205b4', fg: '#fff' },
  // Kick badges (underscore variants)
  sub_gifter: { label: 'GIFT', bg: '#8205b4', fg: '#fff' },
  og: { label: 'OG', bg: '#53fc18', fg: '#000' },
  verified: { label: '✓', bg: '#53fc18', fg: '#000' },
}

// Twitch badge image URLs: "setID/version" → image_url
const twitchBadgeUrls = new Map()
const ffzBadgeKeys = new Set() // tracks which channel:badgeName entries are FFZ (need bg color)
const badgesFetchedChannels = new Set()
// Sorted numeric version lists per "channel:setID" — for nearest-tier fallback
// (e.g. user has subscriber/5 but channel only defines 0,3,6 → use 3).
const channelBadgeVersions = new Map()

function findNearestChannelBadgeVersion(channel, name, version) {
  const versions = channelBadgeVersions.get(`${channel}:${name}`)
  if (!versions || versions.length === 0) return null
  const v = parseInt(version, 10)
  if (!Number.isFinite(v)) return null
  // Subscriber versions encode tier in the thousands digit (2xxx = T2, 3xxx = T3).
  // Stay within the same tier when picking the nearest lower version.
  let tierMin = -Infinity, tierMax = Infinity
  if (name === 'subscriber') {
    if (v >= 3000) { tierMin = 3000; tierMax = 3999 }
    else if (v >= 2000) { tierMin = 2000; tierMax = 2999 }
    else { tierMin = 0; tierMax = 1999 }
  }
  let best = -1
  for (const vv of versions) {
    if (vv > v) break
    if (vv < tierMin || vv > tierMax) continue
    if (vv > best) best = vv
  }
  return best >= 0 ? String(best) : null
}
let globalBadgesFetched = false
const TWITCH_GQL = 'https://gql.twitch.tv/gql'
const TWITCH_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'

// ═══ GQL Proxy — routes calls through MAIN world to use fresh hashes ═══
// Twitch rotates persisted query hashes; the MAIN world fetch interceptor
// captures them from Twitch's own code so we never hardcode stale hashes.

// Cache for intercepted GQL data pushed from MAIN world
const _gqlDataCache = {} // operationName → { data, ts }

// Listen for passively intercepted GQL data from MAIN world
window.addEventListener('message', (e) => {
  // Same-origin frames (Twitch embeds) could otherwise poison the cache —
  // restrict to the top window (where early-inject-main.js runs).
  if (e.source !== window || e.origin !== location.origin) return
  if (e.data?.type === 'heatsync-gql-data') {
    const { operation, data, errors } = e.data
    if (data && !errors?.length) {
      _gqlDataCache[operation] = { data, ts: Date.now() }
      if (Object.keys(_gqlDataCache).length > 50) {
        const oldest = Object.entries(_gqlDataCache).reduce((a, b) => a[1].ts < b[1].ts ? a : b)[0]
        delete _gqlDataCache[oldest]
      }
      // Auto-refresh individual slots when relevant GQL data arrives
      const container = document.getElementById('hs-mc-tab-twitch')
      if (container && container.style.display !== 'none') {
        const pollOps = ['ActivePoll', 'CreatePoll', 'ChannelPollContext']
        const predOps = ['ChannelPointsPredictionContext', 'MakePrediction']
        if (pollOps.includes(operation)) {
          refreshPollSlot()
        } else if (predOps.includes(operation)) {
          refreshPredictionSlot()
        } else {
          renderTwitchTab()
        }
      }
    }
  }
}, { signal: mcSignal })

// Send Helix API request through MAIN world (uses captured OAuth token)
// URL can contain {me} which resolves to the logged-in user's ID
function helixRequest(url, method, body) {
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2)
    const ac = new AbortController()
    const signal = mcSignal ? AbortSignal.any([mcSignal, ac.signal]) : ac.signal
    const handler = (e) => {
      if (e.source !== window || e.origin !== location.origin) return
      if (e.data?.type === 'heatsync-helix-response' && e.data.id === id) {
        ac.abort()
        clearTimeout(timer)
        resolve(e.data)
      }
    }
    window.addEventListener('message', handler, { signal })
    const msg = { type: 'heatsync-helix', id, url, method: method || 'GET', nonce: window.HS?.getMainWorldNonce?.() || null }
    if (body) msg.body = body
    window.postMessage(msg, location.origin)
    const timer = setTimeout(() => {
      ac.abort()
      resolve({ error: 'helix timeout — refresh the page' })
    }, 15000)
  })
}

// Send GQL request through MAIN world proxy (uses captured hashes + integrity)
function gqlProxy(operation, variables, opts) {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2)
    const ac = new AbortController()
    const signal = mcSignal ? AbortSignal.any([mcSignal, ac.signal]) : ac.signal
    const handler = (e) => {
      if (e.source !== window || e.origin !== location.origin) return
      if (e.data?.type === 'heatsync-gql-response' && e.data.id === id) {
        ac.abort()
        clearTimeout(timer)
        if (e.data.error) reject(new Error(e.data.error))
        else resolve(e.data.data)
      }
    }
    window.addEventListener('message', handler, { signal })
    const msg = { type: 'heatsync-gql-request', id, operation, variables, nonce: window.HS?.getMainWorldNonce?.() || null }
    if (opts?.rawQuery) msg.rawQuery = opts.rawQuery
    if (opts?.batch) msg.batch = opts.batch
    window.postMessage(msg, location.origin)
    const timer = setTimeout(() => {
      ac.abort()
      reject(new Error('GQL proxy timeout'))
    }, 4000)
  })
}

async function fetchGlobalBadges() {
  if (globalBadgesFetched) return
  globalBadgesFetched = true
  try {
    const resp = await fetch(TWITCH_GQL, {
      method: 'POST',
      headers: { 'Client-Id': TWITCH_CLIENT_ID, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ badges { imageURL(size: NORMAL) setID version } }' }),
      signal: AbortSignal.timeout(5000)
    })
    if (!resp.ok) { globalBadgesFetched = false; return }
    const data = await resp.json()
    const badges = data?.data?.badges
    if (!badges) { globalBadgesFetched = false; return }
    for (const b of badges) {
      twitchBadgeUrls.set(`${b.setID}/${b.version}`, b.imageURL)
    }
    log('Loaded global badges:', twitchBadgeUrls.size)
    // Existing message DOM was built before badges loaded — bump epoch so the
    // diff invalidates old msgKeys and rebuilds with the now-populated URLs.
    if (typeof bumpRenderEpoch === 'function') bumpRenderEpoch()
    renderMessages(currentTab)
  } catch (e) {
    globalBadgesFetched = false
    log('Failed to fetch global badges:', e.message)
  }
}

// Prediction state
let _predictionPollTimer = null
let _predictionChannel = null
let _twitchIsMod = false  // cached from fetchPrediction (most reliable isMod source)
let _twitchChannelId = null
const _userBets = new Map() // eventId → { outcomeId, points } (capped at 50)

// Rewards state
let _rewardsCache = null
let _rewardsCacheChannel = null

// Prediction result cache — avoids redundant GQL on quick tab switches
let _predResultCache = null // { result, channel, ts }
const PRED_CACHE_TTL = 5000 // 5s — fresh enough to feel instant, short enough to stay current

const PRED_FIELDS = 'id title status createdAt endedAt predictionWindowSeconds winningOutcome { id } outcomes { id title totalPoints totalUsers color } self { prediction { outcome { id } points } }'

// True when this content script is running on a twitch.tv page (cookies +
// MAIN-world Apollo client + integrity are all directly available).
const _isOnTwitchPage = () => /(^|\.)twitch\.tv$/i.test(location.hostname || '')

// GQL call — on Twitch: direct fetch / MAIN-world proxy. Off Twitch (Kick /
// YouTube): route through background.js so the request carries the user's
// twitch.tv auth cookie. This lets mod-state checks (isModerator etc.) work
// from any page the multichat overlay runs on.
async function twitchGql(query, variables) {
  if (!_isOnTwitchPage()) {
    try {
      const resp = await safeSendMessage({ type: 'twitch_gql_authed', query, variables: variables || null })
      if (resp?.ok && resp.data) return resp.data
      throw new Error(resp?.error || 'twitch_gql bridge failed')
    } catch (e) {
      throw new Error('GQL bridge failed: ' + e.message)
    }
  }
  // Try direct fetch (works in Chrome MV3 content scripts with host_permissions)
  try {
    const token = getTwitchAuthToken()
    const hdrs = { 'Content-Type': 'application/json', 'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko' }
    if (token) hdrs['Authorization'] = 'OAuth ' + token
    const body = variables ? { query, variables } : { query }
    const resp = await fetch('https://gql.twitch.tv/gql', {
      method: 'POST', headers: hdrs, body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000)
    })
    if (!resp.ok) throw new Error('GQL ' + resp.status)
    return resp.json()
  } catch (directErr) {
    // Direct fetch failed (Firefox CORS) — fall back to MAIN world proxy
    try {
      const data = await gqlProxy('twitchGql', variables || {}, { rawQuery: query })
      const d = Array.isArray(data) ? data[0] : data
      // Proxy wraps in { data } or returns raw — normalize
      return d?.data ? d : { data: d }
    } catch (proxyErr) {
      throw new Error('GQL failed: direct=' + directErr.message + ' proxy=' + proxyErr.message)
    }
  }
}

async function fetchPrediction(channelLogin) {
  const safe = channelLogin.replace(/[^a-z0-9_]/g, '')
  if (!safe) return null

  // Return cached result if fresh (avoids GQL on quick tab switches)
  if (_predResultCache && _predResultCache.channel === safe && Date.now() - _predResultCache.ts < PRED_CACHE_TTL) {
    return _predResultCache.result
  }

  try {
    let predEvent = null
    let balance = null
    let channelId = null
    let isMod = false
    let cpImage = null
    let cpName = null

    // Single combined GQL query — predictions + balance + channel points settings
    try {
      const data = await twitchGql('{ user(login: "' + safe + '") { id self { isModerator } channel { activePredictionEvents { ' + PRED_FIELDS + ' } lockedPredictionEvents { ' + PRED_FIELDS + ' } resolvedPredictionEvents(first: 1) { edges { node { ' + PRED_FIELDS + ' } } } } } currentUser { id } channel(name: "' + safe + '") { communityPointsSettings { image { url url2x } name } self { communityPoints { balance } } } }')
      const ch = data?.data?.user?.channel
      const userId = data?.data?.user?.id
      const currentUserId = data?.data?.currentUser?.id
      if (userId) channelId = userId
      isMod = data?.data?.user?.self?.isModerator || (userId && currentUserId && userId === currentUserId)

      // Priority: ACTIVE > LOCKED > recently RESOLVED (< 5 min ago)
      const active = ch?.activePredictionEvents
      const locked = ch?.lockedPredictionEvents
      const resolved = ch?.resolvedPredictionEvents?.edges?.[0]?.node

      if (Array.isArray(active) && active.length) {
        predEvent = active.find(e => e.status === 'ACTIVE') || active[0]
      } else if (Array.isArray(locked) && locked.length) {
        predEvent = locked[0]
      } else if (resolved) {
        // Show resolved predictions briefly so users see the result
        const resolvedTime = resolved.endedAt || resolved.createdAt
        const resolvedAge = Date.now() - new Date(resolvedTime).getTime()
        if (resolvedAge < 300000) predEvent = resolved
      }

      // Populate _userBets from self.prediction
      if (predEvent?.self?.prediction) {
        const sp = predEvent.self.prediction
        if (sp.outcome?.id && sp.points) {
          if (_userBets.size > 50) _userBets.delete(_userBets.keys().next().value)
          _userBets.set(predEvent.id, { outcomeId: sp.outcome.id, points: sp.points })
        }
      }

      // Extract balance + channel points settings from same response
      const ch2 = data?.data?.channel
      balance = ch2?.self?.communityPoints?.balance ?? null
      cpImage = ch2?.communityPointsSettings?.image?.url2x || ch2?.communityPointsSettings?.image?.url || null
      cpName = ch2?.communityPointsSettings?.name || null
    } catch (e) {
      log('GQL prediction query failed:', e.message)
    }

    // Fallback: fetch balance via proxy if combined query didn't get it
    if (balance === null) {
      try {
        const data = await gqlProxy('CommunityPointsContext', { channelLogin: safe })
        const d = Array.isArray(data) ? data[0]?.data : (data?.data || data)
        balance = d?.community?.channel?.self?.communityPoints?.balance ?? null
      } catch {}
    }

    _twitchIsMod = isMod
    _twitchChannelId = channelId
    const result = { prediction: predEvent, balance, channelId, isMod, cpImage, cpName }
    _predResultCache = { result, channel: safe, ts: Date.now() }
    return result
  } catch (e) {
    log('Failed to fetch prediction:', e.message)
    return null
  }
}

// ═══ Mod prediction management (direct GQL — no MAIN world proxy) ═══

// Mod prediction mutations — try Apollo client (has integrity + correct hashes),
// fallback to raw query through MAIN world proxy (has integrity), final fallback direct fetch
async function predictionMutation(searchTerm, resultField, rawQuery, variables) {
  // Try Apollo client first (most reliable — uses Twitch's own persisted hashes)
  const apolloResult = await apolloMutate({ searchTerm, variables, resultField, rawQuery })
  if (apolloResult.ok) return { ok: true }
  // Apollo failed — try raw query through MAIN world proxy (has integrity)
  try {
    const data = await gqlMutation(rawQuery, variables)
    const err = data?.data?.[resultField]?.error
    if (err) return { error: err.code || resultField + ' failed' }
    return { ok: true }
  } catch (e) { return { error: apolloResult.error || e.message } }
}

async function lockPrediction(eventId) {
  return predictionMutation(
    'LockPredictionEvent', 'lockPredictionEvent',
    'mutation($input: LockPredictionEventInput!) { lockPredictionEvent(input: $input) { error { code } } }',
    { input: { id: eventId } }
  )
}

async function resolvePrediction(eventId, outcomeId) {
  return predictionMutation(
    'ResolvePredictionEvent', 'resolvePredictionEvent',
    'mutation($input: ResolvePredictionEventInput!) { resolvePredictionEvent(input: $input) { error { code } } }',
    { input: { eventID: eventId, outcomeID: outcomeId } }
  )
}

async function cancelPrediction(eventId) {
  return predictionMutation(
    'CancelPredictionEvent', 'cancelPredictionEvent',
    'mutation($input: CancelPredictionEventInput!) { cancelPredictionEvent(input: $input) { error { code } } }',
    { input: { id: eventId } }
  )
}

async function createPrediction(channelId, title, windowSeconds, outcomes) {
  const colors = ['BLUE', 'PINK', 'ORANGE', 'GREEN', 'TEAL', 'PURPLE', 'YELLOW', 'LIGHT_BLUE', 'RED', 'BROWN']
  return predictionMutation(
    'CreatePredictionEvent', 'createPredictionEvent',
    'mutation($input: CreatePredictionEventInput!) { createPredictionEvent(input: $input) { error { code } } }',
    { input: { channelID: channelId, title, predictionWindowSeconds: windowSeconds, outcomes: outcomes.map((t, i) => ({ title: t, color: colors[i] || colors[0] })) } }
  )
}

// Route a mutation through Twitch's own Apollo client in the MAIN world.
// searchTerm: string to find the webpack module (e.g. 'AcceptPredictionTerms')
// variables: GQL variables object
// resultField: the mutation's return field name (for error extraction)
// rawQuery: optional fallback raw query string
function apolloMutate({ searchTerm, variables, resultField, rawQuery }) {
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2)
    const ac = new AbortController()
    const signal = mcSignal ? AbortSignal.any([mcSignal, ac.signal]) : ac.signal
    const handler = (e) => {
      if (e.source !== window || e.origin !== location.origin) return
      if (e.data?.type === 'heatsync-apollo-mutate-response' && e.data.id === id) {
        ac.abort()
        clearTimeout(timer)
        resolve(e.data.data || { error: 'no response' })
      }
    }
    window.addEventListener('message', handler, { signal })
    window.postMessage({
      type: 'heatsync-apollo-mutate', id, searchTerm, variables,
      resultField, rawQuery, nonce: window.HS?.getMainWorldNonce?.() || null
    }, location.origin)
    const timer = setTimeout(() => {
      ac.abort()
      resolve({ error: 'apollo mutation timeout' })
    }, 8000)
  })
}

async function acceptPredictionTerms() {
  const result = await apolloMutate({
    searchTerm: 'AcceptPredictionTerms',
    variables: { input: { hasAcceptedTOS: true } },
    resultField: 'updateUserPredictionSettings',
    rawQuery: 'mutation($input: UpdateUserPredictionSettingsInput!) { updateUserPredictionSettings(input: $input) { error { code } settings { hasAcceptedTOS } } }'
  })
  return !!result.ok
}

// Known working persisted query hashes (from Twitch's own client). Hashes
// auto-update from live Twitch traffic on twitch.tv pages via early-inject
// gql.hashes capture; this map is the fallback seed for first-call before any
// page traffic, and for code paths that don't have MAIN-world access.
const TWITCH_HASHES = {
  MakePrediction: 'b44682ecc88358817009f20e69d75081b1e58825bb40aa53d5dbadcc17c881d8',
  // Follow / unfollow — needed for cross-platform follow propagation. Twitch
  // killed the public follow REST API in Aug 2023, so this is the only path.
  FollowButton_FollowUser: '800e7346bdf7e5278a3c1d3f21b2b56e2639928f86815677a7126b093b2fdd08',
  FollowButton_UnfollowUser: 'f7dae976ebf41c755ae2d758546bfd176b4eeb856656098bb40e0a672ca0d880'
}

// Route mutation through MAIN world proxy (has integrity token) with direct fetch fallback
async function gqlMutation(query, variables) {
  try {
    const data = await gqlProxy('twitchGql', variables || {}, { rawQuery: query })
    const d = Array.isArray(data) ? data[0] : data
    return d?.data ? d : { data: d }
  } catch {
    return twitchGql(query, variables)
  }
}

// Use persisted query hash for MakePrediction — raw queries are dead for mutations
async function gqlPersistedMutation(operationName, variables) {
  const hash = TWITCH_HASHES[operationName]
  if (!hash) return gqlMutation('mutation ' + operationName + '($input: ' + operationName + 'Input!) { ' + operationName.replace(/^[A-Z]/, c => c.toLowerCase()) + '(input: $input) { error { code } } }', variables)
  const token = getTwitchAuthToken()
  const hdrs = { 'Content-Type': 'application/json', 'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko' }
  if (token) hdrs['Authorization'] = 'OAuth ' + token
  try {
    const resp = await fetch('https://gql.twitch.tv/gql', {
      method: 'POST', headers: hdrs,
      body: JSON.stringify({
        operationName,
        variables,
        extensions: { persistedQuery: { version: 1, sha256Hash: hash } }
      }),
      signal: AbortSignal.timeout(8000)
    })
    if (!resp.ok) throw new Error('GQL ' + resp.status)
    return resp.json()
  } catch (directErr) {
    // Firefox CORS fallback — route through MAIN world proxy with hash
    try {
      const data = await gqlProxy(operationName, variables)
      const d = Array.isArray(data) ? data[0] : data
      return d?.data ? d : { data: d }
    } catch {
      throw directErr
    }
  }
}

async function placePredictionBet(eventId, outcomeId, points, transactionId) {
  const token = getTwitchAuthToken()
  if (!token) return { error: 'not logged in' }
  try {
    const isTosError = (d) => {
      const msg = d?.errors?.[0]?.message || ''
      const code = d?.data?.makePrediction?.error?.code || ''
      return msg.includes('ACCEPT') || msg.includes('TOS') || code.includes('ACCEPT') || code.includes('TOS')
    }
    const tryBet = () => {
      const makeInput = { eventID: eventId, outcomeID: outcomeId, points, transactionID: crypto.randomUUID() }
      return gqlPersistedMutation('MakePrediction', { input: makeInput })
    }

    let data = await tryBet()
    if (isTosError(data)) {
      await acceptPredictionTerms()
      for (let attempt = 0; attempt < 3; attempt++) {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
        data = await tryBet()
        if (!isTosError(data)) break
      }
    }
    if (data?.errors?.length) return { error: data.errors[0].message }
    const mutError = data?.data?.makePrediction?.error
    if (mutError) return { error: mutError.code || 'bet failed' }
    if (_userBets.size > 50) _userBets.delete(_userBets.keys().next().value)
    _userBets.set(eventId, { outcomeId, points })
    return { ok: true }
  } catch (e) {
    return { error: e.message }
  }
}

async function fetchChannelRewards(channelLogin) {
  const safe = channelLogin.replace(/[^a-z0-9_]/g, '')
  if (!safe) return null
  if (_rewardsCacheChannel === safe && _rewardsCache && Date.now() - _rewardsCache.fetchedAt < 60000) {
    return _rewardsCache
  }
  const token = getTwitchAuthToken()
  if (!token) return null
  try {
    // Try proxy with captured ChannelPointsContext hash first
    const data = await gqlProxy('ChannelPointsContext', { channelLogin: safe }).catch(() => null)
    let user = null
    if (data) {
      const d = Array.isArray(data) ? data[0] : data
      user = d?.data?.community?.channel || d?.data?.user || d?.community?.channel || d?.user
    }
    // Fallback: try raw GQL (may work for some fields)
    if (!user) {
      const resp = await fetch(TWITCH_GQL, {
        method: 'POST',
        headers: {
          'Client-Id': TWITCH_CLIENT_ID,
          'Content-Type': 'application/json',
          'Authorization': `OAuth ${token}`
        },
        signal: AbortSignal.timeout(5000),
        body: JSON.stringify({
          query: `{
            user(login: "${safe}") {
              id
              communityPointsSettings {
                customRewards {
                  id title cost backgroundColor isEnabled isPaused isInStock
                  isUserInputRequired cooldownExpiresAt prompt
                  globalCooldownSetting { globalCooldownSeconds isEnabled }
                  image { url }
                  defaultImage { url }
                }
              }
              self {
                communityPoints {
                  balance
                  availableClaim { id }
                }
              }
            }
          }`
        })
      })
      if (resp.ok) {
        const raw = await resp.json()
        user = raw?.data?.user
      }
    }
    if (!user) return null
    const settings = user.communityPointsSettings || user.communityPointsSetting || {}
    const rewards = (settings.customRewards || []).filter(r => r.isEnabled)
    const self = user.self || {}
    const cp = self.communityPoints || {}
    const balance = cp.balance ?? null
    const availableClaim = cp.availableClaim?.id ?? null
    _rewardsCache = { rewards, balance, availableClaim, channelId: user.id, fetchedAt: Date.now() }
    _rewardsCacheChannel = safe
    return _rewardsCache
  } catch (e) {
    log('Failed to fetch rewards:', e.message)
    return null
  }
}

async function redeemChannelReward(channelId, rewardId, cost, title, textInput) {
  const token = getTwitchAuthToken()
  if (!token) return { error: 'not logged in' }
  try {
    const input = {
      channelID: channelId,
      rewardID: rewardId,
      cost,
      title,
      transactionID: crypto.randomUUID()
    }
    if (textInput) input.textInput = textInput
    // Try proxy first (uses captured hash + integrity)
    try {
      const data = await gqlProxy('RedeemCommunityPointsCustomReward', { input })
      const d = Array.isArray(data) ? data[0] : data
      if (d?.errors?.length) return { error: d.errors[0].message }
      const err = d?.data?.redeemCommunityPointsCustomReward?.error
      if (err) return { error: err.code || 'redemption failed' }
      return { ok: true }
    } catch(proxyErr) {
      // Fallback to raw GQL mutation
      const resp = await fetch(TWITCH_GQL, {
        method: 'POST',
        headers: {
          'Client-Id': TWITCH_CLIENT_ID,
          'Content-Type': 'application/json',
          'Authorization': `OAuth ${token}`
        },
        body: JSON.stringify({
          query: `mutation($input: RedeemCommunityPointsCustomRewardInput!) {
            redeemCommunityPointsCustomReward(input: $input) {
              redemption { id }
              error { code }
            }
          }`,
          variables: { input }
        })
      })
      if (!resp.ok) return { error: `HTTP ${resp.status}` }
      const data = await resp.json()
      if (data?.errors?.length) return { error: data.errors[0].message }
      const err = data?.data?.redeemCommunityPointsCustomReward?.error
      if (err) return { error: err.code || 'redemption failed' }
      return { ok: true }
    }
  } catch (e) {
    return { error: e.message }
  }
}

async function claimCommunityPoints(claimId, channelId, channelLogin) {
  const token = getTwitchAuthToken()
  if (!token) return false
  let claimed = false
  try {
    await gqlProxy('ClaimCommunityPoints', {
      input: { claimID: claimId, channelID: channelId }
    }).catch(async () => {
      // Fallback to raw GQL
      const resp = await fetch(TWITCH_GQL, {
        method: 'POST',
        headers: {
          'Client-Id': TWITCH_CLIENT_ID,
          'Content-Type': 'application/json',
          'Authorization': `OAuth ${token}`
        },
        body: JSON.stringify({
          query: `mutation($input: ClaimCommunityPointsInput!) {
            claimCommunityPoints(input: $input) { claim { id } }
          }`,
          variables: { input: { claimID: claimId, channelID: channelId } }
        })
      })
      if (!resp.ok) throw new Error('HTTP ' + resp.status)
    })
    claimed = true
  } catch (e) {
    log('Failed to claim bonus points:', e.message)
  }
  // Silent claim — toast was noisy when tracking multiple channels (e.g.
  // nl_kripp claims firing while viewing asmongold247). Points still credit;
  // the toast was the only visible signal and the user explicitly didn't
  // want it. Re-enable behind a setting if needed in future.
  // if (claimed && channelLogin) {
  //   try { window.HsNotifs?.emit?.('toast', { text: '+50 · ' + channelLogin, level: 'success' }) } catch (_) {}
  // }
  return claimed
}

// Persist active poll to storage (survives reloads; Twitch has no public poll query)
function _savePollToStorage(poll, channelId) {
  if (!poll?.id) return
  try {
    chrome.storage.local.set({ hs_active_poll: { poll, channelId, savedAt: Date.now() } })
  } catch {}
}
function _clearPollFromStorage() {
  try { chrome.storage.local.remove('hs_active_poll') } catch {}
}

// Recompute remainingDurationMilliseconds from startedAt + durationSeconds
function _refreshPollTiming(poll) {
  if (!poll?.startedAt || !poll?.durationSeconds) return poll
  const elapsed = Date.now() - new Date(poll.startedAt).getTime()
  const totalMs = poll.durationSeconds * 1000
  poll.remainingDurationMilliseconds = Math.max(0, totalMs - elapsed)
  // Auto-mark as completed if time expired
  if (poll.remainingDurationMilliseconds <= 0 && poll.status === 'ACTIVE') {
    poll.status = 'COMPLETED'
  }
  return poll
}

async function fetchPoll(channelLogin) {
  const safe = channelLogin.replace(/[^a-z0-9_]/g, '')
  if (!safe) return null
  try {
    // 1. Check GQL interception cache (from Twitch's own traffic)
    for (const key of ['ActivePoll', 'ChannelPollContext']) {
      const c = _gqlDataCache[key]
      if (c && Date.now() - c.ts < 15000) {
        const poll = c.data?.user?.activePoll || c.data?.channel?.activePoll || null
        if (poll) {
          _refreshPollTiming(poll)
          _savePollToStorage(poll, c.data?.user?.id || _twitchChannelId)
          const isMod = c.data?.user?.self?.isModerator || _twitchIsMod
          return { poll, channelId: c.data?.user?.id || _twitchChannelId, isMod }
        }
      }
    }
    // 2. Check persistent storage (survives reloads, no 15s TTL)
    //    activePoll is persisted-query-only — no public GQL query exists
    try {
      const stored = await chrome.storage.local.get('hs_active_poll')
      const entry = stored?.hs_active_poll
      if (entry?.poll && entry.channelId === _twitchChannelId) {
        const poll = _refreshPollTiming(entry.poll)
        // Clear expired/completed polls from storage
        if (poll.status === 'COMPLETED' || poll.status === 'ARCHIVED' || poll.status === 'TERMINATED') {
          _clearPollFromStorage()
        } else {
          return { poll, channelId: entry.channelId, isMod: _twitchIsMod }
        }
      }
    } catch {}
    return { poll: null, channelId: _twitchChannelId, isMod: _twitchIsMod }
  } catch (e) {
    log('Failed to fetch poll:', e.message)
    return null
  }
}

async function votePoll(pollId, choiceId) {
  const token = getTwitchAuthToken()
  if (!token) return { error: 'not logged in' }
  try {
    // Try proxy first
    try {
      const data = await gqlProxy('VotePoll', {
        input: { pollID: pollId, choiceID: choiceId }
      })
      const d = Array.isArray(data) ? data[0] : data
      if (d?.errors?.length) return { error: d.errors[0].message }
      const err = d?.data?.votePoll?.error
      if (err) return { error: err.code || 'vote failed' }
      return { ok: true }
    } catch(proxyErr) {
      // Fallback to raw GQL
      const resp = await fetch(TWITCH_GQL, {
        method: 'POST',
        headers: {
          'Client-Id': TWITCH_CLIENT_ID,
          'Content-Type': 'application/json',
          'Authorization': 'OAuth ' + token
        },
        body: JSON.stringify({
          query: 'mutation($input: VotePollInput!) { votePoll(input: $input) { error { code } } }',
          variables: { input: { pollID: pollId, choiceID: choiceId } }
        })
      })
      if (!resp.ok) return { error: 'HTTP ' + resp.status }
      const data = await resp.json()
      if (data?.errors?.length) return { error: data.errors[0].message }
      const err = data?.data?.votePoll?.error
      if (err) return { error: err.code || 'vote failed' }
      return { ok: true }
    }
  } catch (e) {
    return { error: e.message }
  }
}

const POLL_FIELDS = 'id title status durationSeconds remainingDurationMilliseconds startedAt choices { id title totalVoters } totalVoters'

async function createTwitchPoll(channelId, title, durationSeconds, choices) {
  const rawQuery = 'mutation($input: CreatePollInput!) { createPoll(input: $input) { poll { ' + POLL_FIELDS + ' } error { code } } }'
  const variables = { input: { ownedBy: channelId, title, choices: choices.map(t => ({ title: t })), durationSeconds } }
  try {
    const data = await gqlMutation(rawQuery, variables)
    const result = data?.data?.createPoll
    if (result?.error) return { error: result.error.code || 'create poll failed' }
    if (data?.errors?.length) return { error: data.errors[0].message || 'create poll failed' }
    const poll = result?.poll
    if (poll) {
      _gqlDataCache['ActivePoll'] = { data: { user: { activePoll: poll, id: channelId } }, ts: Date.now() }
      _savePollToStorage(poll, channelId)
    }
    return { ok: true, poll }
  } catch (e) {
    return { error: e.message }
  }
}

async function endTwitchPoll(pollId) {
  const rawQuery = 'mutation($input: TerminatePollInput!) { terminatePoll(input: $input) { poll { ' + POLL_FIELDS + ' } } }'
  const variables = { input: { pollID: pollId } }
  try {
    const data = await gqlMutation(rawQuery, variables)
    if (data?.errors?.length) return { error: data.errors[0].message || 'end poll failed' }
    const poll = data?.data?.terminatePoll?.poll
    if (poll) {
      _gqlDataCache['ActivePoll'] = { data: { user: { activePoll: poll, id: _twitchChannelId } }, ts: Date.now() }
    }
    _clearPollFromStorage()
    return { ok: true }
  } catch (e) {
    return { error: e.message }
  }
}

let _userPollVotes = new Map() // pollId → choiceId

function renderPoll(poll, channelId, isMod) {
  const section = document.createElement('div')
  section.className = 'hs-mc-poll'
  section.dataset.pollId = poll.id
  if (channelId) section.dataset.channelId = channelId

  const isCompleted = poll.status === 'COMPLETED' || poll.status === 'ARCHIVED'
  const totalVotes = poll.totalVoters || poll.choices.reduce((s, c) => s + (c.totalVoters || 0), 0)
  const userVote = _userPollVotes.get(poll.id)

  // Header
  const header = document.createElement('div')
  header.className = 'hs-mc-poll-header'
  const title = document.createElement('div')
  title.className = 'hs-mc-poll-title'
  title.textContent = poll.title
  header.appendChild(title)

  if (isCompleted) {
    const badge = document.createElement('span')
    badge.className = 'hs-mc-poll-status hs-mc-poll-status-ended'
    badge.textContent = t('mc_poll_ended')
    header.appendChild(badge)
  } else if (poll.remainingDurationMilliseconds != null) {
    const timer = document.createElement('span')
    timer.className = 'hs-mc-poll-timer'
    timer.dataset.ends = Date.now() + poll.remainingDurationMilliseconds
    header.appendChild(timer)
  }
  section.appendChild(header)

  // Total votes
  const meta = document.createElement('div')
  meta.className = 'hs-mc-poll-meta'
  meta.textContent = totalVotes + ' vote' + (totalVotes !== 1 ? 's' : '')
  section.appendChild(meta)

  // Choices
  const choicesWrap = document.createElement('div')
  choicesWrap.className = 'hs-mc-poll-choices'

  // Find top choice for winner highlight
  let topVotes = 0
  for (const c of poll.choices) {
    if ((c.totalVoters || 0) > topVotes) topVotes = c.totalVoters || 0
  }

  for (const choice of poll.choices) {
    const votes = choice.totalVoters || 0
    const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0
    const isTop = isCompleted && votes === topVotes && topVotes > 0
    const isVoted = userVote === choice.id

    const row = document.createElement('div')
    row.className = 'hs-mc-poll-choice' + (isTop ? ' hs-mc-poll-choice-top' : '') + (isVoted ? ' hs-mc-poll-choice-voted' : '')

    const track = document.createElement('div')
    track.className = 'hs-mc-poll-choice-track'
    const fill = document.createElement('div')
    fill.className = 'hs-mc-poll-choice-fill'
    fill.style.width = pct + '%'
    track.appendChild(fill)

    const label = document.createElement('div')
    label.className = 'hs-mc-poll-choice-label'

    const nameSpan = document.createElement('span')
    nameSpan.className = 'hs-mc-poll-choice-name'
    nameSpan.textContent = choice.title
    if (isVoted) {
      const check = document.createElement('span')
      check.className = 'hs-mc-poll-voted-check'
      check.textContent = ' \u2713'
      nameSpan.appendChild(check)
    }
    label.appendChild(nameSpan)

    const pctSpan = document.createElement('span')
    pctSpan.className = 'hs-mc-poll-choice-pct'
    pctSpan.textContent = pct + '%'
    label.appendChild(pctSpan)

    track.appendChild(label)
    row.appendChild(track)

    if (!isCompleted && !userVote) {
      const voteBtn = document.createElement('button')
      voteBtn.className = 'hs-mc-poll-vote-btn'
      voteBtn.dataset.pollId = poll.id
      voteBtn.dataset.choiceId = choice.id
      voteBtn.textContent = 'vote'
      row.appendChild(voteBtn)
    }

    choicesWrap.appendChild(row)
  }

  section.appendChild(choicesWrap)

  // Mod controls — end poll
  if (!isCompleted && isMod) {
    const modRow = document.createElement('div')
    modRow.className = 'hs-mc-poll-mod-row'
    const endBtn = document.createElement('button')
    endBtn.className = 'hs-mc-poll-mod-btn hs-mc-poll-end-btn'
    endBtn.dataset.pollId = poll.id
    endBtn.textContent = t('mc_poll_end')
    modRow.appendChild(endBtn)
    section.appendChild(modRow)
  }

  return section
}

function renderNoPoll(channelId, isMod) {
  const wrap = document.createElement('div')
  wrap.className = 'hs-mc-poll-empty'
  if (!isMod) return wrap

  const createWrap = document.createElement('div')
  createWrap.className = 'hs-mc-poll-create'
  if (channelId) createWrap.dataset.channelId = channelId

  const toggle = document.createElement('button')
  toggle.className = 'hs-mc-poll-mod-btn hs-mc-poll-create-toggle'
  toggle.textContent = t('mc_poll_new')
  createWrap.appendChild(toggle)

  const form = document.createElement('div')
  form.className = 'hs-mc-poll-create-form'
  form.style.display = 'none'

  const titleInput = document.createElement('input')
  titleInput.className = 'hs-mc-poll-create-input'
  titleInput.placeholder = t('mc_poll_question')
  titleInput.maxLength = 60
  form.appendChild(titleInput)

  for (let i = 0; i < 4; i++) {
    const opt = document.createElement('input')
    opt.className = 'hs-mc-poll-create-input hs-mc-poll-create-choice'
    opt.placeholder = t('mc_poll_choice', [String(i + 1)]) + (i < 2 ? '' : ' (' + t('mc_poll_optional') + ')')
    opt.maxLength = 25
    form.appendChild(opt)
  }

  const durRow = document.createElement('div')
  durRow.className = 'hs-mc-poll-create-dur-row'
  const durLabel = document.createElement('span')
  durLabel.className = 'hs-mc-poll-create-dur-label'
  durLabel.textContent = t('mc_pred_duration')
  durRow.appendChild(durLabel)
  for (const secs of [30, 60, 120, 300, 600, 1800]) {
    const btn = document.createElement('button')
    btn.className = 'hs-mc-poll-create-dur' + (secs === 60 ? ' hs-mc-poll-create-dur-active' : '')
    btn.dataset.secs = secs
    btn.tabIndex = -1
    btn.textContent = secs < 60 ? secs + 's' : (secs / 60) + 'm'
    durRow.appendChild(btn)
  }
  form.appendChild(durRow)

  const submitBtn = document.createElement('button')
  submitBtn.className = 'hs-mc-poll-mod-btn hs-mc-poll-create-submit'
  submitBtn.tabIndex = -1
  submitBtn.textContent = t('mc_poll_create')
  form.appendChild(submitBtn)

  createWrap.appendChild(form)
  wrap.appendChild(createWrap)
  return wrap
}

// Optimistic UI update after voting — patch DOM immediately without round-trip
function optimisticPollVoteUpdate(pollSection, choiceId) {
  if (!pollSection) return
  const choices = pollSection.querySelectorAll('.hs-mc-poll-choice')
  const metaEl = pollSection.querySelector('.hs-mc-poll-meta')
  const totalMatch = metaEl?.textContent?.match(/(\d+)/)
  const oldTotal = totalMatch ? parseInt(totalMatch[1]) : 0

  // Reconstruct per-choice vote counts from percentages
  const entries = []
  for (const choice of choices) {
    const pctEl = choice.querySelector('.hs-mc-poll-choice-pct')
    const nameEl = choice.querySelector('.hs-mc-poll-choice-name')
    const voteBtn = choice.querySelector('.hs-mc-poll-vote-btn')
    const isTarget = voteBtn?.dataset?.choiceId === choiceId
    const oldPct = pctEl ? parseInt(pctEl.textContent) : 0
    let votes = oldTotal > 0 ? Math.round((oldPct / 100) * oldTotal) : 0
    if (isTarget) votes += 1
    entries.push({ choice, votes, pctEl, nameEl, voteBtn, isTarget })
  }

  const total = entries.reduce((s, v) => s + v.votes, 0) || 1
  if (metaEl) metaEl.textContent = total + ' vote' + (total !== 1 ? 's' : '')

  for (const { choice, votes, pctEl, nameEl, voteBtn, isTarget } of entries) {
    const pct = Math.round((votes / total) * 100)
    if (pctEl) pctEl.textContent = pct + '%'
    const fill = choice.querySelector('.hs-mc-poll-choice-fill')
    if (fill) fill.style.width = pct + '%'
    if (isTarget) {
      choice.classList.add('hs-mc-poll-choice-voted')
      if (nameEl && !nameEl.querySelector('.hs-mc-poll-voted-check')) {
        const check = document.createElement('span')
        check.className = 'hs-mc-poll-voted-check'
        check.textContent = ' \u2713'
        nameEl.appendChild(check)
      }
    }
    // Remove all vote buttons (user already voted)
    if (voteBtn) voteBtn.remove()
  }
}

function attachPollHandlers() {
  const container = document.getElementById('hs-mc-tab-twitch')
  if (!container) return

  container.querySelectorAll('.hs-mc-poll-vote-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      btn.disabled = true
      btn.textContent = '...'
      const result = await votePoll(btn.dataset.pollId, btn.dataset.choiceId)
      if (result.error) {
        btn.textContent = '!'
        btn.title = result.error
        setTimeout(() => { btn.textContent = 'vote'; btn.disabled = false; btn.title = '' }, 2000)
      } else {
        if (_userPollVotes.size > 50) _userPollVotes.delete(_userPollVotes.keys().next().value)
        _userPollVotes.set(btn.dataset.pollId, btn.dataset.choiceId)
        const pollSection = btn.closest('.hs-mc-poll')
        optimisticPollVoteUpdate(pollSection, btn.dataset.choiceId)
        setTimeout(() => refreshPollSlot(), 3000)
      }
    })
  })

  // End poll (mod)
  container.querySelectorAll('.hs-mc-poll-end-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      btn.disabled = true
      btn.textContent = '...'
      const result = await endTwitchPoll(btn.dataset.pollId)
      if (result.error) {
        btn.textContent = result.error
        btn.title = result.error
        setTimeout(() => { btn.textContent = t('mc_poll_end'); btn.disabled = false; btn.title = '' }, 3000)
      } else {
        btn.textContent = '\u2713'
        refreshPollSlot()
      }
    })
  })

  // Create poll toggle
  container.querySelectorAll('.hs-mc-poll-create-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const form = btn.parentElement.querySelector('.hs-mc-poll-create-form')
      if (form) {
        const showing = form.style.display !== 'none'
        form.style.display = showing ? 'none' : 'flex'
        btn.textContent = showing ? t('mc_poll_new') : t('mc_pred_cancel_form')
      }
    })
  })

  // Create poll duration picker
  container.querySelectorAll('.hs-mc-poll-create-dur').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      container.querySelectorAll('.hs-mc-poll-create-dur').forEach(b => b.classList.remove('hs-mc-poll-create-dur-active'))
      btn.classList.add('hs-mc-poll-create-dur-active')
    })
  })

  // Create poll submit
  container.querySelectorAll('.hs-mc-poll-create-submit').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const createWrap = btn.closest('.hs-mc-poll-create')
      const channelId = createWrap?.dataset.channelId
      if (!channelId) { btn.textContent = 'no channel'; return }
      const form = btn.closest('.hs-mc-poll-create-form')
      const inputs = form.querySelectorAll('.hs-mc-poll-create-input')
      const title = inputs[0]?.value?.trim()
      const choices = [...form.querySelectorAll('.hs-mc-poll-create-choice')].map(i => i.value.trim()).filter(Boolean)
      if (!title) { inputs[0].focus(); return }
      if (choices.length < 2) { form.querySelectorAll('.hs-mc-poll-create-choice')[choices.length]?.focus(); return }
      const durBtn = form.querySelector('.hs-mc-poll-create-dur-active')
      const secs = parseInt(durBtn?.dataset.secs || '60')
      btn.disabled = true
      btn.textContent = '...'
      const result = await createTwitchPoll(channelId, title, secs, choices)
      if (result.error) {
        const errMap = { POLL_ALREADY_ACTIVE: t('mc_error_poll_active'), FORBIDDEN: t('mc_error_no_permission'), UNAUTHORIZED: t('mc_error_not_logged_in') }
        const msg = errMap[result.error] || result.error
        btn.textContent = msg
        btn.title = result.error
        setTimeout(() => { btn.textContent = t('mc_poll_create'); btn.disabled = false; btn.title = '' }, 3000)
      } else {
        // Close create form so refreshPollSlot's guard doesn't skip
        form.style.display = 'none'
        refreshPollSlot()
      }
    })
  })

  // Create poll keyboard nav
  container.querySelectorAll('.hs-mc-poll-create-input').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault()
        const inputs = [...container.querySelectorAll('.hs-mc-poll-create-input')]
        const idx = inputs.indexOf(input)
        const next = inputs[(idx + 1) % inputs.length]
        next?.focus()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        container.querySelector('.hs-mc-poll-create-submit')?.click()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        container.querySelector('.hs-mc-poll-create-toggle')?.click()
      }
    })
  })

  // Poll timers
  container.querySelectorAll('.hs-mc-poll-timer').forEach(el => {
    const endsAt = parseInt(el.dataset.ends)
    const update = () => {
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
      if (remaining <= 0) {
        el.textContent = t('mc_poll_ended')
        el.classList.add('hs-mc-poll-status-ended')
        return
      }
      const m = Math.floor(remaining / 60)
      const s = remaining % 60
      el.textContent = m > 0 ? m + ':' + String(s).padStart(2, '0') : s + 's'
    }
    update()
    const iv = cleanup.setIntervalIfVisible(() => {
      if (!el.isConnected) { cleanup.clearInterval(iv); return }
      update()
    }, 1000)
  })
}

const badgesInFlight = new Set()
const badgesFailedAt = new Map()  // channelLogin -> ms (last failure) — LRU-capped at 100
const BADGE_FAILURE_BACKOFF_MS = 60000
const BADGES_FAILED_MAX = 100

async function fetchChannelBadges(channelLogin) {
  if (!channelLogin) return
  if (badgesFetchedChannels.has(channelLogin)) return
  if (badgesInFlight.has(channelLogin)) return
  // Backoff window after a failed fetch — without this, an early fetch that
  // failed (transient 5xx, network blip, empty data) used to permanently
  // poison the guard so badges fell back to the global star forever.
  const lastFail = badgesFailedAt.get(channelLogin)
  if (lastFail && Date.now() - lastFail < BADGE_FAILURE_BACKOFF_MS) return
  // Sanitize: Twitch logins are alphanumeric + underscore only
  const safe = channelLogin.replace(/[^a-z0-9_]/g, '')
  if (!safe) return
  badgesInFlight.add(channelLogin)
  let populated = false
  try {
    // Fetch channel badges (GQL broadcastBadges) + FFZ in parallel
    const [gqlResp, ffzResp] = await Promise.allSettled([
      twitchGql(`{ user(login:"${safe}") { broadcastBadges { imageURL(size: NORMAL) setID version } } }`),
      fetch(`https://api.frankerfacez.com/v1/room/${safe}`, { credentials: 'omit', signal: AbortSignal.timeout(5000) })
    ])

    // Channel badges via GQL broadcastBadges (no Client-Integrity needed)
    if (gqlResp.status === 'fulfilled') {
      const badges = gqlResp.value?.data?.user?.broadcastBadges
      if (badges?.length) {
        const versionsBySet = new Map()
        for (const b of badges) {
          if (b.imageURL) {
            twitchBadgeUrls.set(`${channelLogin}:${b.setID}/${b.version}`, b.imageURL)
            populated = true
          }
          const v = parseInt(b.version, 10)
          if (Number.isFinite(v)) {
            let arr = versionsBySet.get(b.setID)
            if (!arr) { arr = []; versionsBySet.set(b.setID, arr) }
            arr.push(v)
          }
        }
        for (const [setID, arr] of versionsBySet) {
          arr.sort((a, b) => a - b)
          channelBadgeVersions.set(`${channelLogin}:${setID}`, arr)
        }
      }
    }

    // FFZ custom mod/VIP badges — override Twitch versions
    if (ffzResp.status === 'fulfilled' && ffzResp.value.ok) {
      const ffz = await ffzResp.value.json()
      const room = ffz?.room
      if (room) {
        const modUrl = room.mod_urls?.['2'] || room.mod_urls?.['1'] || room.moderator_badge
        if (modUrl) {
          const src = modUrl.startsWith('//') ? 'https:' + modUrl : modUrl
          twitchBadgeUrls.set(`${channelLogin}:moderator/1`, src)
          ffzBadgeKeys.add(`${channelLogin}:moderator`)
          populated = true
        }
        const vipUrl = room.vip_badge?.['2'] || room.vip_badge?.['1']
        if (vipUrl) {
          const src = vipUrl.startsWith('//') ? 'https:' + vipUrl : vipUrl
          twitchBadgeUrls.set(`${channelLogin}:vip/1`, src)
          ffzBadgeKeys.add(`${channelLogin}:vip`)
          populated = true
        }
      }
    }

    if (populated) {
      badgesFetchedChannels.add(channelLogin)
      badgesFailedAt.delete(channelLogin)
      // Evict oldest channel if cache exceeds 20
      if (badgesFetchedChannels.size > 20) {
        const oldest = badgesFetchedChannels.values().next().value
        badgesFetchedChannels.delete(oldest)
        for (const key of twitchBadgeUrls.keys()) {
          if (key.startsWith(`${oldest}:`)) twitchBadgeUrls.delete(key)
        }
        for (const key of ffzBadgeKeys) {
          if (key.startsWith(`${oldest}:`)) ffzBadgeKeys.delete(key)
        }
        for (const key of channelBadgeVersions.keys()) {
          if (key.startsWith(`${oldest}:`)) channelBadgeVersions.delete(key)
        }
      }
      log('Loaded channel badges for', channelLogin)
      // Same cold-start race as global badges — bump epoch so messages from
      // this channel that already rendered with the text-fallback star get
      // rebuilt with the channel-specific image.
      if (typeof bumpRenderEpoch === 'function') bumpRenderEpoch()
      renderMessages(currentTab)
    } else {
      // No data populated — schedule retry after backoff
      if (badgesFailedAt.size >= BADGES_FAILED_MAX) {
        badgesFailedAt.delete(badgesFailedAt.keys().next().value)
      }
      badgesFailedAt.set(channelLogin, Date.now())
      log('No channel badges returned for', channelLogin, '— will retry after backoff')
    }
  } catch (e) {
    log('Failed to fetch channel badges:', e.message)
    if (badgesFailedAt.size >= BADGES_FAILED_MAX) {
      badgesFailedAt.delete(badgesFailedAt.keys().next().value)
    }
    badgesFailedAt.set(channelLogin, Date.now())
  } finally {
    badgesInFlight.delete(channelLogin)
  }
}

function renderBadges(badgesStr, channel) {
  if (!badgesStr) return ''
  return badgesStr.split(',').map(badge => {
    const [name, version] = badge.split('/')
    // Channel-specific exact match → channel-specific nearest-tier (e.g. 5mo
    // sub on a channel that only defines 0/3/6 → use 3) → global exact →
    // global "/1" generic-star fallback.
    let url = channel && twitchBadgeUrls.get(`${channel}:${name}/${version}`)
    if (!url && channel) {
      const nearest = findNearestChannelBadgeVersion(channel, name, version)
      if (nearest != null) url = twitchBadgeUrls.get(`${channel}:${name}/${nearest}`)
    }
    url = url
      || twitchBadgeUrls.get(`${name}/${version}`)
      || twitchBadgeUrls.get(`${name}/1`)
    if (url) {
      // FFZ custom badges are white icons on transparent bg — add badge-type background
      const ffzKey = channel && `${channel}:${name}/`
      const isFFZ = ffzKey && ffzBadgeKeys.has(`${channel}:${name}`)
      const bgStyle = isFFZ && BADGE_STYLES[name] ? `background:${BADGE_STYLES[name].bg};padding:1px;border-radius:2px;` : ''
      const label = BADGE_STYLES[name]?.label || name
      return `<img class="hs-mc-badge-img" src="${escapeHtml(url)}" alt="${escapeHtml(name)}" title="${escapeHtml(label)}" loading="lazy" decoding="async" width="18" height="18" style="width:18px;height:18px;${bgStyle}">`
    }
    // Text fallback
    const style = BADGE_STYLES[name]
    if (!style) return ''
    return `<span class="hs-mc-badge" style="background:${style.bg};color:${style.fg}" title="${escapeHtml(style.label)}">${style.label}</span>`
  }).join('')
}

function renderThirdPartyBadges(userId) {
  if (!userId) return ''
  let html = ''
  const bttv = mcBttvBadgeMap.get(userId)
  if (bttv) {
    html += `<img class="hs-mc-badge-img" src="${escapeHtml(bttv.url)}" alt="${escapeHtml(bttv.description)}" title="${escapeHtml(bttv.description)}" loading="lazy" decoding="async" width="18" height="18" style="width:18px;height:18px;">`
  }
  const ffzList = mcFfzBadgeMap.get(userId)
  if (ffzList) {
    for (const b of ffzList) {
      const safeColor = /^#[0-9a-fA-F]{3,8}$/.test(b.color) ? b.color : ''
      html += `<img class="hs-mc-badge-img" src="${escapeHtml(b.url)}" alt="${escapeHtml(b.title)}" title="${escapeHtml(b.title)}" loading="lazy" decoding="async" width="18" height="18" style="width:18px;height:18px;${safeColor ? 'background:' + safeColor + ';border-radius:2px;' : ''}">`
    }
  }
  const chat = mcChatterinoBadgeMap.get(userId)
  if (chat) {
    html += `<img class="hs-mc-badge-img" src="${escapeHtml(chat.url)}" alt="Chatterino" title="${escapeHtml(chat.tooltip || 'Chatterino')}" loading="lazy" decoding="async" width="18" height="18" style="width:18px;height:18px;">`
  }
  const cosmetic = mcUserCosmetics.get(userId)
  if (cosmetic?.badge) {
    const files = cosmetic.badge.host?.files || []
    const file = files.find(f => f.name?.endsWith('.webp')) || files.find(f => f.name?.endsWith('.avif')) || files[0]
    if (file) {
      const base = cosmetic.badge.host?.url || ''
      // 7TV returns protocol-relative URLs (//cdn.7tv.app/...) — promote to https
      // before validation so safeUrl doesn't drop them.
      const absBase = base.startsWith('//') ? 'https:' + base : base
      const rawUrl = (absBase.endsWith('/') ? absBase : absBase + '/') + file.name
      const url = safeUrl(rawUrl)
      if (url) {
        // Class includes hs-mc-7tv-badge so updateCosmeticsInPlace's dedup
        // selector finds it and doesn't insert a duplicate when the async
        // cosmetic fetch resolves after the inline render.
        html += `<img class="hs-mc-badge-img hs-mc-7tv-badge" src="${escapeHtml(url)}" alt="7TV" title="${escapeHtml(cosmetic.badge.tooltip || '7TV')}" loading="lazy" decoding="async" width="18" height="18" style="width:18px;height:18px;">`
      }
    }
  }
  return html
}

// ═══ Followage Lookup ═══

const _followageCache = new Map() // "user:channel" → { result, ts }
const FOLLOWAGE_CACHE_TTL = 300000 // 5min

async function lookupFollowage(username, channelLogin) {
  if (!username || !channelLogin) return null
  if (username.toLowerCase() === channelLogin.toLowerCase()) return null
  const key = `${username.toLowerCase()}:${channelLogin.toLowerCase()}`
  const cached = _followageCache.get(key)
  if (cached && Date.now() - cached.ts < FOLLOWAGE_CACHE_TTL) return cached.result

  try {
    // Try server-side API first (works everywhere, including multichat on heatsync.org)
    const resp = typeof apiFetch === 'function'
      ? await apiFetch(`/api/twitch/followage?user=${encodeURIComponent(username)}&channel=${encodeURIComponent(channelLogin)}`)
      : null
    if (resp?.ok && resp.data) {
      const d = resp.data
      const result = {
        followedAt: d.followedAt || null,
        followerCount: d.followerCount ?? null,
        channelFollowedAt: d.channelFollowedAt || null,
      }
      _followageCache.set(key, { result, ts: Date.now() })
      if (_followageCache.size > 500) {
        _followageCache.delete(_followageCache.keys().next().value)
      }
      return result
    }

    // Fallback: direct GQL proxy (works on Twitch tabs with MAIN world script)
    const safeUser = username.replace(/[^a-z0-9_]/gi, '')
    const safeChan = channelLogin.replace(/[^a-z0-9_]/gi, '')
    const data = await gqlProxy(null, null, {
      rawQuery: `{ user(login: "${safeUser}") { follow(targetLogin: "${safeChan}") { followedAt } followers { totalCount } } channel: user(login: "${safeChan}") { follow(targetLogin: "${safeUser}") { followedAt } } }`
    })
    const user = data?.data?.user
    const result = {
      followedAt: user?.follow?.followedAt || null,
      followerCount: user?.followers?.totalCount ?? null,
      channelFollowedAt: data?.data?.channel?.follow?.followedAt || null,
    }
    _followageCache.set(key, { result, ts: Date.now() })
    if (_followageCache.size > 500) {
      _followageCache.delete(_followageCache.keys().next().value)
    }
    return result
  } catch {
    return null
  }
}

// ═══ Mod actions (ban/unban/timeout/delete) ═══
// Twitch deprecated /ban /unban /timeout /clear /delete and most mod chat commands
// via IRC PRIVMSG in Feb 2023; sending them as text now silently no-ops. We route
// via the existing apolloMutate → gqlMutation fallback chain (same pattern as
// predictionMutation), so the user's normal Twitch session integrity covers it.
// Mutation names (Chat_BanUserFromChatRoom etc.) are the long-standing ones used
// by Twitch's own web client and reflected in FFZ/Chatterino integrations.

const _twChannelIdCache = new Map() // login(lc) → { id, ts }

async function resolveTwitchChannelId(channelLogin) {
  const lc = (channelLogin || '').toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_]/g, '')
  if (!lc) return null
  const cached = _twChannelIdCache.get(lc)
  if (cached && Date.now() - cached.ts < 3600000) return cached.id
  try {
    const r = await fetch(`https://decapi.me/twitch/id/${encodeURIComponent(lc)}`, { credentials: 'omit' })
    const body = (await r.text()).trim()
    if (r.ok && /^\d+$/.test(body)) {
      _twChannelIdCache.set(lc, { id: body, ts: Date.now() })
      return body
    }
  } catch (_) {}
  try {
    const data = await gqlProxy(null, null, { rawQuery: `{ user(login: "${lc}") { id } }` })
    const id = data?.data?.user?.id || (Array.isArray(data) ? data[0]?.data?.user?.id : null)
    if (id) {
      _twChannelIdCache.set(lc, { id, ts: Date.now() })
      return id
    }
  } catch (_) {}
  return null
}

// Server kill-switch — refuses every mod mutation when the 'mutations' feature
// is flagged. Used when a regression in our ban/timeout pipeline is shipping
// false-positive actions; flip the server flag, no extension update needed.
function _isMutationsKilled() {
  try {
    const h = (typeof window !== 'undefined' && window.__hsHealth) || null
    return !!(h && (h.kill || (Array.isArray(h.disabled) && h.disabled.includes('mutations'))))
  } catch { return false }
}

async function _modActionMutation(searchTerm, resultField, rawQuery, variables) {
  if (_isMutationsKilled()) return { error: 'mod actions disabled by server' }
  // Off-Twitch (Kick/YouTube pages): relay through a twitch.tv tab — Apollo +
  // Client-Integrity only exist in Twitch's page context. The relay runs this
  // same function inside the Twitch tab and returns the result.
  if (!_isOnTwitchPage()) {
    const resp = await safeSendMessage({
      type: 'twitch_relay',
      op: 'mod_action',
      args: { searchTerm, resultField, rawQuery, variables }
    })
    if (resp?.ok && resp.result) return resp.result
    if (resp?.error === 'no_twitch_tab')   return { error: 'open a twitch.tv tab to use mod actions' }
    if (resp?.error === 'stale_twitch_tab') return { error: 'refresh your twitch.tv tab (extension was updated)' }
    return { error: resp?.error || 'relay failed' }
  }
  const apolloResult = await apolloMutate({ searchTerm, variables, resultField, rawQuery })
  if (apolloResult.ok) return { ok: true }
  try {
    const data = await gqlMutation(rawQuery, variables)
    if (data?.errors?.length) return { error: data.errors[0].message || `${resultField} failed` }
    const err = data?.data?.[resultField]?.error
    if (err) return { error: err.code || `${resultField} failed` }
    return { ok: true }
  } catch (e) {
    return { error: apolloResult.error || e.message }
  }
}

// Twitch-tab-only: respond to relay requests from off-Twitch pages.
// Runs ban/timeout/delete/follow locally (has integrity), returns the result.
if (_isOnTwitchPage() && typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== 'twitch_relay_exec') return false
    ;(async () => {
      try {
        if (msg.op === 'mod_action') {
          const { searchTerm, resultField, rawQuery, variables } = msg.args || {}
          const result = await _modActionMutation(searchTerm, resultField, rawQuery, variables)
          sendResponse({ ok: true, result })
        } else if (msg.op === 'follow_action') {
          const { targetID, follow, disableNotifications } = msg.args || {}
          const result = await _followMutation(targetID, follow, disableNotifications)
          sendResponse({ ok: true, result })
        } else {
          sendResponse({ ok: false, error: 'unknown op' })
        }
      } catch (e) {
        sendResponse({ ok: false, error: e.message })
      }
    })()
    return true
  })
}

// Twitch follow / unfollow mutation. On a twitch.tv page, fires the persisted
// query through the MAIN-world GQL proxy (handles auth + integrity + hash
// rotation). Off-twitch, relays through a twitch.tv tab — the MAIN world
// only exists on twitch.tv so a relay is mandatory. No-tab → queueable.
//
// IMPORTANT: must call gqlProxy with operationName + variables ONLY (no
// rawQuery). The MAIN-world handler explicitly rejects rawQuery messages for
// security; it serves persisted queries via gql.hashes lookup. The
// FollowButton_FollowUser / FollowButton_UnfollowUser hashes are seeded in
// early-inject-main.js and auto-updated from page traffic.
//
// Idempotency: TARGET_ALREADY_FOLLOWED / TARGET_NOT_FOLLOWED treated as
// success so heatsync→twitch state stays consistent across retries.
async function _followMutation(targetID, follow, disableNotifications) {
  if (!targetID) return { error: 'no target id' }
  const operationName = follow ? 'FollowButton_FollowUser' : 'FollowButton_UnfollowUser'
  const resultField = follow ? 'followUser' : 'unfollowUser'
  const variables = follow
    ? { input: { targetID: String(targetID), disableNotifications: !!disableNotifications } }
    : { input: { targetID: String(targetID) } }

  if (!_isOnTwitchPage()) {
    const resp = await safeSendMessage({
      type: 'twitch_relay',
      op: 'follow_action',
      args: { targetID, follow, disableNotifications }
    })
    if (resp?.ok && resp.result) return resp.result
    if (resp?.error === 'no_twitch_tab')   return { error: 'no_twitch_tab', queueable: true }
    if (resp?.error === 'stale_twitch_tab') return { error: 'stale_twitch_tab', queueable: true }
    return { error: resp?.error || 'relay failed', queueable: true }
  }

  // On Twitch: gqlProxy with operation name + variables (no rawQuery — MAIN
  // world rejects rawQuery for security). Hash + integrity attached server-side
  // by executeGqlProxy in early-inject-main.js.
  try {
    const data = await gqlProxy(operationName, variables)
    const d = Array.isArray(data) ? data[0] : data
    if (d?.errors?.length) {
      const msg = String(d.errors[0].message || '').toLowerCase()
      if (msg.includes('already') || msg.includes('not followed') || msg.includes('not following')) {
        return { ok: true, idempotent: true }
      }
      return { error: d.errors[0].message || (resultField + ' failed') }
    }
    const err = d?.data?.[resultField]?.error
    if (err) {
      const code = String(err.code || '')
      if (code === 'TARGET_ALREADY_FOLLOWED' || code === 'TARGET_NOT_FOLLOWED') return { ok: true, idempotent: true }
      if (code === 'TARGET_TWO_FACTOR_REQUIRED') return { error: '2fa_required' }
      return { error: code || (resultField + ' failed') }
    }
    return { ok: true }
  } catch (e) {
    const msg = String(e?.message || '').toLowerCase()
    // Hash missing from MAIN-world gql.hashes — Twitch may have rotated.
    // Auto-capture will eventually update; queue so next attempt uses fresh hash.
    if (msg.includes('no hash') || msg.includes('hash not available')) {
      return { error: 'twitch_hash_stale', queueable: true }
    }
    if (msg.includes('timeout')) return { error: 'twitch_gql_timeout', queueable: true }
    return { error: e?.message || 'twitch follow failed', queueable: true }
  }
}

async function followTwitchUserById(targetID, follow = true, disableNotifications = false) {
  return _followMutation(targetID, follow, disableNotifications)
}

async function banTwitchUser(channelLogin, targetLogin, reason) {
  const channelID = await resolveTwitchChannelId(channelLogin)
  if (!channelID) return { error: 'channel not found' }
  const bannedUserLogin = (targetLogin || '').toLowerCase().replace(/^@/, '')
  if (!bannedUserLogin) return { error: 'no target user' }
  return _modActionMutation(
    'Chat_BanUserFromChatRoom', 'banUserFromChatRoom',
    'mutation($input: BanUserFromChatRoomInput!) { banUserFromChatRoom(input: $input) { error { code } } }',
    { input: { channelID, bannedUserLogin, expiresIn: null, reason: reason || '' } }
  )
}

async function timeoutTwitchUser(channelLogin, targetLogin, durationSec, reason) {
  const channelID = await resolveTwitchChannelId(channelLogin)
  if (!channelID) return { error: 'channel not found' }
  const bannedUserLogin = (targetLogin || '').toLowerCase().replace(/^@/, '')
  if (!bannedUserLogin) return { error: 'no target user' }
  return _modActionMutation(
    'Chat_BanUserFromChatRoom', 'banUserFromChatRoom',
    'mutation($input: BanUserFromChatRoomInput!) { banUserFromChatRoom(input: $input) { error { code } } }',
    { input: { channelID, bannedUserLogin, expiresIn: Math.max(1, durationSec | 0), reason: reason || '' } }
  )
}

async function unbanTwitchUser(channelLogin, targetLogin) {
  const channelID = await resolveTwitchChannelId(channelLogin)
  if (!channelID) return { error: 'channel not found' }
  const bannedUserLogin = (targetLogin || '').toLowerCase().replace(/^@/, '')
  if (!bannedUserLogin) return { error: 'no target user' }
  return _modActionMutation(
    'Chat_UnbanUserFromChatRoom', 'unbanUserFromChatRoom',
    'mutation($input: UnbanUserFromChatRoomInput!) { unbanUserFromChatRoom(input: $input) { error { code } } }',
    { input: { channelID, bannedUserLogin } }
  )
}

async function deleteTwitchMessage(channelLogin, messageID) {
  const channelID = await resolveTwitchChannelId(channelLogin)
  if (!channelID) return { error: 'channel not found' }
  if (!messageID) return { error: 'no message id' }
  return _modActionMutation(
    'Chat_DeleteChatMessage', 'deleteChatMessage',
    'mutation($input: DeleteChatMessageInput!) { deleteChatMessage(input: $input) { error { code } } }',
    { input: { channelID, messageID } }
  )
}
