// @ts-check
// settings registry — every multichat setting as one declarative entry.
// pure data + pure validators only: no DOM, no chrome.*, no i18n calls.
// bundled at IIFE scope (build.js lib list) so main.js, every multichat
// module, and content.js read the same catalog; bun tests import it.
//
// entry fields:
//   key        EXACT storage key — never rename, existing users' synced
//              data lives under these names
//   type       'bool' | 'enum' | 'range' | 'text' | 'multiselect' | 'boolmap'
//              boolmap = one storage key holding {subkey: bool} (the
//              inlineNotifs / hermesEvents nested savers); options list the
//              subkeys, each with {value, default, color, tag?, label(/Key)?,
//              tip(/Key)?}; coercion merges partial stored maps over default
//   default    value assumed when storage is empty; written by reset
//   scope      'sync'         → ui_settings.<key> in chrome.storage.sync
//              'local'        → chrome.storage.local.<key> (per-device)
//              'local-mirror' → saveUiSetting() splits to local via
//                               UI_SYNC_BLOCKLIST; mirrorKey names the
//                               actual local storage key
//   category   settings subtab id (display|chat|notifs|mod|filters|tweaks|system)
//   section    group title within the subtab (sectionKey when i18n'd)
//   label/tip  literal lowercase strings — or labelKey/tipKey when the
//              string is i18n'd (renderer resolves via t(); not available here)
//   control    'pill' | 'select' | 'sizebtns' | 'range' | 'text' | 'textarea'
//   options    [{value,label|labelKey}] for enum/multiselect;
//              {min,max,step} for range
//   alias      extra search keywords (originally the legacy data-setting
//              attribute names) — fed into the settings search haystack
//   dependsOn  {key, equals?} — row hidden unless the named setting matches
//              (equals omitted = truthy)
//   runtimeVar legacy module-level var name bridged by main.js _RUNTIME_BRIDGE
//   apply      id into main.js _APPLIERS — side-effect run on set
//   applyOnLoad  also run the applier once during loadAllSettings hydration
//   syncSilent   skip the applier on REMOTE (cross-tab/device) changes —
//              for set-time-only effects like the volume preview ping
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
//   displayScale  range only: UI shows value × scale (storage stays raw)
//   tweak      true → twitch-ui-noise CSS-hide flag; content.js
//              applyUiSettings() owns the actual hide rules
//   noReset    excluded from resetSettingsToDefaults (server-coupled prefs)
//   reloadApply  value fully applies only after a page reload — renderer
//              shows a [reload] chip when current differs from boot
//   cw         {stateKey, serverBody, noun} — per-viewer content-warning
//              filter: local bool + server PATCH /api/user/settings with
//              rollback; main.js derives CW_CATS from these

/**
 * @typedef {{ value: *, label?: string, labelKey?: string, tip?: string, tipKey?: string, default?: boolean, tag?: string, color?: string, borderColor?: string, applies?: 'live'|'reload' }} SettingOption
 */

/**
 * @typedef {Object} SettingDef
 * @property {string} key EXACT storage key — never rename
 * @property {'bool'|'enum'|'range'|'text'|'multiselect'|'boolmap'} type
 * @property {*} default
 * @property {'sync'|'local'|'local-mirror'} scope
 * @property {string} category settings subtab id
 * @property {string} [section] group title ([sectionKey] when i18n'd)
 * @property {string} [sectionKey] i18n key for section title
 * @property {string} [label] lowercase literal
 * @property {string} [labelKey] i18n key for label
 * @property {string} [tip] hover tooltip
 * @property {string} [tipKey] i18n key for tip
 * @property {'pill'|'select'|'sizebtns'|'range'|'text'|'textarea'} [control]
 * @property {SettingOption[]|{min:number,max:number,step:number}} [options]
 * @property {string} [alias] extra search keywords
 * @property {{key:string,equals?:*}} [dependsOn]
 * @property {string} [runtimeVar] legacy module var bridged in main.js
 * @property {string} [apply] id into main.js _APPLIERS
 * @property {boolean} [applyOnLoad]
 * @property {boolean} [syncSilent] skip applier on remote cross-tab changes
 * @property {boolean} [rerender]
 * @property {boolean} [rerenderSettings]
 * @property {string} [migrate] one-shot default-flip guard key
 * @property {function(Object,Object):*} [legacy] retired-key migration
 * @property {boolean} [legacySyncFallback]
 * @property {boolean} [firstRunPersist]
 * @property {boolean} [invertDisplay]
 * @property {number} [maxLen]
 * @property {string} [placeholder]
 * @property {string} [placeholderKey]
 * @property {string} [mirrorKey] local-mirror storage key
 * @property {boolean} [tweak]
 * @property {boolean} [noReset]
 * @property {boolean} [reloadApply]
 * @property {number} [displayScale]
 * @property {{stateKey:string,serverBody:string,noun:string}} [cw]
 */

