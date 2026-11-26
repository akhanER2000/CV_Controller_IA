// Genera las 5 maquetas Forja v2 como SVG editables (se importan en FigCraft).
// Datos: los de la captura real prompts/lotes-fable5/_diseno/referencias/actual-editor.png
// (70 ítems de master, 55 referencias, 3 overrides, 5 roles, 12 grupos, 21 huecos).
import { writeFileSync, mkdirSync } from "node:fs";
const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });

const C = {
  bg: "#0E0C0B", surface: "#171412", elev: "#211D1A", sunken: "#090807",
  text: "#F5F1EB", muted: "#BDB4AA", subtle: "#8F857C",
  b300: "#FF9A55", b500: "#F2782F", b700: "#A9470F", fa: "#F58C4A", fb: "#EA6D2C",
  ink: "#160A03", inkM: "#3A1A06", oro: "#E5BE5C",
  crema: "#F2E8D8", cremaH: "#E8DAC3", inkC: "#1F1712", inkCM: "#5B4A3C",
  cardA: "#1E1A17", cardB: "#151210", line: "#FFFFFF", danger: "#F2606E",
};
const SANS = "Geist", DISP = "Playfair Display", MONO = "Geist Mono";
const ICON = {
  panel: "M2 2h6v6H2z M12 2h6v6h-6z M2 12h6v6H2z M12 12h6v6h-6z",
  master: "M4 2h8l4 4v12H4z M7 9h6 M7 12h6 M7 15h4",
  variantes: "M10 2l8 4-8 4-8-4z M2 10l8 4 8-4 M2 14l8 4 8-4",
  fuentes: "M2 5h6l2 2h8v10H2z",
  ajustes: "M2 5h16 M2 10h16 M2 15h16 M6 3v4 M13 8v4 M8 13v4",
  mas: "M10 4v12 M4 10h12",
  buscar: "M8.5 3a5.5 5.5 0 1 0 0 11a5.5 5.5 0 1 0 0-11z M13 13l4.5 4.5",
  revision: "M3 10l4 4 10-10",
  doc: "M5 2h7l3 3v13H5z M8 9h4 M8 12h4",
};
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

