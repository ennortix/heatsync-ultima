// settings registry — every multichat setting as one declarative entry.
// pure data + pure validators only: no DOM, no chrome.*, no i18n calls.
// bundled at IIFE scope (build.js lib list) so main.js, every multichat
// module, and content.js read the same catalog; bun tests import it.
//
// entry fields:
//   key        EXACT storage key — never rename, existing users' synced
//              data lives under these names
//   type       'bool' | 'enum' | 'range' | 'text' | 'multiselect'
//   default    value assumed when storage is empty; written by reset
//   scope      'sync'         → ui_settings.<key> in chrome.storage.sync
//              'local'        → chrome.storage.local.<key> (per-device)
//              'local-mirror' → saveUiSetting() splits to local via
//                               UI_SYNC_BLOCKLIST; mirrorKey names the
//                               actual local storage key
//   category   settings subtab id (display|chat|notifs|mod|filters|tweaks|system)
//   section    group title within the subtab
//   label/tip  literal lowercase strings — or labelKey/tipKey when the
//              string is i18n'd (renderer resolves via t(); not available here)
//   control    'pill' | 'select' | 'sizebtns' | 'range' | 'text' | 'textarea'
//   options    [{value,label|labelKey}] for enum/multiselect;
//              {min,max,step} for range
//   alias      legacy data-setting attribute value emitted by the current
//              renderers — click/input handlers resolve it to this entry
//   dependsOn  {key, equals?} — row hidden unless the named setting matches
//              (equals omitted = truthy)
//   runtimeVar legacy module-level var name bridged by main.js _RUNTIME_BRIDGE
//   apply      id into main.js _APPLIERS — side-effect run on set
//   applyOnLoad  also run the applier once during loadAllSettings hydration
//   rerender   true → re-render chat messages after a change
//   rerenderSettings  true → re-render the settings panel after a change
//   migrate    one-shot guard key in ui_settings (default-flip migrations)
//   legacy     (ui, local) → value | undefined — pull from a retired key
//              when this entry's own storage is empty
//   legacySyncFallback  local-mirror only: hydrate from the old sync copy
//              (and persist to local) when the local key is empty
//   firstRunPersist  local only: persist the default on first load so
//              other surfaces (options page) render the real state
//   invertDisplay    multiselect of hidden ids rendered as "visible" pills
//   maxLen     string cap for text/textarea
//   placeholder/placeholderKey  textarea placeholder

