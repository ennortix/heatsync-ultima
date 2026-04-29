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

  const items = [
    { action: 'clip', accent: '#bf94ff', icon: '<svg width="16" height="16" viewBox="0 0 20 20"><path fill="currentColor" d="M18 7h-2V5a2 2 0 00-2-2H6a2 2 0 00-2 2v2H2v4l8 6 8-6V7zM6 5h8v2H6V5z"/></svg>', label: 'create clip' },
    { action: 'popout', accent: '#4a90d9', icon: '<svg width="16" height="16" viewBox="0 0 20 20"><path fill="currentColor" d="M4 4h6v2H6v8h8v-4h2v6H4V4zm8 0h4v4h-2V6.41l-4.3 4.3-1.4-1.42L12.58 6H11V4z"></path></svg>', label: 'popout chat' },
    { action: 'mod', accent: '#00c8af', icon: '<svg width="16" height="16" viewBox="0 0 20 20"><path fill="currentColor" d="M10 2l6 2.7V9c0 4.4-2.5 8.3-6 10-3.5-1.7-6-5.6-6-10V4.7L10 2z"/></svg>', label: 'mod view' }
  ]

  for (const item of items) {
    const el = document.createElement('div')
    el.className = 'hs-mc-menu-item hs-mc-pred-link'
    el.dataset.action = item.action
    el.style.setProperty('--menu-accent', item.accent)
    // Static HTML with SVG icons only — no dynamic values, safe innerHTML
    el.innerHTML = `<div class="hs-mc-menu-icon">${item.icon}</div><div class="hs-mc-menu-text"><div class="hs-mc-menu-title">${item.label}</div></div><svg class="hs-mc-menu-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`
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
        showToast('color: ' + color)
        const el = document.getElementById('hs-mc-current-color')
        if (el) { el.style.backgroundColor = swatch.style.backgroundColor; el.title = color }
      } else {
        showToast('color failed: ' + (resp.error || 'unknown'))
      }
    })
  })

  // Custom hex
  const hexBtn = document.getElementById('hs-mc-color-hex-btn')
  const hexInput = document.getElementById('hs-mc-color-hex-input')
  if (hexBtn && hexInput) {
    hexBtn.addEventListener('click', async () => {
      const color = hexInput.value.trim()
      if (!/^#[0-9a-f]{6}$/i.test(color)) { showToast('invalid hex — use #RRGGBB'); return }
      const resp = await helixRequest(`https://api.twitch.tv/helix/chat/color?user_id={me}&color=${encodeURIComponent(color)}`, 'PUT')
      if (resp.ok) {
        showToast('color: ' + color)
        const el = document.getElementById('hs-mc-current-color')
        if (el) { el.style.backgroundColor = color; el.title = color }
      } else {
        showToast('color failed: ' + (resp.error || 'color change failed'))
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
        showToast('mode failed: ' + (resp.error || 'unknown'))
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
    const iv = cleanup.setInterval(() => {
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

  // Quick link handlers
  container.querySelectorAll('.hs-mc-pred-link').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation()
      triggerTwitchFeature(item.dataset.action)
    })
  })

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
        try {
          optimisticBetUpdate(container, btn.dataset.outcome, betPoints)
        } catch (e) {
          console.error('[hs-pred] optimistic update failed:', e)
        }
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
    const iv = cleanup.setInterval(() => {
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
  _bannerTimers.push(cleanup.setInterval(() => {
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
  const ch = config.channels.find(c => (typeof c === 'string' ? c : c.id) === currentTab)
  if (!ch) return getLiveChannel()
  return typeof ch === 'string' ? ch : ch.twitch || ch.id
}

async function renderTwitchTab() {
  const container = document.getElementById('hs-mc-tab-twitch')
  if (!container) return

  const channel = getActiveTwitchChannel()

  // YouTube/Kick: Twitch features (predictions, polls, rewards, color, clips) require
  // the Twitch page context (auth cookie + GQL proxy). Show what's available instead.
  if (hostPlatform === 'yt' || hostPlatform === 'kick') {
    container.textContent = ''
    const notice = document.createElement('div')
    notice.className = 'hs-mc-pred-empty'
    notice.style.cssText = 'padding:20px;text-align:center;'
    const msg = document.createElement('div')
    msg.className = 'hs-mc-pred-empty-text'
    msg.textContent = hostPlatform === 'yt'
      ? 'twitch features (predictions, polls, rewards, clips) are available when viewing on twitch'
      : 'some features require the twitch page'
    notice.appendChild(msg)
    container.appendChild(notice)
    // Popout chat still works — opens in new window
    if (channel) {
      container.appendChild(renderQuickLinks())
    }
    return
  }

  if (!channel) {
    container.textContent = ''
    const empty = document.createElement('div')
    empty.className = 'hs-mc-pred-empty'
    const msg = document.createElement('div')
    msg.className = 'hs-mc-pred-empty-text'
    msg.textContent = 'no channel detected'
    empty.appendChild(msg)
    container.appendChild(empty)
    container.appendChild(renderQuickLinks())
    return
  }

  _predictionChannel = channel

  container.textContent = ''

  // Placeholder slots for progressive rendering
  const predSlot = document.createElement('div')
  predSlot.className = 'hs-mc-pred-loading'
  predSlot.dataset.predSlot = '1'
  predSlot.textContent = 'loading...'
  const pollSlot = document.createElement('div')
  pollSlot.dataset.pollSlot = '1'
  const rewardsSlot = document.createElement('div')
  container.appendChild(predSlot)
  container.appendChild(pollSlot)
  container.appendChild(rewardsSlot)

  // Color picker + links rendered immediately (no network needed)
  container.appendChild(renderColorPicker())
  const modesSlot = document.createElement('div')
  container.appendChild(modesSlot)
  container.appendChild(renderQuickLinks())
  attachColorHandlers()

  // Chat modes (non-blocking)
  renderChatModes(channel).then(modesEl => {
    if (modesEl) {
      modesSlot.appendChild(modesEl)
      attachModeHandlers()
    }
  })

  // Fetch all in parallel, render each as it arrives
  const modBefore = _twitchIsMod
  fetchPrediction(channel).then(result => {
    _lastPredResult = result
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
    // If prediction fetch revealed mod status, refresh poll slot to show mod controls
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
      claimCommunityPoints(rewardsResult.availableClaim, rewardsResult.channelId)
    }
    if (rewardsResult?.rewards?.length) {
      rewardsSlot.appendChild(renderRewards(rewardsResult.rewards, rewardsResult.balance, rewardsResult.channelId))
      attachRewardHandlers()
    }
  })

  startPredictionPoll()
}

function startPredictionPoll() {
  stopPredictionPoll()
  _predictionPollTimer = cleanup.setInterval(() => {
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

function triggerTwitchFeature(action) {
  const channel = getActiveTwitchChannel() || getCurrentChannel();
  if (!channel) return false;

  if (action === 'clip') {
    // Create clip via Helix API
    ;(async () => {
      const userResp = await helixRequest(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(channel)}`)
      if (!userResp.ok || !userResp.data?.data?.[0]) { showToast('could not resolve channel'); return }
      const broadcasterId = userResp.data.data[0].id
      const resp = await helixRequest(`https://api.twitch.tv/helix/clips?broadcaster_id=${broadcasterId}`, 'POST')
      if (resp.ok && resp.data?.data?.[0]) {
        const editUrl = resp.data.data[0].edit_url
        const clipId = resp.data.data[0].id
        showToast('clip created! ' + clipId)
        // Copy clip URL to clipboard
        try { await navigator.clipboard.writeText(editUrl || `https://clips.twitch.tv/${clipId}`) } catch {}
      } else {
        showToast('clip failed: ' + (resp.error || 'stream must be live'))
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
  if (e.origin !== location.origin) return
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

// Request cached data from MAIN world
function gqlGetCache(operations) {
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2)
    const ac = new AbortController()
    const signal = mcSignal ? AbortSignal.any([mcSignal, ac.signal]) : ac.signal
    const handler = (e) => {
      if (e.source !== window || e.origin !== location.origin) return
      if (e.data?.type === 'heatsync-gql-cache-response' && e.data.id === id) {
        ac.abort()
        clearTimeout(timer)
        resolve(e.data)
      }
    }
    window.addEventListener('message', handler, { signal })
    window.postMessage({ type: 'heatsync-gql-get-cache', id, operations }, location.origin)
    const timer = setTimeout(() => {
      ac.abort()
      resolve({ data: {}, hashes: [] })
    }, 3000)
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
    if (!resp.ok) return
    const data = await resp.json()
    const badges = data?.data?.badges
    if (!badges) return
    for (const b of badges) {
      twitchBadgeUrls.set(`${b.setID}/${b.version}`, b.imageURL)
    }
    log('Loaded global badges:', twitchBadgeUrls.size)
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

// GQL call — tries direct fetch first (Chrome MV3), falls back to MAIN world proxy (Firefox MV2)
async function twitchGql(query, variables) {
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

// Known working persisted query hashes (from Twitch's own client)
const TWITCH_HASHES = {
  MakePrediction: 'b44682ecc88358817009f20e69d75081b1e58825bb40aa53d5dbadcc17c881d8'
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

async function claimCommunityPoints(claimId, channelId) {
  const token = getTwitchAuthToken()
  if (!token) return
  try {
    await gqlProxy('ClaimCommunityPoints', {
      input: { claimID: claimId, channelID: channelId }
    }).catch(async () => {
      // Fallback to raw GQL
      await fetch(TWITCH_GQL, {
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
    })
  } catch (e) {
    log('Failed to claim bonus points:', e.message)
  }
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
    const iv = cleanup.setInterval(() => {
      if (!el.isConnected) { cleanup.clearInterval(iv); return }
      update()
    }, 1000)
  })
}

async function fetchChannelBadges(channelLogin) {
  if (!channelLogin || badgesFetchedChannels.has(channelLogin)) return
  // Sanitize: Twitch logins are alphanumeric + underscore only
  const safe = channelLogin.replace(/[^a-z0-9_]/g, '')
  if (!safe) return
  badgesFetchedChannels.add(channelLogin)
  // Evict oldest channel if cache exceeds 20
  if (badgesFetchedChannels.size > 20) {
    const oldest = badgesFetchedChannels.values().next().value;
    badgesFetchedChannels.delete(oldest);
    // Remove that channel's badge entries
    for (const key of twitchBadgeUrls.keys()) {
      if (key.startsWith(`${oldest}:`)) twitchBadgeUrls.delete(key);
    }
    for (const key of ffzBadgeKeys) {
      if (key.startsWith(`${oldest}:`)) ffzBadgeKeys.delete(key);
    }
  }
  try {
    // Fetch Twitch GQL + FFZ badges in parallel
    const [twitchResp, ffzResp] = await Promise.allSettled([
      fetch(TWITCH_GQL, {
        method: 'POST',
        headers: { 'Client-Id': TWITCH_CLIENT_ID, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `{ user(login: "${safe}") { broadcastBadges { imageURL(size: NORMAL) setID version } } }` }),
        signal: AbortSignal.timeout(5000)
      }),
      fetch(`https://api.frankerfacez.com/v1/room/${safe}`, { credentials: 'omit', signal: AbortSignal.timeout(5000) })
    ])

    // Twitch channel badges
    if (twitchResp.status === 'fulfilled' && twitchResp.value.ok) {
      const data = await twitchResp.value.json()
      const badges = data?.data?.user?.broadcastBadges
      if (badges) {
        for (const b of badges) {
          twitchBadgeUrls.set(`${channelLogin}:${b.setID}/${b.version}`, b.imageURL)
        }
      }
    }

    // FFZ custom mod/VIP badges — override Twitch versions
    if (ffzResp.status === 'fulfilled' && ffzResp.value.ok) {
      const ffz = await ffzResp.value.json()
      const room = ffz?.room
      if (room) {
        // Custom mod badge
        const modUrl = room.mod_urls?.['2'] || room.mod_urls?.['1'] || room.moderator_badge
        if (modUrl) {
          const src = modUrl.startsWith('//') ? 'https:' + modUrl : modUrl
          twitchBadgeUrls.set(`${channelLogin}:moderator/1`, src)
          ffzBadgeKeys.add(`${channelLogin}:moderator`)
        }
        // Custom VIP badge
        const vipUrl = room.vip_badge?.['2'] || room.vip_badge?.['1']
        if (vipUrl) {
          const src = vipUrl.startsWith('//') ? 'https:' + vipUrl : vipUrl
          twitchBadgeUrls.set(`${channelLogin}:vip/1`, src)
          ffzBadgeKeys.add(`${channelLogin}:vip`)
        }
      }
    }

    log('Loaded channel badges for', channelLogin)
    renderMessages(currentTab)
  } catch (e) {
    badgesFetchedChannels.delete(channelLogin)
    log('Failed to fetch channel badges:', e.message)
  }
}

function renderBadges(badgesStr, channel) {
  if (!badgesStr) return ''
  return badgesStr.split(',').map(badge => {
    const [name, version] = badge.split('/')
    // Channel-specific first, then global fallback
    const url = (channel && twitchBadgeUrls.get(`${channel}:${name}/${version}`))
      || twitchBadgeUrls.get(`${name}/${version}`)
      || twitchBadgeUrls.get(`${name}/1`)
    if (url) {
      // FFZ custom badges are white icons on transparent bg — add badge-type background
      const ffzKey = channel && `${channel}:${name}/`
      const isFFZ = ffzKey && ffzBadgeKeys.has(`${channel}:${name}`)
      const bgStyle = isFFZ && BADGE_STYLES[name] ? `background:${BADGE_STYLES[name].bg};padding:1px;border-radius:2px;` : ''
      const label = BADGE_STYLES[name]?.label || name
      return `<img class="hs-mc-badge-img" src="${escapeHtml(url)}" alt="${escapeHtml(name)}" title="${escapeHtml(label)}" style="width:18px;height:18px;${bgStyle}">`
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
    html += `<img class="hs-mc-badge-img" src="${escapeHtml(bttv.url)}" alt="${escapeHtml(bttv.description)}" title="${escapeHtml(bttv.description)}" style="width:18px;height:18px;">`
  }
  const ffzList = mcFfzBadgeMap.get(userId)
  if (ffzList) {
    for (const b of ffzList) {
      const safeColor = /^#[0-9a-fA-F]{3,8}$/.test(b.color) ? b.color : ''
      html += `<img class="hs-mc-badge-img" src="${escapeHtml(b.url)}" alt="${escapeHtml(b.title)}" title="${escapeHtml(b.title)}" style="width:18px;height:18px;${safeColor ? 'background:' + safeColor + ';border-radius:2px;' : ''}">`
    }
  }
  const chat = mcChatterinoBadgeMap.get(userId)
  if (chat) {
    html += `<img class="hs-mc-badge-img" src="${escapeHtml(chat.url)}" alt="Chatterino" title="${escapeHtml(chat.tooltip || 'Chatterino')}" style="width:18px;height:18px;">`
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
        html += `<img class="hs-mc-badge-img hs-mc-7tv-badge" src="${escapeHtml(url)}" alt="7TV" title="${escapeHtml(cosmetic.badge.tooltip || '7TV')}" style="width:18px;height:18px;">`
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
