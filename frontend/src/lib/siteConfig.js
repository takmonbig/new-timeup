import { useEffect, useState } from "react";
import api from "@/lib/api";

let _config = null;
const listeners = new Set();

function runScripts(container) {
  container.querySelectorAll("script").forEach((old) => {
    const s = document.createElement("script");
    [...old.attributes].forEach((a) => s.setAttribute(a.name, a.value));
    s.text = old.text;
    document.head.appendChild(s);
  });
}

function injectPixel(mp) {
  if (window.__pzPixelDone) return;
  window.__pzPixelDone = true;
  const custom = (mp.custom_head_code || "").trim();
  if (custom) {
    const wrap = document.createElement("div");
    wrap.innerHTML = custom;
    // append non-script nodes (e.g. <noscript>) then execute scripts
    [...wrap.childNodes].forEach((n) => { if (n.tagName !== "SCRIPT") document.head.appendChild(n.cloneNode(true)); });
    runScripts(wrap);
  } else if (mp.pixel_id) {
    /* eslint-disable */
    !(function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    /* eslint-enable */
    window.fbq("init", mp.pixel_id);
    window.fbq("track", "PageView");
  }
}

export async function loadSiteConfig() {
  try {
    const { data } = await api.get("/config/public");
    _config = data;
    if (data?.meta_pixel?.enabled) injectPixel(data.meta_pixel);
    listeners.forEach((l) => l(data));
  } catch (e) { /* ignore */ }
  return _config;
}

export function getSiteConfig() { return _config; }

// Fire a Meta Pixel event mapped from an app trigger (register/deposit/game_play/win)
export function fbTrack(triggerKey, params) {
  const mp = _config?.meta_pixel;
  if (!mp?.enabled || !window.fbq) return;
  const ev = mp.events?.[triggerKey];
  if (ev) { try { window.fbq("track", ev, params || {}); } catch (e) { /* ignore */ } }
}

export function useSiteConfig() {
  const [cfg, setCfg] = useState(_config);
  useEffect(() => {
    listeners.add(setCfg);
    if (!_config) loadSiteConfig();
    else setCfg(_config);
    return () => listeners.delete(setCfg);
  }, []);
  return cfg;
}