const SETTINGS = [
  // ── display / font ────────────────────────────────────────────────────
  {
    key: 'fontFamily', type: 'enum', default: 'CozetteVector', scope: 'sync',
    category: 'display', section: 'font', label: 'font family', tip: 'multichat font family',
    control: 'select', alias: 'fontfamily', apply: 'fonts', applyOnLoad: true, rerenderSettings: true,
    options: [
      { value: 'CozetteVector', label: 'CozetteVector (13px)' },
      { value: 'GohuFont', label: 'GohuFont (14px)' },
      { value: 'monospace', label: 'system monospace' },
      { value: 'twitch', label: 'platform default (Inter — twitch + kick)' },
      { value: 'custom', label: 'custom...' },
    ],
  },
  {
    key: 'customFontName', type: 'text', default: '', scope: 'sync',
    category: 'display', section: 'font', label: 'custom font name',
    control: 'text', alias: 'customfontname', apply: 'fonts', applyOnLoad: true, maxLen: 64,
    dependsOn: { key: 'fontFamily', equals: 'custom' },
  },
  {
    key: 'fontSize', type: 'enum', default: '13', scope: 'sync',
    category: 'display', section: 'font', label: 'font size', tip: 'base font size for multichat panel',
    control: 'select', alias: 'fontsize', apply: 'fonts', applyOnLoad: true,
    options: [
      { value: '13', label: '13px' },
      { value: '14', label: '14px' },
      { value: '16', label: '16px' },
    ],
  },

  // ── display / display ─────────────────────────────────────────────────
  {
    key: 'hs_emote_size', type: 'enum', default: 1, scope: 'local',
    category: 'display', section: 'display',
    labelKey: 'mc_settings_emote_size', tipKey: 'mc_settings_emote_size_desc',
    control: 'sizebtns', runtimeVar: 'emoteSize', apply: 'emoteSize', applyOnLoad: true,
    options: [
      { value: 1, label: '1x' },
      { value: 2, label: '2x' },
      { value: 4, label: '4x' },
    ],
  },
  {
    key: 'hs_emoji_size', type: 'enum', default: 2, scope: 'local',
    category: 'display', section: 'display',
    label: 'emoji size', tip: 'emoji size -- 1x native, 2x (default)/4x scale unicode emoji',
    control: 'sizebtns', runtimeVar: 'emojiSize', apply: 'emojiSize', applyOnLoad: true,
    legacy: function(ui) { return ui.bigEmoji === false ? 1 : undefined },
    options: [
      { value: 1, label: '1x' },
      { value: 2, label: '2x' },
      { value: 4, label: '4x' },
    ],
  },
  {
    key: 'timestamps', type: 'bool', default: false, scope: 'sync',
    category: 'display', section: 'display',
    labelKey: 'mc_settings_timestamps', tipKey: 'mc_settings_timestamps_desc',
    control: 'pill', alias: 'timestamps', runtimeVar: 'timestampsEnabled', rerender: true,
  },
  {
    key: 'avatars', type: 'bool', default: false, scope: 'sync',
    category: 'display', section: 'display',
    label: 'pfps', tipKey: 'mc_settings_avatars_desc',
    control: 'pill', alias: 'avatars', runtimeVar: 'avatarsEnabled', rerender: true,
  },
  {
    key: 'zebra', type: 'bool', default: true, scope: 'sync',
    category: 'display', section: 'display',
    labelKey: 'mc_settings_zebra', tipKey: 'mc_settings_zebra_desc',
    control: 'pill', alias: 'zebra', runtimeVar: 'zebraEnabled', rerender: true,
  },
  {
    key: 'hs_readable_names', type: 'bool', default: true, scope: 'local',
    category: 'display', section: 'display',
    label: 'readable names', tip: "brighten dim username colors so they're readable on the black bg",
    control: 'pill', alias: 'readablenames', runtimeVar: 'readableNamesEnabled',
  },
  {
    key: 'firstChatterGlow', type: 'bool', default: true, scope: 'sync',
    category: 'display', section: 'display',
    labelKey: 'mc_settings_first_chatter', tipKey: 'mc_settings_first_chatter_desc',
    control: 'pill', alias: 'firstchatter', runtimeVar: 'firstChatterGlow', rerender: true,
  },
  {
    key: 'autoHideEmpty', type: 'bool', default: false, scope: 'sync',
    category: 'display', section: 'display',
    labelKey: 'mc_settings_auto_hide', tipKey: 'mc_settings_auto_hide_desc',
    control: 'pill', alias: 'autohide', runtimeVar: 'autoHideInput', apply: 'autoHide',
  },
  {
    key: 'showPlatformBadges', type: 'bool', default: true, scope: 'sync',
    category: 'display', section: 'display',
    label: 'platform badges', tip: '[T] [K] [Y] labels on messages',
    control: 'pill', alias: 'showplatformbadges', runtimeVar: 'platformBadgesEnabled', rerender: true,
  },

  // ── chat / input ──────────────────────────────────────────────────────
  {
    key: 'wysiwygEnabled', type: 'bool', default: true, scope: 'sync',
    category: 'chat', section: 'input',
    labelKey: 'mc_settings_input_preview', tipKey: 'mc_settings_input_preview_desc',
    control: 'pill', alias: 'wysiwyg', runtimeVar: 'wysiwygEnabled', apply: 'rebuildInput',
    migrate: 'wysiwygDefaultOn_v1',
  },
  {
    key: 'viMode', type: 'bool', default: false, scope: 'sync',
    category: 'chat', section: 'input',
    labelKey: 'mc_settings_vi_mode', tipKey: 'mc_settings_vi_mode_desc',
    control: 'pill', alias: 'vi', runtimeVar: 'viModeEnabled', apply: 'viMode',
  },

  // ── chat / messages ───────────────────────────────────────────────────
  {
    key: 'linksEnabled', type: 'bool', default: true, scope: 'sync',
    category: 'chat', section: 'messages',
    labelKey: 'mc_settings_clickable_links', tipKey: 'mc_settings_clickable_links_desc',
    control: 'pill', alias: 'links', runtimeVar: 'linksEnabled', rerender: true,
  },
  {
    key: 'linkPreviewsEnabled', type: 'bool', default: true, scope: 'sync',
    category: 'chat', section: 'messages',
    labelKey: 'mc_settings_link_previews', tipKey: 'mc_settings_link_previews_desc',
    control: 'pill', alias: 'linkpreviews', runtimeVar: 'linkPreviewsEnabled',
  },
  {
    key: 'hs_auto_claim_points', type: 'bool', default: true, scope: 'local',
    category: 'chat', section: 'messages',
    labelKey: 'mc_settings_auto_claim', tipKey: 'mc_settings_auto_claim_desc',
    control: 'pill', alias: 'autoclaim', runtimeVar: 'autoClaimPoints', apply: 'autoClaim', applyOnLoad: true,
    firstRunPersist: true,
  },
  {
    key: 'hs_dim_timeouts', type: 'bool', default: true, scope: 'local',
    category: 'chat', section: 'messages',
    labelKey: 'mc_settings_dim_timeouts', tipKey: 'mc_settings_dim_timeouts_desc',
    control: 'pill', alias: 'dimtimeouts', runtimeVar: 'dimTimeouts',
  },
  {
    key: 'keywordHighlights', type: 'text', default: '', scope: 'local-mirror',
    mirrorKey: 'keyword_highlights', legacySyncFallback: true,
    category: 'chat', section: 'messages',
    labelKey: 'mc_settings_keyword_highlights', tipKey: 'mc_settings_keyword_highlights_desc',
    placeholderKey: 'mc_settings_keyword_highlights_placeholder',
    control: 'textarea', alias: 'keywordhighlights', runtimeVar: 'keywordHighlights',
    apply: 'keywordRegex', applyOnLoad: true, rerender: true, maxLen: 65536,
  },

  // ── notifs / on @mention ──────────────────────────────────────────────
  {
    key: 'hs_notifications', type: 'bool', default: false, scope: 'local',
    category: 'notifs', section: 'on @mention (tab unfocused)',
    label: 'browser notification', tip: 'show a desktop notification when someone @s you',
    control: 'pill', apply: 'notifPermission',
  },
  {
    key: 'mentionTitleFlash', type: 'bool', default: true, scope: 'sync',
    category: 'notifs', section: 'on @mention (tab unfocused)',
    label: 'tab title flash', tip: "pulse the browser tab title with the mentioner's name until you focus the tab",
    control: 'pill',
  },
  {
    key: 'mentionSoundVolume', type: 'range', default: 0.3, scope: 'sync',
    category: 'notifs', section: 'on @mention (tab unfocused)',
    label: 'mention sound volume', tip: 'audio ping volume on mention. 0 = silent. uses pure WebAudio tones, no asset shipped.',
    control: 'range', alias: 'mentionsoundvolume', apply: 'mentionPing',
    options: { min: 0, max: 1, step: 0.05 },
  },

  // ── notifs / cross-platform follow ────────────────────────────────────
  {
    key: 'crossFollowKick', type: 'bool', default: true, scope: 'sync',
    category: 'notifs', section: 'cross-platform follow',
    label: 'also follow on kick', tip: 'when you follow on heatsync, also follow on kick if they have a linked kick account. needs a kick.com login; queues otherwise',
    control: 'pill',
  },

  // ── mod / automod ─────────────────────────────────────────────────────
  {
    key: 'automodAllCaps', type: 'bool', default: false, scope: 'sync',
    category: 'mod', section: 'automod',
    label: 'hide all-caps spam', tip: 'hide messages over 10 chars that are mostly uppercase',
    control: 'pill', apply: 'automod',
  },
  {
    key: 'automodRegex', type: 'text', default: '', scope: 'sync',
    category: 'mod', section: 'automod',
    label: 'filter regex', tip: 'one pattern per line, case-insensitive -- matching messages get hidden',
    placeholder: 'bit\\.ly\nfree\\s+v[\\-]?bucks',
    control: 'textarea', alias: 'automodregex', apply: 'automod', maxLen: 4096,
  },

  // ── system / tabs ─────────────────────────────────────────────────────
  {
    key: 'hiddenTabs', type: 'multiselect', default: ['pinned'], scope: 'sync',
    category: 'system', section: 'tabs',
    label: 'visible tabs',
    control: 'pill', runtimeVar: 'hiddenTabs', apply: 'hiddenTabs', invertDisplay: true,
    options: [
      { value: 'feed', labelKey: 'mc_tab_feed' },
      { value: 'whispers', labelKey: 'mc_tab_whispers' },
      { value: 'mentions', labelKey: 'mc_tab_mentions' },
      { value: 'discover', labelKey: 'mc_tab_discover' },
      { value: 'pinned', labelKey: 'mc_tab_pinned' },
    ],
  },

  // ── system / advanced ─────────────────────────────────────────────────
  {
    key: 'crashTelemetry', type: 'bool', default: false, scope: 'sync',
    category: 'system', section: 'advanced',
    label: 'show diagnostic errors', tip: "show the diagnostic errors panel below. errors are always captured locally to chrome.storage and never uploaded; this toggle only controls the panel's visibility.",
    control: 'pill', rerenderSettings: true,
  },
]