function T(x, y, s, o = {}) {
  const { size = 13, w = 400, f = SANS, c = C.text, a = "start", ls = 0, it = false } = o;
  return `<text x="${x}" y="${y}" font-family="${f}" font-size="${size}" font-weight="${w}"${it ? ' font-style="italic"' : ""} fill="${c}" text-anchor="${a}"${ls ? ` letter-spacing="${ls}"` : ""}>${esc(s)}</text>`;
}
const R = (x, y, w, h, r, fill, extra = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`;
const I = (n, x, y, s = 18, c = C.text, sw = 1.5) =>
  `<g transform="translate(${x} ${y}) scale(${s / 20})"><path d="${ICON[n]}" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/></g>`;

const DEFS = `<defs>
<linearGradient id="gBrasa" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.fa}"/><stop offset="1" stop-color="${C.fb}"/></linearGradient>
<linearGradient id="gGraf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.cardA}"/><stop offset="1" stop-color="${C.cardB}"/></linearGradient>
<linearGradient id="gArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.b500}" stop-opacity="0.55"/><stop offset="1" stop-color="${C.b500}" stop-opacity="0"/></linearGradient>
<radialGradient id="gAtm1" cx="0.12" cy="0.05" r="0.7"><stop offset="0" stop-color="#B8431A" stop-opacity="0.38"/><stop offset="1" stop-color="#B8431A" stop-opacity="0"/></radialGradient>
<radialGradient id="gAtm2" cx="0.95" cy="0.95" r="0.6"><stop offset="0" stop-color="#E5A13C" stop-opacity="0.18"/><stop offset="1" stop-color="#E5A13C" stop-opacity="0"/></radialGradient>
<filter id="sh" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#000" flood-opacity="0.45"/></filter>
<filter id="shB" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="16" stdDeviation="22" flood-color="#F2782F" flood-opacity="0.28"/></filter>
</defs>`;

function card(x, y, w, h, mat = "grafito", r = 22) {
  if (mat === "brasa") return R(x, y, w, h, r, "url(#gBrasa)", 'filter="url(#shB)"');
  if (mat === "crema") return R(x, y, w, h, r, C.crema, 'filter="url(#sh)"');
  if (mat === "vidrio") return R(x, y, w, h, r, C.surface, 'fill-opacity="0.78" stroke="#FFFFFF" stroke-opacity="0.10" filter="url(#sh)"');
  return R(x, y, w, h, r, "url(#gGraf)", 'stroke="#FFFFFF" stroke-opacity="0.07" filter="url(#sh)"');
}
function kpi(x, y, w, label, val, fuente, icon, mat = "grafito") {
  const onB = mat === "brasa";
  const fg = onB ? C.ink : C.text, fm = onB ? C.inkM : C.subtle;
  return [
    card(x, y, w, 96, mat, 16),
    T(x + 20, y + 30, label, { size: 12, w: 500, c: onB ? C.inkM : C.muted }),
    T(x + 20, y + 66, val, { size: 30, w: 600, c: fg, ls: -0.6 }),
    T(x + 20, y + 84, "fuente: " + fuente, { size: 10.5, f: MONO, c: fm }),
    R(x + w - 56, y + 20, 36, 36, 12, onB ? C.ink : "url(#gBrasa)"),
    I(icon, x + w - 47, y + 29, 18, onB ? C.fa : C.ink, 1.7),
  ].join("");
}
function ring(cx, cy, r, sw, pct, col, track) {
  // Arco como <path> (sin rotate ni dasharray): el importador lo lee literal.
  const a = Math.min(pct, 0.9999) * 2 * Math.PI;
  const ex = cx + r * Math.sin(a), ey = cy - r * Math.cos(a);
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${track}" stroke-width="${sw}"/>` +
    `<path d="M${cx} ${cy - r} A${r} ${r} 0 ${a > Math.PI ? 1 : 0} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round"/>`;
}
function chip(x, y, s, tone = "neutro") {
  const w = s.length * 6.4 + 22;
  const map = {
    neutro: [C.elev, C.muted, "#FFFFFF", 0.1], brasa: [C.b500, C.ink, null, 0],
    oro: ["#2A2316", C.oro, C.oro, 0.4], ejemplo: ["#2A2420", C.b300, C.b300, 0.5],
    crema: [C.cremaH, C.inkCM, null, 0],
  }[tone];
  return R(x, y, w, 24, 12, map[0], map[2] ? `stroke="${map[2]}" stroke-opacity="${map[3]}"` : "") +
    T(x + 11, y + 16, s, { size: 11, w: 500, c: map[1], f: tone === "ejemplo" ? MONO : SANS });
}
function btn(x, y, s, kind = "brasa", icon = null, w = null) {
  const width = w ?? s.length * 7.2 + (icon ? 52 : 36);
  const bg = kind === "brasa" ? "url(#gBrasa)" : kind === "tinta" ? C.ink : kind === "crema" ? C.inkC : C.elev;
  const fg = kind === "brasa" ? C.ink : kind === "tinta" ? C.fa : kind === "crema" ? C.crema : C.text;
  const st = kind === "grafito" ? 'stroke="#FFFFFF" stroke-opacity="0.14"' : "";
  return R(x, y, width, 40, 12, bg, st) + (icon ? I(icon, x + 16, y + 11, 18, fg, 1.8) : "") +
    T(x + (icon ? 42 : width / 2), y + 25, s, { size: 13, w: 600, c: fg, a: icon ? "start" : "middle" });
}

