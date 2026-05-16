// MAIN-world script. Loaded only on youtube.com.
// Prevents <video>.pause() from firing while the multichat input has focus,
// so pressing space while typing in our chat overlay doesn't pause the video.
// Without this, YT's keyboard handler runs in capture phase (before our input's
// keydown reaches us) and calls pause() — even an immediate replay leaves an
// audible click. Patching pause() at the element level is the only path that
// fully suppresses it; isolated-world content scripts can't intercept calls
// page scripts make on shared DOM nodes.
(() => {
  if (window._hsMcYtPausePatched) return
  window._hsMcYtPausePatched = true

  const inOurInput = () => {
    const ae = document.activeElement
    if (!ae) return false
    if (ae.id === 'hs-mc-input') return true
    return !!(ae.closest && ae.closest('#hs-mc-input'))
  }

  const patchVideo = (v) => {
    if (!v || v._hsMcPausePatched) return
    v._hsMcPausePatched = true
    const origPause = v.pause
    v.pause = function () {
      if (inOurInput()) return
      return origPause.apply(this, arguments)
    }
  }

  const scan = () => {
    const vids = document.querySelectorAll('video')
    for (let i = 0; i < vids.length; i++) patchVideo(vids[i])
  }

  if (document.documentElement) scan()
  new MutationObserver(scan).observe(document.documentElement || document, {
    childList: true,
    subtree: true,
  })
})()
