// Ambient declarations for the cross-module globals heatsync attaches to `window`.
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
}