// ── pure validators / helpers ─────────────────────────────────────────────

function validateSettingValue(def, v) {
  if (!def) return false
  switch (def.type) {
    case 'bool': return typeof v === 'boolean'
    case 'enum': return def.options.some(function(o) { return o.value === v })
    case 'range': return typeof v === 'number' && isFinite(v) &&
      v >= def.options.min && v <= def.options.max
    case 'text': return typeof v === 'string' && v.length <= (def.maxLen || 4096)
    case 'multiselect': return Array.isArray(v) &&
      v.every(function(x) { return def.options.some(function(o) { return o.value === x }) })
    default: return false
  }
}

// normalize a raw value toward validity; returns undefined when unsalvageable
function coerceSettingValue(def, v) {
  if (!def || v === undefined || v === null) return undefined
  switch (def.type) {
    case 'bool': return !!v
    case 'enum': {
      if (def.options.some(function(o) { return o.value === v })) return v
      // tolerate string/number mismatch ('2' vs 2) from DOM datasets
      var loose = def.options.find(function(o) { return String(o.value) === String(v) })
      return loose ? loose.value : undefined
    }
    case 'range': {
      var n = typeof v === 'number' ? v : parseFloat(v)
      if (!isFinite(n)) return undefined
      return Math.min(def.options.max, Math.max(def.options.min, n))
    }
    case 'text': {
      if (typeof v !== 'string') return undefined
      return v.length > (def.maxLen || 4096) ? v.slice(0, def.maxLen || 4096) : v
    }
    case 'multiselect': {
      if (!Array.isArray(v)) return undefined
      return v.filter(function(x) { return def.options.some(function(o) { return o.value === x }) })
    }
    default: return undefined
  }
}

