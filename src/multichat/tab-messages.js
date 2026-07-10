// tab-messages.js — the single source of truth for WHICH platform message
// arrays a chat tab renders, given the per-tab T/K/Y source filter.
//
// No import/export: concatenated into the multichat-<platform>.js bundle (see
// build.js MULTICHAT_MODULES) as plain top-level functions, same as
// send-targets.js. Tested in isolation via tests/tab-messages.test.js.
//
// Why this exists: the live/channel tabs used to inline
// `fairMerge([filt.twitch?a:[], filt.kick?b:[], filt.youtube?c:[]])`. On a page
// where a tab's ONLY populated source is filtered off (e.g. a bare youtube.com
// watch page with the Y filter hidden), that silently produced an EMPTY merge —
// a dead, blank panel with no hint why. That exact failure mode swallowed a full
// debugging night. Routing every tab through selectTabSources() makes the
// distinction explicit: `hiddenByFilter` lets callers show an honest, actionable
// empty state ("N messages hidden — show all") instead of a silent blank, and a
// filter can never make a tab look broken.

/**
 * @param {{twitch?: any[], kick?: any[], youtube?: any[]}} sources
 *   The three platform message arrays for a tab (any may be empty/absent).
 * @param {{twitch?: boolean, kick?: boolean, youtube?: boolean}|null|undefined} filter
 *   The tab's platform filter; a key that is absent/undefined counts as ON
 *   (matches getPlatformFilter's `!== false` default), so a tab with no filter
 *   config behaves exactly as before this module existed.
 * @returns {{
 *   included: any[][],           // arrays to hand to fairMerge (filtered)
 *   hiddenByFilter: boolean,     // messages exist but the filter excluded ALL of them
 *   hiddenCount: number,         // how many messages the filter is hiding
 *   filter: {twitch: boolean, kick: boolean, youtube: boolean}, // resolved (defaults applied)
 *   availablePlatforms: Array<'twitch'|'kick'|'youtube'>,  // platforms that HAVE messages
 * }}
 */
function selectTabSources(sources, filter) {
  const twitch = Array.isArray(sources?.twitch) ? sources.twitch : []
  const kick = Array.isArray(sources?.kick) ? sources.kick : []
  const youtube = Array.isArray(sources?.youtube) ? sources.youtube : []

  const f = {
    twitch: filter?.twitch !== false,
    kick: filter?.kick !== false,
    youtube: filter?.youtube !== false,
  }

  const included = [f.twitch ? twitch : [], f.kick ? kick : [], f.youtube ? youtube : []]

  const total = twitch.length + kick.length + youtube.length
  const shown = (f.twitch ? twitch.length : 0) + (f.kick ? kick.length : 0) + (f.youtube ? youtube.length : 0)
  const hiddenCount = total - shown

  const availablePlatforms = []
  if (twitch.length) availablePlatforms.push('twitch')
  if (kick.length) availablePlatforms.push('kick')
  if (youtube.length) availablePlatforms.push('youtube')

  return {
    included,
    // There ARE messages for this tab, but the active filter excluded every one
    // of them — the caller must render an actionable notice, never a blank panel.
    hiddenByFilter: total > 0 && shown === 0,
    hiddenCount,
    filter: f,
    availablePlatforms,
  }
}