/* ── SHELL ── */
const NAV = [["panel", "Panel"], ["master", "Master"], ["variantes", "Variantes"], ["fuentes", "Fuentes"]];
function lateral(active) {
  const x = 16, y = 16, w = 248, h = 868;
  const o = [card(x, y, w, h, "vidrio", 22)];
  o.push(T(x + 22, y + 44, "Corpus", { size: 23, w: 500, f: DISP }));
  o.push(R(x + 98, y + 26, 6, 6, 1.5, C.b500));
  o.push(T(x + 22, y + 88, "TRABAJO", { size: 10.5, w: 500, f: MONO, c: C.subtle, ls: 1.4 }));
  let yy = y + 102;
  for (const [k, l] of NAV) {
    const on = k === active;
    if (on) o.push(R(x + 12, yy, w - 24, 44, 14, C.elev, 'stroke="#F2782F" stroke-opacity="0.28"'));
    o.push(R(x + 20, yy + 7, 30, 30, 10, on ? "url(#gBrasa)" : C.elev));
    o.push(I(k, x + 26, yy + 13, 18, on ? C.ink : C.muted, 1.6));
    o.push(T(x + 62, yy + 27, l, { size: 13.5, w: on ? 600 : 500, c: on ? C.text : C.muted }));
    yy += 50;
    if (k === "master") { o.push(R(x + 35, yy - 4, 1, 26, 0, "#FFFFFF", 'fill-opacity="0.16"')); o.push(T(x + 62, yy + 14, "Revisión", { size: 12.5, c: C.muted })); yy += 30; }
    if (k === "fuentes") { o.push(R(x + 35, yy - 4, 1, 26, 0, "#FFFFFF", 'fill-opacity="0.16"')); o.push(T(x + 62, yy + 14, "Volcar material", { size: 12.5, c: C.muted })); yy += 30; }
  }
  o.push(T(x + 22, yy + 22, "CUENTA", { size: 10.5, w: 500, f: MONO, c: C.subtle, ls: 1.4 }));
  yy += 36;
  o.push(R(x + 20, yy + 7, 30, 30, 10, C.elev), I("ajustes", x + 26, yy + 13, 18, C.muted, 1.6), T(x + 62, yy + 27, "Ajustes", { size: 13.5, w: 500, c: C.muted }));
  // tarjeta oferta — brasa rellena
  const cy = y + h - 236;
  o.push(card(x + 14, cy, w - 28, 164, "brasa", 18));
  o.push(T(x + 32, cy + 34, "Una oferta nueva", { size: 19, w: 500, f: DISP, c: C.ink }));
  o.push(T(x + 32, cy + 58, "Pega la oferta y Corpus arma", { size: 12, c: C.inkM }));
  o.push(T(x + 32, cy + 75, "la variante desde tu master.", { size: 12, c: C.inkM }));
  o.push(btn(x + 30, cy + 104, "Nueva variante", "tinta", "mas", w - 60));
  // pie
  o.push(R(x + 20, y + h - 52, 62, 30, 9, "none", 'stroke="#FFFFFF" stroke-opacity="0.16"'));
  o.push(R(x + 22, y + h - 50, 28, 26, 7, C.elev), T(x + 36, y + h - 32, "ES", { size: 10.5, f: MONO, a: "middle" }), T(x + 66, y + h - 32, "EN", { size: 10.5, f: MONO, c: C.subtle, a: "middle" }));
  o.push(R(x + 90, y + h - 52, 30, 30, 9, C.elev), T(x + 105, y + h - 32, "☾", { size: 13, c: C.muted, a: "middle" }));
  return o.join("");
}
function barra(ruta, titulo, W = 1440) {
  const x = 280, w = W - x - 16;
  const o = [];
  o.push(T(x + 4, 38, ruta, { size: 12, c: C.subtle }));
  o.push(T(x + 4, 70, titulo, { size: 30, w: 500, f: DISP, ls: -0.3 }));
  const sx = x + w - 520;
  o.push(R(sx, 26, 300, 44, 14, C.surface, 'fill-opacity="0.8" stroke="#FFFFFF" stroke-opacity="0.10"'));
  o.push(I("buscar", sx + 14, 38, 18, C.subtle), T(sx + 42, 53, "Ir a… Master, Variantes, Fuentes", { size: 12.5, c: C.subtle }));
  o.push(R(sx + 250, 37, 38, 22, 6, C.elev), T(sx + 269, 52, "⌘K", { size: 10.5, f: MONO, c: C.muted, a: "middle" }));
  const ux = x + w - 204;
  o.push(R(ux, 26, 204, 44, 14, C.surface, 'fill-opacity="0.8" stroke="#FFFFFF" stroke-opacity="0.10"'));
  o.push(`<circle cx="${ux + 24}" cy="48" r="15" fill="${C.elev}" stroke="${C.oro}" stroke-opacity="0.7" stroke-width="1.5"/>`, T(ux + 24, 52, "AE", { size: 10, f: MONO, c: C.oro, a: "middle" }));
  o.push(T(ux + 48, 45, "Akhan Espinoza", { size: 12.5, w: 600 }), T(ux + 48, 60, "Cuenta y ajustes", { size: 11, c: C.subtle }));
  return o.join("");
}
function fondo(W, H) {
  return R(0, 0, W, H, 0, C.bg) + R(0, 0, W, H, 0, "url(#gAtm1)") + R(0, 0, W, H, 0, "url(#gAtm2)");
}
const svg = (W, H, body, name) => writeFileSync(`${OUT}/${name}.svg`,
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${DEFS}${body}</svg>`);

/* ── VISTA 1 · PANEL ── */
{
  const o = [fondo(1440, 900), lateral("panel"), barra("Corpus  /  Panel", "Panel")];
  const X = 280, W = 1144, g = 16, kw = (W - 3 * g) / 4;
  [["Ítems en el master", "70", "master", "master"], ["Roles de experiencia", "5", "master · experiencia", "doc"],
   ["Grupos de habilidades", "12", "master · habilidades", "ajustes"], ["Referencias en la variante", "55", "variante activa", "variantes"]]
    .forEach(([l, v, f, i], k) => o.push(kpi(X + k * (kw + g), 100, kw, l, v, f, i)));
  // hero brasa
  const hy = 212;
  o.push(card(X, hy, 560, 316, "brasa", 22));
  o.push(T(X + 32, hy + 46, "TU PRÓXIMA VARIANTE", { size: 11, w: 500, f: MONO, c: C.inkM, ls: 1.2 }));
  o.push(T(X + 32, hy + 104, "Pega la oferta.", { size: 42, w: 500, f: DISP, c: C.ink, ls: -0.8 }));
  o.push(T(X + 32, hy + 152, "Corpus la arma.", { size: 42, w: 500, f: DISP, c: C.ink, ls: -0.8 }));
  o.push(T(X + 32, hy + 192, "Cada línea sale de tu master y lleva su fuente.", { size: 14, c: C.inkM }));
  o.push(T(X + 32, hy + 212, "Nada inventado: lo que no tiene respaldo, no entra.", { size: 14, c: C.inkM }));
  o.push(btn(X + 32, hy + 248, "Nueva variante", "tinta", "mas"), btn(X + 200, hy + 248, "Volcar material", "crema"));
  // folio crema con anillo
  const cx = X + 576;
  o.push(card(cx, hy, 276, 316, "crema", 22));
  o.push(T(cx + 24, hy + 40, "Cobertura de la variante", { size: 15, w: 600, c: C.inkC }));
  o.push(T(cx + 24, hy + 60, "referencias usadas del master", { size: 12, c: C.inkCM }));
  o.push(ring(cx + 138, hy + 166, 70, 16, 55 / 70, C.b700, C.cremaH));
  o.push(T(cx + 138, hy + 172, "79 %", { size: 30, w: 600, c: C.inkC, a: "middle", ls: -0.5 }));
  o.push(T(cx + 138, hy + 192, "55 de 70", { size: 11.5, f: MONO, c: C.inkCM, a: "middle" }));
  o.push(T(cx + 24, hy + 284, "fuente: variante activa · master", { size: 10.5, f: MONO, c: C.inkCM }));
  // barras grafito
  const bx = cx + 292, bw = X + W - bx;
  o.push(card(bx, hy, bw, 316, "grafito", 22));
  o.push(T(bx + 24, hy + 40, "El master por sección", { size: 15, w: 600 }));
  o.push(T(bx + 24, hy + 60, "ítems por bloque", { size: 12, c: C.subtle }));
  const secs = [["Resumen", 1], ["Experiencia", 5], ["Habilidades", 12]];
  secs.forEach(([n, v], k) => {
    const by = hy + 96 + k * 58;
    o.push(T(bx + 24, by, n, { size: 12.5, c: C.muted }), T(bx + bw - 24, by, String(v), { size: 12.5, w: 600, f: MONO, a: "end" }));
    o.push(R(bx + 24, by + 12, bw - 48, 12, 6, "#FFFFFF", 'fill-opacity="0.08"'), R(bx + 24, by + 12, (bw - 48) * v / 12, 12, 6, "url(#gBrasa)"));
  });
  o.push(T(bx + 24, hy + 284, "fuente: master", { size: 10.5, f: MONO, c: C.subtle }));
  // fila 3: área (ejemplo) + recientes
  const ay = hy + 332, ah = 900 - ay - 16;
  o.push(card(X, ay, 700, ah, "grafito", 22));
  o.push(T(X + 24, ay + 38, "Material volcado por semana", { size: 15, w: 600 }), chip(X + 252, ay + 22, "ejemplo", "ejemplo"));
  o.push(T(X + 24, ay + 58, "se llena cuando haya ingestas reales", { size: 12, c: C.subtle }));
  const pts = [0.2, 0.35, 0.3, 0.55, 0.45, 0.7, 0.62, 0.85, 0.74, 0.9];
  const px = (i) => X + 24 + i * (652 / 9), py = (v) => ay + ah - 30 - v * (ah - 110);
  let d = `M${px(0)} ${py(pts[0])}`; pts.forEach((v, i) => { if (i) d += ` L${px(i)} ${py(v)}`; });
  for (let k = 0; k < 4; k++) o.push(R(X + 24, ay + 84 + k * ((ah - 114) / 3), 652, 1, 0, "#FFFFFF", 'fill-opacity="0.06"'));
  o.push(`<path d="${d} L${px(9)} ${ay + ah - 30} L${px(0)} ${ay + ah - 30} Z" fill="url(#gArea)"/>`, `<path d="${d}" fill="none" stroke="${C.b500}" stroke-width="2.5" stroke-linejoin="round"/>`);
  const lx = X + 716, lw = X + W - lx;
  o.push(card(lx, ay, lw, ah, "grafito", 22));
  o.push(T(lx + 24, ay + 38, "Variantes recientes", { size: 15, w: 600 }));
  o.push(R(lx + 16, ay + 58, lw - 32, 62, 14, C.elev));
  o.push(R(lx + 28, ay + 70, 38, 38, 11, "url(#gBrasa)"), I("variantes", lx + 38, ay + 80, 18, C.ink, 1.7));
  o.push(T(lx + 78, ay + 86, "AI/ML Engineer & Software Engineer", { size: 13, w: 600 }), T(lx + 78, ay + 104, "al día · guardado", { size: 11.5, c: C.subtle }));
  o.push(chip(lx + lw - 112, ay + 77, "3 páginas", "neutro"));
  o.push(R(lx + 16, ay + 132, lw - 32, 62, 14, "none", 'stroke="#FFFFFF" stroke-opacity="0.14" stroke-dasharray="5 5"'));
  o.push(T(lx + lw / 2, ay + 168, "La siguiente sale de una oferta", { size: 12.5, c: C.muted, a: "middle" }));
  svg(1440, 900, o.join(""), "01-panel");
}

/* ── VISTA 2 · EDITOR DE VARIANTE ── */
{
  const o = [fondo(1440, 900), lateral("variantes"), barra("Corpus  /  Variantes  /  AI/ML Engineer & Software Engineer", "Editor de variante")];
  const X = 280, W = 1144;
  // franja de estado: KPI compactos + ajuste
  const ks = [["Referencias", "55", "variante"], ["Overrides", "3", "variante"], ["Páginas objetivo", "2", "ajuste"]];
  ks.forEach(([l, v, f], k) => o.push(kpi(X + k * 196, 100, 180, l, v, f, k === 0 ? "variantes" : k === 1 ? "doc" : "panel")));
  const sx = X + 588, sw = W - 588;
  o.push(card(sx, 100, sw, 96, "brasa", 16));
  o.push(T(sx + 24, 132, "No cabe en 2 páginas a 10 pt", { size: 18, w: 500, f: DISP, c: C.ink }));
  o.push(T(sx + 24, 154, "21 huecos de más · fuente: motor de ajuste", { size: 12, f: MONO, c: C.inkM }));
  o.push(btn(sx + sw - 170, 128, "Proponer recortes", "tinta", null, 150));
  // pestañas
  const ty = 212;
  o.push(R(X, ty, 360, 40, 20, C.surface, 'stroke="#FFFFFF" stroke-opacity="0.10"'));
  [["Contenido", 1], ["Ajuste", 0], ["Salud", 0]].forEach(([n, on], k) => {
    if (on) o.push(R(X + 4 + k * 118, ty + 4, 116, 32, 16, "url(#gBrasa)"));
    o.push(T(X + 62 + k * 118, ty + 25, n, { size: 13, w: 600, c: on ? C.ink : C.muted, a: "middle" }));
  });
  // columna master
  const cy = 268, ch = 900 - cy - 16;
  o.push(card(X, cy, 300, ch, "grafito", 22));
  o.push(T(X + 20, cy + 34, "Tu master", { size: 15, w: 600 }), T(X + 280, cy + 34, "70 ítems", { size: 11.5, f: MONO, c: C.subtle, a: "end" }));
  o.push(R(X + 16, cy + 50, 268, 36, 12, C.sunken), I("buscar", X + 28, cy + 59, 16, C.subtle), T(X + 52, cy + 73, "Buscar en tu master", { size: 12, c: C.subtle }));
  const roles = [["Founder & AI Engineer", "PharmIQ"], ["AI/ML Engineer", "Proyecto de título (AeroFit)"], ["Independent Developer", "Open-Source & Simulation"], ["Scrum Master & Tech Lead", "Proyecto VR (3DLAB-ENVI)"], ["Software Engineering Intern", "Tesseract Softwares"]];
  roles.forEach(([a, b], k) => {
    const ry = cy + 102 + k * 62;
    o.push(R(X + 16, ry, 268, 54, 12, C.elev));
    o.push(T(X + 30, ry + 23, a, { size: 12.5, w: 600 }), T(X + 30, ry + 41, b, { size: 11.5, c: C.subtle }));
    o.push(I("revision", X + 258, ry + 18, 14, C.oro, 1.8));
  });
  // centro: edición
  const mx = X + 316, mw = 480;
  o.push(card(mx, cy, mw, ch, "grafito", 22));
  o.push(T(mx + 24, cy + 34, "Título objetivo", { size: 15, w: 600 }), T(mx + mw - 24, cy + 34, "el campo que más pesa", { size: 11.5, c: C.subtle, a: "end" }));
  o.push(R(mx + 20, cy + 50, mw - 40, 48, 12, C.sunken, 'stroke="#FF9A55" stroke-opacity="0.45"'));
  o.push(T(mx + 36, cy + 80, "AI/ML Engineer & Software Engineer", { size: 15, w: 600 }));
  o.push(T(mx + 24, cy + 132, "Resumen", { size: 15, w: 600 }), chip(mx + 100, cy + 116, "hechos verificados", "oro"));
  o.push(card(mx + 20, cy + 150, mw - 40, 150, "crema", 16));
  ["Ingeniero Civil en Computación en su último año", "(UNAB), especializado en IA aplicada a dominios", "regulados como salud y aviación. Ha liderado", "equipos con Scrum y construido sistemas RAG con", "trazabilidad de fuentes."]
    .forEach((l, k) => o.push(T(mx + 40, cy + 180 + k * 21, l, { size: 13.5, c: C.inkC })));
  o.push(T(mx + 24, cy + 336, "Experiencia", { size: 15, w: 600 }), T(mx + mw - 24, cy + 336, "las fechas vienen del master", { size: 11.5, c: C.subtle, a: "end" }));
  [["Founder & AI Engineer — PharmIQ", "2026-04 · actualidad"], ["AI/ML Engineer — Proyecto de título", "2026-04 · actualidad"], ["Scrum Master & Technical Team Lead", "2025-03 · 2025-12"], ["Software Engineering Intern", "2025-07 · 2025-08"]]
    .forEach(([a, b], k) => {
      const ry = cy + 352 + k * 52;
      o.push(R(mx + 20, ry, mw - 40, 44, 12, C.elev), T(mx + 36, ry + 27, a, { size: 13, w: 600 }), T(mx + mw - 36, ry + 27, b, { size: 11, f: MONO, c: C.subtle, a: "end" }));
    });
  // derecha: documento (no cambia de forma: hoja blanca)
  const dx = mx + mw + 16, dw = X + W - dx;
  o.push(card(dx, cy, dw, ch, "vidrio", 22));
  o.push(T(dx + 20, cy + 34, "Documento", { size: 15, w: 600 }), chip(dx + dw - 110, cy + 18, "página 1 de 3", "neutro"));
  o.push(R(dx + 24, cy + 54, dw - 48, ch - 78, 4, "#FFFFFF"));
  const px = dx + 44, pw = dw - 88;
  o.push(T(px, cy + 90, "Akhan Lorenzo Andrés Espinoza Rojas", { size: 12, w: 700, c: "#111" }), T(px, cy + 104, "AI/ML Engineer & Software Engineer", { size: 8.5, w: 600, c: "#333" }));
  for (let k = 0; k < 26; k++) {
    const yy = cy + 124 + k * 15;
    if (k % 7 === 0) o.push(T(px, yy, ["RESUMEN", "HABILIDADES", "EXPERIENCIA", "PROYECTOS"][k / 7] || "", { size: 7, w: 700, c: "#B8431A" }));
    else o.push(R(px, yy - 6, pw * (0.55 + ((k * 37) % 40) / 100), 4, 2, "#D6D2CC"));
  }
  svg(1440, 900, o.join(""), "02-editor-variante");
}

/* ── VISTA 3 · MASTER ── */
{
  const o = [fondo(1440, 900), lateral("master"), barra("Corpus  /  Master", "Tu master")];
  const X = 280, W = 1144, g = 16, kw = (W - 3 * g) / 4;
  [["Ítems", "70", "master", "master"], ["Roles", "5", "master · experiencia", "doc"], ["Grupos de habilidades", "12", "master · habilidades", "ajustes"], ["Resumen", "1", "master · resumen", "revision"]]
    .forEach(([l, v, f, i], k) => o.push(kpi(X + k * (kw + g), 100, kw, l, v, f, i, k === 0 ? "brasa" : "grafito")));
  const ty = 212;
  o.push(R(X, ty, 470, 40, 20, C.surface, 'stroke="#FFFFFF" stroke-opacity="0.10"'));
  [["Todo", 1], ["Experiencia", 0], ["Habilidades", 0], ["Proyectos", 0]].forEach(([n, on], k) => {
    if (on) o.push(R(X + 4 + k * 116, ty + 4, 114, 32, 16, "url(#gBrasa)"));
    o.push(T(X + 61 + k * 116, ty + 25, n, { size: 13, w: 600, c: on ? C.ink : C.muted, a: "middle" }));
  });
  o.push(btn(X + W - 150, ty, "Añadir ítem", "grafito", "mas", 150));
  const cy = 268, ch = 900 - cy - 16, lw = 760;
  o.push(card(X, cy, lw, ch, "grafito", 22));
  o.push(T(X + 24, cy + 38, "Experiencia", { size: 20, w: 500, f: DISP }), T(X + lw - 24, cy + 38, "5 roles", { size: 11.5, f: MONO, c: C.subtle, a: "end" }));
  [["Founder & AI Engineer — PharmIQ", "PharmIQ · Valparaíso, remoto", "2026-04 · actualidad", 1],
   ["AI/ML Engineer — Proyecto de título (AeroFit)", "Universidad Andrés Bello", "2026-04 · actualidad", 1],
   ["Scrum Master & Technical Team Lead — Proyecto VR", "Universidad Andrés Bello", "2025-03 · 2025-12", 1],
   ["Software Engineering Intern — Tesseract Softwares", "Tesseract Softwares", "2025-07 · 2025-08", 1],
   ["Independent Developer — Open-Source & Simulation", "Independiente", "2024-01 · actualidad", 0]]
    .forEach(([a, b, c, ok], k) => {
      const ry = cy + 60 + k * 100;
      o.push(R(X + 16, ry, lw - 32, 88, 16, C.elev, 'stroke="#FFFFFF" stroke-opacity="0.06"'));
      o.push(R(X + 32, ry + 18, 4, 52, 2, ok ? C.oro : C.subtle));
      o.push(T(X + 52, ry + 36, a, { size: 14.5, w: 600 }), T(X + 52, ry + 58, b, { size: 12, c: C.muted }));
      o.push(T(X + lw - 36, ry + 36, c, { size: 11, f: MONO, c: C.subtle, a: "end" }));
      o.push(chip(X + lw - 36 - (ok ? 98 : 106), ry + 50, ok ? "con fuente" : "sin respaldo", ok ? "oro" : "neutro"));
    });
  const rx = X + lw + 16, rw = W - lw - 16;
  o.push(card(rx, cy, rw, 300, "crema", 22));
  o.push(T(rx + 24, cy + 40, "Revisión", { size: 20, w: 500, f: DISP, c: C.inkC }));
  o.push(T(rx + 24, cy + 64, "lo que llegó de tus fuentes y espera", { size: 12.5, c: C.inkCM }), T(rx + 24, cy + 82, "que lo aceptes en el master", { size: 12.5, c: C.inkCM }));
  o.push(R(rx + 24, cy + 108, rw - 48, 104, 16, C.cremaH));
  o.push(T(rx + rw / 2, cy + 152, "Nada pendiente", { size: 15, w: 600, c: C.inkC, a: "middle" }), T(rx + rw / 2, cy + 174, "vuelca material para alimentar el master", { size: 12, c: C.inkCM, a: "middle" }));
  o.push(btn(rx + 24, cy + 236, "Volcar material", "crema", "fuentes", rw - 48));
  o.push(card(rx, cy + 316, rw, ch - 316, "grafito", 22));
  o.push(T(rx + 24, cy + 354, "Habilidades", { size: 15, w: 600 }), T(rx + rw - 24, cy + 354, "12 grupos", { size: 11.5, f: MONO, c: C.subtle, a: "end" }));
  let hx = rx + 24, hy = cy + 374;
  ["IA y LLMs", "Arquitecturas de IA", "Datos y ML", "Lenguajes", "Frameworks y web", "Infraestructura", "Ingeniería de software", "Metodologías", "3D y hardware", "Ciberseguridad"].forEach((s) => {
    const w = s.length * 6.4 + 22; if (hx + w > rx + rw - 24) { hx = rx + 24; hy += 32; }
    o.push(chip(hx, hy, s, "neutro")); hx += w + 8;
  });
  svg(1440, 900, o.join(""), "03-master");
}

/* ── VISTA 4 · VARIANTES ── */
{
  const o = [fondo(1440, 900), lateral("variantes"), barra("Corpus  /  Variantes", "Variantes")];
  const X = 280, W = 1144;
  o.push(card(X, 100, W, 220, "brasa", 22));
  o.push(T(X + 36, 150, "UNA OFERTA NUEVA", { size: 11, w: 500, f: MONO, c: C.inkM, ls: 1.2 }));
  o.push(T(X + 36, 204, "Pega el aviso y sale una variante", { size: 38, w: 500, f: DISP, c: C.ink, ls: -0.6 }));
  o.push(T(X + 36, 236, "hecha de tu master, con cada línea atada a su fuente.", { size: 15, c: C.inkM }));
  const ix = X + 640;
  o.push(R(ix, 140, W - 640 - 36, 120, 16, C.ink, 'fill-opacity="0.92"'));
  o.push(T(ix + 20, 172, "Pega aquí el texto del aviso…", { size: 13.5, c: C.subtle }));
  o.push(btn(ix + (W - 640 - 36) - 190, 208, "Crear variante", "brasa", "mas", 170));
  o.push(T(X + 4, 360, "Tus variantes", { size: 22, w: 500, f: DISP }), T(X + 156, 360, "1", { size: 13, f: MONO, c: C.subtle }));
  const cy = 384, cw = (W - 32) / 3, ch = 250;
  o.push(card(X, cy, cw, ch, "grafito", 22));
  o.push(ring(X + cw - 62, cy + 62, 34, 9, 1, C.b500, "rgba(255,255,255,0.08)"));
  o.push(T(X + cw - 62, cy + 67, "3 pág", { size: 12, w: 600, f: MONO, a: "middle" }));
  o.push(T(X + 24, cy + 48, "AI/ML Engineer &", { size: 18, w: 600 }), T(X + 24, cy + 72, "Software Engineer (copia)", { size: 18, w: 600 }));
  o.push(T(X + 24, cy + 98, "al día · guardado", { size: 12, c: C.subtle }));
  o.push(chip(X + 24, cy + 128, "55 referencias", "neutro"), chip(X + 142, cy + 128, "3 overrides", "neutro"));
  o.push(chip(X + 24, cy + 160, "no cabe en 2 páginas", "brasa"));
  o.push(btn(X + 24, cy + ch - 60, "Abrir editor", "grafito", "doc", 140), btn(X + 176, cy + ch - 60, "PDF", "grafito", null, 70));
  const ex = X + cw + 16;
  o.push(R(ex, cy, cw, ch, 22, "none", 'stroke="#FFFFFF" stroke-opacity="0.16" stroke-dasharray="6 6"'));
  o.push(R(ex + cw / 2 - 24, cy + 70, 48, 48, 16, C.elev), I("mas", ex + cw / 2 - 11, cy + 83, 22, C.b300, 1.8));
  o.push(T(ex + cw / 2, cy + 150, "Cada oferta, su variante", { size: 15, w: 600, a: "middle" }), T(ex + cw / 2, cy + 172, "el master no se toca: la variante es una vista", { size: 12, c: C.subtle, a: "middle" }));
  const fx = ex + cw + 16;
  o.push(card(fx, cy, cw, ch, "crema", 22));
  o.push(T(fx + 24, cy + 44, "Plantillas", { size: 18, w: 500, f: DISP, c: C.inkC }));
  o.push(T(fx + 24, cy + 66, "el mismo documento, siempre", { size: 12, c: C.inkCM }), T(fx + 24, cy + 82, "legible por ATS", { size: 12, c: C.inkCM }));
  for (let k = 0; k < 3; k++) { o.push(R(fx + 24 + k * 98, cy + 104, 86, 116, 6, "#FFFFFF", 'stroke="#1F1712" stroke-opacity="0.08"')); for (let j = 0; j < 7; j++) o.push(R(fx + 34 + k * 98, cy + 120 + j * 13, 50 + ((j * 13 + k * 7) % 16), 3, 1.5, "#D6D2CC")); }
  svg(1440, 900, o.join(""), "04-variantes");
}

/* ── VISTA 5 · MÓVIL (Panel) ── */
{
  const W = 390, H = 844, o = [fondo(W, H)];
  o.push(T(20, 52, "Corpus", { size: 22, w: 500, f: DISP }), R(94, 35, 6, 6, 1.5, C.b500));
  o.push(R(W - 104, 28, 40, 40, 14, C.surface, 'stroke="#FFFFFF" stroke-opacity="0.10"'), I("buscar", W - 94, 38, 20, C.muted));
  o.push(`<circle cx="${W - 38}" cy="48" r="18" fill="${C.elev}" stroke="${C.oro}" stroke-opacity="0.7" stroke-width="1.5"/>`, T(W - 38, 52, "AE", { size: 10, f: MONO, c: C.oro, a: "middle" }));
  o.push(T(20, 108, "Panel", { size: 32, w: 500, f: DISP }));
  const kw = (W - 52) / 2;
  [["Ítems", "70", "master", "master"], ["Roles", "5", "experiencia", "doc"], ["Habilidades", "12", "grupos", "ajustes"], ["Referencias", "55", "variante", "variantes"]]
    .forEach(([l, v, f, i], k) => o.push(kpi(20 + (k % 2) * (kw + 12), 128 + Math.floor(k / 2) * 108, kw, l, v, f, i)));
  const hy = 348;
  o.push(card(20, hy, W - 40, 230, "brasa", 22));
  o.push(T(40, hy + 40, "TU PRÓXIMA VARIANTE", { size: 10.5, w: 500, f: MONO, c: C.inkM, ls: 1.1 }));
  o.push(T(40, hy + 84, "Pega la oferta.", { size: 30, w: 500, f: DISP, c: C.ink }), T(40, hy + 120, "Corpus la arma.", { size: 30, w: 500, f: DISP, c: C.ink }));
  o.push(T(40, hy + 150, "Nada inventado: todo sale de tu master.", { size: 13, c: C.inkM }));
  o.push(btn(40, hy + 170, "Nueva variante", "tinta", "mas", W - 80));
  const cy = hy + 246;
  o.push(card(20, cy, W - 40, 130, "crema", 22));
  o.push(ring(84, cy + 65, 38, 10, 55 / 70, C.b700, C.cremaH), T(84, cy + 70, "79 %", { size: 15, w: 600, c: C.inkC, a: "middle" }));
  o.push(T(140, cy + 50, "Cobertura de la variante", { size: 14, w: 600, c: C.inkC }), T(140, cy + 70, "55 de 70 ítems del master", { size: 12, c: C.inkCM }), T(140, cy + 92, "fuente: variante activa", { size: 10.5, f: MONO, c: C.inkCM }));
  // barra inferior
  o.push(card(8, H - 76, W - 16, 64, "vidrio", 20));
  const items = ["panel", "master", "variantes", "fuentes", "ajustes"];
  items.forEach((k, i) => {
    const x = 8 + (W - 16) / 5 * (i + 0.5);
    if (i === 0) o.push(R(x - 22, H - 66, 44, 44, 14, "url(#gBrasa)"));
    o.push(I(k, x - 10, H - 54, 20, i === 0 ? C.ink : C.muted, 1.6));
  });
  svg(W, H, o.join(""), "05-movil-panel");
}
console.log("ok");