/** @type {SettingDef[]} */
const SETTINGS = [
  // ── display — the headline toggle first ──────────────────────────────

  // ── display / font ────────────────────────────────────────────────────
  {
    key: 'fontFamily',
    type: 'enum',
    default: 'CozetteVector',
    scope: 'sync',
    category: 'display',
    section: 'font',
    label: 'font family',
    tip: 'multichat font family',
    control: 'select',
    alias: 'fontfamily',
    apply: 'fonts',
    applyOnLoad: true,
    rerenderSettings: true,
    options: [
      { value: 'CozetteVector', label: 'CozetteVector (13px)' },
      { value: 'GohuFont', label: 'GohuFont (14px)' },
      { value: 'monospace', label: 'system monospace' },
      { value: 'twitch', label: 'platform default (Inter — twitch + kick)' },
      { value: 'custom', label: 'custom...' },
    ],
  },
  {
    key: 'customFontName',
    type: 'text',
    default: '',
    scope: 'sync',
    category: 'display',
    section: 'font',
    label: 'custom font name',
    control: 'text',
    alias: 'customfontname',
    apply: 'fonts',
    applyOnLoad: true,
    maxLen: 64,
    dependsOn: { key: 'fontFamily', equals: 'custom' },
  },
  {
    key: 'fontSize',
    type: 'range',
    default: 13,
    scope: 'sync',
    category: 'display',
    section: 'font',
    label: 'font size',
    tip: 'chat font size in px — drag to taste (replaces the old F-/F+ buttons)',
    control: 'range',
    alias: 'fontsize',
    apply: 'fonts',
    applyOnLoad: true,
    options: { min: 10, max: 22, step: 1 },
  },

  // ── display / display ─────────────────────────────────────────────────
  {
    key: 'hs_emote_size',
    type: 'enum',
    default: 1,
    scope: 'local',
    category: 'display',
    section: 'chat messages',
    labelKey: 'mc_settings_emote_size',
    tipKey: 'mc_settings_emote_size_desc',
    control: 'sizebtns',
    runtimeVar: 'emoteSize',
    apply: 'emoteSize',
    applyOnLoad: true,
    alias: 'native chat emote scale',
    options: [
      { value: 1, label: '1x' },
      { value: 2, label: '2x' },
      { value: 4, label: '4x' },
    ],
  },
  {
    key: 'hs_emoji_size',
    type: 'enum',
    default: 2,
    scope: 'local',
    category: 'display',
    section: 'chat messages',
    label: 'emoji size',
    tip: 'emoji size -- 1x native, 2x (default)/4x scale unicode emoji',
    control: 'sizebtns',
    runtimeVar: 'emojiSize',
    apply: 'emojiSize',
    applyOnLoad: true,
    legacy: (ui) => (ui.bigEmoji === false ? 1 : undefined),
    options: [
      { value: 1, label: '1x' },
      { value: 2, label: '2x' },
      { value: 4, label: '4x' },
    ],
  },
  {
    key: 'timestamps',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'display',
    section: 'chat messages',
    labelKey: 'mc_settings_timestamps',
    tipKey: 'mc_settings_timestamps_desc',
    control: 'pill',
    alias: 'timestamps',
    runtimeVar: 'timestampsEnabled',
    rerender: true,
  },
  {
    key: 'timestampFormat',
    type: 'enum',
    default: '24h',
    scope: 'sync',
    category: 'display',
    section: 'chat messages',
    label: 'timestamp format',
    tip: 'clock format for chat row timestamps',
    control: 'sizebtns',
    rerender: true,
    dependsOn: { key: 'timestamps' },
    options: [
      { value: '24h', label: '24h' },
      { value: '12h', label: '12h' },
    ],
  },
  {
    key: 'avatars',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'display',
    section: 'chat messages',
    label: 'pfps',
    tipKey: 'mc_settings_avatars_desc',
    control: 'pill',
    alias: 'avatars',
    runtimeVar: 'avatarsEnabled',
    rerender: true,
  },
  {
    key: 'zebra',
    type: 'bool',
    default: true,
    scope: 'sync',
    category: 'display',
    section: 'chat messages',
    labelKey: 'mc_settings_zebra',
    tipKey: 'mc_settings_zebra_desc',
    control: 'pill',
    alias: 'zebra',
    runtimeVar: 'zebraEnabled',
    rerender: true,
  },
  {
    key: 'hs_readable_names',
    type: 'bool',
    default: true,
    scope: 'local',
    category: 'display',
    section: 'chat messages',
    label: 'fix dim usernames',
    tip: "brighten dim username colors so they're readable on the black bg",
    control: 'pill',
    alias: 'readablenames',
    runtimeVar: 'readableNamesEnabled',
    rerender: true,
  },
  {
    key: 'firstChatterGlow',
    type: 'bool',
    default: true,
    scope: 'sync',
    category: 'display',
    section: 'chat messages',
    labelKey: 'mc_settings_first_chatter',
    tipKey: 'mc_settings_first_chatter_desc',
    control: 'pill',
    alias: 'firstchatter',
    runtimeVar: 'firstChatterGlow',
    rerender: true,
  },
  {
    key: 'autoHideEmpty',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'display',
    section: 'chat messages',
    labelKey: 'mc_settings_auto_hide',
    tipKey: 'mc_settings_auto_hide_desc',
    control: 'pill',
    alias: 'autohide',
    runtimeVar: 'autoHideInput',
    apply: 'autoHide',
  },
  {
    key: 'showPlatformBadges',
    type: 'bool',
    default: true,
    scope: 'sync',
    category: 'display',
    section: 'chat messages',
    label: 'platform badges',
    tip: '[T] [K] [Y] labels on messages',
    control: 'pill',
    alias: 'showplatformbadges',
    runtimeVar: 'platformBadgesEnabled',
    rerender: true,
  },

  // ── display / layout ──────────────────────────────────────────────────
  // Written by the rotate buttons too — registry + buttons share one
  // setSetting write path. chatPosition includes 'hidden' (the \\ toggle
  // stores it) so hydration never un-hides a deliberately hidden chat.
  {
    key: 'tabPosition',
    type: 'enum',
    default: 'top',
    scope: 'sync',
    category: 'display',
    section: 'layout',
    label: 'tab bar position',
    tip: 'which edge the multichat tab bar docks to',
    control: 'sizebtns',
    runtimeVar: 'tabPosition',
    apply: 'tabPosition',
    rerender: true,
    options: [
      { value: 'top', label: 'top' },
      { value: 'right', label: 'right' },
      { value: 'bottom', label: 'bottom' },
      { value: 'left', label: 'left' },
    ],
  },
  {
    key: 'chatPosition',
    type: 'enum',
    default: 'right',
    scope: 'sync',
    category: 'display',
    section: 'layout',
    label: 'chat dock side',
    tip: 'which side of the player the chat panel docks to — hidden tucks it away (\\ key toggles)',
    control: 'sizebtns',
    runtimeVar: 'chatPosition',
    apply: 'chatPosition',
    options: [
      { value: 'right', label: 'right' },
      { value: 'bottom', label: 'bottom' },
      { value: 'left', label: 'left' },
      { value: 'top', label: 'top' },
      { value: 'hidden', label: 'hidden' },
    ],
  },
  {
    key: 'ytShowSuggestions',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'display',
    section: 'layout',
    label: 'youtube: suggestions strip',
    tip: 'show suggested videos in a vertical strip beside the title (youtube, left/right dock only) — off by default since the chat reclaims that space',
    control: 'pill',
    apply: 'ytSuggestions',
    applyOnLoad: true,
  },
  {
    key: 'ytChatOnNonLive',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'display',
    section: 'layout',
    label: 'youtube: chat on non-live pages',
    tip: 'show the multichat panel on youtube VODs, home and search too — off by default, so the panel only appears on livestreams (where there is live chat)',
    control: 'pill',
    apply: 'ytNonLiveChat',
    applyOnLoad: true,
  },

  // ── display / density ─────────────────────────────────────────────────
  {
    key: 'messageDensity',
    type: 'enum',
    default: 'compact',
    scope: 'sync',
    category: 'display',
    section: 'density',
    label: 'message density',
    tip: 'row padding — compact is the classic tight look',
    control: 'sizebtns',
    apply: 'density',
    applyOnLoad: true,
    options: [
      { value: 'compact', label: 'compact' },
      { value: 'cozy', label: 'cozy' },
    ],
  },
  {
    key: 'lineHeight',
    type: 'enum',
    default: '18',
    scope: 'sync',
    category: 'display',
    section: 'density',
    label: 'line height',
    tip: 'chat row line height in px — 18 keeps bitmap fonts on the pixel grid',
    control: 'sizebtns',
    apply: 'density',
    applyOnLoad: true,
    options: [
      { value: '18', label: '18' },
      { value: '22', label: '22' },
      { value: '26', label: '26' },
    ],
  },
  {
    key: 'hs_dom_render_cap',
    type: 'range',
    default: 500,
    scope: 'local',
    category: 'display',
    section: 'density',
    label: 'max visible messages',
    tip: 'max chat rows kept as live DOM (data buffer stays 1500). lower = less ram on busy channels.',
    control: 'range',
    runtimeVar: 'domRenderCap',
    apply: 'renderCap',
    options: { min: 100, max: 1500, step: 100 },
  },

  // ── display / cosmetics (per-provider) ────────────────────────────────
  {
    key: 'sevenTvPaints',
    type: 'bool',
    default: true,
    scope: 'sync',
    category: 'display',
    section: 'cosmetics',
    label: '7tv paints + badges',
    tip: 'name paints and 7tv badges on chatters',
    control: 'pill',
    rerender: true,
  },
  {
    key: 'bttvBadges',
    type: 'bool',
    default: true,
    scope: 'sync',
    category: 'display',
    section: 'cosmetics',
    label: 'bttv badges',
    tip: 'betterttv badges on chatters',
    control: 'pill',
    rerender: true,
  },
  {
    key: 'ffzBadges',
    type: 'bool',
    default: true,
    scope: 'sync',
    category: 'display',
    section: 'cosmetics',
    label: 'ffz badges',
    tip: 'frankerfacez badges on chatters',
    control: 'pill',
    rerender: true,
  },
  {
    key: 'animateEmotes',
    type: 'bool',
    default: true,
    scope: 'sync',
    category: 'display',
    section: 'cosmetics',
    label: 'animate emotes',
    tip: 'play animated emotes (gifs/webp). off shows static first frames — saves cpu on busy channels. multichat messages; picker stays animated.',
    control: 'pill',
    runtimeVar: 'emoteAnimationEnabled',
    apply: 'emoteAnimation',
  },
  {
    key: 'chatterinoBadges',
    type: 'bool',
    default: true,
    scope: 'sync',
    category: 'display',
    section: 'cosmetics',
    label: 'chatterino badges',
    tip: 'chatterino badges on chatters',
    control: 'pill',
    rerender: true,
  },
  {
    key: 'nativeVisible',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'display',
    section: 'cosmetics',
    label: 'show native chat',
    tip: 'show the platform native chat alongside heatsync — access gift sub, channel points, predictions',
    control: 'pill',
    runtimeVar: 'nativeVisible',
    apply: 'nativeVisible',
    applyOnLoad: true,
  },

  // ── chat / input ──────────────────────────────────────────────────────
  {
    key: 'wysiwygEnabled',
    type: 'bool',
    default: true,
    scope: 'sync',
    category: 'chat',
    section: 'input',
    labelKey: 'mc_settings_input_preview',
    tipKey: 'mc_settings_input_preview_desc',
    control: 'pill',
    alias: 'wysiwyg',
    runtimeVar: 'wysiwygEnabled',
    apply: 'rebuildInput',
    migrate: 'wysiwygDefaultOn_v1',
  },
  {
    key: 'viMode',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'chat',
    section: 'input',
    labelKey: 'mc_settings_vi_mode',
    tipKey: 'mc_settings_vi_mode_desc',
    control: 'pill',
    alias: 'vi',
    runtimeVar: 'viModeEnabled',
    apply: 'viMode',
  },

  // ── chat / messages ───────────────────────────────────────────────────
  {
    key: 'linksEnabled',
    type: 'bool',
    default: true,
    scope: 'sync',
    category: 'chat',
    section: 'messages',
    labelKey: 'mc_settings_clickable_links',
    tipKey: 'mc_settings_clickable_links_desc',
    control: 'pill',
    alias: 'links',
    runtimeVar: 'linksEnabled',
    rerender: true,
  },
  {
    key: 'linkPreviewsEnabled',
    type: 'bool',
    default: true,
    scope: 'sync',
    category: 'chat',
    section: 'messages',
    labelKey: 'mc_settings_link_previews',
    tipKey: 'mc_settings_link_previews_desc',
    control: 'pill',
    alias: 'linkpreviews',
    runtimeVar: 'linkPreviewsEnabled',
  },
  {
    key: 'mediaEmbedsEnabled',
    type: 'bool',
    default: true,
    scope: 'sync',
    category: 'chat',
    section: 'messages',
    labelKey: 'mc_settings_media_embeds',
    tipKey: 'mc_settings_media_embeds_desc',
    control: 'pill',
    alias: 'mediaembeds',
    runtimeVar: 'mediaEmbedsEnabled',
    rerender: true,
  },
  {
    key: 'hs_auto_claim_points',
    type: 'bool',
    default: true,
    scope: 'local',
    category: 'chat',
    section: 'messages',
    labelKey: 'mc_settings_auto_claim',
    tipKey: 'mc_settings_auto_claim_desc',
    control: 'pill',
    alias: 'autoclaim',
    runtimeVar: 'autoClaimPoints',
    apply: 'autoClaim',
    applyOnLoad: true,
    firstRunPersist: true,
  },
  {
    key: 'hs_dim_timeouts',
    type: 'bool',
    default: true,
    scope: 'local',
    category: 'chat',
    section: 'messages',
    labelKey: 'mc_settings_dim_timeouts',
    tipKey: 'mc_settings_dim_timeouts_desc',
    control: 'pill',
    alias: 'dimtimeouts',
    runtimeVar: 'dimTimeouts',
  },
  {
    key: 'keywordHighlights',
    type: 'text',
    default: '',
    scope: 'local-mirror',
    mirrorKey: 'keyword_highlights',
    legacySyncFallback: true,
    category: 'chat',
    section: 'messages',
    labelKey: 'mc_settings_keyword_highlights',
    tipKey: 'mc_settings_keyword_highlights_desc',
    placeholderKey: 'mc_settings_keyword_highlights_placeholder',
    control: 'textarea',
    alias: 'keywordhighlights',
    runtimeVar: 'keywordHighlights',
    apply: 'keywordRegex',
    applyOnLoad: true,
    rerender: true,
    maxLen: 65536,
  },

  // ── chat / privacy ────────────────────────────────────────────────────
  {
    key: 'anonChat',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'chat',
    section: 'privacy',
    label: 'anonymous presence',
    tip: "don't broadcast typing/presence signals to the platform",
    control: 'pill',
  },

  // ── chat / native chat — the platform's own chat input + messages ─────
  // Consumed by heatsync-button.js + autocomplete-hook.js (via the
  // localStorage mirror) — same ui_settings keys the picker popup writes.
  {
    key: 'emoteWysiwyg',
    type: 'bool',
    default: true,
    scope: 'sync',
    category: 'chat',
    section: 'native chat',
    label: 'show emotes as images while typing',
    tip: 'render emotes as images inside the native chat input (wysiwyg)',
    control: 'pill',
  },
  {
    key: 'emoteSpaceAfter',
    type: 'bool',
    default: true,
    scope: 'sync',
    category: 'chat',
    section: 'native chat',
    label: 'space after emote',
    tip: 'insert a space after tab-completing an emote',
    control: 'pill',
  },
  {
    key: 'compactChatInput',
    type: 'bool',
    default: true,
    scope: 'sync',
    category: 'chat',
    section: 'native chat',
    label: 'compact chat input',
    tip: 'tighter native chat input row',
    control: 'pill',
  },
  {
    key: 'highlightMentions',
    type: 'bool',
    default: true,
    scope: 'sync',
    category: 'chat',
    section: 'native chat',
    label: 'highlight @mentions',
    tip: 'tint native chat rows that mention you',
    control: 'pill',
  },
  {
    key: 'rightClickBlockMode',
    type: 'enum',
    default: 'menu',
    scope: 'sync',
    category: 'chat',
    section: 'native chat',
    label: 'emote right-click',
    tip: 'menu = context menu with open/copy/block · instant = block immediately · off = native right-click',
    control: 'sizebtns',
    options: [
      { value: 'menu', label: 'menu' },
      { value: 'instant', label: 'instant' },
      { value: 'off', label: 'off' },
    ],
  },

  // ── notifs / inline notifications ─────────────────────────────────────
  {
    key: 'inlineNotifs',
    type: 'boolmap',
    scope: 'sync',
    category: 'notifs',
    sectionKey: 'mc_settings_inline_notifs',
    label: 'inline notifications',
    control: 'pill',
    runtimeVar: 'inlineNotifs',
    default: { op: true, mop: true, re: true, dm: false, moment: true },
    options: [
      {
        value: 'op',
        default: true,
        tag: '[OP]',
        color: '#ff0000',
        borderColor: '#ff0000',
        labelKey: 'mc_settings_notif_op',
        tipKey: 'mc_settings_notif_op_desc',
      },
      {
        value: 'mop',
        default: true,
        tag: '[OP]',
        color: '#ff00ff',
        borderColor: '#ff00ff',
        labelKey: 'mc_settings_notif_op_reply',
        tipKey: 'mc_settings_notif_op_reply_desc',
      },
      {
        value: 're',
        default: true,
        tag: '[RE]',
        color: '#00ffff',
        borderColor: '#00ffff',
        labelKey: 'mc_settings_notif_re',
        tipKey: 'mc_settings_notif_re_desc',
      },
      {
        value: 'dm',
        default: false,
        tag: '[DM]',
        color: '#ffff00',
        borderColor: '#ffff00',
        labelKey: 'mc_settings_notif_dm',
        tipKey: 'mc_settings_notif_dm_desc',
      },
      {
        value: 'moment',
        default: true,
        tag: '[🔥]',
        color: '#ff8700',
        borderColor: '#ff8700',
        label: 'moment alerts',
        tip: "a channel's chat suddenly explodes — heat spike detected server-side; click the row to open the stream",
      },
    ],
  },

  // ── notifs / twitch events ────────────────────────────────────────────
  {
    key: 'hermesEvents',
    type: 'boolmap',
    scope: 'sync',
    category: 'notifs',
    sectionKey: 'mc_settings_twitch_events',
    label: 'twitch events',
    control: 'pill',
    runtimeVar: 'hermesToggles',
    default: {
      online: true,
      offline: false,
      gameSwitch: true,
      raid: true,
      hype: false,
      sub: true,
      redeem: true,
      pred: true,
      poll: true,
    },
    options: [
      { value: 'online', default: true, color: '#00ff7f', label: 'went live', tip: 'banner when a channel goes live' },
      {
        value: 'offline',
        default: false,
        color: '#808080',
        label: 'went offline',
        tip: 'banner when a channel goes offline (off by default — noisy)',
      },
      {
        value: 'gameSwitch',
        default: true,
        color: '#ff00ff',
        label: 'game switches',
        tip: 'banner when a streamer changes the game',
      },
      {
        value: 'raid',
        default: true,
        color: '#9146ff',
        labelKey: 'mc_settings_raids',
        tipKey: 'mc_settings_raids_desc',
      },
      {
        value: 'hype',
        default: false,
        color: '#ff8700',
        labelKey: 'mc_settings_hype_trains',
        tipKey: 'mc_settings_hype_trains_desc',
      },
      {
        value: 'sub',
        default: true,
        color: '#00ff7f',
        labelKey: 'mc_settings_gift_subs',
        tipKey: 'mc_settings_gift_subs_desc',
      },
      {
        value: 'redeem',
        default: true,
        color: '#00bfff',
        labelKey: 'mc_settings_redeems',
        tipKey: 'mc_settings_redeems_desc',
      },
      {
        value: 'pred',
        default: true,
        color: '#387aff',
        labelKey: 'mc_settings_prediction_banner',
        tipKey: 'mc_settings_prediction_banner_desc',
      },
      {
        value: 'poll',
        default: true,
        color: '#00c853',
        labelKey: 'mc_settings_poll_banner',
        tipKey: 'mc_settings_poll_banner_desc',
      },
    ],
  },

  // ── notifs / on @mention ──────────────────────────────────────────────
  {
    key: 'hs_notifications',
    type: 'bool',
    default: false,
    scope: 'local',
    category: 'notifs',
    section: 'when you get @mentioned',
    label: 'browser notification',
    tip: 'show a desktop notification when someone @s you',
    control: 'pill',
    apply: 'notifPermission',
  },
  {
    key: 'mentionTitleFlash',
    type: 'bool',
    default: true,
    scope: 'sync',
    category: 'notifs',
    section: 'when you get @mentioned',
    label: 'tab title flash',
    tip: "pulse the browser tab title with the mentioner's name until you focus the tab",
    control: 'pill',
  },
  {
    key: 'mentionSoundVolume',
    type: 'range',
    default: 0.3,
    scope: 'sync',
    category: 'notifs',
    section: 'when you get @mentioned',
    label: 'mention sound volume',
    tip: 'audio ping volume on mention. 0 = silent. uses pure WebAudio tones, no asset shipped.',
    control: 'range',
    alias: 'mentionsoundvolume',
    apply: 'mentionPing',
    displayScale: 100,
    syncSilent: true,
    options: { min: 0, max: 1, step: 0.05 },
  },

  // ── notifs / cross-platform follow ────────────────────────────────────
  {
    key: 'crossFollowKick',
    type: 'bool',
    default: true,
    scope: 'sync',
    category: 'notifs',
    section: 'cross-platform follow',
    label: 'also follow on kick',
    tip: 'when you follow on heatsync, also follow on kick if they have a linked kick account. needs a kick.com login; queues otherwise',
    control: 'pill',
  },

  // ── mod / mod toolbar ─────────────────────────────────────────────────
  // Hover actions on chat rows when you mod the channel. Option tags are
  // the button glyphs (rendered orange, matching the toolbar itself);
  // MOD_BUTTON_CATALOG in main.js keeps the action wiring — ids are the
  // contract between the two.
  {
    key: 'hs_mod_toolbar_buttons',
    type: 'multiselect',
    default: [],
    scope: 'local',
    category: 'mod',
    section: 'mod toolbar',
    label: 'mod toolbar buttons',
    tip: 'hover actions on chat rows when you mod the channel — all off by default',
    control: 'pill',
    runtimeVar: 'modToolbarButtons',
    apply: 'modToolbar',
    applyOnLoad: true,
    options: [
      { value: 'delete_message', tag: 'x', label: 'delete this message' },
      { value: 'timeout_1m', tag: '1m', label: 'timeout 1 minute' },
      { value: 'timeout_10m', tag: '10m', label: 'timeout 10 minutes' },
      { value: 'timeout_1h', tag: '1h', label: 'timeout 1 hour' },
      { value: 'timeout_24h', tag: '24h', label: 'timeout 24 hours' },
      { value: 'timeout_7d', tag: '7d', label: 'timeout 7 days' },
      { value: 'ban', tag: '⛔', label: 'permanent ban' },
      { value: 'unban', tag: '✓', label: 'unban user' },
    ],
  },

  // ── mod / automod ─────────────────────────────────────────────────────
  {
    key: 'automodAllCaps',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'mod',
    section: 'automod',
    label: 'hide all-caps spam',
    tip: 'hide messages over 10 chars that are mostly uppercase',
    control: 'pill',
    apply: 'automod',
    applyOnLoad: true,
  },
  {
    key: 'automodRegex',
    type: 'text',
    default: '',
    scope: 'sync',
    category: 'mod',
    section: 'automod',
    label: 'filter regex',
    tip: 'one pattern per line, case-insensitive -- matching messages get hidden',
    placeholder: 'bit\\.ly\nfree\\s+v[\\-]?bucks',
    control: 'textarea',
    alias: 'automodregex',
    apply: 'automod',
    applyOnLoad: true,
    maxLen: 4096,
  },

  // ── filters / content — per-viewer content-warning emote filters ──────
  // local bool + server PATCH with rollback; sexual + gore hidden by
  // default server-side, weapons/drugs/hate shown by default
  {
    key: 'viewer_show_sexual',
    type: 'bool',
    default: false,
    scope: 'local',
    category: 'filters',
    section: 'content',
    label: 'show sexual emotes',
    tip: 'emotes flagged for sexual content (≥ 70%) are hidden by default. shown with a dashed border when on.',
    control: 'pill',
    apply: 'cwServerPatch',
    noReset: true,
    cw: { stateKey: 'sexual', serverBody: 'show_sexual_emotes', noun: 'sexual emotes setting' },
  },
  {
    key: 'viewer_show_gore',
    type: 'bool',
    default: false,
    scope: 'local',
    category: 'filters',
    section: 'content',
    label: 'show gore emotes',
    tip: 'emotes flagged for violence/gore (≥ 70%) are hidden by default. shown with a dashed border when on.',
    control: 'pill',
    apply: 'cwServerPatch',
    noReset: true,
    cw: { stateKey: 'gore', serverBody: 'show_gore_emotes', noun: 'gore emotes setting' },
  },
  {
    key: 'viewer_show_weapon',
    type: 'bool',
    default: true,
    scope: 'local',
    category: 'filters',
    section: 'content',
    label: 'show weapons emotes',
    tip: 'emotes flagged for weapons imagery. on by default.',
    control: 'pill',
    apply: 'cwServerPatch',
    noReset: true,
    cw: { stateKey: 'weapon', serverBody: 'show_weapon_emotes', noun: 'weapons setting' },
  },
  {
    key: 'viewer_show_drug',
    type: 'bool',
    default: true,
    scope: 'local',
    category: 'filters',
    section: 'content',
    label: 'show drugs emotes',
    tip: 'emotes flagged for drug imagery. on by default.',
    control: 'pill',
    apply: 'cwServerPatch',
    noReset: true,
    cw: { stateKey: 'drug', serverBody: 'show_drug_emotes', noun: 'drugs setting' },
  },
  {
    key: 'viewer_show_hate',
    type: 'bool',
    default: true,
    scope: 'local',
    category: 'filters',
    section: 'content',
    label: 'show hate emotes',
    tip: 'emotes flagged for hate imagery. on by default.',
    control: 'pill',
    apply: 'cwServerPatch',
    noReset: true,
    cw: { stateKey: 'hate', serverBody: 'show_hate_emotes', noun: 'hate setting' },
  },

  // ── filters / messages — render-time content filters ──────────────────
  // Hidden at render, not dropped from buffers — toggling off un-hides
  // retroactively. Mentions/unread state still counts hidden messages.
  {
    key: 'hideBots',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'filters',
    section: 'messages',
    label: 'hide bots',
    tip: 'hide messages from known chat bots (nightbot, streamelements, fossabot…)',
    control: 'pill',
    rerender: true,
  },
  {
    key: 'hideCommands',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'filters',
    section: 'messages',
    label: 'hide !commands',
    tip: 'hide messages that start with !',
    control: 'pill',
    rerender: true,
  },
  {
    key: 'hideDuplicates',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'filters',
    section: 'messages',
    label: 'hide duplicates',
    tip: 'collapse identical consecutive messages (spam waves) to the first one',
    control: 'pill',
    rerender: true,
  },
  {
    key: 'hs_mute_keywords',
    type: 'text',
    default: '',
    scope: 'local',
    category: 'filters',
    section: 'messages',
    label: 'mute keywords',
    tip: 'one term per line — messages containing any get hidden. distinct from keyword highlights.',
    placeholder: 'spoiler\n!drops',
    control: 'textarea',
    apply: 'muteKeywords',
    applyOnLoad: true,
    rerender: true,
    maxLen: 65536,
  },

  // ── tweaks — twitch ui noise toggles (content.js CSS-hide flags) ──────
  // order defines section ordering in the tweaks subtab
  {
    key: 'hideChannelPoints',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'tweaks',
    section: 'channel points / hype',
    tweak: true,
    control: 'pill',
    label: 'channel points button',
    tip: 'hides the points/claim button beside chat input',
  },
  {
    key: 'hideHypeTrain',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'tweaks',
    section: 'channel points / hype',
    tweak: true,
    control: 'pill',
    label: 'hype train banner',
    tip: 'banner above chat showing hype train progress',
  },
  {
    key: 'hideHypeChat',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'tweaks',
    section: 'channel points / hype',
    tweak: true,
    control: 'pill',
    label: 'hype chat button',
    tip: 'paid pinned-message button in chat input row',
  },
  {
    key: 'hidePinnedHypeChats',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'tweaks',
    section: 'channel points / hype',
    tweak: true,
    control: 'pill',
    label: 'pinned hype chats',
    tip: 'pinned paid-message stack at top of chat',
  },
  {
    key: 'hideCombos',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'tweaks',
    section: 'channel points / hype',
    tweak: true,
    control: 'pill',
    label: 'combos / power-ups',
    tip: 'one-tap streak buttons in chat input',
  },
  {
    key: 'hideBitsBtns',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'tweaks',
    section: 'channel points / hype',
    tweak: true,
    control: 'pill',
    label: 'bits / cheer buttons',
    tip: 'bits balance + cheer button',
  },
  {
    key: 'hideCharity',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'tweaks',
    section: 'callouts / banners',
    tweak: true,
    control: 'pill',
    label: 'charity callout',
    tip: 'fundraiser banners above chat',
  },
  {
    key: 'hideDrops',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'tweaks',
    section: 'callouts / banners',
    tweak: true,
    control: 'pill',
    label: 'drops banner',
    tip: 'drops/quest progress callouts',
  },
  {
    key: 'hidePolls',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'tweaks',
    section: 'callouts / banners',
    tweak: true,
    control: 'pill',
    label: 'active poll',
    tip: 'poll widget above chat',
  },
  {
    key: 'hidePredictions',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'tweaks',
    section: 'callouts / banners',
    tweak: true,
    control: 'pill',
    label: 'active prediction',
    tip: 'prediction widget above chat',
  },
  {
    key: 'hideGiftBanner',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'tweaks',
    section: 'callouts / banners',
    tweak: true,
    control: 'pill',
    label: 'gift sub mass banner',
    tip: 'banner when many subs gifted at once',
  },
  {
    key: 'hideCommunityHighlights',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'tweaks',
    section: 'callouts / banners',
    tweak: true,
    control: 'pill',
    label: 'community highlights',
    tip: 'pinned-message stack at top of chat',
  },
  {
    key: 'hideSharedChatBanner',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'tweaks',
    section: 'callouts / banners',
    tweak: true,
    control: 'pill',
    label: 'shared chat banner',
    tip: 'cross-platform shared-chat indicator',
  },
  {
    key: 'hideRecommendedChannels',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'tweaks',
    section: 'sidebar / chrome',
    tweak: true,
    control: 'pill',
    label: 'recommended channels',
    tip: 'sidebar "Recommended Channels" section',
  },
  {
    key: 'hideStories',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'tweaks',
    section: 'sidebar / chrome',
    tweak: true,
    control: 'pill',
    label: 'stories shelf',
    tip: 'sidebar / top stories rail',
  },
  {
    key: 'hidePrimeLoot',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'tweaks',
    section: 'sidebar / chrome',
    tweak: true,
    control: 'pill',
    label: 'prime gaming loot upsell',
    tip: 'crown-icon prime loot button',
  },
  {
    key: 'hideTwitchTurbo',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'tweaks',
    section: 'sidebar / chrome',
    tweak: true,
    control: 'pill',
    label: 'twitch turbo upsell',
    tip: 'turbo cta links',
  },
  {
    key: 'hideSubtember',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'tweaks',
    section: 'sidebar / chrome',
    tweak: true,
    control: 'pill',
    label: 'subtember / seasonal banners',
    tip: 'seasonal subscription gradient banners',
  },
  {
    key: 'hideDiscoverLuna',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'tweaks',
    section: 'sidebar / chrome',
    tweak: true,
    control: 'pill',
    label: 'discover luna promo',
    tip: 'external app promo link',
  },
  {
    key: 'hideLiveNotifBtn',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'tweaks',
    section: 'sidebar / chrome',
    tweak: true,
    control: 'pill',
    label: 'live notification toggle',
    tip: 'subscribe-to-notifications bell button',
  },
  {
    key: 'hideUnfollowBtn',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'tweaks',
    section: 'sidebar / chrome',
    tweak: true,
    control: 'pill',
    label: 'unfollow button',
    tip: 'unfollow button (prevents misclicks)',
  },
  {
    key: 'hideSubscribeBtn',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'tweaks',
    section: 'sidebar / chrome',
    tweak: true,
    control: 'pill',
    label: 'subscribe button',
    tip: 'channel subscribe button',
  },
  {
    key: 'hideOnscreenCelebrations',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'tweaks',
    section: 'player overlay',
    tweak: true,
    control: 'pill',
    label: 'onscreen celebrations',
    tip: 'confetti / celebration overlays on video',
  },
  {
    key: 'hidePlayerExtensions',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'tweaks',
    section: 'player overlay',
    tweak: true,
    control: 'pill',
    label: 'player extensions',
    tip: 'overlay extensions covering the video',
  },

  // ── mod / native chat ─────────────────────────────────────────────────
  {
    key: 'showClearedMessages',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'mod',
    section: 'native chat',
    label: 'show deleted messages',
    tip: 'keep deleted/timed-out messages visible (struck through) in native twitch chat',
    control: 'pill',
  },

  // ── tweaks / native chat chrome ───────────────────────────────────────
  {
    key: 'hideChatHeader',
    type: 'bool',
    default: true,
    scope: 'sync',
    category: 'tweaks',
    section: 'native chat',
    tweak: true,
    control: 'pill',
    label: 'chat header',
    tip: "hide the native chat header bar (default on — heatsync's chrome replaces it)",
  },
  {
    key: 'hideStreamTitle',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'tweaks',
    section: 'native chat',
    tweak: true,
    control: 'pill',
    label: 'stream title',
    tip: 'hide the stream title block under the player',
  },
  {
    key: 'hideViewerCount',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'tweaks',
    section: 'native chat',
    tweak: true,
    control: 'pill',
    label: 'viewer count',
    tip: 'hide the live viewer counter',
  },

  // ── system / tabs ─────────────────────────────────────────────────────
  {
    key: 'hiddenTabs',
    type: 'multiselect',
    default: ['pinned'],
    scope: 'sync',
    category: 'system',
    section: 'tabs',
    label: 'visible tabs',
    control: 'pill',
    runtimeVar: 'hiddenTabs',
    apply: 'hiddenTabs',
    invertDisplay: true,
    options: [
      { value: 'feed', labelKey: 'mc_tab_feed' },
      { value: 'whispers', labelKey: 'mc_tab_whispers' },
      { value: 'mentions', labelKey: 'mc_tab_mentions' },
      { value: 'pinned', labelKey: 'mc_tab_pinned' },
    ],
  },

  // ── system / language ─────────────────────────────────────────────────
  // Option labels hydrate at runtime from I18N_LOCALE_NAMES (browser-api.js
  // stays the single source of locale display names). The locale applier
  // re-inits i18n live; full UI re-labels on reload (reloadApply chip).
  {
    key: 'hs_ui_locale',
    type: 'enum',
    default: '',
    scope: 'local',
    category: 'system',
    section: 'language',
    label: 'interface language',
    tip: 'multichat ui language — relabels fully on reload',
    control: 'select',
    apply: 'locale',
    reloadApply: true,
    options: [
      { value: '' },
      { value: 'ar' },
      { value: 'bg' },
      { value: 'cs' },
      { value: 'da' },
      { value: 'de' },
      { value: 'el' },
      { value: 'en' },
      { value: 'es' },
      { value: 'fi' },
      { value: 'fr' },
      { value: 'he' },
      { value: 'hi' },
      { value: 'hu' },
      { value: 'id' },
      { value: 'it' },
      { value: 'ja' },
      { value: 'ko' },
      { value: 'ms' },
      { value: 'nl' },
      { value: 'no' },
      { value: 'pl' },
      { value: 'pt_BR' },
      { value: 'pt_PT' },
      { value: 'ro' },
      { value: 'ru' },
      { value: 'sk' },
      { value: 'sv' },
      { value: 'th' },
      { value: 'tl' },
      { value: 'tr' },
      { value: 'uk' },
      { value: 'vi' },
      { value: 'zh_CN' },
      { value: 'zh_TW' },
    ],
  },

  // ── system / subsystems — compose your own chat ───────────────────────
  // Whole features OFF for real: gated at init so a disabled subsystem
  // never creates its sockets/listeners/DOM (RAM + CPU reclaim). Most
  // need a reload to apply (applies:'reload'); live ones tear down in
  // place. Server health kill-switch (__hsHealth.disabled) overrides.
  {
    key: 'subsystems',
    type: 'boolmap',
    scope: 'sync',
    category: 'system',
    section: 'subsystems',
    label: 'subsystems',
    apply: 'subsystemToggle',
    control: 'pill',
    default: {
      'irc-twitch': true,
      'chat-kick': true,
      'chat-youtube': true,
      cosmetics: true,
      feed: true,
      whispers: true,
      mentions: true,
      'stream-stats': true,
      'profile-cards': true,
      'emote-render': true,
      'tab-complete': true,
      'picker-button': true,
      'right-click-block': true,
    },
    options: [
      {
        value: 'irc-twitch',
        default: true,
        color: '#9146ff',
        applies: 'reload',
        label: 'twitch chat feed',
        tip: 'twitch irc connection + channel joins inside the overlay',
      },
      {
        value: 'chat-kick',
        default: true,
        color: '#53fc18',
        applies: 'reload',
        label: 'kick chat feed',
        tip: 'kick websocket connection + channel joins inside the overlay',
      },
      {
        value: 'chat-youtube',
        default: true,
        color: '#ff0000',
        applies: 'reload',
        label: 'youtube chat feed',
        tip: 'youtube live chat subscriptions inside the overlay',
      },
      {
        value: 'cosmetics',
        default: true,
        color: '#00ffff',
        applies: 'reload',
        label: 'third-party cosmetics',
        tip: '7tv paints + bttv/ffz/chatterino badges. off saves ram on busy channels.',
      },
      {
        value: 'feed',
        default: true,
        color: '#00ff7f',
        applies: 'reload',
        label: 'feed',
        tip: 'heatsync social feed tab + its event stream',
      },
      {
        value: 'whispers',
        default: true,
        color: '#ffff00',
        applies: 'reload',
        label: 'whispers',
        tip: 'twitch whisper eventsub socket + whispers tab',
      },
      {
        value: 'mentions',
        default: true,
        color: '#ff00ff',
        applies: 'live',
        label: 'mentions',
        tip: 'mention detection, mentions tab and pings',
      },
      {
        value: 'stream-stats',
        default: true,
        color: '#387aff',
        applies: 'live',
        label: 'stream stats',
        tip: 'per-channel message-rate stats powering heat ranking',
      },
      {
        value: 'profile-cards',
        default: true,
        color: '#00c853',
        applies: 'reload',
        label: 'profile cards',
        tip: 'click a username for the profile card popup',
      },
      {
        value: 'emote-render',
        default: true,
        color: '#ff8700',
        applies: 'reload',
        label: 'emotes in native chat',
        tip: 'render heatsync emotes inside the platform’s own chat',
      },
      {
        value: 'tab-complete',
        default: true,
        color: '#ff8700',
        applies: 'reload',
        label: 'tab-complete in native chat',
        tip: 'emote + username completion in the platform’s own input',
      },
      {
        value: 'picker-button',
        default: true,
        color: '#ff8700',
        applies: 'reload',
        label: 'emote picker button',
        tip: 'the heatsync picker button beside the native chat input',
      },
      {
        value: 'right-click-block',
        default: true,
        color: '#ff8700',
        applies: 'live',
        label: 'right-click emote block',
        tip: 'right-click any emote to instantly block it',
      },
    ],
  },

  // ── system / advanced ─────────────────────────────────────────────────
  {
    key: 'crashTelemetry',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'system',
    section: 'advanced',
    label: 'show diagnostic errors',
    tip: 'errors are captured locally only — never uploaded. this toggle just shows the diagnostic panel below.',
    control: 'pill',
    rerenderSettings: true,
  },
  {
    key: 'debugLogging',
    type: 'bool',
    default: false,
    scope: 'sync',
    category: 'system',
    section: 'advanced',
    label: 'debug logging',
    tip: 'verbose console logging from all heatsync scripts — applies on next page load',
    control: 'pill',
    reloadApply: true,
  },
]

