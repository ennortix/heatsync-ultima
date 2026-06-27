// Ambient declarations for the cross-module globals heatsync attaches to `window`.

// Firefox WebExtensions API — present in Firefox content scripts, absent in Chrome.
// Declared as optional so `typeof browser !== 'undefined'` guards work correctly.
declare var browser: typeof chrome | undefined
// The build concatenates src/lib/*.js into each content-script IIFE; these files
// publish their public surface on `window.*` so multichat/chrome layers can reach
// them without ESM imports. Typed loosely on purpose — tightening to the real
// shapes is phase-2 work once more lib files opt into `// @ts-check`.

interface Window {
  heatsyncApi?: unknown
  heatsyncCleanup?: unknown
  heatsyncConfig?: unknown
  heatsyncSettingsSchema?: unknown
  heatsyncUtils?: unknown
  /** runtime perf trace flag — set to true at devtools to enable */
  __hsPerfTrace?: boolean
  /** ring-buffer of slow callback records (capped at 200) */
  __hsPerfLog?: Array<{ kind: string; ms: number; dur: number; at: number; src: string }>
  /** error reporter singleton guard */
  __hsErrorReporter?: unknown
  /** dedup flag for ctx-death page reload */
  __heatsyncReloadScheduled?: boolean
  /** debug flag (set via localStorage heatsync_debug=true) */
  HEATSYNC_DEBUG?: boolean
}
