"use client";

import { useEffect } from "react";

// Posts the current document height to the parent window whenever it
// changes, so the host page can resize its <iframe> to fit the content
// without awkward internal scrollbars.
//
// Host snippet (vanilla JS):
//   window.addEventListener('message', (e) => {
//     if (!e.data || e.data.source !== 'geo-visibility-checker') return;
//     if (e.data.type === 'resize') {
//       document.getElementById('geo-demo').style.height = e.data.height + 'px';
//     }
//   });
export function EmbedAutoResize() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.parent === window) return; // not inside an iframe

    let lastHeight = 0;
    const post = () => {
      const h = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
      );
      if (Math.abs(h - lastHeight) < 4) return;
      lastHeight = h;
      window.parent.postMessage(
        {
          source: "geo-visibility-checker",
          type: "resize",
          height: h,
        },
        "*",
      );
    };
    post();
    const ro = new ResizeObserver(post);
    ro.observe(document.body);
    const mo = new MutationObserver(post);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, []);
  return null;
}