// ── presets ("builds") — sparse diffs over registry defaults ──────────────
// Composite keys (boolmap/multiselect) carry whole values. Anything not in
// a diff stays untouched, so presets compose with user tweaks and survive
// new settings. A preset reads "active" only when ALL its diff keys match.
const SETTINGS_PRESETS = [
  {
    id: 'minimal',
    label: 'minimal',
    tip: 'just chat — no cosmetics, feed, stats or extra chrome',
    diff: {
      avatars: false,
      zebra: false,
      firstChatterGlow: false,
      showPlatformBadges: false,
      linkPreviewsEnabled: false,
      hiddenTabs: ['feed', 'whispers', 'mentions', 'pinned'],
      subsystems: {
        'irc-twitch': true,
        'chat-kick': true,
        'chat-youtube': true,
        cosmetics: false,
        feed: false,
        whispers: false,
        mentions: false,
        'stream-stats': false,
        'profile-cards': true,
        'emote-render': true,
        'tab-complete': true,
        'picker-button': true,
        'right-click-block': true,
      },
    },
  },
  {
    id: 'power-user',
    label: 'power user',
    tip: 'every tab on, timestamps, vi keys',
    diff: {
      viMode: true,
      timestamps: true,
      hiddenTabs: [],
    },
  },
  {
    id: 'moderator',
    label: 'moderator',
    tip: 'timestamps + readable names + all-caps automod',
    diff: {
      timestamps: true,
      automodAllCaps: true,
      hs_readable_names: true,
    },
  },
  {
    id: 'low-ram',
    label: 'low ram',
    tip: 'cosmetics, feed, whispers, stats and previews off; 1x emotes',
    diff: {
      hs_emote_size: 1,
      hs_emoji_size: 1,
      avatars: false,
      linkPreviewsEnabled: false,
      subsystems: {
        'irc-twitch': true,
        'chat-kick': true,
        'chat-youtube': true,
        cosmetics: false,
        feed: false,
        whispers: false,
        mentions: true,
        'stream-stats': false,
        'profile-cards': false,
        'emote-render': true,
        'tab-complete': true,
        'picker-button': true,
        'right-click-block': true,
      },
    },
  },
]