// build/test-time lint — returns an array of problem strings (empty = clean).
// syncBlocklist is utils.js UI_SYNC_BLOCKLIST (passed in to keep this pure).
function lintSettings(syncBlocklist) {
  var problems = []
  var seen = new Set()
  var aliases = new Set()
  var syncDefaults = {}
  for (var i = 0; i < SETTINGS.length; i++) {
    var def = SETTINGS[i]
    if (seen.has(def.key)) problems.push('duplicate key: ' + def.key)
    seen.add(def.key)
    if (def.alias) {
      if (aliases.has(def.alias)) problems.push('duplicate alias: ' + def.alias)
      aliases.add(def.alias)
    }
    if (!validateSettingValue(def, def.default)) problems.push('default fails validate: ' + def.key)
    if (!['sync', 'local', 'local-mirror'].includes(def.scope)) problems.push('bad scope: ' + def.key)
    if (def.scope === 'sync' && syncBlocklist && syncBlocklist.has(def.key)) {
      problems.push('sync-scoped key is in UI_SYNC_BLOCKLIST: ' + def.key)
    }
    if (def.scope === 'local-mirror') {
      if (!def.mirrorKey) problems.push('local-mirror without mirrorKey: ' + def.key)
      if (syncBlocklist && !syncBlocklist.has(def.key)) {
        problems.push('local-mirror key missing from UI_SYNC_BLOCKLIST: ' + def.key)
      }
    }
    if (def.scope === 'local' && !/^(hs|viewer)_/.test(def.key)) {
      problems.push('local key outside hs_/viewer_ namespace (breaks export/import): ' + def.key)
    }
    if (!def.label && !def.labelKey) problems.push('no label: ' + def.key)
    if (def.dependsOn && !SETTINGS.some(function(d) { return d.key === def.dependsOn.key })) {
      problems.push('dependsOn unknown key: ' + def.key)
    }
    if (def.scope === 'sync') syncDefaults[def.key] = def.default
  }
  // 8 KB sync quota headroom — defaults must leave room for user values
  var size = JSON.stringify(syncDefaults).length
  if (size > 7000) problems.push('sync defaults too large: ' + size + ' bytes')
  return problems
}

// Global export (IIFE bundle path — mirrors utils.js)
if (typeof window !== 'undefined') {
  window.heatsyncSettingsSchema = { SETTINGS, validateSettingValue, coerceSettingValue, lintSettings }
}

export { SETTINGS, validateSettingValue, coerceSettingValue, lintSettings }
