// Heatsync Popup - Minimal status view
(function() {
  'use strict'

  const API_URL = 'https://heatsync.org'

  function t(key, subs) {
    try { return chrome.i18n.getMessage(key, subs) || key } catch { return key }
  }

  function hydrateI18n(root = document) {
    for (const el of root.querySelectorAll('[data-i18n]'))
      el.textContent = t(el.dataset.i18n) || el.textContent
    for (const el of root.querySelectorAll('[data-i18n-placeholder]'))
      el.placeholder = t(el.dataset.i18nPlaceholder) || el.placeholder
    for (const el of root.querySelectorAll('[data-i18n-title]'))
      el.title = t(el.dataset.i18nTitle) || el.title
  }

  function escapeHtml(str) {
    if (str == null) return ''
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
  }

  async function init() {
    const content = document.getElementById('content')
    const dot = document.getElementById('status-dot')

    // Load stored data
    const stored = await chrome.storage.local.get([
      'auth_token', 'auth_token_encrypted', 'user_info', 'emote_inventory', 'global_emotes', 'blocked_emotes'
    ])

    // Check API connectivity
    try {
      const controller = new AbortController()
      setTimeout(() => controller.abort(), 3000)
      const resp = await fetch(`${API_URL}/api/health`, { signal: controller.signal })
      if (resp.ok) {
        dot.className = 'status-dot green'
        dot.title = t('popup_status_connected')
      } else {
        dot.className = 'status-dot red'
        dot.title = t('popup_status_api_error')
      }
    } catch {
      dot.className = 'status-dot red'
      dot.title = t('popup_status_offline')
    }

    const token = stored.auth_token || stored.auth_token_encrypted
    const user = stored.user_info

    if (token && user) {
      // Logged in
      const rawAvatar = user.avatar_url || user.profile_image_url || ''
      const avatar = rawAvatar.startsWith('https://') ? rawAvatar : ''
      const name = user.display_name || user.username || 'user'
      const emoteCount = (stored.emote_inventory || []).length
      const globalCount = (stored.global_emotes || []).length
      const heat = user.heat || 0

      content.innerHTML = `
        <div class="user-section">
          <div class="user-row">
            ${avatar ? `<img src="${escapeHtml(avatar)}" class="user-avatar" alt="">` : '<div class="user-avatar"></div>'}
            <div>
              <div class="user-name">${escapeHtml(name)}</div>
              <div class="user-stats">${heat ? t('popup_user_stats_heat', [String(emoteCount), String(globalCount), String(heat)]) : t('popup_user_stats', [String(emoteCount), String(globalCount)])}</div>
            </div>
          </div>
        </div>
        <div class="actions">
          <a href="https://heatsync.org/emotes" target="_blank" rel="noopener noreferrer" class="action-btn">${t('popup_btn_emotes')}</a>
          <button class="action-btn" id="refresh-btn">${t('popup_btn_refresh')}</button>
          <a href="https://heatsync.org" target="_blank" rel="noopener noreferrer" class="action-btn">${t('popup_btn_site')}</a>
          <button class="action-btn" id="logout-btn" style="color:#808080">${t('popup_btn_logout') || 'logout'}</button>
        </div>
      `

      document.getElementById('refresh-btn')?.addEventListener('click', async (e) => {
        e.target.textContent = '...'
        e.target.disabled = true
        await chrome.runtime.sendMessage({ type: 'refresh_all' })
        e.target.textContent = t('popup_btn_done')
        setTimeout(() => { e.target.textContent = t('popup_btn_refresh'); e.target.disabled = false }, 1000)
      })

      document.getElementById('logout-btn')?.addEventListener('click', async () => {
        await chrome.storage.local.remove(['auth_token', 'auth_token_encrypted', 'user_info', 'emote_inventory', 'blocked_emotes'])
        await chrome.runtime.sendMessage({ type: 'clear_auth' })
        init().catch(() => {})
      })
    } else {
      // Not logged in
      content.innerHTML = `
        <div class="login-section">
          ${t('popup_login_prompt')}
          <br>
          <a href="https://heatsync.org" target="_blank" rel="noopener noreferrer" class="login-btn">heatsync.org</a>
        </div>
      `
    }
  }

  function initPopout() {
    const input = document.getElementById('popout-input')
    const btn = document.getElementById('popout-btn')

    // auto-fill from active tab if on twitch or kick
    let detectedPlatform = 'twitch'
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (!tab?.url) return
      try {
        const url = new URL(tab.url)
        if (url.hostname.includes('twitch.tv')) {
          detectedPlatform = 'twitch'
          const m = url.pathname.match(/^\/(?:popout\/|embed\/)?([a-zA-Z0-9_]+)/)
          if (m && !['directory', 'settings', 'videos', 'moderator', 'subscriptions'].includes(m[1].toLowerCase())) {
            input.value = m[1].toLowerCase()
          }
        } else if (url.hostname.includes('kick.com')) {
          detectedPlatform = 'kick'
          const m = url.pathname.match(/^\/([a-zA-Z0-9_]+)/)
          if (m && !['categories', 'following', 'settings', 'search'].includes(m[1].toLowerCase())) {
            input.value = m[1].toLowerCase()
          }
        }
      } catch {}
    })

    function openPopout() {
      const channel = input.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')
      if (!channel) { input.focus(); return }
      const url = detectedPlatform === 'kick'
        ? `https://kick.com/${channel}`
        : `https://www.twitch.tv/popout/${channel}/chat`
      chrome.tabs.create({ url })
    }

    btn.addEventListener('click', openPopout)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') openPopout()
    })
  }

  document.addEventListener('DOMContentLoaded', () => {
    hydrateI18n()
    init().catch(e => console.error('popup init failed:', e))
    initPopout()

    // Re-run init when auth token lands in storage (user logged in while popup was open)
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return
      const authKeys = ['auth_token', 'auth_token_encrypted', 'user_info']
      const relevant = authKeys.some(k => k in changes)
      if (!relevant) return
      // Only re-init when transitioning to/from logged-in state
      const wasAuthed = authKeys.slice(0, 2).some(k => changes[k]?.oldValue)
      const nowAuthed = authKeys.slice(0, 2).some(k => changes[k]?.newValue)
      if (wasAuthed !== nowAuthed || (nowAuthed && 'user_info' in changes)) {
        init().catch(e => console.error('popup re-init failed:', e))
      }
    })
  })
})()
