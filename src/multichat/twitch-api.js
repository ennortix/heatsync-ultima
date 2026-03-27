// Twitch API - GQL proxy, badges, predictions, rewards, polls, Twitch tab UI

// ═══ Predictions & Betting ═══

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
  label.textContent = 'chat color'
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
  hexInput.placeholder = '#hex (turbo/sub)'
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
        showToast('color failed: ' + (resp.error || 'turbo/sub only for custom hex'))
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
  label.textContent = 'chat modes'
  header.appendChild(label)
  section.appendChild(header)

  const modes = [
    { key: 'emote_mode', label: 'emote only', field: 'emote_mode' },
    { key: 'follower_mode', label: 'follower', field: 'follower_mode' },
    { key: 'slow_mode', label: 'slow', field: 'slow_mode' },
    { key: 'subscriber_mode', label: 'sub only', field: 'subscriber_mode' },
    { key: 'unique_chat_mode', label: 'unique', field: 'unique_chat_mode' },
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

function renderPrediction(pred, balance) {
  const frag = document.createDocumentFragment()
  const isLocked = pred.status === 'LOCKED'
  const isResolved = pred.status === 'RESOLVED'
  const isCanceled = pred.status === 'CANCELED'
  const isEnded = isResolved || isCanceled
  const totalPoints = pred.outcomes.reduce((s, o) => s + (o.totalPoints || 0), 0)
  const createdAt = new Date(pred.createdAt).getTime()
  const windowMs = (pred.predictionWindowSeconds || 120) * 1000
  const endsAt = createdAt + windowMs
  const userBet = _userBets.get(pred.id)
  const winningId = pred.winningOutcome?.id || null

  const wrapper = document.createElement('div')
  wrapper.className = 'hs-mc-prediction' + (isResolved ? ' hs-mc-pred-resolved' : '') + (isCanceled ? ' hs-mc-pred-canceled' : '')
  wrapper.dataset.eventId = pred.id

  // Header
  const header = document.createElement('div')
  header.className = 'hs-mc-pred-header'
  const title = document.createElement('div')
  title.className = 'hs-mc-pred-title'
  title.textContent = pred.title
  header.appendChild(title)

  if (isCanceled) {
    const badge = document.createElement('span')
    badge.className = 'hs-mc-pred-status hs-mc-pred-status-canceled'
    badge.textContent = 'refunded'
    header.appendChild(badge)
  } else if (isResolved) {
    const badge = document.createElement('span')
    badge.className = 'hs-mc-pred-status hs-mc-pred-status-resolved'
    badge.textContent = 'ended'
    header.appendChild(badge)
  } else if (isLocked) {
    const badge = document.createElement('span')
    badge.className = 'hs-mc-pred-locked'
    badge.textContent = 'locked'
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
    bal.appendChild(makeCoinSvg(14))
    bal.appendChild(document.createTextNode(' ' + formatPoints(balance)))
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
      banner.textContent = 'you won +' + formatPoints(payout)
    } else {
      banner.textContent = 'you lost ' + formatPoints(userBet.points)
    }
    wrapper.appendChild(banner)
  } else if (isCanceled && userBet) {
    const banner = document.createElement('div')
    banner.className = 'hs-mc-pred-result hs-mc-pred-result-refund'
    banner.textContent = formatPoints(userBet.points) + ' returned'
    wrapper.appendChild(banner)
  }

  // Outcomes
  const outcomesWrap = document.createElement('div')
  outcomesWrap.className = 'hs-mc-pred-outcomes'

  for (const outcome of pred.outcomes) {
    const pct = totalPoints > 0 ? Math.round((outcome.totalPoints / totalPoints) * 100) : 0
    const color = outcome.color === 'PINK' ? '#f5009b' : '#387aff'
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
    titleSpan.textContent = outcome.title
    if (isWinner) {
      const winBadge = document.createElement('span')
      winBadge.className = 'hs-mc-pred-winner-badge'
      winBadge.textContent = 'winner'
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
    let statsText = formatPoints(points) + ' pts \u00b7 ' + userCount + ' voter' + (userCount !== 1 ? 's' : '')
    if (isBetOn) statsText += ' \u00b7 your bet: ' + formatPoints(userBet.points)
    stats.textContent = statsText
    card.appendChild(stats)

    if (!isLocked && !isEnded) {
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
      customInput.type = 'number'
      customInput.min = '1'
      if (balance != null) customInput.max = String(balance)
      customInput.placeholder = 'amt'
      customInput.dataset.outcome = outcome.id
      betRow.appendChild(customInput)

      const goBtn = document.createElement('button')
      goBtn.className = 'hs-mc-pred-bet-go'
      goBtn.dataset.outcome = outcome.id
      goBtn.style.setProperty('--oc', color)
      goBtn.textContent = 'bet'
      betRow.appendChild(goBtn)

      card.appendChild(betRow)
    }

    outcomesWrap.appendChild(card)
  }

  wrapper.appendChild(outcomesWrap)
  frag.appendChild(wrapper)
  return frag
}

function renderNoPrediction(balance) {
  const wrap = document.createElement('div')
  wrap.className = 'hs-mc-pred-empty'
  const text = document.createElement('div')
  text.className = 'hs-mc-pred-empty-text'
  text.textContent = 'no active prediction'
  wrap.appendChild(text)
  if (balance != null) {
    const bal = document.createElement('div')
    bal.className = 'hs-mc-pred-balance'
    bal.style.marginTop = '8px'
    bal.appendChild(makeCoinSvg(14))
    bal.appendChild(document.createTextNode(' ' + formatPoints(balance)))
    wrap.appendChild(bal)
  }
  return wrap
}

function renderRewards(rewards, balance, channelId) {
  const section = document.createElement('div')
  section.className = 'hs-mc-rewards'

  const header = document.createElement('div')
  header.className = 'hs-mc-rewards-header'
  const label = document.createElement('span')
  label.className = 'hs-mc-rewards-label'
  label.textContent = 'rewards'
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
    empty.textContent = 'no rewards available'
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
      if (reward.isPaused) reason.textContent = 'paused'
      else if (!reward.isInStock) reason.textContent = 'out of stock'
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
        input.placeholder = card.dataset.prompt || 'enter text...'
        const btn = document.createElement('button')
        btn.className = 'hs-mc-reward-submit'
        btn.textContent = 'redeem'
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
            setTimeout(() => { btn.textContent = 'redeem'; btn.disabled = false; btn.title = '' }, 2000)
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
      if (!el.isConnected) { clearInterval(iv); return }
      const secs = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
      if (secs <= 0) {
        _rewardsCache = null
        renderTwitchTab()
        clearInterval(iv)
        return
      }
      el.textContent = secs > 60 ? `${Math.ceil(secs / 60)}m cooldown` : `${secs}s cooldown`
    }, 1000)
  })
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

  // Bet button handlers
  container.querySelectorAll('.hs-mc-pred-bet-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const eventId = container.querySelector('.hs-mc-prediction')?.dataset.eventId
      if (!eventId) return
      btn.disabled = true
      btn.textContent = '...'
      const result = await placePredictionBet(eventId, btn.dataset.outcome, parseInt(btn.dataset.points))
      if (result.error) {
        btn.textContent = '!'
        btn.title = result.error
        setTimeout(() => { btn.textContent = formatPoints(parseInt(btn.dataset.points)); btn.disabled = false; btn.title = '' }, 2000)
      } else {
        btn.textContent = '\u2713'
        setTimeout(() => renderTwitchTab(), 500)
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
      const points = parseInt(input?.value)
      if (!points || points < 1) return
      btn.disabled = true
      btn.textContent = '...'
      const result = await placePredictionBet(eventId, btn.dataset.outcome, points)
      if (result.error) {
        btn.textContent = '!'
        btn.title = result.error
        setTimeout(() => { btn.textContent = 'bet'; btn.disabled = false; btn.title = '' }, 2000)
      } else {
        btn.textContent = '\u2713'
        input.value = ''
        setTimeout(() => renderTwitchTab(), 500)
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
      if (!el.isConnected) { clearInterval(iv); return }
      update()
    }, 1000)
  })
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

  if (!container.querySelector('.hs-mc-prediction, .hs-mc-pred-empty')) {
    container.textContent = ''
    const loading = document.createElement('div')
    loading.className = 'hs-mc-pred-loading'
    loading.textContent = 'loading...'
    container.appendChild(loading)
  }

  const [result, rewardsResult, pollResult] = await Promise.all([
    fetchPrediction(channel),
    fetchChannelRewards(channel),
    fetchPoll(channel)
  ])

  container.textContent = ''

  // Auto-claim bonus points
  if (rewardsResult?.availableClaim && rewardsResult.channelId) {
    claimCommunityPoints(rewardsResult.availableClaim, rewardsResult.channelId)
  }

  if (!result) {
    const empty = document.createElement('div')
    empty.className = 'hs-mc-pred-empty'
    const msg = document.createElement('div')
    msg.className = 'hs-mc-pred-empty-text'
    msg.textContent = "couldn't load predictions"
    empty.appendChild(msg)
    container.appendChild(empty)
  } else if (result.prediction) {
    container.appendChild(renderPrediction(result.prediction, result.balance))
  } else {
    container.appendChild(renderNoPrediction(result.balance))
  }

  // Poll
  if (pollResult) {
    container.appendChild(renderPoll(pollResult))
  }

  if (rewardsResult?.rewards?.length) {
    container.appendChild(renderRewards(rewardsResult.rewards, rewardsResult.balance, rewardsResult.channelId))
  }

  // Color picker
  container.appendChild(renderColorPicker())

  // Chat modes (only renders if user is mod/broadcaster — fails silently otherwise)
  renderChatModes(channel).then(modesEl => {
    if (modesEl) {
      const linksEl = container.querySelector('.hs-mc-pred-links')
      if (linksEl) container.insertBefore(modesEl, linksEl)
      else container.appendChild(modesEl)
      attachModeHandlers()
    }
  })

  container.appendChild(renderQuickLinks())
  attachPredictionHandlers()
  attachPollHandlers()
  attachRewardHandlers()
  attachColorHandlers()
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
    renderTwitchTab()
  }, 15000)
}

