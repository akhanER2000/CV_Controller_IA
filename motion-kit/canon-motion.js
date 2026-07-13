/* ============================================================================
   CANON · canon-motion.js
   El motor de las animaciones que necesitan lógica (no solo CSS).
   Vanilla, sin dependencias, ~2 KB. Copiar tal cual en cada pantalla del diseño.
   En producción (Next.js), esta misma lógica se porta a hooks — pero la API
   y los nombres de clase NO CAMBIAN. Ese es el contrato con ingeniería.
   ============================================================================ */
(() => {
  'use strict';

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Guarda de "una sola vez por sesión" ──────────────────────────────────
     La hairline se dibuja la PRIMERA vez que la sección aparece. Nunca más.
     Una animación que se repite deja de enseñar y empieza a estorbar.        */
  const seen = new Set();
  const once = (key) => { if (seen.has(key)) return false; seen.add(key); return true; };

  /* ══════════════════════════════════════════════════════════════════════════
     1 · dividerDraw — la hairline dorada, al entrar en viewport, UNA vez
     Uso:  <div class="c-divider" data-divider="experiencia"></div>
     ══════════════════════════════════════════════════════════════════════════ */
  const dividers = document.querySelectorAll('.c-divider');
  if (dividers.length) {
    if (REDUCED) {
      dividers.forEach(d => d.classList.add('is-drawn'));   // ya dibujada
    } else {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (!e.isIntersecting) return;
          const key = e.target.dataset.divider || e.target.id || Math.random();
          if (once('div:' + key)) e.target.classList.add('is-drawn');
          io.unobserve(e.target);
        });
      }, { threshold: 0.6 });
      dividers.forEach(d => io.observe(d));
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
     2 · ★ EL ESCALONADO — el momento estelar del producto
     Los items se pueblan al terminar la ingesta. Ver tu carrera aparecer,
     item por item, ES el producto en tres segundos.

     Uso:  CANON.stagger(document.querySelector('#staging-list'))
     El contenedor lleva .c-stagger y los hijos .c-stagger-item
     ══════════════════════════════════════════════════════════════════════════ */
  function stagger(container, { step = 40, max = 24 } = {}) {
    if (!container) return;
    const items = container.querySelectorAll('.c-stagger-item');
    items.forEach((el, i) => {
      if (i < max) {
        el.style.setProperty('--d', `${i * step}ms`);   // retraso incremental
      } else {
        el.classList.add('c-no-stagger');               // el resto, de golpe
      }
    });
    // doble rAF: garantiza que el navegador pinta el estado inicial
    requestAnimationFrame(() => requestAnimationFrame(() => {
      container.classList.add('is-running');
    }));
  }

  /* ══════════════════════════════════════════════════════════════════════════
     3 · EL ÚNICO SHIMMER — cuando la IA termina de extraer. Una vez.
     Se autolimita: si alguien lo llama dos veces, la segunda no hace nada.
     ══════════════════════════════════════════════════════════════════════════ */
  function shimmer(el, key = 'global') {
    if (!el || REDUCED) return;
    if (!once('shimmer:' + key)) {
      console.warn('[CANON] El shimmer ya se disparó. Hay UNO por producto.');
      return;
    }
    el.classList.add('is-firing');
    el.addEventListener('animationend', () => el.classList.remove('is-firing'), { once: true });
  }

  /* ══════════════════════════════════════════════════════════════════════════
     4 · ★ EL TOGGLE RAYOS-X — "Cómo lo lee el ATS"
     El PDF se desenfoca, pierde el color, y del desenfoque resuelve el texto
     crudo del parser. Es la metáfora del producto: así te ve la máquina.

     Uso:  <div class="c-xray" data-mode="doc">
             <div class="c-xray__doc">…el CV renderizado…</div>
             <pre class="c-xray__raw">…el texto REAL extraído del PDF…</pre>
           </div>
           <button data-xray-toggle="#preview" aria-pressed="false">…</button>
     ══════════════════════════════════════════════════════════════════════════ */
  document.querySelectorAll('[data-xray-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.querySelector(btn.dataset.xrayToggle);
      if (!target) return;
      const raw = target.dataset.mode !== 'raw';
      target.dataset.mode = raw ? 'raw' : 'doc';
      btn.setAttribute('aria-pressed', String(raw));
      announce(raw
        ? 'Mostrando el texto que extrae el ATS de tu PDF'
        : 'Mostrando el documento');
    });
  });

  /* ══════════════════════════════════════════════════════════════════════════
     5 · CONTADOR HONESTO — sube contando lo que de verdad se encontró.
     Nunca un porcentaje inventado. Si no sabes cuánto falta, di qué haces.
     ══════════════════════════════════════════════════════════════════════════ */
  function countTo(el, to, ms = 600) {
    if (!el) return;
    if (REDUCED) { el.textContent = to; return; }
    const from = parseInt(el.textContent, 10) || 0;
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / ms);
      el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     6 · CONFIRMAR / DESCARTAR — ceremonia 1
     ══════════════════════════════════════════════════════════════════════════ */
  function confirm(el) {
    if (!el || REDUCED) return;
    el.classList.remove('c-confirm');
    void el.offsetWidth;                       // reinicia la animación
    el.classList.add('c-confirm');
  }
  function dismiss(el, after) {
    if (!el) return;
    if (REDUCED) { after && after(); el.remove(); return; }
    el.classList.add('c-dismiss');
    el.addEventListener('animationend', () => { after && after(); el.remove(); }, { once: true });
  }

  /* ══════════════════════════════════════════════════════════════════════════
     7 · ACCESIBILIDAD — los estados de IA se ANUNCIAN.
     Una animación que solo se ve deja fuera a quien usa lector de pantalla.
     ══════════════════════════════════════════════════════════════════════════ */
  let live = document.getElementById('canon-live');
  if (!live) {
    live = document.createElement('div');
    live.id = 'canon-live';
    live.setAttribute('aria-live', 'polite');
    live.setAttribute('aria-atomic', 'true');
    live.style.cssText =
      'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap';
    document.body.appendChild(live);
  }
  function announce(msg) { live.textContent = msg; }

  /* ══════════════════════════════════════════════════════════════════════════
     8 · SCROLL-REVEAL — solo dentro de .c-doc. En la app está PROHIBIDO.
     ══════════════════════════════════════════════════════════════════════════ */
  const reveals = document.querySelectorAll('.c-doc .c-reveal');
  if (reveals.length && !REDUCED) {
    const io2 = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        io2.unobserve(e.target);
      });
    }, { threshold: 0.25 });
    reveals.forEach(r => io2.observe(r));
  }

  window.CANON = { stagger, shimmer, countTo, confirm, dismiss, announce, REDUCED };
})();
