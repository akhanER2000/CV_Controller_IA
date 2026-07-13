/* ============================================================================
   CANON · canon-aurora.js  —  v2 "Los tres metales conductores"
   El fondo vivo: shader WebGL2, fBm + domain warping, REACTIVO AL RATÓN.

   ── DE DÓNDE SALE (forense de la referencia, verificado en el navegador) ──
   · El humo es un <canvas> WEBGL2 en un div fixed·inset:0·z-index:0·pointer-events:none
   · Su buffer es de 300×150 px escalado a 1920 → el humo no tiene bordes duros,
     nadie nota la baja resolución, y la GPU casi no trabaja. Copiamos el truco.
   · El "blackout": el contenedor de página es OPACO (#050508) y las secciones
     ALTERNAN entre opacas (tapan el humo) y transparentes (VENTANAS al humo).
     Ese es el mecanismo que hace que no estorbe. Ver canon-aurora.css.

   ── QUÉ ES NUESTRO Y NO SUYO ──
   Ellos: 4 acentos (esmeralda, púrpura, carmesí, oro) — una nebulosa.
   Nosotros: LOS TRES METALES CONDUCTORES — oro, cobre, plata.
   No es una paleta arbitraria: el concepto original ya lo dice —
   "el oro: en electrónica, el metal con que se bañan los contactos críticos
    porque conduce sin corroerse". Oro, cobre y plata SON los conductores.
   La metáfora no se importa: se extiende.

   ⚠️ DISCIPLINA: los tres metales viven SOLO aquí, en la atmósfera.
      En la UI, el oro sigue siendo el ÚNICO acento interactivo.
      Atmósfera ≠ señal. Si el cobre empieza a significar algo, se rompe el sistema.

   API:
     CANON.aurora.mount()
     CANON.aurora.setActive(true|false)   // la IA trabaja → el humo se agita
     CANON.aurora.pause() / .resume()     // pausar mientras el usuario escribe
   ============================================================================ */