function stopPredictionPoll() {
  if (_predictionPollTimer) {
    clearInterval(_predictionPollTimer)
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
      // Auto-refresh Twitch tab if prediction/poll data arrives while tab is visible
      const container = document.getElementById('hs-mc-tab-twitch')
      if (container && container.style.display !== 'none') {
        renderTwitchTab()
      }
    }
  }
})

// Send Helix API request through MAIN world (uses captured OAuth token)
// URL can contain {me} which resolves to the logged-in user's ID
function helixRequest(url, method, body) {
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2)
    const handler = (e) => {
      if (e.data?.type === 'heatsync-helix-response' && e.data.id === id) {
        window.removeEventListener('message', handler)
        clearTimeout(timer)
        resolve(e.data)
      }
    }
    window.addEventListener('message', handler)
    const msg = { type: 'heatsync-helix', id, url, method: method || 'GET' }
    if (body) msg.body = body
    window.postMessage(msg, location.origin)
    const timer = setTimeout(() => {
      window.removeEventListener('message', handler)
      resolve({ error: 'helix timeout — refresh the page' })
    }, 15000)
  })
}

// Send GQL request through MAIN world proxy (uses captured hashes + integrity)
function gqlProxy(operation, variables, opts) {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2)
    const handler = (e) => {
      if (e.data?.type === 'heatsync-gql-response' && e.data.id === id) {
        window.removeEventListener('message', handler)
        clearTimeout(timer)
        if (e.data.error) reject(new Error(e.data.error))
        else resolve(e.data.data)
      }
    }
    window.addEventListener('message', handler)
    const msg = { type: 'heatsync-gql-request', id, operation, variables }
    if (opts?.rawQuery) msg.rawQuery = opts.rawQuery
    if (opts?.batch) msg.batch = opts.batch
    window.postMessage(msg, location.origin)
    const timer = setTimeout(() => {
      window.removeEventListener('message', handler)
      reject(new Error('GQL proxy timeout'))
    }, 10000)
  })
}

