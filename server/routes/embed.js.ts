// GET /embed.js
//
// Stage 5 — Earnest Scheduler embed widget. External sites drop a single
// <script> tag and get a "Book a call" button that opens the booking page in
// an iframe modal.
//
// Usage on a third-party site:
//
//   <script
//     src="https://app.earnest.guru/embed.js"
//     data-org="hue-studios"
//     data-user="peter"
//     data-event="discovery"
//     data-label="Book a call"
//     data-color="#6366F1"
//     async
//   ></script>
//
// The script:
//   - Reads its own data-* attributes from the <script> tag.
//   - Renders a button (or wraps any element with [data-earnest-book="true"]).
//   - On click, opens an iframe modal pointing at /book/<org>/<user>[/<event>].
//   - Listens for postMessage('earnest:booking:close') from the iframe to
//     close the modal after a successful booking.
//
// We serve this server-side instead of as a static asset because the base
// origin is templated from the runtime config — staging vs prod use different
// hosts.
import { defineEventHandler, setResponseHeaders } from 'h3';

export default defineEventHandler((event) => {
	const config = useRuntimeConfig();
	const baseUrl = (config.public as any)?.siteUrl || 'https://app.earnest.guru';

	const js = renderEmbedScript(baseUrl);

	setResponseHeaders(event, {
		'Content-Type': 'application/javascript; charset=utf-8',
		'Cache-Control': 'public, max-age=300, s-maxage=900',
		'Access-Control-Allow-Origin': '*',
	});
	return js;
});

function renderEmbedScript(baseUrl: string) {
	const safeBase = JSON.stringify(baseUrl);
	return `(function () {
  if (window.__earnestEmbedLoaded) return;
  window.__earnestEmbedLoaded = true;

  var BASE = ${safeBase};
  var BUTTON_CLASS = 'earnest-book-btn';

  function buildBookingUrl(opts) {
    if (!opts.org || !opts.user) return null;
    var path = '/book/' + encodeURIComponent(opts.org) + '/' + encodeURIComponent(opts.user);
    if (opts.event) path += '/' + encodeURIComponent(opts.event);
    return BASE + path + '?embed=1';
  }

  function injectStyles() {
    if (document.getElementById('earnest-embed-styles')) return;
    var s = document.createElement('style');
    s.id = 'earnest-embed-styles';
    s.textContent = [
      '.earnest-book-btn{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:9999px;border:none;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;background:var(--earnest-color,#6366F1);color:#fff;transition:transform .15s ease,opacity .15s ease;}',
      '.earnest-book-btn:hover{transform:translateY(-1px);opacity:.95}',
      '.earnest-book-btn:focus{outline:2px solid var(--earnest-color,#6366F1);outline-offset:2px}',
      '.earnest-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2147483646;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .2s ease;}',
      '.earnest-modal-backdrop.is-open{opacity:1}',
      '.earnest-modal-shell{position:relative;width:min(640px,calc(100vw - 24px));height:min(820px,calc(100vh - 48px));background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.4);transform:translateY(8px);transition:transform .2s ease;}',
      '.earnest-modal-backdrop.is-open .earnest-modal-shell{transform:translateY(0)}',
      '.earnest-modal-shell iframe{width:100%;height:100%;border:0;display:block;}',
      '.earnest-modal-close{position:absolute;top:8px;right:8px;width:32px;height:32px;border-radius:9999px;border:0;background:rgba(0,0,0,.55);color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:1;}',
      '.earnest-modal-close:hover{background:rgba(0,0,0,.8)}',
      '@media (max-width:640px){.earnest-modal-shell{width:100vw;height:100vh;border-radius:0}}',
    ].join('');
    document.head.appendChild(s);
  }

  function openModal(url) {
    injectStyles();
    var backdrop = document.createElement('div');
    backdrop.className = 'earnest-modal-backdrop';
    var shell = document.createElement('div');
    shell.className = 'earnest-modal-shell';

    var close = document.createElement('button');
    close.className = 'earnest-modal-close';
    close.setAttribute('aria-label', 'Close booking');
    close.innerHTML = '&times;';

    var iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.allow = 'payment *; camera; microphone';
    iframe.title = 'Book a meeting';

    shell.appendChild(close);
    shell.appendChild(iframe);
    backdrop.appendChild(shell);
    document.body.appendChild(backdrop);

    // Force layout, then animate in
    requestAnimationFrame(function () { backdrop.classList.add('is-open'); });

    function destroy() {
      backdrop.classList.remove('is-open');
      window.removeEventListener('message', onMessage);
      document.removeEventListener('keydown', onKey);
      setTimeout(function () { if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop); }, 200);
    }

    function onMessage(e) {
      // Origin check — only accept from the booking origin we opened.
      try {
        var iframeOrigin = new URL(url).origin;
        if (e.origin !== iframeOrigin) return;
      } catch (_) { return; }
      var data = e.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'earnest:booking:close' || data.type === 'earnest:booking:done') {
        destroy();
      }
    }

    function onKey(e) { if (e.key === 'Escape') destroy(); }

    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) destroy(); });
    close.addEventListener('click', destroy);
    window.addEventListener('message', onMessage);
    document.addEventListener('keydown', onKey);
  }

  function attach(el, opts) {
    el.classList.add(BUTTON_CLASS);
    if (opts.color) el.style.setProperty('--earnest-color', opts.color);
    if (!el.textContent || !el.textContent.trim()) {
      el.textContent = opts.label || 'Book a call';
    }
    el.addEventListener('click', function (e) {
      e.preventDefault();
      var url = buildBookingUrl(opts);
      if (url) openModal(url);
    });
  }

  function init() {
    var script = document.currentScript || (function () {
      var all = document.getElementsByTagName('script');
      for (var i = all.length - 1; i >= 0; i--) {
        if ((all[i].src || '').indexOf('/embed.js') !== -1) return all[i];
      }
      return null;
    })();

    var datasetOpts = script ? {
      org: script.getAttribute('data-org'),
      user: script.getAttribute('data-user'),
      event: script.getAttribute('data-event') || null,
      label: script.getAttribute('data-label') || 'Book a call',
      color: script.getAttribute('data-color') || null,
    } : { org: null, user: null };

    // Look for opt-in elements first; if none, AND the script has data-org +
    // data-user, auto-render a button right next to the script tag.
    var explicit = document.querySelectorAll('[data-earnest-book="true"]');
    if (explicit.length > 0) {
      explicit.forEach(function (el) {
        var opts = {
          org: el.getAttribute('data-org') || datasetOpts.org,
          user: el.getAttribute('data-user') || datasetOpts.user,
          event: el.getAttribute('data-event') || datasetOpts.event,
          label: el.getAttribute('data-label') || datasetOpts.label,
          color: el.getAttribute('data-color') || datasetOpts.color,
        };
        attach(el, opts);
      });
      return;
    }

    if (datasetOpts.org && datasetOpts.user && script && script.parentNode) {
      var btn = document.createElement('button');
      btn.type = 'button';
      attach(btn, datasetOpts);
      script.parentNode.insertBefore(btn, script.nextSibling);
    }

    // Imperative API for SPA hosts
    window.EarnestEmbed = {
      open: function (opts) {
        var url = buildBookingUrl(opts || {});
        if (url) openModal(url);
      },
      attach: function (selector, opts) {
        document.querySelectorAll(selector).forEach(function (el) { attach(el, opts || {}); });
      },
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
`;
}