(() => {
  'use strict';

  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── LOS TRES METALES CONDUCTORES (+ el sustrato) ────────────────────────── */
  const OBSIDIAN = [0.020, 0.020, 0.031];   // #050508  el sustrato
  const GOLD     = [0.831, 0.686, 0.216];   // #D4AF37  oro de marca
  const COPPER   = [0.722, 0.451, 0.200];   // #B87333  cobre — el metal cálido
  const SILVER   = [0.678, 0.714, 0.761];   // #ADB6C2  plata — el metal frío

  const TRAILS = 16;                        // puntos de estela del ratón

  const VERT = `#version 300 es
  in vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

  const FRAG = `#version 300 es
  precision highp float;
  out vec4 fragColor;

  uniform vec2  uRes;
  uniform float uTime;
  uniform float uIntensity;          // 0 calma · 1 la IA trabaja
  uniform vec2  uMouse;              // ratón suavizado, en coords de shader
  uniform float uMouseVel;           // velocidad del ratón → cuánta estela deja
  uniform vec3  uTrail[${TRAILS}];   // (x, y, vida 0..1) — la estela que se apaga
  uniform vec3  uObsidian;
  uniform vec3  uGold;
  uniform vec3  uCopper;
  uniform vec3  uSilver;

  float hash(vec2 p){
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i+vec2(0,0)), hash(i+vec2(1,0)), u.x),
               mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
  }
  float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
    for (int i = 0; i < 5; i++){ v += a * noise(p); p = rot * p * 2.02; a *= 0.5; }
    return v;
  }

  void main(){
    // ZOOM 0.85 (no 1.35): volutas grandes y lentas, como la referencia.
    // Con 1.35 salían burbujas pequeñas: parecía camuflaje, no humo.
    vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / min(uRes.x, uRes.y);
    uv *= 0.85;

    float t = uTime * (0.020 + 0.030 * uIntensity);

    // ═══ LA ESTELA DEL RATÓN ════════════════════════════════════════════════
    // Cada punto reciente del cursor empuja el dominio y calienta el metal.
    // Se apagan solos (vida → 0): el humo "recuerda" por dónde pasaste.
    vec2  push = vec2(0.0);   // desplazamiento que la estela imprime al ruido
    float heat = 0.0;         // calor: enciende el metal
    for (int i = 0; i < ${TRAILS}; i++){
      vec3  tr   = uTrail[i];
      float life = tr.z;
      if (life <= 0.001) continue;
      vec2  d    = uv - tr.xy;
      float dist = length(d);
      float fall = exp(-dist * dist * 7.0);      // gaussiana: halo suave, sin borde
      push += normalize(d + 1e-5) * fall * life * 0.28;
      heat += fall * life;
    }
    // el cursor vivo empuja más si se mueve rápido
    float mdist = length(uv - uMouse);
    float mfall = exp(-mdist * mdist * 5.0);
    heat += mfall * (0.35 + uMouseVel * 0.9);

    // ═══ DOMAIN WARPING — el ruido se alimenta de sí mismo ═══════════════════
    // La estela entra AQUÍ, en el dominio: no pinta encima, DEFORMA EL HUMO.
    // Por eso se siente como humo de verdad y no como un foco pegado al cursor.
    vec2 w = uv + push;

    vec2 q = vec2(fbm(w + t * 0.5),
                  fbm(w + vec2(5.2, 1.3) - t * 0.4));

    vec2 r = vec2(fbm(w + 4.0*q + vec2(1.7, 9.2) + t * 0.30),
                  fbm(w + 4.0*q + vec2(8.3, 2.8) - t * 0.25));

    float f = fbm(w + 4.0*r);

    // ═══ ★ NORMALIZAR. EL BUG QUE DEJABA LA PANTALLA NEGRA. ═════════════════
    // El fBm de 5 octavas NO sale en 0..1. Medido sobre el campo real:
    //   p25=0.165 · p50=0.217 · p95=0.342 · max=0.605
    // La versión anterior arrancaba la curva en 0.42 → NINGÚN píxel la cruzaba.
    // El humo era negro sobre negro. Remapeamos al rango que de verdad ocupa.
    float fn = clamp((f - 0.05) / 0.37, 0.0, 1.0);

    // ═══ LOS METALES ════════════════════════════════════════════════════════
    // Calibrado renderizando el campo y MIRÁNDOLO, no a ojo.
    // Sigue siendo escaso: la mediana de mezcla es 0.004 — el 85% es obsidiana.
    float veil     = smoothstep(0.05, 0.80, fn);
    float filament = smoothstep(0.50, 0.72, fn) * (1.0 - smoothstep(0.82, 1.00, fn));

    // Qué metal aflora depende de la torsión del dominio (length(q)),
    // también normalizada:
    //   humo quieto  → plata  (frío, en reposo)
    //   humo torcido → cobre  (calor)
    //   la cresta    → oro    (el conductor)
    float torsion = clamp((length(q) - 0.15) / 0.40, 0.0, 1.0);
    vec3 metal = mix(uSilver, uCopper, smoothstep(0.25, 0.75, torsion));
    metal      = mix(metal,   uGold,   smoothstep(0.55, 1.00, torsion + heat * 0.32));

    vec3 col = uObsidian;
    col = mix(col, metal,  veil     * (0.85 + 0.12 * uIntensity + heat * 0.18));
    col = mix(col, uGold,  filament * (0.60 + 0.10 * uIntensity + heat * 0.20));

    // el rastro del cursor: un rescoldo, no un foco. Muy contenido.
    col += uGold * heat * 0.020;

    // viñeta: el centro respira, los bordes se apagan. El texto vive en el centro.
    vec2 vuv = uv / 0.85;
    float vig = 1.0 - 0.16 * dot(vuv * 0.75, vuv * 0.75);
    col *= clamp(vig, 0.0, 1.0);

    // grano: obligatorio en negros, mata el banding
    col += (hash(gl_FragCoord.xy + uTime) - 0.5) * 0.012;

    fragColor = vec4(col, 1.0);
  }`;

  const instances = [];
  let running = true;

  /* ── Ratón global (una sola escucha para todas las instancias) ───────────── */
  const mouse = { x: 0, y: 0, tx: 0, ty: 0, vel: 0 };
  const trail = Array.from({ length: TRAILS }, () => ({ x: 0, y: 0, life: 0 }));
  let trailHead = 0, lastEmit = 0;

  const ZOOM = 0.85;   // ⚠️ DEBE coincidir con el `uv *= 0.85` del shader,
                       //    o la estela aparece desplazada del cursor.

  if (!REDUCED) {
    addEventListener('pointermove', (e) => {
      const w = innerWidth, h = innerHeight, m = Math.min(w, h);
      // mismas coords que el shader
      mouse.tx = ((e.clientX * 2 - w) / m) * ZOOM;
      mouse.ty = (((h - e.clientY) * 2 - h) / m) * ZOOM;

      const now = performance.now();
      if (now - lastEmit > 34) {            // ~30 Hz de emisión: estela suave, sin saturar
        lastEmit = now;
        const p = trail[trailHead];
        p.x = mouse.tx; p.y = mouse.ty; p.life = 1;
        trailHead = (trailHead + 1) % TRAILS;
      }
    }, { passive: true });
  }

  function compile(gl, type, src){
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('[CANON aurora]', gl.getShaderInfoLog(s)); return null;
    }
    return s;
  }

  function mountOne(host){
    if (host.dataset.mounted) return;
    host.dataset.mounted = '1';

    if (REDUCED) { host.classList.add('is-static'); return; }

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden','true');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    host.appendChild(canvas);

    const gl = canvas.getContext('webgl2', { antialias:false, alpha:false, powerPreference:'low-power' });
    if (!gl) { host.classList.add('is-static'); return; }

    const prog = gl.createProgram();
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) { host.classList.add('is-static'); return; }
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[CANON aurora] link:', gl.getProgramInfoLog(prog));
      host.classList.add('is-static'); return;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const U = {
      res:   gl.getUniformLocation(prog,'uRes'),
      time:  gl.getUniformLocation(prog,'uTime'),
      inten: gl.getUniformLocation(prog,'uIntensity'),
      mouse: gl.getUniformLocation(prog,'uMouse'),
      mvel:  gl.getUniformLocation(prog,'uMouseVel'),
      trail: gl.getUniformLocation(prog,'uTrail'),
      obs:   gl.getUniformLocation(prog,'uObsidian'),
      gold:  gl.getUniformLocation(prog,'uGold'),
      copper:gl.getUniformLocation(prog,'uCopper'),
      silver:gl.getUniformLocation(prog,'uSilver'),
    };
    gl.uniform3fv(U.obs,    OBSIDIAN);
    gl.uniform3fv(U.gold,   GOLD);
    gl.uniform3fv(U.copper, COPPER);
    gl.uniform3fv(U.silver, SILVER);

    /* ★ EL TRUCO: buffer a ~1/4 de resolución (tope 560px). El humo no tiene
       bordes duros; al escalar nadie lo nota y la GPU apenas trabaja.
       (La referencia usa 300x150 para una pantalla de 1920.) */
    const SCALE = 0.28, MAXW = 560;
    function resize(){
      const r = host.getBoundingClientRect();
      const w = Math.max(2, Math.min(MAXW, Math.round(r.width * SCALE)));
      const h = Math.max(2, Math.round(r.height * SCALE));
      if (canvas.width !== w || canvas.height !== h){
        canvas.width = w; canvas.height = h;
        gl.viewport(0,0,w,h);
        gl.useProgram(prog);
        gl.uniform2f(U.res, w, h);
      }
    }
    resize();
    new ResizeObserver(resize).observe(host);

    const flat = new Float32Array(TRAILS * 3);

    instances.push({
      intensity: host.dataset.aurora === 'active' ? 1 : 0,
      target:    host.dataset.aurora === 'active' ? 1 : 0,
      draw(t){
        this.intensity += (this.target - this.intensity) * 0.02;
        gl.useProgram(prog);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        gl.uniform1f(U.time,  t);
        gl.uniform1f(U.inten, this.intensity);
        gl.uniform2f(U.mouse, mouse.x, mouse.y);
        gl.uniform1f(U.mvel,  mouse.vel);
        for (let i = 0; i < TRAILS; i++){
          flat[i*3]     = trail[i].x;
          flat[i*3 + 1] = trail[i].y;
          flat[i*3 + 2] = trail[i].life;
        }
        gl.uniform3fv(U.trail, flat);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    });
  }

  /* -- Bucle unico, 30 fps. Es una deriva lenta: 60 fps quema bateria sin
        que se note ninguna diferencia. ------------------------------------- */
  let last = 0;
  const FRAME = 1000 / 30;
  function loop(now){
    requestAnimationFrame(loop);
    if (!running || document.hidden) return;      // pestana oculta -> cero trabajo
    if (now - last < FRAME) return;
    last = now;

    // suavizado del raton + velocidad
    const px = mouse.x, py = mouse.y;
    mouse.y += (mouse.ty - mouse.y) * 0.12;
    const d = Math.hypot(mouse.x - px, mouse.y - py);
    mouse.vel += (Math.min(1, d * 9) - mouse.vel) * 0.15;

    // la estela se apaga sola
    for (const p of trail) if (p.life > 0) p.life = Math.max(0, p.life - 0.016);

    const t = now * 0.001;
    for (const i of instances) i.draw(t);
  }
  requestAnimationFrame(loop);
  document.addEventListener('visibilitychange', () => { last = 0; });

  const aurora = {
    mount(root = document){ root.querySelectorAll('.c-aurora-gl').forEach(mountOne); },
    pause(){ running = false; },
    resume(){ running = true; },
    setActive(on){ for (const i of instances) i.target = on ? 1 : 0; },
    get reduced(){ return REDUCED; }
  };

  window.CANON = Object.assign(window.CANON || {}, { aurora });
  if (document.readyState !== 'loading') aurora.mount();
  else document.addEventListener('DOMContentLoaded', () => aurora.mount());
})();