// Request cached data from MAIN world
function gqlGetCache(operations) {
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2)
    const handler = (e) => {
      if (e.data?.type === 'heatsync-gql-cache-response' && e.data.id === id) {
        window.removeEventListener('message', handler)
        clearTimeout(timer)
        resolve(e.data)
      }
    }
    window.addEventListener('message', handler)
    window.postMessage({ type: 'heatsync-gql-get-cache', id, operations }, location.origin)
    const timer = setTimeout(() => {
      window.removeEventListener('message', handler)
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
const _userBets = new Map() // eventId → { outcomeId, points }

// Rewards state
let _rewardsCache = null
let _rewardsCacheChannel = null

async function fetchPrediction(channelLogin) {
  const safe = channelLogin.replace(/[^a-z0-9_]/g, '')
  if (!safe) return null
  try {
    // First check MAIN world cache (intercepted from Twitch's own calls)
    const cached = await gqlGetCache(['ChannelPointsPredictionContext', 'CommunityPointsContext'])
    const predCache = cached.data?.ChannelPointsPredictionContext
    const pointsCache = cached.data?.CommunityPointsContext

    let predEvent = null
    let balance = null

    if (predCache && Date.now() - predCache.ts < 30000) {
      predEvent = predCache.data?.user?.activePredictionEvent || null
    }
    if (pointsCache && Date.now() - pointsCache.ts < 30000) {
      balance = pointsCache.data?.community?.channel?.self?.communityPoints?.balance ?? null
    }

    // If cache miss, try proxy call with captured hashes
    if (!predCache || Date.now() - predCache.ts >= 30000) {
      try {
        const data = await gqlProxy('ChannelPointsPredictionContext', { channelLogin: safe })
        if (Array.isArray(data)) {
          predEvent = data[0]?.data?.user?.activePredictionEvent || null
          balance = data[1]?.data?.community?.channel?.self?.communityPoints?.balance ?? balance
        } else {
          predEvent = data?.data?.user?.activePredictionEvent || data?.user?.activePredictionEvent || null
        }
      } catch (e) {
        log('GQL proxy prediction failed:', e.message)
      }
    }
    if (balance == null && (!pointsCache || Date.now() - pointsCache.ts >= 30000)) {
      try {
        const data = await gqlProxy('CommunityPointsContext', { channelLogin: safe })
        const d = Array.isArray(data) ? data[0]?.data : (data?.data || data)
        balance = d?.community?.channel?.self?.communityPoints?.balance ?? null
      } catch (e) {
        log('GQL proxy points failed:', e.message)
      }
    }

    return { prediction: predEvent, balance }
  } catch (e) {
    log('Failed to fetch prediction:', e.message)
    return null
  }
}

async function placePredictionBet(eventId, outcomeId, points, transactionId) {
  const token = getTwitchAuthToken()
  if (!token) return { error: 'not logged in' }
  try {
    const data = await gqlProxy('MakePrediction', {
      input: {
        eventID: eventId,
        outcomeID: outcomeId,
        points: points,
        transactionID: transactionId || crypto.randomUUID()
      }
    })
    const d = Array.isArray(data) ? data[0] : data
    if (d?.errors?.length) return { error: d.errors[0].message }
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

async function fetchPoll(channelLogin) {
  const safe = channelLogin.replace(/[^a-z0-9_]/g, '')
  if (!safe) return null
  try {
    // Try MAIN world cache first (intercepted from Twitch's own calls)
    const cached = await gqlGetCache(['ActivePoll', 'ChannelPollContext'])
    for (const key of ['ActivePoll', 'ChannelPollContext']) {
      const c = cached.data?.[key]
      if (c && Date.now() - c.ts < 15000) {
        const poll = c.data?.user?.activePoll || c.data?.channel?.activePoll || null
        if (poll) return poll
      }
    }
    // Try proxy with captured hash
    try {
      const data = await gqlProxy('ActivePoll', { channelLogin: safe })
      const d = Array.isArray(data) ? data[0] : data
      return d?.data?.user?.activePoll || d?.user?.activePoll || null
    } catch(e) {
      log('GQL proxy poll failed:', e.message)
    }
    // Fallback to raw GQL
    const token = getTwitchAuthToken()
    const headers = { 'Client-Id': TWITCH_CLIENT_ID, 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = 'OAuth ' + token
    const resp = await fetch(TWITCH_GQL, {
      method: 'POST', headers,
      body: JSON.stringify({
        query: '{ user(login: "' + safe + '") { activePoll { id title status durationSeconds remainingDurationMilliseconds startedAt choices { id title totalVoters } totalVoters } } }'
      })
    })
    if (!resp.ok) return null
    const data = await resp.json()
    return data?.data?.user?.activePoll || null
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

let _userPollVotes = new Map() // pollId → choiceId

function renderPoll(poll) {
  const section = document.createElement('div')
  section.className = 'hs-mc-poll'
  section.dataset.pollId = poll.id

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
    badge.textContent = 'ended'
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
  return section
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
        _userPollVotes.set(btn.dataset.pollId, btn.dataset.choiceId)
        btn.textContent = '\u2713'
        setTimeout(() => renderTwitchTab(), 500)
      }
    })
  })

  // Poll timers
  container.querySelectorAll('.hs-mc-poll-timer').forEach(el => {
    const endsAt = parseInt(el.dataset.ends)
    const update = () => {
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
      if (remaining <= 0) {
        el.textContent = 'ended'
        el.classList.add('hs-mc-poll-status-ended')
        return
      }
      const m = Math.floor(remaining / 60)
      const s = remaining % 60
      el.textContent = m > 0 ? m + ':' + String(s).padStart(2, '0') : s + 's'
    }
    update()
    const iv = cleanup.setInterval(() => {
      if (!el.isConnected) { clearInterval(iv); return }
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
      fetch(`https://api.frankerfacez.com/v1/room/${safe}`, { signal: AbortSignal.timeout(5000) })
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
      return `<img class="hs-mc-badge-img" src="${escapeHtml(url)}" alt="${escapeHtml(name)}" title="${escapeHtml(name)}" style="width:18px;height:18px;${bgStyle}">`
    }
    // Text fallback
    const style = BADGE_STYLES[name]
    if (!style) return ''
    return `<span class="hs-mc-badge" style="background:${style.bg};color:${style.fg}" title="${escapeHtml(name)}">${style.label}</span>`
  }).join('')
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
        followingCount: d.followingCount ?? null,
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
      rawQuery: `{ user(login: "${safeUser}") { follow(targetLogin: "${safeChan}") { followedAt } follows { totalCount } followers { totalCount } } channel: user(login: "${safeChan}") { follow(targetLogin: "${safeUser}") { followedAt } } }`
    })
    const user = data?.data?.user
    const result = {
      followedAt: user?.follow?.followedAt || null,
      followingCount: user?.follows?.totalCount ?? null,
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
