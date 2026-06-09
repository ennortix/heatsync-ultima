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
//   tweak      true → twitch-ui-noise CSS-hide flag; content.js
//              applyUiSettings() owns the actual hide rules
//   noReset    excluded from resetSettingsToDefaults (server-coupled prefs)
//   cw         {stateKey, serverBody, noun} — per-viewer content-warning
//              filter: local bool + server PATCH /api/user/settings with
//              rollback; main.js derives CW_CATS from these

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

  // ── notifs / inline notifications ─────────────────────────────────────
  {
    key: 'inlineNotifs', type: 'boolmap', scope: 'sync',
    category: 'notifs', sectionKey: 'mc_settings_inline_notifs',
    label: 'inline notifications',
    control: 'pill', runtimeVar: 'inlineNotifs',
    default: { op: true, mop: true, re: true, dm: false },
    options: [
      { value: 'op', default: true, tag: '[OP]', color: '#ff0000', borderColor: '#ff0000', labelKey: 'mc_settings_notif_op', tipKey: 'mc_settings_notif_op_desc' },
      { value: 'mop', default: true, tag: '[OP]', color: '#ff00ff', borderColor: '#ff00ff', labelKey: 'mc_settings_notif_op_reply', tipKey: 'mc_settings_notif_op_reply_desc' },
      { value: 're', default: true, tag: '[RE]', color: '#00ffff', borderColor: '#00ffff', labelKey: 'mc_settings_notif_re', tipKey: 'mc_settings_notif_re_desc' },
      { value: 'dm', default: false, tag: '[DM]', color: '#ffff00', borderColor: '#ffff00', labelKey: 'mc_settings_notif_dm', tipKey: 'mc_settings_notif_dm_desc' },
    ],
  },

  // ── notifs / twitch events ────────────────────────────────────────────
  {
    key: 'hermesEvents', type: 'boolmap', scope: 'sync',
    category: 'notifs', sectionKey: 'mc_settings_twitch_events',
    label: 'twitch events',
    control: 'pill', runtimeVar: 'hermesToggles',
    default: { online: true, offline: false, gameSwitch: true, raid: true, hype: false, sub: true, redeem: true, pred: true, poll: true },
    options: [
      { value: 'online', default: true, color: '#00ff7f', label: 'went live', tip: 'banner when a channel goes live' },
      { value: 'offline', default: false, color: '#808080', label: 'went offline', tip: 'banner when a channel goes offline (off by default — noisy)' },
      { value: 'gameSwitch', default: true, color: '#ff00ff', label: 'game switches', tip: 'banner when a streamer changes the game' },
      { value: 'raid', default: true, color: '#9146ff', labelKey: 'mc_settings_raids', tipKey: 'mc_settings_raids_desc' },
      { value: 'hype', default: false, color: '#ff8700', labelKey: 'mc_settings_hype_trains', tipKey: 'mc_settings_hype_trains_desc' },
      { value: 'sub', default: true, color: '#00ff7f', labelKey: 'mc_settings_gift_subs', tipKey: 'mc_settings_gift_subs_desc' },
      { value: 'redeem', default: true, color: '#00bfff', labelKey: 'mc_settings_redeems', tipKey: 'mc_settings_redeems_desc' },
      { value: 'pred', default: true, color: '#387aff', labelKey: 'mc_settings_prediction_banner', tipKey: 'mc_settings_prediction_banner_desc' },
      { value: 'poll', default: true, color: '#00c853', labelKey: 'mc_settings_poll_banner', tipKey: 'mc_settings_poll_banner_desc' },
    ],
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
    control: 'pill', apply: 'automod', applyOnLoad: true,
  },
  {
    key: 'automodRegex', type: 'text', default: '', scope: 'sync',
    category: 'mod', section: 'automod',
    label: 'filter regex', tip: 'one pattern per line, case-insensitive -- matching messages get hidden',
    placeholder: 'bit\\.ly\nfree\\s+v[\\-]?bucks',
    control: 'textarea', alias: 'automodregex', apply: 'automod', applyOnLoad: true, maxLen: 4096,
  },

  // ── filters / content — per-viewer content-warning emote filters ──────
  // local bool + server PATCH with rollback; sexual + gore hidden by
  // default server-side, weapons/drugs/hate shown by default
  {
    key: 'viewer_show_sexual', type: 'bool', default: false, scope: 'local',
    category: 'filters', section: 'content',
    label: 'show sexual emotes', tip: 'emotes flagged for sexual content (≥ 70%) are hidden by default. shown with a dashed border when on.',
    control: 'pill', runtimeVar: 'cw_sexual', apply: 'cwServerPatch', noReset: true,
    cw: { stateKey: 'sexual', serverBody: 'show_sexual_emotes', noun: 'sexual emotes setting' },
  },
  {
    key: 'viewer_show_gore', type: 'bool', default: false, scope: 'local',
    category: 'filters', section: 'content',
    label: 'show gore emotes', tip: 'emotes flagged for violence/gore (≥ 70%) are hidden by default. shown with a dashed border when on.',
    control: 'pill', runtimeVar: 'cw_gore', apply: 'cwServerPatch', noReset: true,
    cw: { stateKey: 'gore', serverBody: 'show_gore_emotes', noun: 'gore emotes setting' },
  },
  {
    key: 'viewer_show_weapon', type: 'bool', default: true, scope: 'local',
    category: 'filters', section: 'content',
    label: 'show weapons emotes', tip: 'emotes flagged for weapons imagery. on by default.',
    control: 'pill', runtimeVar: 'cw_weapon', apply: 'cwServerPatch', noReset: true,
    cw: { stateKey: 'weapon', serverBody: 'show_weapon_emotes', noun: 'weapons setting' },
  },
  {
    key: 'viewer_show_drug', type: 'bool', default: true, scope: 'local',
    category: 'filters', section: 'content',
    label: 'show drugs emotes', tip: 'emotes flagged for drug imagery. on by default.',
    control: 'pill', runtimeVar: 'cw_drug', apply: 'cwServerPatch', noReset: true,
    cw: { stateKey: 'drug', serverBody: 'show_drug_emotes', noun: 'drugs setting' },
  },
  {
    key: 'viewer_show_hate', type: 'bool', default: true, scope: 'local',
    category: 'filters', section: 'content',
    label: 'show hate emotes', tip: 'emotes flagged for hate imagery. on by default.',
    control: 'pill', runtimeVar: 'cw_hate', apply: 'cwServerPatch', noReset: true,
    cw: { stateKey: 'hate', serverBody: 'show_hate_emotes', noun: 'hate setting' },
  },

  // ── tweaks — twitch ui noise toggles (content.js CSS-hide flags) ──────
  // order defines section ordering in the tweaks subtab
  {
    key: 'hideChannelPoints', type: 'bool', default: false, scope: 'sync',
    category: 'tweaks', section: 'channel points / hype', tweak: true, control: 'pill',
    label: 'channel points button', tip: 'hides the points/claim button beside chat input',
  },
  {
    key: 'hideHypeTrain', type: 'bool', default: false, scope: 'sync',
    category: 'tweaks', section: 'channel points / hype', tweak: true, control: 'pill',
    label: 'hype train banner', tip: 'banner above chat showing hype train progress',
  },
  {
    key: 'hideHypeChat', type: 'bool', default: false, scope: 'sync',
    category: 'tweaks', section: 'channel points / hype', tweak: true, control: 'pill',
    label: 'hype chat button', tip: 'paid pinned-message button in chat input row',
  },
  {
    key: 'hidePinnedHypeChats', type: 'bool', default: false, scope: 'sync',
    category: 'tweaks', section: 'channel points / hype', tweak: true, control: 'pill',
    label: 'pinned hype chats', tip: 'pinned paid-message stack at top of chat',
  },
  {
    key: 'hideCombos', type: 'bool', default: false, scope: 'sync',
    category: 'tweaks', section: 'channel points / hype', tweak: true, control: 'pill',
    label: 'combos / power-ups', tip: 'one-tap streak buttons in chat input',
  },
  {
    key: 'hideBitsBtns', type: 'bool', default: false, scope: 'sync',
    category: 'tweaks', section: 'channel points / hype', tweak: true, control: 'pill',
    label: 'bits / cheer buttons', tip: 'bits balance + cheer button',
  },
  {
    key: 'hideCharity', type: 'bool', default: false, scope: 'sync',
    category: 'tweaks', section: 'callouts / banners', tweak: true, control: 'pill',
    label: 'charity callout', tip: 'fundraiser banners above chat',
  },
  {
    key: 'hideDrops', type: 'bool', default: false, scope: 'sync',
    category: 'tweaks', section: 'callouts / banners', tweak: true, control: 'pill',
    label: 'drops banner', tip: 'drops/quest progress callouts',
  },
  {
    key: 'hidePolls', type: 'bool', default: false, scope: 'sync',
    category: 'tweaks', section: 'callouts / banners', tweak: true, control: 'pill',
    label: 'active poll', tip: 'poll widget above chat',
  },
  {
    key: 'hidePredictions', type: 'bool', default: false, scope: 'sync',
    category: 'tweaks', section: 'callouts / banners', tweak: true, control: 'pill',
    label: 'active prediction', tip: 'prediction widget above chat',
  },
  {
    key: 'hideGiftBanner', type: 'bool', default: false, scope: 'sync',
    category: 'tweaks', section: 'callouts / banners', tweak: true, control: 'pill',
    label: 'gift sub mass banner', tip: 'banner when many subs gifted at once',
  },
  {
    key: 'hideCommunityHighlights', type: 'bool', default: false, scope: 'sync',
    category: 'tweaks', section: 'callouts / banners', tweak: true, control: 'pill',
    label: 'community highlights', tip: 'pinned-message stack at top of chat',
  },
  {
    key: 'hideSharedChatBanner', type: 'bool', default: false, scope: 'sync',
    category: 'tweaks', section: 'callouts / banners', tweak: true, control: 'pill',
    label: 'shared chat banner', tip: 'cross-platform shared-chat indicator',
  },
  {
    key: 'hideRecommendedChannels', type: 'bool', default: false, scope: 'sync',
    category: 'tweaks', section: 'sidebar / chrome', tweak: true, control: 'pill',
    label: 'recommended channels', tip: 'sidebar "Recommended Channels" section',
  },
  {
    key: 'hideStories', type: 'bool', default: false, scope: 'sync',
    category: 'tweaks', section: 'sidebar / chrome', tweak: true, control: 'pill',
    label: 'stories shelf', tip: 'sidebar / top stories rail',
  },
  {
    key: 'hidePrimeLoot', type: 'bool', default: false, scope: 'sync',
    category: 'tweaks', section: 'sidebar / chrome', tweak: true, control: 'pill',
    label: 'prime gaming loot upsell', tip: 'crown-icon prime loot button',
  },
  {
    key: 'hideTwitchTurbo', type: 'bool', default: false, scope: 'sync',
    category: 'tweaks', section: 'sidebar / chrome', tweak: true, control: 'pill',
    label: 'twitch turbo upsell', tip: 'turbo cta links',
  },
  {
    key: 'hideSubtember', type: 'bool', default: false, scope: 'sync',
    category: 'tweaks', section: 'sidebar / chrome', tweak: true, control: 'pill',
    label: 'subtember / seasonal banners', tip: 'seasonal subscription gradient banners',
  },
  {
    key: 'hideDiscoverLuna', type: 'bool', default: false, scope: 'sync',
    category: 'tweaks', section: 'sidebar / chrome', tweak: true, control: 'pill',
    label: 'discover luna promo', tip: 'external app promo link',
  },
  {
    key: 'hideLiveNotifBtn', type: 'bool', default: false, scope: 'sync',
    category: 'tweaks', section: 'sidebar / chrome', tweak: true, control: 'pill',
    label: 'live notification toggle', tip: 'subscribe-to-notifications bell button',
  },
  {
    key: 'hideUnfollowBtn', type: 'bool', default: false, scope: 'sync',
    category: 'tweaks', section: 'sidebar / chrome', tweak: true, control: 'pill',
    label: 'unfollow button', tip: 'unfollow button (prevents misclicks)',
  },
  {
    key: 'hideSubscribeBtn', type: 'bool', default: false, scope: 'sync',
    category: 'tweaks', section: 'sidebar / chrome', tweak: true, control: 'pill',
    label: 'subscribe button', tip: 'channel subscribe button',
  },
  {
    key: 'hideOnscreenCelebrations', type: 'bool', default: false, scope: 'sync',
    category: 'tweaks', section: 'player overlay', tweak: true, control: 'pill',
    label: 'onscreen celebrations', tip: 'confetti / celebration overlays on video',
  },
  {
    key: 'hidePlayerExtensions', type: 'bool', default: false, scope: 'sync',
    category: 'tweaks', section: 'player overlay', tweak: true, control: 'pill',
    label: 'player extensions', tip: 'overlay extensions covering the video',
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
    case 'boolmap': return !!v && typeof v === 'object' && !Array.isArray(v) &&
      Object.keys(v).every(function(k) {
        return typeof v[k] === 'boolean' && def.options.some(function(o) { return o.value === k })
      })
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
    case 'boolmap': {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined
      // merge known stored subkeys over the full default map — legacy
      // installs persisted partial maps and expect default-fill semantics
      var merged = {}
      for (var dk in def.default) merged[dk] = def.default[dk]
      for (var sk in v) {
        if (def.options.some(function(o) { return o.value === sk })) merged[sk] = !!v[sk]
      }
      return merged
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
    if (def.type === 'boolmap') {
      var optVals = def.options.map(function(o) { return o.value })
      var defKeys = Object.keys(def.default)
      if (optVals.length !== defKeys.length || !optVals.every(function(k) { return defKeys.indexOf(k) !== -1 })) {
        problems.push('boolmap default/options key mismatch: ' + def.key)
      }
      def.options.forEach(function(o) {
        if (def.default[o.value] !== o.default) problems.push('boolmap per-option default disagrees with default map: ' + def.key + '.' + o.value)
      })
    }
    if (def.cw && (!def.cw.stateKey || !def.cw.serverBody || !def.cw.noun)) {
      problems.push('cw sub-shape incomplete: ' + def.key)
    }
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
