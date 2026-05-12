// heatsync popup — channel popout only.
(function() {
  'use strict';

  const input = document.getElementById('popout-input');
  const btn = document.getElementById('popout-btn');
  const detected = document.getElementById('detected');
  const linkOptions = document.getElementById('link-options');

  let platform = 'twitch';
  let ytIsHandle = false;

  function parseInput(raw) {
    const v = (raw || '').trim();
    if (!v) return null;
    if (/^https?:\/\//i.test(v)) {
      try {
        const u = new URL(v);
        const h = u.hostname.replace(/^www\./, '');
        if (h.endsWith('twitch.tv')) {
          const m = u.pathname.match(/^\/(?:popout\/|embed\/)?([a-z0-9_]+)/i);
          if (m) return { platform: 'twitch', channel: m[1].toLowerCase(), isHandle: false };
        }
        if (h.endsWith('kick.com')) {
          const m = u.pathname.match(/^\/(?:popout\/)?([a-z0-9_]+)/i);
          if (m) return { platform: 'kick', channel: m[1].toLowerCase(), isHandle: false };
        }
        if (h.endsWith('youtube.com') || h === 'youtu.be') {
          const handle = u.pathname.match(/^\/@([^/]+)/);
          if (handle) return { platform: 'youtube', channel: handle[1].toLowerCase(), isHandle: true };
          const live = u.pathname.match(/^\/live\/([^/?]+)/);
          if (live) return { platform: 'youtube', channel: live[1], isHandle: false };
          const vid = u.searchParams.get('v');
          if (vid) return { platform: 'youtube', channel: vid, isHandle: false };
        }
      } catch {}
    }
    const channel = v.replace(/^@/, '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!channel) return null;
    return { platform, channel, isHandle: ytIsHandle && platform === 'youtube' };
  }

  function buildUrl(p) {
    if (p.platform === 'youtube') {
      return p.isHandle
        ? 'https://www.youtube.com/@' + p.channel + '/live'
        : 'https://www.youtube.com/live_chat?v=' + p.channel + '&is_popout=1';
    }
    if (p.platform === 'kick') return 'https://kick.com/popout/' + p.channel + '/chat';
    return 'https://www.twitch.tv/popout/' + p.channel + '/chat';
  }

  async function openPopoutWindow(url) {
    if (!url) return;
    const winApi = (typeof browser !== 'undefined' ? browser : chrome).windows;
    const tabsApi = (typeof browser !== 'undefined' ? browser : chrome).tabs;
    if (winApi?.create) {
      try {
        await winApi.create({
          url,
          type: 'popup',
          width: 400,
          height: 600,
          focused: true,
          left: Math.max(0, (screen.availWidth || 1280) - 420),
          top: 80,
        });
        window.close();
        return;
      } catch {}
    }
    try { await tabsApi.create({ url }); } catch {}
    window.close();
  }

  function openPopout() {
    const p = parseInput(input.value);
    if (!p) { input.focus(); return; }
    openPopoutWindow(buildUrl(p));
  }

  function setDetected(p, channel) {
    while (detected.firstChild) detected.removeChild(detected.firstChild);
    if (!p || !channel) return;
    detected.appendChild(document.createTextNode('on '));
    const b = document.createElement('b');
    b.textContent = p + '/' + channel;
    detected.appendChild(b);
  }

  function autofillFromActiveTab() {
    chrome.tabs.query({ active: true, currentWindow: true }).then(function(tabs) {
      const tab = tabs[0];
      if (!tab || !tab.url) return;
      try {
        const url = new URL(tab.url);
        const host = url.hostname.replace(/^www\./, '');
        if (host.endsWith('twitch.tv')) {
          platform = 'twitch';
          const m = url.pathname.match(/^\/(?:popout\/|embed\/)?([a-zA-Z0-9_]+)/);
          if (m && !['directory','settings','videos','moderator','subscriptions','search','jobs','turbo','prime','p','popout','embed'].includes(m[1].toLowerCase())) {
            input.value = m[1].toLowerCase();
            setDetected('twitch', m[1].toLowerCase());
          }
        } else if (host.endsWith('kick.com')) {
          platform = 'kick';
          const m = url.pathname.match(/^\/([a-zA-Z0-9_]+)/);
          if (m && !['categories','following','settings','search','browse'].includes(m[1].toLowerCase())) {
            input.value = m[1].toLowerCase();
            setDetected('kick', m[1].toLowerCase());
          }
        } else if (host.endsWith('youtube.com')) {
          platform = 'youtube';
          const handle = url.pathname.match(/^\/@([^/]+)/);
          if (handle) {
            input.value = handle[1].toLowerCase();
            ytIsHandle = true;
            setDetected('youtube', '@' + handle[1].toLowerCase());
          } else {
            const vid = url.searchParams.get('v');
            const live = url.pathname.match(/^\/live\/([^/?]+)/);
            if (vid) { input.value = vid; setDetected('youtube', vid); }
            else if (live) { input.value = live[1]; setDetected('youtube', live[1]); }
          }
        }
      } catch {}
    });
  }

  btn.addEventListener('click', openPopout);
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') openPopout();
  });
  input.addEventListener('input', function() {
    ytIsHandle = false;
    setDetected(null, null);
  });
  input.addEventListener('focus', function() { input.select(); });

  linkOptions.addEventListener('click', function(e) {
    e.preventDefault();
    if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
  });

  // Errors footer: left-click → copy last 50 to clipboard, right-click → clear.
  // Stored as ring-buffer in chrome.storage.local key 'hs_errors' by lib/error-reporter.js
  // (content scripts) and inline reporter in background.js (service worker).
  const linkErrors = document.getElementById('link-errors');
  function refreshErrorCount() {
    chrome.storage.local.get('hs_errors', (cur) => {
      const arr = Array.isArray(cur?.hs_errors) ? cur.hs_errors : [];
      linkErrors.textContent = 'errors (' + arr.length + ')';
    });
  }
  async function copyErrors() {
    const cur = await new Promise(r => chrome.storage.local.get('hs_errors', r));
    const arr = Array.isArray(cur?.hs_errors) ? cur.hs_errors : [];
    if (arr.length === 0) {
      linkErrors.textContent = 'no errors';
      setTimeout(refreshErrorCount, 1200);
      return;
    }
    const ua = navigator.userAgent;
    const ver = chrome.runtime.getManifest().version;
    const payload = { ver, ua, count: arr.length, errors: arr };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      linkErrors.textContent = 'copied ' + arr.length;
    } catch {
      linkErrors.textContent = 'copy failed';
    }
    setTimeout(refreshErrorCount, 1200);
  }
  function clearErrors() {
    chrome.storage.local.remove('hs_errors', () => {
      linkErrors.textContent = 'cleared';
      setTimeout(refreshErrorCount, 800);
    });
  }
  linkErrors.addEventListener('click', (e) => { e.preventDefault(); copyErrors(); });
  linkErrors.addEventListener('contextmenu', (e) => { e.preventDefault(); clearErrors(); });
  refreshErrorCount();

  autofillFromActiveTab();
  input.focus();
})();