// ── pure validators / helpers ─────────────────────────────────────────────

/**
 * @param {SettingDef} def
 * @param {*} v
 * @returns {boolean}
 */
function validateSettingValue(def, v) {
  if (!def) return false
  switch (def.type) {
    case 'bool':
      return typeof v === 'boolean'
    case 'enum': {
      const opts = /** @type {SettingOption[]} */ (def.options)
      return !!opts && opts.some((o) => o.value === v)
    }
    case 'range': {
      const range = /** @type {{min:number,max:number,step:number}} */ (def.options)
      return typeof v === 'number' && isFinite(v) && !!range && v >= range.min && v <= range.max
    }
    case 'text':
      return typeof v === 'string' && v.length <= (def.maxLen || 4096)
    case 'multiselect': {
      const opts = /** @type {SettingOption[]} */ (def.options)
      return !!opts && Array.isArray(v) && v.every((x) => opts.some((o) => o.value === x))
    }
    case 'boolmap': {
      const opts = /** @type {SettingOption[]} */ (def.options)
      return (
        !!v &&
        typeof v === 'object' &&
        !Array.isArray(v) &&
        !!opts &&
        Object.keys(v).every((k) => typeof v[k] === 'boolean' && opts.some((o) => o.value === k))
      )
    }
    default:
      return false
  }
}

