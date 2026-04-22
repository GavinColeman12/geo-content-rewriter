# Embedding the GEO Visibility Checker

The tool exposes a dedicated `/embed` route designed to be iframed from any
site. It strips the main app's header/footer chrome, skips the toolkit tabs,
renders just the Visibility Checker, and auto-reports its height to the
parent window so the iframe can resize with content.

Host URL once deployed:
```
https://demo-rewriter.crescendo-consulting.net/embed
```

(While developing locally: `http://localhost:3001/embed`.)

## Quick snippet — fixed height

Drop this anywhere in your page's HTML. `height` is a starting value; the
script below will auto-adjust as the audit runs and results expand.

```html
<iframe
  id="geo-demo"
  src="https://demo-rewriter.crescendo-consulting.net/embed"
  width="100%"
  height="900"
  style="border:0;display:block;max-width:900px;margin:0 auto;"
  title="GEO Visibility Checker"
  loading="lazy"
  referrerpolicy="no-referrer-when-downgrade"
></iframe>
```

## Recommended — auto-resize

Paste **both** the iframe and the script block below. The iframe posts its
document height to `window.parent` whenever content changes, and the host
resizes to match — no internal scrollbars on the iframe, no awkward empty
space.

```html
<iframe
  id="geo-demo"
  src="https://demo-rewriter.crescendo-consulting.net/embed"
  width="100%"
  height="900"
  style="border:0;display:block;max-width:900px;margin:0 auto;"
  title="GEO Visibility Checker"
  loading="lazy"
></iframe>
<script>
  (function () {
    var frame = document.getElementById('geo-demo');
    if (!frame) return;
    window.addEventListener('message', function (e) {
      if (!e.data || e.data.source !== 'geo-visibility-checker') return;
      if (e.data.type === 'resize' && typeof e.data.height === 'number') {
        frame.style.height = (e.data.height + 8) + 'px';
      }
    });
  })();
</script>
```

## Behavior notes

- **Audits are persisted to the same Neon DB** as the main app. Cache and
  benchmark data are shared — an audit run from an embedded iframe
  contributes to the industry benchmarks and can be found via `/a/[id]`.
- **Rate limits** are shared too (5 audits / IP / day, if Upstash is
  configured), so a user spamming the embed also affects their direct-site
  quota. This is usually what you want.
- **Share links** generated inside the embed point at the live demo domain
  (e.g. `/a/aud_xxx`) and open in a new tab on click. They don't navigate
  the iframe.
- **Responsive**: the embed container is `max-w-4xl` internally. Narrow
  iframes render as a mobile layout; wide iframes up to ~896px render as
  desktop. Above 896px the content stays centered.

## Customization

The route currently ignores URL params. If you want per-embed branding or
feature toggles (e.g. `?title=Custom+Headline`, `?hideAttribution=1`), open
an issue — they're a few lines to add to `app/embed/page.tsx`.

## Security

- The `/embed` route sets `Content-Security-Policy: frame-ancestors *` so
  any origin can iframe it. Change to an explicit allowlist in
  `next.config.mjs` if you want to restrict.
- The main app (everything outside `/embed`) sets `frame-ancestors 'self'`
  as a clickjacking defense — only the embed surface is publicly
  iframable.
- The iframe runs in its own origin and does not access the parent. The
  only cross-frame communication is one-directional `postMessage` calls
  from the iframe to the parent with the fixed shape
  `{ source: "geo-visibility-checker", type: "resize", height: N }`. Hosts
  should filter on `e.data.source` (as shown in the snippet) to avoid
  reacting to unrelated messages.