// normalize a raw value toward validity; returns undefined when unsalvageable
/**
 * @param {SettingDef} def
 * @param {*} v
 * @returns {*} normalized value, or undefined
 */
function coerceSettingValue(def, v) {
  if (!def || v === undefined || v === null) return undefined
  switch (def.type) {
    case 'bool':
      return !!v
    case 'enum': {
      const opts = /** @type {SettingOption[]} */ (def.options)
      if (opts && opts.some((o) => o.value === v)) return v
      // tolerate string/number mismatch ('2' vs 2) from DOM datasets
      var loose = opts && opts.find((o) => String(o.value) === String(v))
      return loose ? loose.value : undefined
    }
    case 'range': {
      const range = /** @type {{min:number,max:number,step:number}} */ (def.options)
      var n = typeof v === 'number' ? v : parseFloat(v)
      if (!isFinite(n) || !range) return undefined
      return Math.min(range.max, Math.max(range.min, n))
    }
    case 'text': {
      if (typeof v !== 'string') return undefined
      return v.length > (def.maxLen || 4096) ? v.slice(0, def.maxLen || 4096) : v
    }
    case 'multiselect': {
      const opts = /** @type {SettingOption[]} */ (def.options)
      if (!Array.isArray(v) || !opts) return undefined
      return v.filter((x) => opts.some((o) => o.value === x))
    }
    case 'boolmap': {
      const opts = /** @type {SettingOption[]} */ (def.options)
      if (!v || typeof v !== 'object' || Array.isArray(v) || !opts) return undefined
      // merge known stored subkeys over the full default map — legacy
      // installs persisted partial maps and expect default-fill semantics
      var merged = {}
      for (var dk in def.default) merged[dk] = def.default[dk]
      for (var sk in v) {
        if (opts.some((o) => o.value === sk)) merged[sk] = !!v[sk]
      }
      return merged
    }
    default:
      return undefined
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
    if (def.type === 'boolmap') {
      var boolmapOpts = /** @type {SettingOption[]} */ (def.options)
      var optVals = boolmapOpts ? boolmapOpts.map((o) => o.value) : []
      var defKeys = Object.keys(def.default)
      if (optVals.length !== defKeys.length || !optVals.every((k) => defKeys.indexOf(k) !== -1)) {
        problems.push('boolmap default/options key mismatch: ' + def.key)
      }
      if (boolmapOpts)
        boolmapOpts.forEach((o) => {
          if (def.default[o.value] !== o.default)
            problems.push('boolmap per-option default disagrees with default map: ' + def.key + '.' + o.value)
        })
    }
    if (def.cw && (!def.cw.stateKey || !def.cw.serverBody || !def.cw.noun)) {
      problems.push('cw sub-shape incomplete: ' + def.key)
    }
    if (def.dependsOn) {
      const depKey = def.dependsOn.key
      if (!SETTINGS.some((d) => d.key === depKey)) problems.push('dependsOn unknown key: ' + def.key)
    }
    if (def.scope === 'sync') syncDefaults[def.key] = def.default
  }
  // 8 KB sync quota headroom — defaults must leave room for user values
  var size = JSON.stringify(syncDefaults).length
  if (size > 7000) problems.push('sync defaults too large: ' + size + ' bytes')
  // preset diffs must reference real keys with valid values
  var presetIds = new Set()
  for (var p = 0; p < SETTINGS_PRESETS.length; p++) {
    var preset = SETTINGS_PRESETS[p]
    if (presetIds.has(preset.id)) problems.push('duplicate preset id: ' + preset.id)
    presetIds.add(preset.id)
    for (var dk in preset.diff) {
      var target = SETTINGS.find((d) => d.key === dk)
      if (!target) {
        problems.push('preset ' + preset.id + ' references unknown key: ' + dk)
        continue
      }
      if (!validateSettingValue(target, preset.diff[dk])) {
        problems.push('preset ' + preset.id + ' has invalid value for: ' + dk)
      }
    }
  }
  return problems
}

// Global export (IIFE bundle path — mirrors utils.js)
if (typeof window !== 'undefined') {
  window.heatsyncSettingsSchema = { SETTINGS, SETTINGS_PRESETS, validateSettingValue, coerceSettingValue, lintSettings }
}

export { coerceSettingValue, lintSettings, SETTINGS, SETTINGS_PRESETS, validateSettingValue }
