// Esterno dell'arena per l'intro aerea: involucro, tetto, insegna e dintorni stilizzati, ricostruiti dalle foto (vedi docs/ARENE-RILIEVO.md).
// Tutto è configurato in arenas.js → exterior. I lati (north/south/west/east) seguono la convenzione di layout.js.
// Di notte si accendono facciate, finestre, lampioni, fari delle auto e piste all'aperto: ogni materiale che si accende
// finisce nella lista `night` restituita, e la vista ne regola l'intensità durante il tramonto.

import * as THREE from 'three';
import { TEAMS } from './teams.js?v=109';
import { seeded, color, canvas, texture, drawLogo, fitText, Mesher, stripGeometry, roundedRect } from './common.js?v=109';

const pick3 = (rand, list) => list[Math.floor(rand() * list.length)];
const GROUND = { urban: '#8e8f88', alpine: '#6f8a55', grass: '#79925a', snow: '#e6ebf0' };

// L'involucro deve contenere tutto il rettangolo interno: ottagono e angoli arrotondati vengono allargati quanto serve.
function footprint(shape, X0, X1, Z0, Z1, cut = 0.3, extra = 0) {
  const w = X1 - X0, d = Z1 - Z0;
  if (shape === 'octagon') { const c = Math.min(w, d) * cut, e = c / 2 + 1 + extra; X0 -= e; X1 += e; Z0 -= e; Z1 += e; return [[X0 + c, Z0], [X1 - c, Z0], [X1, Z0 + c], [X1, Z1 - c], [X1 - c, Z1], [X0 + c, Z1], [X0, Z1 - c], [X0, Z0 + c]]; }
  if (shape === 'rounded') { const r0 = Math.min(w, d) / 2 * 0.42, e = r0 * 0.3 + 1, hx = w / 2 + e, hz = d / 2 + e, mx = X0 + w / 2, mz = Z0 + d / 2; return roundedRect(hx, hz, Math.min(hx, hz) * 0.42, 7).map(([x, z]) => [x + mx, z + mz]); }
  return [[X0, Z0], [X1, Z0], [X1, Z1], [X0, Z1]];
}
const grow = (fp, e) => { const cx = fp.reduce((a, p) => a + p[0], 0) / fp.length, cz = fp.reduce((a, p) => a + p[1], 0) / fp.length; return fp.map(([x, z]) => [x + Math.sign(x - cx) * e, z + Math.sign(z - cz) * e]); };

/* ---------- texture delle facciate: giorno (map) e notte (emissiveMap) ---------- */

function facadeTextures(E) {
  const W = 512, H = 256, [c, g] = canvas(W, H), [cn, n] = canvas(W, H), base = E.wall || '#8d9096', rand = seeded((E.facade || 'f') + base);
  const dark = color(base).multiplyScalar(0.72).getStyle(), light = color(base).lerp(color('#ffffff'), 0.25).getStyle(), glow = E.glow || '#ffcf8f';
  const warm = a => `rgba(255,218,168,${a})`;
  g.fillStyle = base; g.fillRect(0, 0, W, H); n.fillStyle = '#000'; n.fillRect(0, 0, W, H);
  const glass = (y0, y1, mull = 16, tint = '#26313b') => {
    g.fillStyle = tint; g.fillRect(0, H * y0, W, H * (y1 - y0)); g.fillStyle = 'rgba(160,190,210,.18)'; g.fillRect(0, H * y0, W, H * (y1 - y0) * 0.35);
    g.fillStyle = color(tint).lerp(color('#9aa3ab'), 0.4).getStyle(); for (let x = 0; x < W; x += mull) g.fillRect(x, H * y0, 2, H * (y1 - y0));
  };
  const lit = (y0, y1, a = 0.75, mull = 16) => { for (let x = 0; x < W; x += mull) { n.fillStyle = warm(a * (0.6 + rand() * 0.4)); n.fillRect(x + 2, H * y0, mull - 2, H * (y1 - y0)); } };
  const ground = (top = 0.86) => {
    g.fillStyle = '#2b3a47'; g.fillRect(0, H * top, W, H * (1 - top));
    for (let x = 4; x < W; x += 28) { g.fillStyle = rand() < 0.6 ? 'rgba(255,214,150,.55)' : 'rgba(150,180,200,.45)'; g.fillRect(x, H * (top + 0.02), 20, H * (0.98 - top)); n.fillStyle = warm(0.6 + rand() * 0.4); n.fillRect(x, H * (top + 0.02), 20, H * (0.98 - top)); }
  };
  const f = E.facade || 'concrete';
  if (f === 'slots') {
    // Gottardo: fascia alta con feritoie verticali, piano terra vetrato a tutta altezza, linea LED blu.
    g.fillStyle = light; g.fillRect(0, 0, W, 5);
    for (let x = 3; x < W; x += 11) { g.fillStyle = '#18191c'; g.fillRect(x, H * 0.16, 4, H * 0.2); n.fillStyle = warm(0.3); n.fillRect(x, H * 0.16, 4, H * 0.2); }
    glass(0.52, 1, 14, '#1c232a'); lit(0.56, 0.98, 0.26, 28);
    if (E.line) { n.fillStyle = E.line; n.fillRect(0, H * 0.52, W, 5); g.fillStyle = dark; g.fillRect(0, H * 0.5, W, 6); }
  } else if (f === 'mesh') {
    // Friburgo: due fasce di rete metallica a rombi, separate da un piano arretrato con una linea ambra.
    const lattice = (ctx, y0, y1, stroke, wdt, fillA) => {
      ctx.save(); ctx.beginPath(); ctx.rect(0, H * y0, W, H * (y1 - y0)); ctx.clip();
      if (fillA) { ctx.fillStyle = fillA; ctx.fillRect(0, H * y0, W, H * (y1 - y0)); }
      ctx.strokeStyle = stroke; ctx.lineWidth = wdt;
      for (let x = -H; x < W + H; x += 24) { ctx.beginPath(); ctx.moveTo(x, H * y0); ctx.lineTo(x + H * 0.9, H * y1); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, H * y1); ctx.lineTo(x + H * 0.9, H * y0); ctx.stroke(); }
      ctx.restore();
    };
    g.fillStyle = '#9aa0a6'; g.fillRect(0, 0, W, H);
    lattice(g, 0, 0.5, '#e4e7ea', 3); lattice(g, 0.62, 0.9, '#e4e7ea', 3);
    g.fillStyle = '#25282c'; g.fillRect(0, H * 0.5, W, H * 0.12); ground(0.9);
    lattice(n, 0, 0.5, glow, 4, 'rgba(20,60,160,.45)'); lattice(n, 0.62, 0.9, glow, 4, 'rgba(20,60,160,.45)');
    n.fillStyle = E.line || '#ffb04a'; n.fillRect(0, H * 0.585, W, 4);
  } else if (f === 'panels') {
    // Berna: griglia fitta di pannelli chiari e aperture; di sera luce azzurra e bianca dal basso.
    for (let y = 0; y < H * 0.88; y += 21) for (let x = 0; x < W; x += 32) {
      const win = rand() < 0.22; g.fillStyle = win ? '#3a4652' : pick3(rand, ['#e6e8ea', '#d5d9dd', '#c3c9cf', '#b5bec7', '#eef0f1']); g.fillRect(x + 1, y + 1, 30, 19);
      if (win && rand() < 0.6) { n.fillStyle = warm(0.55); n.fillRect(x + 1, y + 1, 30, 19); }
    }
    const gr = n.createLinearGradient(0, H, 0, 0); gr.addColorStop(0, 'rgba(60,130,255,.9)'); gr.addColorStop(0.5, 'rgba(120,175,255,.42)'); gr.addColorStop(1, 'rgba(200,225,255,.1)');
    n.globalCompositeOperation = 'lighter'; n.fillStyle = gr; n.fillRect(0, 0, W, H * 0.88); n.globalCompositeOperation = 'source-over';
    ground(0.88);
  } else if (f === 'opal') {
    // Berna: vetro opalino quasi bianco a montanti fitti, con macchie di riquadri grigi come pixel; di sera azzurro dal basso.
    g.fillStyle = '#e8edf0'; g.fillRect(0, 0, W, H);
    for (let y = 0; y < H * 0.9; y += 12) for (let x = 0; x < W; x += 16) {
      const blob = Math.sin(x * 0.031 + y * 0.05) + Math.sin(x * 0.013 - y * 0.07) + rand() * 0.9;
      if (blob > 1.1) { g.fillStyle = pick3(rand, ['#a9b2ba', '#bcc4cb', '#98a2ab', '#c9d0d6']); g.fillRect(x, y, 16, 12); }
    }
    g.fillStyle = 'rgba(120,135,150,.35)'; for (let x = 0; x < W; x += 8) g.fillRect(x, 0, 1, H * 0.9);
    g.fillStyle = 'rgba(255,255,255,.7)'; for (let y = 0; y < H * 0.9; y += 48) g.fillRect(0, y, W, 2);
    const gr = n.createLinearGradient(0, H, 0, 0); gr.addColorStop(0, 'rgba(40,110,255,.95)'); gr.addColorStop(0.45, 'rgba(70,140,255,.6)'); gr.addColorStop(1, 'rgba(150,190,255,.18)');
    n.fillStyle = gr; n.fillRect(0, 0, W, H * 0.9);
    n.fillStyle = 'rgba(0,0,30,.35)'; for (let x = 0; x < W; x += 8) n.fillRect(x, 0, 1, H * 0.9);
    ground(0.9);
  } else if (f === 'hslats') {
    // Porrentruy, Rapperswil: rivestimento a doghe orizzontali.
    for (let y = 0; y < H * 0.86; y += 6) { g.fillStyle = y % 12 ? light : dark; g.fillRect(0, y, W, 2); }
    ground(0.86);
    if (E.accent) for (let x = 40; x < W; x += 128) { g.fillStyle = E.accent; g.fillRect(x, H * 0.86, 30, H * 0.14); n.fillStyle = E.accent; n.fillRect(x, H * 0.86, 30, H * 0.14); }
  } else if (f === 'pleats') {
    // Zurigo: pieghe verticali come un sipario, bordo inferiore ondulato con oblò; di sera tratti rossi, bianchi e blu.
    const cols = E.nightColors || ['#ffffff'], wave = x => H * (0.76 + 0.045 * Math.sin(x / W * Math.PI * 16));
    for (let x = 0; x < W; x += 16) {
      const gr = g.createLinearGradient(x, 0, x + 16, 0); gr.addColorStop(0, '#f2f3f3'); gr.addColorStop(0.5, '#d4d6d8'); gr.addColorStop(1, '#a9adb1'); g.fillStyle = gr; g.fillRect(x, 0, 16, H);
      const k = cols[Math.floor(x / W * cols.length)], ng = n.createLinearGradient(x, 0, x + 16, 0); ng.addColorStop(0, k); ng.addColorStop(0.6, k); ng.addColorStop(1, '#000');
      n.globalAlpha = 0.85; n.fillStyle = ng; n.fillRect(x, 0, 16, H); n.globalAlpha = 1;
    }
    for (let x = 0; x < W; x += 2) { g.fillStyle = '#2a3036'; g.fillRect(x, wave(x), 2, H - wave(x)); n.fillStyle = '#000'; n.fillRect(x, wave(x), 2, H - wave(x)); }
    for (let x = 13; x < W; x += 26) { g.fillStyle = '#7c8994'; g.beginPath(); g.arc(x, H * 0.9, 8, 0, Math.PI * 2); g.fill(); n.fillStyle = warm(0.95); n.beginPath(); n.arc(x, H * 0.9, 8, 0, Math.PI * 2); n.fill(); }
  } else if (f === 'bands') {
    // Losanna: fasce bianche orizzontali e nastri vetrati.
    for (const [y0, y1] of [[0.3, 0.42], [0.62, 0.74]]) { glass(y0, y1, 20, '#2c3640'); lit(y0, y1, 0.8, 20); }
    ground(0.88);
  } else if (f === 'bronze') {
    // Zugo: pannelli color bronzo e poche grandi finestre.
    for (let x = 0; x < W; x += 10) { g.fillStyle = x % 20 ? dark : base; g.fillRect(x, 0, 8, H); }
    for (let i = 0; i < 4; i++) { const x = 30 + i * 125, y = H * (0.15 + rand() * 0.35); g.fillStyle = '#1f2327'; g.fillRect(x, y, 34, 30); n.fillStyle = warm(0.9); n.fillRect(x, y, 34, 30); }
    glass(0.84, 1, 18, '#20272e'); lit(0.84, 1, 0.9, 18);
  } else if (f === 'struts') {
    // Ginevra: fascia chiara sotto il tetto, vetrate e puntoni inclinati davanti ai vetri.
    glass(0.2, 1, 22, '#2e3943'); lit(0.24, 1, 0.55, 22);
    g.fillStyle = light; g.fillRect(0, 0, W, H * 0.2);
    for (let x = 0; x < W; x += 64) for (const ctx of [g, n]) { ctx.fillStyle = ctx === g ? '#d9d6ce' : '#000'; ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x + 14, H); ctx.lineTo(x + 44, H * 0.2); ctx.lineTo(x + 30, H * 0.2); ctx.fill(); }
  } else if (f === 'glass') {
    glass(0.12, 0.86, 22, '#35495c'); lit(0.14, 0.86, 0.85, 22); g.fillStyle = light; g.fillRect(0, 0, W, H * 0.12);
    ground(0.86);
  } else if (f === 'hallglass') {
    // Lugano: zoccolo in cemento chiaro con gli ingressi, sopra una fascia vetrata a montanti fitti che di sera si accende.
    for (let x = 0; x < W; x += 64) { g.fillStyle = dark; g.fillRect(x, H * 0.5, 2, H * 0.5); }
    g.fillStyle = light; g.fillRect(0, H * 0.48, W, 4);
    glass(0.06, 0.46, 10, '#3a4651'); n.fillStyle = warm(0.85); n.fillRect(0, H * 0.08, W, H * 0.38); n.fillStyle = 'rgba(0,0,0,.55)'; for (let x = 0; x < W; x += 10) n.fillRect(x, H * 0.08, 1, H * 0.38);
    g.fillStyle = dark; g.fillRect(0, 0, W, H * 0.06);
    for (let x = 30; x < W; x += 170) { g.fillStyle = '#2b3036'; g.fillRect(x, H * 0.8, 26, H * 0.2); n.fillStyle = warm(0.9); n.fillRect(x, H * 0.8, 26, H * 0.2); }
  } else if (f === 'fins') {
    for (let x = 0; x < W; x += 24) { g.fillStyle = dark; g.fillRect(x, 0, 6, H); g.fillStyle = light; g.fillRect(x + 6, 0, 2, H); n.fillStyle = warm(0.22); n.fillRect(x + 8, H * 0.1, 15, H * 0.75); }
    ground(0.86);
  } else if (f === 'wood') {
    for (let x = 0; x < W; x += 8) { g.fillStyle = x % 16 ? dark : base; g.fillRect(x, 0, 6, H); }
    ground(0.86);
  } else {
    g.strokeStyle = dark; g.lineWidth = 2; for (let x = 0; x < W; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = 0; y < H; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    ground(0.86);
  }
  if (f !== 'slots' && f !== 'panels' && f !== 'mesh' && f !== 'opal') { g.fillStyle = light; g.fillRect(0, 0, W, 6); }
  // Luce colorata dal basso (es. fascia blu del Gottardo): leggera, sopra il piano terra.
  if (E.wash) { const gr = n.createLinearGradient(0, H, 0, H * 0.4); gr.addColorStop(0, E.wash); gr.addColorStop(1, 'rgba(0,0,0,0)'); n.globalCompositeOperation = 'lighter'; n.fillStyle = gr; n.fillRect(0, 0, W, H); n.globalCompositeOperation = 'source-over'; }
  return { day: texture(c, true), night: texture(cn, true) };
}

function roofTexture(kind, tint) {
  const [c, g] = canvas(256, 256), rand = seeded(kind);
  if (kind === 'solar' || kind === 'terracotta-solar' || kind === 'dark-solar') {
    g.fillStyle = kind === 'solar' ? '#9a9c9e' : kind === 'dark-solar' ? '#3a3d42' : '#a5573a'; g.fillRect(0, 0, 256, 256);
    for (let y = 8; y < 256; y += 32) { g.fillStyle = '#1d2b45'; g.fillRect(6, y, 244, 22); g.strokeStyle = 'rgba(160,180,210,.35)'; g.lineWidth = 1; for (let x = 6; x < 250; x += 14) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 22); g.stroke(); } }
  } else if (kind === 'grid') {
    // Copertura a riquadri (Gottardo): pannelli scuri in un telaio chiaro.
    g.fillStyle = '#b7bdc3'; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 32) for (let x = 0; x < 256; x += 32) { g.fillStyle = rand() < 0.1 ? '#6a7a8a' : '#2f3e52'; g.fillRect(x + 3, y + 3, 26, 26); }
  } else if (kind === 'metal') {
    g.fillStyle = tint || '#3b3e43'; g.fillRect(0, 0, 256, 256); g.fillStyle = 'rgba(255,255,255,.08)'; for (let x = 0; x < 256; x += 16) g.fillRect(x, 0, 3, 256);
  } else if (kind === 'green') {
    g.fillStyle = '#6f8a4f'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 400; i++) { g.fillStyle = rand() < 0.5 ? 'rgba(40,60,30,.25)' : 'rgba(170,190,110,.25)'; g.fillRect(rand() * 256, rand() * 256, 6, 6); }
  } else if (kind === 'snow') {
    g.fillStyle = '#eef2f6'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(160,175,195,.15)'; g.fillRect(rand() * 256, rand() * 256, 30, 3); }
  } else {
    g.fillStyle = tint || '#c9ccd0'; g.fillRect(0, 0, 256, 256); g.strokeStyle = 'rgba(0,0,0,.08)'; for (let x = 0; x < 256; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(90,95,100,.5)'; g.fillRect(rand() * 220, rand() * 220, 18, 12); }
  }
  const t = texture(c, true); t.wrapT = THREE.RepeatWrapping; return t;
}

function glazingTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#3e5566'; g.fillRect(0, 0, 256, 256);
  const grad = g.createLinearGradient(0, 0, 256, 256); grad.addColorStop(0, 'rgba(190,215,235,.35)'); grad.addColorStop(1, 'rgba(40,60,75,0)'); g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#1d1a17'; g.lineWidth = 6; for (let x = 0; x <= 256; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  g.lineWidth = 4; for (let y = 0; y <= 256; y += 48) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  const t = texture(c, true); t.wrapT = THREE.RepeatWrapping; return t;
}

// Vetrata accesa di notte: riquadri caldi e montanti scuri.
function glazingNightTexture(tint) {
  const [c, g] = canvas(256, 256);
  g.fillStyle = tint; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#000'; g.lineWidth = 6; for (let x = 0; x <= 256; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  g.lineWidth = 4; for (let y = 0; y <= 256; y += 48) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  const t = texture(c, true); t.wrapT = THREE.RepeatWrapping; return t;
}

// Blocco uffici (Berna): telai bianchi a griglia, finestre scure e lamelle verticali chiare davanti ai vetri.
// Quattro piani su tutta l'altezza della texture; di notte una parte degli uffici resta accesa.
// Pannelli in lamiera stirata sfaccettati (Friburgo): alluminio chiaro con una trama a diagonali minute;
// di notte la trama si accende di blu. Un pannello per riquadro (u, v da 0 a 1).
function facetTextures() {
  const S = 256, [c, g] = canvas(S, S), [cn, n] = canvas(S, S);
  const gr = g.createLinearGradient(0, 0, S, S); gr.addColorStop(0, '#e3e7ea'); gr.addColorStop(1, '#b9bfc5'); g.fillStyle = gr; g.fillRect(0, 0, S, S);
  n.fillStyle = 'rgba(25,70,190,.55)'; n.fillRect(0, 0, S, S);
  for (const [ctx, col, wdt] of [[g, 'rgba(96,104,112,.75)', 2], [n, '#5c9cff', 3]]) {
    ctx.strokeStyle = col; ctx.lineWidth = wdt;
    for (let k = -S; k < 2 * S; k += 18) { ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k + S * 0.6, S); ctx.stroke(); ctx.beginPath(); ctx.moveTo(k, S); ctx.lineTo(k + S * 0.6, 0); ctx.stroke(); }
    ctx.lineWidth = wdt + 2; ctx.strokeRect(1, 1, S - 2, S - 2);
  }
  return { day: texture(c, true), night: texture(cn, true) };
}

// Fascia sul bancone degli ingressi (Friburgo): striscia nera con le scritte bianche dei servizi.
function entranceSignTexture(labels) {
  const W = 1024, H = 64, [c, g] = canvas(W, H);
  g.fillStyle = '#16171a'; g.fillRect(0, 0, W, H); g.fillStyle = '#f2f2f0'; g.font = '700 30px system-ui, sans-serif'; g.textBaseline = 'middle';
  labels.forEach((t, i) => { const x = 30 + i * W / labels.length; g.fillText(t, x, H / 2); g.fillRect(x - 16, 14, 3, H - 28); });
  return texture(c, true);
}

function officeTextures(seed) {
  const W = 512, H = 256, [c, g] = canvas(W, H), [cn, n] = canvas(W, H), rand = seeded(seed), floors = 4, fh = H / floors;
  g.fillStyle = '#d9dde0'; g.fillRect(0, 0, W, H); n.fillStyle = '#000'; n.fillRect(0, 0, W, H);
  for (let f = 0; f < floors; f++) for (let x = 0; x < W; x += 32) {
    const y = f * fh;
    g.fillStyle = '#26323c'; g.fillRect(x + 3, y + 5, 26, fh - 9);
    if (rand() < 0.55) { g.fillStyle = 'rgba(205,212,218,.85)'; for (let k = 0; k < 26; k += 4) g.fillRect(x + 3 + k, y + 5, 2, fh - 9); }
    if (rand() < 0.4) { n.fillStyle = rand() < 0.8 ? 'rgba(255,214,160,.85)' : 'rgba(215,230,255,.8)'; n.fillRect(x + 3, y + 5, 26, fh - 9); }
  }
  g.fillStyle = '#f2f3f4'; for (let x = 0; x < W; x += 32) g.fillRect(x, 0, 3, H); for (let f = 0; f <= floors; f++) g.fillRect(0, f * fh - 2, W, 4);
  return { day: texture(c, true), night: texture(cn, true) };
}

function towerTextures(seed, tint = '#7b6a58') {
  const [c, g] = canvas(256, 512), [cn, n] = canvas(256, 512), rand = seeded(seed);
  g.fillStyle = tint; g.fillRect(0, 0, 256, 512); n.fillStyle = '#000'; n.fillRect(0, 0, 256, 512);
  for (let y = 10; y < 500; y += 22) for (let x = 6; x < 250; x += 18) { const w = 10 + rand() * 6; g.fillStyle = '#2b3540'; g.fillRect(x, y, w, 12); if (rand() < 0.45) { n.fillStyle = rand() < 0.75 ? '#ffd29a' : '#dbe8ff'; n.fillRect(x, y, w, 12); } }
  for (const [x, y] of [[60, 120], [150, 300], [90, 400]]) { g.fillStyle = '#121416'; g.fillRect(x, y, 40, 48); n.fillStyle = '#000'; n.fillRect(x, y, 40, 48); }
  return { day: texture(c), night: texture(cn) };
}

function signTexture(A, logo) {
  const [c, g] = canvas(1024, 160), T = TEAMS[A.team];
  g.clearRect(0, 0, 1024, 160);
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(80, 80, 70, 0, Math.PI * 2); g.fill(); drawLogo(g, logo, 80, 80, 110);
  g.fillStyle = A.exterior?.signColor || '#ffffff'; g.textBaseline = 'middle'; g.textAlign = 'left'; fitText(g, A.name.toUpperCase(), 840, 84, 900); g.fillText(A.name.toUpperCase(), 170, 80);
  g.fillStyle = T.primary; g.fillRect(170, 128, 160, 8);
  return texture(c);
}

function pitchTexture() {
  const [c, g] = canvas(512, 340);
  for (let i = 0; i < 10; i++) { g.fillStyle = i % 2 ? '#4f8a3c' : '#589842'; g.fillRect(i * 51.2, 0, 51.2, 340); }
  g.strokeStyle = '#f2f2f2'; g.lineWidth = 3; g.strokeRect(14, 14, 484, 312); g.beginPath(); g.moveTo(256, 14); g.lineTo(256, 326); g.stroke();
  g.beginPath(); g.arc(256, 170, 40, 0, Math.PI * 2); g.stroke(); g.strokeRect(14, 100, 70, 140); g.strokeRect(428, 100, 70, 140);
  return texture(c);
}

function iceRinkTexture() {
  const [c, g] = canvas(512, 256);
  g.fillStyle = '#eef4f8'; g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#c8202c'; g.fillRect(254, 0, 4, 256); g.fillStyle = '#2050c0'; g.fillRect(170, 0, 5, 256); g.fillRect(337, 0, 5, 256);
  g.strokeStyle = '#c8202c'; g.lineWidth = 2; for (const x of [90, 422]) for (const y of [70, 186]) { g.beginPath(); g.arc(x, y, 26, 0, Math.PI * 2); g.stroke(); }
  return texture(c);
}

function radialTexture() {
  const [c, g] = canvas(128, 128), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return texture(c);
}

/* ---------- luci puntiformi (finestre, lampioni, fari, stelle) ---------- */

// Punti luminosi che compaiono di notte. Con `move` scorrono lungo una direzione (fari delle auto).
function glowPoints(list, glow, time, move = null) {
  const n = list.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), mv = new Float32Array(n * 2), k = new THREE.Color();
  list.forEach((p, i) => { pos.set([p.x, p.y, p.z], i * 3); k.set(p.c); col.set([k.r, k.g, k.b], i * 3); size[i] = p.s; mv[i * 2] = p.m0 ?? 0; mv[i * 2 + 1] = p.sp ?? 0; });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1)); geo.setAttribute('aMove', new THREE.BufferAttribute(mv, 2));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uNight: glow, uTime: time, uDir: { value: new THREE.Vector3(...(move?.dir || [1, 0, 0])) }, uLen: { value: move?.len || 1 }, uMove: { value: move ? 1 : 0 } },
    vertexShader: `attribute vec3 aColor; attribute float aSize; attribute vec2 aMove; uniform float uTime, uLen, uMove; uniform vec3 uDir; varying vec3 vColor;
      void main() { vec3 p = position; if (uMove > 0.5) p += uDir * (mod(aMove.x + uTime * aMove.y, uLen) - uLen * 0.5);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = clamp(aSize * 520.0 / -mv.z, 1.5, 48.0); gl_Position = projectionMatrix * mv; vColor = aColor; }`,
    fragmentShader: `uniform float uNight; varying vec3 vColor;
      void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.08, d) * uNight; if (a < 0.01) discard; gl_FragColor = vec4(vColor, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; return pts;
}

/* ---------- edificio ---------- */

// Tetto della sala ottagonale di Davos (octaStar), come funzione pura: serve sia all'esterno sia alla vista, che ci
// appoggia sotto le volte di legno (così il soffitto interno segue le falde e non buca mai la copertura).
// Forma, in metri sopra la gronda: unione morbida di un padiglione che sale da tutti i bordi (pendenza `hip`, fino a
// `plateau` × rise) e di due capanne strette che si incrociano al centro e sui lati dritti fanno i timpani (larghe gx, gz).
export function octaRoof(A, EX, EZn, EZs) {
  const E = A.exterior, O = E.octaStar, pad = 1.2, fp = footprint(E.shape, -EX - pad, EX + pad, -EZn - pad, EZs + pad, E.octCut, E.octPad);
  const Hb = O.base ?? 7, U = grow(fp, -(O.inset ?? 2.5)), xs = U.map(q => q[0]), zs = U.map(q => q[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2, hx = (Math.max(...xs) - Math.min(...xs)) / 2, hz = (Math.max(...zs) - Math.min(...zs)) / 2;
  const rise = O.rise ?? 28, sabs = d => Math.sqrt(d * d + 4) - 2, k = (O.soft ?? 0.16) * rise;
  const smax = (p, q) => (p + q + Math.sqrt((p - q) * (p - q) + k * k)) / 2, smin = (p, q) => (p + q - Math.sqrt((p - q) * (p - q) + k * k)) / 2;
  const edges = U.map((a, i) => { const b = U[(i + 1) % U.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); let nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L; if (nx * (cx - a[0]) + nz * (cz - a[1]) < 0) { nx = -nx; nz = -nz; } return [a, nx, nz]; });
  const dist = (x, z) => Math.max(0, Math.min(...edges.map(([a, nx, nz]) => nx * (x - a[0]) + nz * (z - a[1]))));
  const h = (x, z) => {
    const hip = smin((O.hip ?? 0.85) * dist(x, z), rise * (O.plateau ?? 0.72));
    const gA = rise * (1 - sabs(z - cz) / (hz * (O.gz ?? 0.75))), gB = rise * (1 - sabs(x - cx) / (hx * (O.gx ?? 0.5)));
    return Hb + Math.max(0, smax(hip, smax(gA, gB)) - k * 0.3);
  };
  return { fp, U, Hb, cx, cz, rise, h };
}

export function buildExterior(A, { EX, EZn, EZs, roofY, wallY = roofY, ceilAt = null, logo, time = { value: 0 }, glow = { value: 0 } }) {
  const E = A.exterior || {}, group = new THREE.Group(), rand = seeded(A.team + 'ext'), night = [];
  const nightMat = (mat, max = 1, prop = 'emissiveIntensity', min = 0) => { night.push({ mat, max: max - min, prop, min }); return mat; };
  const pad = 1.2, fp = footprint(E.shape, -EX - pad, EX + pad, -EZn - pad, EZs + pad, E.octCut, E.octPad);
  // Di norma i dintorni partono dal rettangolo interno; con la sala ottagonale di Davos (octaStar) dal suo ingombro vero.
  // Zurigo (curtain): il complesso si allunga oltre la sala con la sala d'allenamento a ovest e il corpo degli oblò e la terrazza a est.
  const CT = E.curtain, cW = CT?.west?.len ?? 0, cE = CT ? (CT.east?.len ?? 0) + (CT.terrace?.len ?? 0) : 0;
  const out = !!E.octaStar, X0 = out ? Math.min(...fp.map(q => q[0])) : -EX - pad - cW, X1 = out ? Math.max(...fp.map(q => q[0])) : EX + pad + cE, Z0 = out ? Math.min(...fp.map(q => q[1])) : -EZn - pad, Z1 = out ? Math.max(...fp.map(q => q[1])) : EZs + pad;
  const H = E.height ?? (E.octaStar ? E.octaStar.base ?? 7 : E.roof === 'star' && E.eaves ? E.eaves : roofY + (E.parapet ?? 1.5));
  // Blocco uffici addossato al lato sud (Berna): il terreno attorno, il piazzale e i dintorni partono dal suo fronte.
  const BK = E.block, Zs = Z1 + (BK ? BK.depth ?? 18 : 0);
  const occupied = [[X0 - 14, X1 + 14, Z0 - 14, Zs + 14]];
  const occupy = (x0, x1, z0, z1) => occupied.push([Math.min(x0, x1), Math.max(x0, x1), Math.min(z0, z1), Math.max(z0, z1)]);
  const lamps = [], windows = [], pools = [], extraTrees = [], extraMovers = [];
  const lampAt = (x, z, hgt = 8, c = '#ffd59a') => { lamps.push({ x, y: hgt, z, c, s: 2.6 }); pools.push([x, z]); };
  const buildingWindows = (x, z, w, d, h, ry = 0, chance = 0.35) => {
    const cos = Math.cos(ry), sin = Math.sin(ry);
    for (let fy = 1.8; fy < h - 1; fy += 3.2) for (const [fw, nx, nz] of [[w, 0, 1], [w, 0, -1], [d, 1, 0], [d, -1, 0]]) for (let u = -fw / 2 + 2; u < fw / 2 - 1; u += 3.6) {
      if (rand() > chance) continue;
      const lx = nx ? nx * (w / 2 + 0.3) : u, lz = nz ? nz * (d / 2 + 0.3) : u;
      windows.push({ x: x + lx * cos + lz * sin, y: fy, z: z - lx * sin + lz * cos, c: rand() < 0.72 ? '#ffcf8a' : '#d9e6ff', s: 1.1 });
    }
  };

  // Cielo: cupola con sfumatura dall'orizzonte allo zenit e stelle (regolati dalla vista).
  const skyU = { uTop: { value: color('#8fb4d6') }, uHorizon: { value: color('#dfe9f0') }, uStars: { value: 0 } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uTop, uHorizon; varying vec3 vDir; void main() { float h = clamp(vDir.y, 0.0, 1.0); gl_FragColor = vec4(mix(uHorizon, uTop, pow(h, 0.5)), 1.0); \n#include <colorspace_fragment>\n }',
  }));
  sky.renderOrder = -10; group.add(sky);
  const stars = []; for (let i = 0; i < 900; i++) { const a = rand() * Math.PI * 2, e = Math.asin(0.08 + rand() * 0.92); stars.push({ x: Math.cos(a) * Math.cos(e) * 2800, y: Math.sin(e) * 2800, z: Math.sin(a) * Math.cos(e) * 2800, c: rand() < 0.8 ? '#ffffff' : '#cfe0ff', s: 8 + rand() * 14 }); }
  const starPts = glowPoints(stars, skyU.uStars, time); starPts.material.fog = false; group.add(starPts);

  // Terreno e piazzale.
  const groundC = GROUND[E.ground] || GROUND.grass, snow = E.ground === 'snow';
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshLambertMaterial({ color: E.meadows ? '#76924f' : groundC }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.06; group.add(ground);
  const plaza = (cx, cz, lx, lz, c = '#b8b5ad') => { const m = new THREE.Mesh(new THREE.PlaneGeometry(lx, lz), new THREE.MeshLambertMaterial({ color: c })); m.rotation.x = -Math.PI / 2; m.position.set(cx, 0.01, cz); group.add(m); return m; };
  plaza((X0 + X1) / 2, (Z0 + Zs) / 2, X1 - X0 + 28, Zs - Z0 + 28, snow ? '#cdd3d9' : '#b8b5ad');
  for (let x = X0 - 12; x <= X1 + 12; x += 18) { lampAt(x, Z0 - 12, 7); lampAt(x, Zs + 12, 7); }
  for (let z = Z0 + 6; z <= Zs - 6; z += 18) { lampAt(X0 - 12, z, 7); lampAt(X1 + 12, z, 7); }

  // Facciata (e fascia superiore sporgente, se c'è).
  const fac = facadeTextures(E), uScale = E.uScale ?? 18;
  const facMat = nightMat(new THREE.MeshLambertMaterial({ map: fac.day, emissiveMap: fac.night, emissive: color('#ffffff'), emissiveIntensity: 0, side: THREE.DoubleSide }), E.nightPower ?? 1.1);
  let facade;
  if (E.podium) {
    // Basamento in cemento più largo (cortile e passaggi tutt'attorno, scale davanti), piano vetrato arretrato,
    // poi la scatola dell'arena che sporge sopra il vetro (Gottardo).
    const P = E.podium, ph = P.h ?? 3.5, rh = E.recess?.h ?? 4, rin = E.recess?.in ?? 2.5, base = grow(fp, P.out ?? 7), conc = color(P.color || '#bdbcb7');
    const B = new Mesher();
    // Basamento con rientranze: le scalinate entrano nel cemento e salgono fino al cortile.
    const n = 14, run = 0.45, depth = n * run, bx0 = base[0][0], bx1 = base[1][0], bz0 = base[0][1], bz1 = base[2][1];
    const notches = [[-5, 5, bz0, bz0 + depth, 'z', 1], [-5, 5, bz1 - depth, bz1, 'z', -1], [bx0, bx0 + depth, -4, 4, 'x', 1], [bx1 - depth, bx1, -4, 4, 'x', -1]];
    const inNotch = (x, z) => notches.some(([x0, x1, z0, z1]) => x > x0 && x < x1 && z > z0 && z < z1);
    const topC = color(P.top || '#9fa09c'), wallC = conc.clone().multiplyScalar(0.9);
    for (let x = bx0; x < bx1 - 1e-3; x += 1) for (let z = bz0; z < bz1 - 1e-3; z += 1) {
      const x2 = Math.min(bx1, x + 1), z2 = Math.min(bz1, z + 1);
      if (!inNotch((x + x2) / 2, (z + z2) / 2)) B.quad([x, ph, z], [x2, ph, z], [x2, ph, z2], [x, ph, z2], topC);
    }
    const wallRun = (a0, a1, fixed, along) => { for (let u = a0; u < a1 - 1e-3; u += 1) { const u2 = Math.min(a1, u + 1), m = (u + u2) / 2; if (along === 'x' ? inNotch(m, fixed + (fixed === bz0 ? 0.01 : -0.01)) : inNotch(fixed + (fixed === bx0 ? 0.01 : -0.01), m)) continue; if (along === 'x') B.quad([u, 0, fixed], [u2, 0, fixed], [u2, ph, fixed], [u, ph, fixed], wallC); else B.quad([fixed, 0, u], [fixed, 0, u2], [fixed, ph, u2], [fixed, ph, u], wallC); } };
    wallRun(bx0, bx1, bz0, 'x'); wallRun(bx0, bx1, bz1, 'x'); wallRun(bz0, bz1, bx0, 'z'); wallRun(bz0, bz1, bx1, 'z');
    for (const [x0, x1, z0, z1, axis, dir] of notches) {
      if (axis === 'z') {
        const zs = dir > 0 ? z0 : z1;
        for (let k = 0; k < n; k++) { const h = ph * (k + 1) / n, zc = zs + dir * (k * run + run / 2); B.box((x0 + x1) / 2, h / 2, zc, x1 - x0, h, run + 0.02, conc); }
        for (const x of [x0, x1]) B.quad([x, 0, z0], [x, 0, z1], [x, ph, z1], [x, ph, z0], wallC);
        const ze = dir > 0 ? z1 : z0; B.quad([x0, 0, ze], [x1, 0, ze], [x1, ph, ze], [x0, ph, ze], wallC);
      } else {
        const xs = dir > 0 ? x0 : x1;
        for (let k = 0; k < n; k++) { const h = ph * (k + 1) / n, xc = xs + dir * (k * run + run / 2); B.box(xc, h / 2, (z0 + z1) / 2, run + 0.02, h, z1 - z0, conc); }
        for (const z of [z0, z1]) B.quad([x0, 0, z], [x1, 0, z], [x1, ph, z], [x0, ph, z], wallC);
        const xe = dir > 0 ? x1 : x0; B.quad([xe, 0, z0], [xe, 0, z1], [xe, ph, z1], [xe, ph, z0], wallC);
      }
    }
    const rail = color('#9aa0a6'); base.forEach((a, i) => { const b = base[(i + 1) % base.length]; B.beam([a[0], ph + 1, a[1]], [b[0], ph + 1, b[1]], 0.06, rail); });
    group.add(B.mesh());
    const inner = grow(fp, -rin), glassG = stripGeometry(inner, ph, ph + rh, { closed: true, uScale }), gu = glassG.attributes.uv;
    for (let i = 0; i < gu.count; i++) gu.setY(i, 0.04 + gu.getY(i) * 0.4);
    group.add(new THREE.Mesh(glassG, facMat));
    const band = stripGeometry(fp, ph + rh, H, { closed: true, uScale }), bu = band.attributes.uv;
    for (let i = 0; i < bu.count; i++) bu.setY(i, 0.5 + bu.getY(i) * 0.5);
    facade = new THREE.Mesh(band, facMat); group.add(facade);
    const S = new Mesher(), soff = color('#2a2c30'); fp.forEach((a, i) => { const b = fp[(i + 1) % fp.length], c2 = inner[(i + 1) % inner.length], d = inner[i]; S.quad([a[0], ph + rh, a[1]], [b[0], ph + rh, b[1]], [c2[0], ph + rh, c2[1]], [d[0], ph + rh, d[1]], soff); });
    group.add(S.mesh());
    // Di sera: luce blu lungo i fianchi, sotto lo sbalzo e sul bordo del cortile.
    if (E.sideGlow) {
      const blue = nightMat(new THREE.MeshBasicMaterial({ color: E.sideGlow, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }), 0.95, 'opacity');
      group.add(new THREE.Mesh(stripGeometry(grow(fp, 0.05), ph + rh - 0.5, ph + rh - 0.1, { closed: true }), blue));
      const pts = []; base.forEach((a, i) => { const b = base[(i + 1) % base.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let u = 0; u < L; u += 4) { const t = u / L; pts.push({ x: a[0] + (b[0] - a[0]) * t, y: ph + 0.3, z: a[1] + (b[1] - a[1]) * t, c: E.sideGlow, s: 1.8 }); } });
      fp.forEach((a, i) => { const b = fp[(i + 1) % fp.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let u = 0; u < L; u += 3) { const t = u / L; pts.push({ x: a[0] + (b[0] - a[0]) * t, y: ph + rh + 0.4, z: a[1] + (b[1] - a[1]) * t, c: E.sideGlow, s: 2.4 }); } });
      group.add(glowPoints(pts, glow, time));
    }
    // Piccole luci di cortesia sul basamento: paletti lungo il cortile e segnapasso sulle scalinate.
    { const warmPts = [], bol = new Mesher(), k = color('#4b4f55'), ring = grow(fp, (P.out ?? 7) * 0.55);
      ring.forEach((a2, i) => { const b2 = ring[(i + 1) % ring.length], L = Math.hypot(b2[0] - a2[0], b2[1] - a2[1]); for (let u = 2; u < L; u += 6) { const t = u / L, x = a2[0] + (b2[0] - a2[0]) * t, z = a2[1] + (b2[1] - a2[1]) * t; bol.box(x, ph + 0.45, z, 0.2, 0.9, 0.2, k); warmPts.push({ x, y: ph + 0.95, z, c: '#ffd9a0', s: 1.1 }); } });
      for (const [x0, x1, z0, z1] of notches) for (const [x, z] of [[x0 + 0.3, z0], [x1 - 0.3, z0], [x0 + 0.3, z1], [x1 - 0.3, z1], [x0, z0 + 0.3], [x0, z1 - 0.3], [x1, z0 + 0.3], [x1, z1 - 0.3]]) warmPts.push({ x, y: ph * 0.5, z, c: '#ffe2b5', s: 0.9 });
      group.add(bol.mesh()); group.add(glowPoints(warmPts, glow, time)); }
  } else if (E.folded) facade = foldedHall();
  else if (E.stack) facade = stackedArena();
  else if (E.octaStar) facade = octaHall();
  else if (CT) facade = curtainHall();
  else { facade = new THREE.Mesh(stripGeometry(fp, 0, H, { closed: true, uScale }), facMat); group.add(facade); }

  // Davos: base ottagonale vetrata (di sera dorata) con una gronda bianca tutt'attorno; sopra, arretrata, la sala coperta
  // da un tetto a falde incrociate morbido (colmi e compluvi arrotondati, falde leggermente bombate). Lungo tutto il bordo
  // del tetto una parete vetrata sale fino alla falda: sui quattro lati dritti diventa il grande timpano a punta.
  function octaSpec() {
    const R = octaRoof(A, EX, EZn, EZs), { U } = R;
    // Perimetro fitto della sala (un punto ogni ~2,5 m), per seguire le punte dei timpani.
    const perim = []; U.forEach((a, i) => { const b = U[(i + 1) % U.length], n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2.5)); for (let j = 0; j < n; j++) perim.push([a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n]); });
    return { ...R, O: E.octaStar, perim };
  }
  function octaHall() {
    const S = octaSpec(), { O, Hb, U, h, perim } = S, glow = E.glow || '#ffc879';
    const glassMat = () => nightMat(new THREE.MeshLambertMaterial({ map: glazingTexture(), emissiveMap: glazingNightTexture(glow), emissive: color('#ffffff'), emissiveIntensity: 0.05, side: THREE.DoubleSide }), 1, 'emissiveIntensity', 0.05);
    // Base vetrata ottagonale.
    const base = new THREE.Mesh(stripGeometry(fp, 0, Hb - 0.5, { closed: true, uScale: 4 }), glassMat()); group.add(base);
    // Gronda: soletta bianca che sporge, con il frontalino scuro e il soffitto sotto.
    const L = grow(fp, O.ledge ?? 2.2), G = new Mesher(), white = color(E.roofColor || '#eef2f5'), fascia = color(E.eaveColor || '#3a2c22');
    L.forEach((a, i) => { const b = L[(i + 1) % L.length], c2 = U[(i + 1) % U.length], d2 = U[i], f0 = fp[i], f1 = fp[(i + 1) % fp.length];
      G.quad([a[0], Hb + 0.05, a[1]], [b[0], Hb + 0.05, b[1]], [c2[0], Hb + 0.05, c2[1]], [d2[0], Hb + 0.05, d2[1]], white);
      G.quad([a[0], Hb - 0.5, a[1]], [b[0], Hb - 0.5, b[1]], [f1[0], Hb - 0.5, f1[1]], [f0[0], Hb - 0.5, f0[1]], color('#2a2420'));
      G.quad([a[0], Hb - 0.5, a[1]], [b[0], Hb - 0.5, b[1]], [b[0], Hb + 0.05, b[1]], [a[0], Hb + 0.05, a[1]], fascia); });
    group.add(G.mesh());
    // Parete vetrata sotto le falde, su tutto il perimetro della sala (i timpani).
    const wg = stripGeometry(perim, Hb, p => h(p[0], p[1]) - 0.05, { closed: true, uScale: 4 }), wp = wg.attributes.position, wu = wg.attributes.uv;
    for (let i = 0; i < wp.count; i++) wu.setY(i, (wp.getY(i) - Hb) / 6); // traversi orizzontali dritti, uno ogni 6 m, anche sotto le punte
    const wall = new THREE.Mesh(wg, glassMat()); group.add(wall);
    for (const [x, z] of perim.filter((_, i) => i % 3 === 0)) windows.push({ x: x + Math.sign(x - S.cx) * 0.3, y: Hb * 0.5, z: z + Math.sign(z - S.cz) * 0.3, c: '#ffd59a', s: 1.4 });
    occupy(X0 - 3, X1 + 3, Z0 - 3, Z1 + 3);
    return base;
  }

  // Friburgo: tre livelli con stacchi netti.
  //  - base: fascia di pannelli sfaccettati che sporge di `base.out` (su tre lati; sul fronte sud c'è la vetrata degli ingressi)
  //    con sopra una terrazza e il parapetto in vetro;
  //  - piano arretrato: rivestimento grigio con una fascia vetrata continua (ambra di sera);
  //  - scatola alta: pannelli sfaccettati a sbalzo di `top.out` su tutti i lati, con il soffitto scuro sotto.
  // Davanti, sul fronte sud, la lunga tettoia su pilastri sottili e la torre cilindrica all'angolo.
  function stackedArena() {
    const T = E.stack, L1 = T.base?.h ?? 8, H2 = T.top?.from ?? H * 0.52, bo = T.base?.out ?? 3.5, to = T.top?.out ?? 7, ft = facetTextures();
    const facetMat = nightMat(new THREE.MeshLambertMaterial({ map: ft.day, emissiveMap: ft.night, emissive: color('#ffffff'), emissiveIntensity: 0, flatShading: true, side: THREE.DoubleSide }), 1.15);
    const M2 = new Mesher(), soffit = color('#2b2d31'), grey = color(T.mid?.color || '#a7acb1');
    // Pannelli sfaccettati lungo una polilinea (normale verso l'esterno): ogni riquadro è una piramide bassa
    // con la punta che sale e scende di riquadro in riquadro, così la luce disegna le diagonali come nelle foto.
    const facets = (pts, y0, y1, depth, pitch = 3.3, closed = false) => {
      const pos = [], uv = [], P = closed ? [...pts, pts[0]] : pts; let col = 0;
      for (let e = 0; e < P.length - 1; e++) {
        const a = P[e], b = P[e + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / pitch));
        let nx = (b[1] - a[1]) / L, nz = -(b[0] - a[0]) / L; const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
        if (nx * mx + nz * mz < 0) { nx = -nx; nz = -nz; }
        for (let k = 0; k < n; k++, col++) {
          const p0 = [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], p1 = [a[0] + (b[0] - a[0]) * (k + 1) / n, a[1] + (b[1] - a[1]) * (k + 1) / n];
          const f = 0.18 + 0.64 * ((col % 7) / 6), ay = y0 + (y1 - y0) * f, ax = (p0[0] + p1[0]) / 2 + nx * depth, az = (p0[1] + p1[1]) / 2 + nz * depth;
          const V = { a0: [p0[0], y0, p0[1], 0, 0], b0: [p1[0], y0, p1[1], 1, 0], b1: [p1[0], y1, p1[1], 1, 1], a1: [p0[0], y1, p0[1], 0, 1], ap: [ax, ay, az, 0.5, f] };
          for (const [x1, x2, x3] of [[V.a0, V.b0, V.ap], [V.b0, V.b1, V.ap], [V.b1, V.a1, V.ap], [V.a1, V.a0, V.ap]]) for (const q of [x1, x2, x3]) { pos.push(q[0], q[1], q[2]); uv.push(q[3], q[4]); }
        }
      }
      const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g2.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g2.computeVertexNormals();
      const m = new THREE.Mesh(g2, facetMat); group.add(m); return m;
    };
    const ring = (poly, e) => poly.map(([x, z]) => [x + Math.sign(x - (X0 + X1) / 2) * e, z + Math.sign(z - (Z0 + Z1) / 2) * e]);
    const up = ring(fp, to), lo = ring(fp, bo), fx0 = X0 + (T.front?.from ?? 22), fx1 = X1 - (T.front?.to ?? 6);
    // 1. Scatola alta a sbalzo.
    const upper = facets(up, H2, H, 0.55, 3.3, true);
    // Filo chiaro sotto lo sbalzo: lo stacco tra la scatola alta e il piano arretrato si legge anche da lontano.
    group.add(new THREE.Mesh(stripGeometry(up, H2 - 0.5, H2, { closed: true }), new THREE.MeshLambertMaterial({ color: '#e9ebed', side: THREE.DoubleSide })));
    up.forEach((a, i) => { const b = up[(i + 1) % 4], c2 = fp[(i + 1) % 4], d2 = fp[i]; M2.quad([a[0], H2, a[1]], [b[0], H2, b[1]], [c2[0], H2, c2[1]], [d2[0], H2, d2[1]], soffit); });
    for (let i = 0; i < 4; i++) { const a = up[i], b = up[(i + 1) % 4]; for (let u = 0.05; u < 1; u += 0.08) lamps.push({ x: a[0] + (b[0] - a[0]) * u, y: H2 - 0.3, z: a[1] + (b[1] - a[1]) * u, c: '#ffe2b5', s: 1.2 }); }
    // 2. Piano arretrato grigio con la fascia vetrata.
    const midG = stripGeometry(fp, L1, H2, { closed: true, uScale: 6 }); group.add(new THREE.Mesh(midG, new THREE.MeshLambertMaterial({ color: grey, side: THREE.DoubleSide })));
    const gy0 = L1 + (H2 - L1) * 0.42, gy1 = L1 + (H2 - L1) * 0.72;
    group.add(new THREE.Mesh(stripGeometry(ring(fp, 0.08), gy0, gy1, { closed: true, uScale: 6 }), nightMat(new THREE.MeshLambertMaterial({ map: glazingTexture(), emissiveMap: glazingNightTexture(E.line || '#ffb04a'), emissive: color('#ffffff'), emissiveIntensity: 0.03, side: THREE.DoubleSide }), 1, 'emissiveIntensity', 0.03)));
    // 3. Base sfaccettata su ovest, nord, est (e un tratto del fronte), con terrazza e parapetto in vetro.
    const basePath = [[fx0, lo[3][1]], lo[3], lo[0], lo[1], lo[2], [fx1, lo[2][1]]];
    facets(basePath, 0, L1, 0.45, 3.3);
    const terr = color('#c9c8c3'), glassR = new THREE.MeshLambertMaterial({ color: '#cfe0ea', transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    const inner = [[fx0, Z1], fp[3], fp[0], fp[1], fp[2], [fx1, Z1]];
    for (let i = 0; i < basePath.length - 1; i++) { const a = basePath[i], b = basePath[i + 1], c2 = inner[i + 1], d2 = inner[i]; M2.quad([a[0], L1, a[1]], [b[0], L1, b[1]], [c2[0], L1, c2[1]], [d2[0], L1, d2[1]], terr); }
    M2.quad([fx0, 0, lo[3][1]], [fx0, 0, Z1], [fx0, L1, Z1], [fx0, L1, lo[3][1]], terr); M2.quad([fx1, 0, lo[2][1]], [fx1, 0, Z1], [fx1, L1, Z1], [fx1, L1, lo[2][1]], terr);
    group.add(new THREE.Mesh(stripGeometry(basePath, L1, L1 + 1.1, { uScale: 4 }), glassR));
    // 4. Fronte sud: piano terra vetrato con la fascia nera delle scritte, tettoia lunga su pilastri sottili.
    const gl = nightMat(new THREE.MeshLambertMaterial({ map: glazingTexture(), emissiveMap: glazingNightTexture('#ff9a4a'), emissive: color('#ffffff'), emissiveIntensity: 0.08, side: THREE.DoubleSide }), 0.95, 'emissiveIntensity', 0.08);
    group.add(new THREE.Mesh(stripGeometry([[fx0, Z1], [fx1, Z1]], 0, L1, { uScale: 5 }), gl));
    const band = new THREE.Mesh(new THREE.PlaneGeometry(fx1 - fx0, 1.1), new THREE.MeshBasicMaterial({ map: entranceSignTexture(T.labels || ['VIP', 'Fanshop', 'Tickets', 'Café']) }));
    band.position.set((fx0 + fx1) / 2, 3.9, Z1 + 0.25); group.add(band);
    const C = T.canopy || {}, cy = C.h ?? 6.6, cd = C.depth ?? 11, cz = Z1 + cd, steel = color('#d6d9dc'), under = color('#5a5e64');
    M2.box((fx0 + fx1) / 2, cy, Z1 + cd / 2, fx1 - fx0, 0.35, cd, steel);
    for (let x = fx0 + 0.4; x <= fx1 - 0.4; x += 1.6) M2.box(x, cy - 0.28, Z1 + cd / 2, 0.12, 0.2, cd - 0.4, under);
    for (let x = fx0 + 2; x <= fx1 - 1; x += 8) { M2.box(x, cy / 2, cz - 0.6, 0.32, cy, 0.32, steel); lamps.push({ x, y: cy - 0.5, z: Z1 + cd / 2, c: '#fff1d6', s: 1.8 }); pools.push([x, Z1 + cd / 2]); }
    // 5. Torre cilindrica in cemento chiaro all'angolo sud-ovest, sotto lo sbalzo.
    const D = T.drum || {}, dr = D.r ?? 6.5, drum = new THREE.Mesh(new THREE.CylinderGeometry(dr, dr, H2, 36), new THREE.MeshLambertMaterial({ color: D.color || '#ddd6c6' }));
    drum.position.set(X0 + (D.x ?? 10), H2 / 2, Z1 + (D.z ?? 1)); group.add(drum);
    group.add(M2.mesh());
    occupy(X0 - to, X1 + to, Z0 - to, cz + 2);
    return upper;
  }

  // Zurigo (Swiss Life Arena): complesso lungo a più livelli, rivestito da un "sipario" di pieghe verticali chiare
  // (geometria vera, non texture) con il bordo inferiore ad archi; sotto gli archi il piano terra vetrato arretra dietro
  // una fila di colonne (una colonna in ogni punto basso del bordo). Volumi, da ovest a est:
  //  - west: sala d'allenamento, più bassa (di sera bianca, testata ovest blu);
  //  - main: sala dell'arena, il livello più alto (di sera rossa), con sopra il livello arretrato `top` a fasce blu,
  //    bianca e rossa e l'insegna; sul fronte sud la pensilina scura degli ingressi;
  //  - east: corpo degli oblò (file di finestre rotonde sopra la fascia a pieghe blu);
  //  - terrace: corpo basso più stretto con la terrazza sul tetto (pavimento a cerchi, tende blu, chioschi, alberi),
  //    e gente che passeggia.
  // Ogni volume disegna solo le facce libere (`open` = lati addossati a un altro volume).
  function curtainHall() {
    const C = CT, base = C.base ?? 5, amp = C.amp ?? 2.6, arch = C.arch ?? 9, pitch = C.pitch ?? 2.4, depth = C.depth ?? 0.7, rec = C.recess ?? 3;
    const mx0 = -EX - pad, mx1 = EX + pad, z0 = -EZn - pad, z1 = EZs + pad, Hm = C.main?.h ?? H, hemTop = base + amp;
    const M2 = new Mesher(), colC = color('#62666c'), soffit = color('#2a2c30');
    // Pieghe: gradiente orizzontale per ogni piega (cresta chiara, solco scuro) anche nella luce della sera.
    const [pc, pg] = canvas(64, 8), pgr = pg.createLinearGradient(0, 0, 64, 0);
    pgr.addColorStop(0, '#000'); pgr.addColorStop(0.5, '#fff'); pgr.addColorStop(1, '#000'); pg.fillStyle = pgr; pg.fillRect(0, 0, 64, 8);
    const pleatTex = texture(pc, true);
    const curtainMat = night => nightMat(new THREE.MeshLambertMaterial({ color: C.color || '#eceeee', emissive: color(night), emissiveMap: pleatTex, emissiveIntensity: 0, side: THREE.DoubleSide }), C.nightPower ?? 1.25);
    const faceOf = (B, side) => side === 'north' ? [[B.x0, B.z0], [B.x1, B.z0]] : side === 'east' ? [[B.x1, B.z0], [B.x1, B.z1]] : side === 'south' ? [[B.x1, B.z1], [B.x0, B.z1]] : [[B.x0, B.z1], [B.x0, B.z0]];
    const normalOf = side => side === 'north' ? [0, -1] : side === 'east' ? [1, 0] : side === 'south' ? [0, 1] : [-1, 0];
    const hemAt = ta => base + amp * Math.pow(Math.sin(Math.PI * ta), 0.55);
    // Sipario su una faccia: da y0 (o dal bordo ad archi) fino a y1; colonne sotto i punti bassi del bordo.
    const sipario = (B, side, y1, night, { y0 = null, columns = true, from = null, to = null } = {}) => {
      let [a, b] = faceOf(B, side); const [nx, nz] = normalOf(side), F = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (from != null || to != null) { const u0 = (from ?? 0) / F, u1 = (to ?? F) / F, a0 = a; a = [a0[0] + (b[0] - a0[0]) * u0, a0[1] + (b[1] - a0[1]) * u0]; b = [a0[0] + (b[0] - a0[0]) * u1, a0[1] + (b[1] - a0[1]) * u1]; }
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / pitch)), na = Math.max(1, Math.round(L / arch)), S = n * 6;
      const pos = [], uv = [], idx = [];
      for (let i = 0; i <= S; i++) {
        const t = i / S, f = (t * n) % 1, off = depth * 0.5 * (1 - Math.cos(2 * Math.PI * f)), ta = (t * na) % 1;
        const x = a[0] + (b[0] - a[0]) * t + nx * off, z = a[1] + (b[1] - a[1]) * t + nz * off, yb = y0 ?? hemAt(ta);
        pos.push(x, yb, z, x, y1, z); uv.push(t * n, 0, t * n, 1);
        if (i) { const k = i * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
      }
      const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g2.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g2.setIndex(idx); g2.computeVertexNormals();
      const m = new THREE.Mesh(g2, curtainMat(night)); group.add(m);
      if (y0 == null && columns) for (let k = 0; k <= na; k++) { const t = k / na, x = a[0] + (b[0] - a[0]) * t - nx * 0.5, z = a[1] + (b[1] - a[1]) * t - nz * 0.5; M2.box(x, base / 2, z, 0.75, base, 0.75, colC); }
      return m;
    };
    // Piano terra: vetrata arretrata di `rec` su tutto il volume (calda di sera), soffitto scuro sotto il sipario.
    const glassMat = nightMat(new THREE.MeshLambertMaterial({ map: glazingTexture(), emissiveMap: glazingNightTexture('#ffcf8a'), emissive: color('#ffffff'), emissiveIntensity: 0.06, side: THREE.DoubleSide }), 0.55, 'emissiveIntensity', 0.06);
    const groundFloor = B => {
      const r = [[B.x0 + rec, B.z0 + rec], [B.x1 - rec, B.z0 + rec], [B.x1 - rec, B.z1 - rec], [B.x0 + rec, B.z1 - rec]], o = [[B.x0, B.z0], [B.x1, B.z0], [B.x1, B.z1], [B.x0, B.z1]];
      const g2 = stripGeometry(r, 0, hemTop, { closed: true, uScale: 4 }), gu = g2.attributes.uv; for (let i = 0; i < gu.count; i++) gu.setY(i, gu.getY(i) * hemTop / 5.3);
      group.add(new THREE.Mesh(g2, glassMat));
      o.forEach((p, i) => { const q = o[(i + 1) % 4], q2 = r[(i + 1) % 4], p2 = r[i]; M2.quad([p[0], hemTop, p[1]], [q[0], hemTop, q[1]], [q2[0], hemTop, q2[1]], [p2[0], hemTop, p2[1]], soffit); });
      for (const side of ['north', 'east', 'south', 'west']) { if ((B.open || []).includes(side)) continue; const [a, b] = faceOf(B, side), [nx, nz] = normalOf(side), L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let u = 6; u < L - 3; u += 12) { const t = u / L; windows.push({ x: a[0] + (b[0] - a[0]) * t + nx * (0.2 - rec), y: 2, z: a[1] + (b[1] - a[1]) * t + nz * (0.2 - rec), c: '#ffd9a0', s: 1.6 }); } }
    };
    const sides = B => ['north', 'east', 'south', 'west'].filter(sd => !(B.open || []).includes(sd));
    const vols = {};
    // 1. Sala dell'arena (rossa) e sala d'allenamento (bassa, bianca con la testata blu).
    const VM = vols.main = { x0: mx0, x1: mx1, z0, z1, h: Hm };
    let facadeMesh = null;
    for (const sd of sides(VM)) { const m = sipario(VM, sd, Hm, C.main?.night || '#e8202a'); if (sd === 'south') facadeMesh = m; }
    groundFloor(VM);
    if (C.west) {
      const W = C.west, VW = vols.west = { x0: mx0 - W.len, x1: mx0, z0: z0 + (W.inset ?? 0), z1: z1 - (W.inset ?? 0), h: W.h ?? Hm - 8, open: ['east'] };
      for (const sd of sides(VW)) sipario(VW, sd, VW.h, sd === 'west' ? W.endNight || '#1d4fd8' : W.night || '#ffffff');
      groundFloor(VW);
    }
    // 2. Corpo degli oblò: fascia a pieghe blu sopra il piano terra, poi il muro chiaro con le file di finestre rotonde.
    const [oc, og] = canvas(512, 256), [on, onn] = canvas(512, 256), rows = C.east?.rows ?? 4;
    og.fillStyle = '#e3e4e2'; og.fillRect(0, 0, 512, 256); onn.fillStyle = '#000'; onn.fillRect(0, 0, 512, 256);
    onn.fillStyle = 'rgba(255,70,120,.28)'; onn.fillRect(0, 0, 512, 256);
    for (let r = 0; r < rows; r++) for (let k = 0; k < 8; k++) {
      const x = 32 + k * 64 + (r % 2) * 32, y = 256 * (r + 0.5) / rows, rad = 256 / rows * 0.32;
      for (const x2 of [x, x - 512]) {
        og.fillStyle = '#b9bcbd'; og.beginPath(); og.arc(x2, y, rad + 3, 0, Math.PI * 2); og.fill(); og.fillStyle = '#34414c'; og.beginPath(); og.arc(x2, y, rad, 0, Math.PI * 2); og.fill();
        og.fillStyle = 'rgba(170,200,220,.35)'; og.beginPath(); og.arc(x2 - rad * 0.3, y - rad * 0.3, rad * 0.45, 0, Math.PI * 2); og.fill();
        onn.fillStyle = (r + k) % 3 ? 'rgba(255,214,160,.95)' : 'rgba(255,240,220,.6)'; onn.beginPath(); onn.arc(x2, y, rad, 0, Math.PI * 2); onn.fill();
      }
    }
    const obloMat = nightMat(new THREE.MeshLambertMaterial({ map: texture(oc, true), emissiveMap: texture(on, true), emissive: color('#ffffff'), emissiveIntensity: 0, side: THREE.DoubleSide }), 1);
    const obloWall = (B, side, y0, y1, from = 0, to = null) => { const [a, b] = faceOf(B, side), [nx, nz] = normalOf(side), e = 0.05, F = Math.hypot(b[0] - a[0], b[1] - a[1]), u0 = from / F, u1 = (to ?? F) / F, P = t => [a[0] + (b[0] - a[0]) * t + nx * e, a[1] + (b[1] - a[1]) * t + nz * e]; group.add(new THREE.Mesh(stripGeometry([P(u0), P(u1)], y0, y1, { uScale: (y1 - y0) * 2 }), obloMat)); };
    const T = C.terrace;
    if (C.east) {
      // Le pieghe coprono tutti i lati (bianche di giorno, blu di sera); il muro degli oblò c'è solo sulla faccia verso la
      // terrazza (`obloSides`), tra due strisce di pieghe alle estremità e sopra la fascia che arriva alla quota della terrazza.
      const O = C.east, VO = vols.east = { x0: mx1, x1: mx1 + O.len, z0: z0 + (O.inset ?? 0), z1: z1 - (O.inset ?? 0), h: O.h ?? 22, open: ['west'] }, ends = O.ends ?? 6, blue = O.night || '#1d4fd8';
      for (const sd of ['north', 'south', 'east']) {
        if (!(O.obloSides || ['east']).includes(sd)) { sipario(VO, sd, VO.h, blue); continue; }
        const F = sd === 'east' ? VO.z1 - VO.z0 : VO.x1 - VO.x0, band = sd === 'east' && T ? Math.max(O.band ?? 10, T.h ?? 12) : O.band ?? 10;
        sipario(VO, sd, band, blue, { from: ends, to: F - ends }); obloWall(VO, sd, band, VO.h, ends, F - ends);
        sipario(VO, sd, VO.h, blue, { to: ends }); sipario(VO, sd, VO.h, blue, { from: F - ends });
      }
      groundFloor(VO);
    }
    if (T) {
      const VT = vols.terrace = { x0: mx1 + (C.east?.len ?? 0), x1: mx1 + (C.east?.len ?? 0) + T.len, z0: z0 + (T.inset ?? 8), z1: z1 - (T.insetS ?? T.inset ?? 8), h: T.h ?? 12, open: ['west'] };
      // Niente pieghe sotto il giardino della terrazza: vetrate a tutta altezza (calde di sera) e un bordo chiaro in cemento.
      const R = [[VT.x0, VT.z0], [VT.x1, VT.z0], [VT.x1, VT.z1], [VT.x0, VT.z1]]; // nord, est, sud (ovest addossato)
      const g2 = stripGeometry(R, 0, VT.h - 1.4, { uScale: 4 }), gu = g2.attributes.uv; for (let i = 0; i < gu.count; i++) gu.setY(i, gu.getY(i) * (VT.h - 1.4) / 5.3);
      group.add(new THREE.Mesh(g2, glassMat));
      group.add(new THREE.Mesh(stripGeometry(R, VT.h - 1.4, VT.h + 0.02, { uScale: 8 }), new THREE.MeshLambertMaterial({ color: '#dcdad4', side: THREE.DoubleSide })));
      for (let x = VT.x0 + 4; x < VT.x1; x += 8) for (const z of [VT.z0 + 0.3, VT.z1 - 0.3]) windows.push({ x, y: 3, z, c: '#ffd9a0', s: 1.5 });
    }
    // 3. Pensilina degli ingressi sul fronte sud della sala: lastra scura a sbalzo con le nervature e le luci sotto.
    { const P = C.canopy || {}, cy = P.h ?? 11, cd = P.depth ?? 8, ca = mx1 - (P.from ?? 62), cb = mx1 - (P.to ?? 14), dark = color('#2f3237'), rib = color('#4a4e55');
      M2.box((ca + cb) / 2, cy, z1 + cd / 2, cb - ca, 0.6, cd, dark);
      for (let x = ca + 1.5; x < cb; x += 3.2) { M2.box(x, cy - 0.45, z1 + cd / 2, 0.25, 0.3, cd - 0.3, rib); lamps.push({ x, y: cy - 0.7, z: z1 + cd * 0.65, c: '#fff4de', s: 1.5 }); }
      for (let x = ca + 3; x < cb; x += 12) pools.push([x, z1 + cd / 2]); }
    group.add(M2.mesh());
    // Luce di cortesia lungo il bordo ad archi (di sera i passaggi sotto le colonne restano visibili).
    for (const B of Object.values(vols).filter(B => B.y0 == null)) for (const sd of sides(B)) { const [a, b] = faceOf(B, sd), [nx, nz] = normalOf(sd), L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let u = arch / 2; u < L; u += arch) { const t = u / L; lamps.push({ x: a[0] + (b[0] - a[0]) * t + nx * 0.3, y: base + amp * 0.5, z: a[1] + (b[1] - a[1]) * t + nz * 0.3, c: '#ffe2b5', s: 1.1 }); } }
    if (C.top) { const TP = C.top, ins = TP.inset ?? 5; vols.top = { x0: VM.x0 + (VM.x1 - VM.x0) * (TP.from ?? 0.45), x1: VM.x1 - ins, z0: VM.z0 + ins, z1: VM.z1 - ins, y0: Hm, y1: Hm + (TP.h ?? 6) }; }
    curtainHall.vols = vols;
    for (const B of Object.values(vols).filter(B => B.y0 == null)) occupy(B.x0 - 2, B.x1 + 2, B.z0 - 2, B.z1 + 10);
    return facadeMesh;
  }

  // Quote della sala a pieghe. Con relative: true i profili sono altezze sopra il muro interno (wallY), così la sala
  // segue le tribune; la volta parte 1,5 m sopra il muro e sale almeno quanto l'arco interno più un metro.
  // topAt(x, z) dà la quota del tetto in ogni punto: sul perimetro è il profilo E.folded.top, dentro una superficie
  // che unisce i quattro bordi (patch di Coons) più un rigonfiamento basso lungo z (parabola alta `rise`), che copre l'arco
  // interno. Così la copertura non è una cupola staccata ma una forma unica che sale tra gli angoli.
  function foldedSpec() {
    const F = E.folded, rel = F.relative ? wallY : 0, arch = roofY - wallY;
    const prof = (list, s2) => { const L = [...list].sort((a, b) => a[0] - b[0]); if (s2 <= L[0][0]) return L[0][1]; for (let i = 1; i < L.length; i++) if (s2 <= L[i][0]) { const u = (s2 - L[i - 1][0]) / (L[i][0] - L[i - 1][0]); return L[i - 1][1] + (L[i][1] - L[i - 1][1]) * u; } return L.at(-1)[1]; };
    const top = F.top.map(([s2, h]) => [s2, h + rel]), fold = F.relative && F.fold ? F.fold.map(([s2, f]) => [s2, f * wallY]) : F.fold;
    const w = X1 - X0, d = Z1 - Z0, PER = 2 * (w + d), low = Math.min(...F.top.map(k => k[1])) + rel - wallY;
    // Colmo a falde dritte (1 - |u|), alto quanto basta perché ogni punto resti sopra l'arco interno (cerchio di freccia `arch`).
    let need = 0; for (let k = 0; k < 40; k++) { const u = k / 40; need = Math.max(need, (arch * Math.sqrt(1 - u * u) - low) / (1 - u)); }
    const rise = Math.max(F.rise ?? 0, need + 0.6);
    const edge = { n: x => prof(top, (x - X0) / PER), e: z => prof(top, (w + z - Z0) / PER), s: x => prof(top, (w + d + X1 - x) / PER), w: z => prof(top, Math.min(1, (2 * w + d + Z1 - z) / PER)) };
    const bump = z => { const u = (z - (Z0 + Z1) / 2) / (d / 2); return rise * Math.max(0, 1 - Math.abs(u)); };
    const topAt = (x, z) => {
      const u = Math.min(1, Math.max(0, (x - X0) / w)), v = Math.min(1, Math.max(0, (z - Z0) / d));
      const c00 = edge.n(X0), c10 = edge.n(X1), c01 = edge.s(X0), c11 = edge.s(X1);
      return (1 - v) * edge.n(x) + v * edge.s(x) + (1 - u) * edge.w(z) + u * edge.e(z) - ((1 - u) * (1 - v) * c00 + u * (1 - v) * c10 + (1 - u) * v * c01 + u * v * c11) + bump(z);
    };
    return { ...F, prof, top, fold, rise, topAt };
  }

  // Sala a pieghe (Berna). Lungo il perimetro (s da 0 a 1, dall'angolo nord-ovest verso est, poi sud, ovest) il bordo
  // superiore segue E.folded.top [[s, h]...]: sale, scende e risale. A metà altezza la facciata si piega in fuori
  // (E.folded.fold [[s, h]], out): le linee di piega inclinate disegnano le grandi facce del rivestimento.
  // Verso il blocco uffici il bordo inferiore delle testate si alza (lift) e sotto resta un ingresso vetrato arretrato.
  function foldedHall() {
    const F = foldedSpec(), C = fp, N4 = C.length, nrm = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    const lens = C.map((a, i) => Math.hypot(C[(i + 1) % N4][0] - a[0], C[(i + 1) % N4][1] - a[1])), per = [0];
    lens.forEach((l, i) => per.push(per[i] + l)); const PER = per[N4];
    const prof = F.prof;
    const outs = C.map((_, i) => BK && i === 2 ? 0 : F.out ?? 1.8), LF = F.lift || {}, liftLen = LF.len ?? 24, liftSide = { east: 1, west: 3 }[LF.side ?? 'east'], liftH = LF.h ?? BK?.ground ?? 6;
    // Bordo inferiore: dritto a terra, tranne sulla testata `lift.side` dove sale in diagonale fino all'angolo col blocco uffici.
    const bottom = (i, z) => !BK ? 0 : i === 2 ? blockH() - 0.3 : i === liftSide ? liftH * Math.min(1, Math.max(0, (z - (Z1 - liftLen)) / liftLen)) : 0;
    // Spostamento in fuori di un punto: dentro un lato la sua normale, negli angoli la somma delle due (giunto a 45°).
    const offset = (i, t) => { const j = t < 1e-6 ? (i + N4 - 1) % N4 : t > 1 - 1e-6 ? (i + 1) % N4 : -1, v = [nrm[i][0] * outs[i], nrm[i][1] * outs[i]]; if (j >= 0) { v[0] += nrm[j][0] * outs[j]; v[1] += nrm[j][1] * outs[j]; } return v; };
    const pos = [], uv = [], R = new Mesher(), recess = color('#2c3640'), soffit = color('#3a3d42'), topMax = Math.max(...F.top.map(k => k[1])) + F.rise;
    const keysAll = [...F.top, ...(F.fold || [])].map(k => k[0]);
    for (let i = 0; i < N4; i++) {
      const a = C[i], b = C[(i + 1) % N4], ts = new Set([0, 1]);
      for (let d = 4; d < lens[i]; d += 4) ts.add(d / lens[i]);
      for (const k of keysAll) { const t = (k * PER - per[i]) / lens[i]; if (t > 0 && t < 1) ts.add(t); }
      if (BK && i === liftSide) { const t = i === 1 ? (Z1 - liftLen - a[1]) / lens[i] : (a[1] - (Z1 - liftLen)) / lens[i]; if (t > 0 && t < 1) ts.add(t); }
      const smp = [...ts].sort((x, y) => x - y).map(t => {
        const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, s2 = (per[i] + t * lens[i]) / PER, o = offset(i, t);
        const yb = bottom(i, z), yt = F.topAt(x, z), yf = Math.min(yt - 1, Math.max(yb + 1, prof(F.fold || [[0, yt * 0.5], [1, yt * 0.5]], s2)));
        return { x, z, s: s2 * PER, o, yb, yf, yt, top: F.topOut ?? 0.25 };
      });
      for (let k = 0; k < smp.length - 1; k++) {
        const p = smp[k], q = smp[k + 1];
        const v = (m, y, w) => [m.x + m.o[0] * w, y, m.z + m.o[1] * w];
        const quad = (A1, B1, C1, D1) => { for (const V of [A1, B1, C1, A1, C1, D1]) { pos.push(V[0], V[1], V[2]); uv.push(V[3] / uScale, V[1] / topMax); } };
        const P0 = [...v(p, p.yb, 0), p.s], Q0 = [...v(q, q.yb, 0), q.s], P1 = [...v(p, p.yf, 1), p.s], Q1 = [...v(q, q.yf, 1), q.s], P2 = [...v(p, p.yt, p.top), p.s], Q2 = [...v(q, q.yt, q.top), q.s];
        quad(P0, Q0, Q1, P1); quad(P1, Q1, Q2, P2);
        // Sotto il bordo sollevato: vetrata arretrata di 1 m e soffitto inclinato.
        if (p.yb > 0.05 || q.yb > 0.05) {
          const n = nrm[i], ip = [p.x - n[0], p.z - n[1]], iq = [q.x - n[0], q.z - n[1]];
          R.quad([ip[0], 0, ip[1]], [iq[0], 0, iq[1]], [iq[0], q.yb, iq[1]], [ip[0], p.yb, ip[1]], recess);
          R.quad([p.x, p.yb, p.z], [q.x, q.yb, q.z], [iq[0], q.yb, iq[1]], [ip[0], p.yb, ip[1]], soffit);
          if (k % 2 === 0) windows.push({ x: ip[0] + n[0] * 0.3, y: Math.max(1.2, p.yb * 0.45), z: ip[1] + n[1] * 0.3, c: '#ffd9a6', s: 2 });
        }
      }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.computeVertexNormals();
    facMat.flatShading = true;
    const mesh = new THREE.Mesh(geo, facMat); group.add(mesh);
    if (!R.empty) group.add(R.mesh());
    if (BK) officeBlock();
    return mesh;
  }

  // Altezza del blocco uffici: un numero, oppure 'hall' = arriva al bordo della sala su quel lato (la copertura parte dal suo tetto).
  function blockH() { return BK.h === 'hall' ? foldedSpec().topAt(0, Z1) - 0.2 : BK.h ?? 22; }

  // Blocco uffici lungo il lato sud: piano terra vetrato arretrato, quattro piani a sbalzo sul piazzale, tetto verde.
  // Accanto alla testata est una scalinata larga sale dal piazzale all'ingresso rialzato sotto la sala.
  function officeBlock() {
    const g0 = BK.ground ?? 6, h = blockH(), over = BK.over ?? 5, zf = Zs, zg = Zs - over, M2 = new Mesher();
    const glass = nightMat(new THREE.MeshLambertMaterial({ map: glazingTexture(), emissiveMap: glazingNightTexture('#ffd9a8'), emissive: color('#ffffff'), emissiveIntensity: 0.04, side: THREE.DoubleSide }), 0.9, 'emissiveIntensity', 0.04);
    group.add(new THREE.Mesh(stripGeometry([[X0 + 1.5, Z1], [X0 + 1.5, zg], [X1 - 1.5, zg], [X1 - 1.5, Z1]], 0, g0, { uScale: 8 }), glass));
    const ot = officeTextures(A.team + 'office'); for (const t of [ot.day, ot.night]) { t.wrapT = THREE.RepeatWrapping; t.repeat.y = Math.max(1, Math.round((h - g0) / 4.2)) / 4; } const om = nightMat(new THREE.MeshLambertMaterial({ map: ot.day, emissiveMap: ot.night, emissive: color('#ffffff'), emissiveIntensity: 0, side: THREE.DoubleSide }), 1);
    // Tre facce esterne (la quarta tocca la sala): ovest, sud, est.
    group.add(new THREE.Mesh(stripGeometry([[X0, Z1], [X0, zf], [X1, zf], [X1, Z1]], g0, h, { uScale: 30 }), om));
    M2.quad([X0, g0, Z1], [X1, g0, Z1], [X1, g0, zf], [X0, g0, zf], color('#2a2c30'));
    M2.quad([X0, g0 - 0.6, zf], [X1, g0 - 0.6, zf], [X1, g0, zf], [X0, g0, zf], color('#cfd3d6'));
    const roofG = color('#7d8a5c'); M2.quad([X0, h, Z1], [X1, h, Z1], [X1, h, zf], [X0, h, zf], roofG);
    for (const [a, b] of [[[X0, Z1], [X0, zf]], [[X0, zf], [X1, zf]], [[X1, zf], [X1, Z1]]]) M2.quad([a[0], h, a[1]], [b[0], h, b[1]], [b[0], h + 0.8, b[1]], [a[0], h + 0.8, a[1]], color('#e3e6e8'));
    const r2 = seeded(A.team + 'hvac'); for (let i = 0; i < 9; i++) M2.box(X0 + 10 + r2() * (X1 - X0 - 20), h + 0.9, Z1 + 4 + r2() * (zf - Z1 - 8), 3 + r2() * 4, 1.8, 2 + r2() * 2, color(i % 3 ? '#c9ccd0' : '#9ea3a8'));
    // Scalinata accanto alla testata est: sale verso nord fino al ripiano sotto la sala sollevata.
    const sx0 = X1 + 0.6, sx1 = X1 + 9, top = g0 - 1.5, steps = 26, run = 0.62, zTop = Z1 - 3, conc = color('#c6c4bf');
    for (let k = 0; k < steps; k++) { const y = top * (k + 1) / steps, z = zTop + (steps - k) * run; M2.box((sx0 + sx1) / 2, y / 2, z - run / 2, sx1 - sx0, y, run + 0.02, conc); }
    M2.box((sx0 + sx1) / 2 - 3.5, top / 2, zTop - 6, sx1 - sx0 + 7, top, 12, conc);
    for (const x of [sx0 - 0.2, sx1 + 0.2]) M2.beam([x, 1.2, zTop + steps * run], [x, top + 1.2, zTop], 0.25, color('#e2e1dd'), 2.4);
    group.add(M2.mesh());
    for (let x = X0 + 6; x < X1; x += 8) windows.push({ x, y: g0 - 0.9, z: zf - 0.6, c: '#fff0d8', s: 1.4 });
    occupy(X0, sx1 + 1, Z1, zf);
  }

  if (E.overhang) {
    const out = grow(fp, E.overhang.out ?? 2.2), y0 = H * (E.overhang.from ?? 0.5), M = new Mesher(), soffit = color('#2a2c30');
    const band = stripGeometry(out, y0, H, { closed: true, uScale }), uv = band.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, (E.overhang.from ?? 0.5) + uv.getY(i) * (1 - (E.overhang.from ?? 0.5)));
    group.add(new THREE.Mesh(band, facMat));
    out.forEach((p, i) => { const q = out[(i + 1) % out.length], a = fp[i], b = fp[(i + 1) % fp.length]; M.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [q[0], y0, q[1]], [p[0], y0, p[1]], soffit); M.quad([a[0], H, a[1]], [b[0], H, b[1]], [q[0], H, q[1]], [p[0], H, p[1]], color(E.wall || '#888')); });
    group.add(M.mesh());
  }

  // Tetto.
  const roof = new THREE.Group(); group.add(roof);
  const kind = E.roof || 'flat', mat = E.roofMat || 'membrane';
  let top = H;
  const flatTop = (poly, y, material) => {
    const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z))), geo = new THREE.ShapeGeometry(shape), pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 9, pos.getY(i) / 9);
    geo.rotateX(-Math.PI / 2); const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: roofTexture(material, E.roofColor) })); m.position.y = y; roof.add(m); return m;
  };
  const parapet = (poly, y0, y1) => roof.add(new THREE.Mesh(stripGeometry(poly, y0, y1, { closed: true }), new THREE.MeshLambertMaterial({ color: color(E.wall || '#8d9096').multiplyScalar(0.85), side: THREE.DoubleSide })));
  if (E.octaStar) {
    // Tetto morbido sulla sala ottagonale: maglia ad anelli dal centro al bordo, quote da octaSpec().h.
    const S = octaSpec(), P = S.perim, NR = 22, pos = [], idx = [];
    for (let r = 0; r <= NR; r++) for (const [x, z] of P) { const u = r / NR, px = S.cx + (x - S.cx) * u, pz = S.cz + (z - S.cz) * u; pos.push(px, S.h(px, pz), pz); }
    const n = P.length; for (let r = 0; r < NR; r++) for (let i = 0; i < n; i++) { const a = r * n + i, b = r * n + (i + 1) % n, c2 = (r + 1) * n + (i + 1) % n, d2 = (r + 1) * n + i; idx.push(a, d2, b, b, d2, c2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    roof.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: E.roofColor || '#eef2f5', side: THREE.DoubleSide })));
    // Bordo scuro sottile lungo la falda, sopra la parete vetrata.
    roof.add(new THREE.Mesh(stripGeometry(P, p => S.h(p[0], p[1]) - 0.05, p => S.h(p[0], p[1]) + 0.45, { closed: true }), new THREE.MeshLambertMaterial({ color: E.eaveColor || '#3a2c22', side: THREE.DoubleSide })));
    top = S.Hb + S.rise;
  } else if (E.stack) {
    // Tetto piano della scatola alta (sporge come lei), con parapetto e qualche impianto.
    const to = E.stack.top?.out ?? 7, up = fp.map(([x, z]) => [x + Math.sign(x - (X0 + X1) / 2) * to, z + Math.sign(z - (Z0 + Z1) / 2) * to]);
    flatTop(up, H + 0.02, E.roofMat || 'metal'); parapet(up, H, H + 0.8);
    const RM = new Mesher(), r3 = seeded(A.team + 'units');
    for (let i = 0; i < 8; i++) RM.box(X0 + 12 + r3() * (X1 - X0 - 24), H + 1.2, Z0 + 10 + r3() * (Z1 - Z0 - 20), 4 + r3() * 6, 2.4, 3 + r3() * 4, color(i % 2 ? '#c9ccd0' : '#a3a8ad'));
    roof.add(RM.mesh());
  } else if (CT) {
    // Zurigo: tetti piani su ogni volume. Sulla sala i pannelli solari scuri, i lucernari a file e gli impianti; sopra, il
    // livello arretrato (top) a fasce blu, bianca e rossa; sulla terrazza il pavimento a cerchi, le tende blu, i chioschi,
    // gli alberi nelle fioriere e la gente.
    const V = curtainHall.vols, rect = B => [[B.x0, B.z0], [B.x1, B.z0], [B.x1, B.z1], [B.x0, B.z1]], RM = new Mesher(), r3 = seeded(A.team + 'units');
    for (const k of ['main', 'west', 'east']) { const B = V[k]; if (!B) continue; flatTop(rect(B), B.h + 0.02, k === 'east' ? 'membrane' : mat); parapet(rect(B), B.h - 0.4, B.h + 0.9); }
    // Lucernari (di sera la luce della pista) e impianti sulla sala, fuori dal livello arretrato.
    const sky = new Mesher(), VM = V.main, TB = V.top;
    for (let z = VM.z0 + 9; z < VM.z1 - 6; z += 14) for (let x = VM.x0 + 8; x < (TB ? TB.x0 - 4 : VM.x1 - 8); x += 22) sky.box(x + 8, VM.h + 0.35, z, 16, 0.5, 2.2, color('#c9d6df'));
    if (!sky.empty) { const sl = sky.mesh({ emissive: color('#ffe6bf'), emissiveIntensity: 0 }); nightMat(sl.material, 0.9); roof.add(sl); }
    for (let i = 0; i < 10; i++) RM.box(VM.x0 + 10 + r3() * ((TB ? TB.x0 : VM.x1) - VM.x0 - 20), VM.h + 1.2, VM.z0 + 6 + r3() * (VM.z1 - VM.z0 - 12), 3 + r3() * 5, 2.2, 2.5 + r3() * 3, color(i % 2 ? '#c9ccd0' : '#9ea3a8'));
    top = VM.h;
    if (TB) {
      // Fasce della sera: blu, bianca e rossa su ogni faccia (di giorno pannelli chiari con i giunti).
      const [tc, tg] = canvas(512, 64), [tn, tnn] = canvas(512, 64);
      tg.fillStyle = '#eef0f0'; tg.fillRect(0, 0, 512, 64); tg.fillStyle = '#c3c8cc'; for (let x = 0; x < 512; x += 16) tg.fillRect(x, 0, 2, 64); tg.fillRect(0, 31, 512, 2);
      ['#1d4fd8', '#f4f6ff', '#e8202a'].forEach((k, i) => { tnn.fillStyle = k; tnn.fillRect(i * 512 / 3, 0, 512 / 3, 64); });
      tnn.fillStyle = 'rgba(0,0,0,.45)'; for (let x = 0; x < 512; x += 16) tnn.fillRect(x, 0, 2, 64);
      const tm = nightMat(new THREE.MeshLambertMaterial({ map: texture(tc), emissiveMap: texture(tn), emissive: color('#ffffff'), emissiveIntensity: 0, side: THREE.DoubleSide }), 1.15);
      const R = rect(TB); R.forEach((a, i) => { const b = R[(i + 1) % 4], L = Math.hypot(b[0] - a[0], b[1] - a[1]); roof.add(new THREE.Mesh(stripGeometry([a, b], TB.y0, TB.y1, { uScale: L }), tm)); });
      flatTop(R, TB.y1 + 0.02, 'membrane'); parapet(R, TB.y1 - 0.3, TB.y1 + 0.6);
      for (let i = 0; i < 4; i++) RM.box(TB.x0 + 6 + r3() * (TB.x1 - TB.x0 - 12), TB.y1 + 1, TB.z0 + 6 + r3() * (TB.z1 - TB.z0 - 12), 4, 1.8, 3, color('#b9bec3'));
      top = TB.y1;
    }
    const VT = V.terrace;
    if (VT) {
      const y = VT.h, lx = VT.x1 - VT.x0, lz = VT.z1 - VT.z0;
      // Pavimento a grandi cerchi.
      const [fc, fg] = canvas(256, 256), fr = seeded('terrazza'); fg.fillStyle = '#cfc8bc'; fg.fillRect(0, 0, 256, 256); fg.strokeStyle = '#9d968b'; fg.lineWidth = 4;
      for (let i = 0; i < 9; i++) { const cx = fr() * 256, cz = fr() * 256, r = 18 + fr() * 40; for (const dx of [-256, 0, 256]) for (const dz of [-256, 0, 256]) { fg.beginPath(); fg.arc(cx + dx, cz + dz, r, 0, Math.PI * 2); fg.stroke(); fg.beginPath(); fg.arc(cx + dx, cz + dz, r * 0.62, 0, Math.PI * 2); fg.stroke(); } }
      const ft = texture(fc, true); ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(lx / 30, lz / 30);
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(lx, lz), new THREE.MeshLambertMaterial({ map: ft })); fl.rotation.x = -Math.PI / 2; fl.position.set((VT.x0 + VT.x1) / 2, y + 0.03, (VT.z0 + VT.z1) / 2); roof.add(fl);
      roof.add(new THREE.Mesh(stripGeometry([[VT.x0, VT.z0], [VT.x1, VT.z0], [VT.x1, VT.z1], [VT.x0, VT.z1]], y, y + 1.15, { uScale: 4 }), new THREE.MeshLambertMaterial({ color: '#cfe0ea', transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false })));
      // Due tende a lastre piegate (azzurre), su quattro pali.
      const TM = new Mesher(), blue = color('#3d86e0');
      for (const [cx, cz, len] of [[VT.x0 + lx * 0.32, VT.z1 - 5, 20], [VT.x0 + lx * 0.7, VT.z0 + lz * 0.42, 14]]) {
        const n = Math.round(len / 2.2), d = 3;
        for (let k = 0; k < n; k++) { const xa = cx - len / 2 + k * len / n, xb = xa + len / n, ya = y + (k % 2 ? 3.4 : 4.3), yb = y + (k % 2 ? 4.3 : 3.4); TM.quad([xa, ya, cz - d], [xb, yb, cz - d], [xb, yb, cz + d], [xa, ya, cz + d], k % 2 ? blue : blue.clone().multiplyScalar(0.85)); }
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) RM.box(cx + sx * (len / 2 - 0.4), y + 1.8, cz + sz * (d - 0.4), 0.15, 3.6, 0.15, color('#d7dade'));
        for (let k = 0; k < 4; k++) lamps.push({ x: cx - len / 2 + (k + 0.5) * len / 4, y: y + 3, z: cz, c: '#cfe2ff', s: 1.4 });
      }
      { const tent = TM.mesh({ emissive: color('#3d86e0'), emissiveIntensity: 0 }); nightMat(tent.material, 0.45); roof.add(tent); }
      // Chioschi (scale e ascensori) in vetro scuro, fioriere con alberi, panchine.
      for (const [kx, kz] of [[VT.x0 + 6, VT.z0 + 6], [VT.x0 + lx * 0.55, VT.z0 + 5]]) { RM.box(kx, y + 1.5, kz, 5, 3, 4, color('#3a4752')); RM.box(kx, y + 3.1, kz, 5.6, 0.25, 4.6, color('#e1e3e4')); windows.push({ x: kx, y: y + 1.5, z: kz + 2.1, c: '#ffe2b5', s: 1.6 }); }
      for (let k = 0; k < 6; k++) { const x = VT.x0 + 8 + k * (lx - 16) / 5, z = VT.z0 + lz * (k % 2 ? 0.72 : 0.22); RM.box(x, y + 0.4, z, 3, 0.8, 3, color('#8d8a84')); extraTrees.push([x, z, 6 + (k % 3), y + 0.8, false]); }
      for (let k = 0; k < 8; k++) RM.box(VT.x0 + 5 + k * (lx - 10) / 7, y + 0.25, (VT.z0 + VT.z1) / 2 + (k % 2 ? 3 : -3), 2.4, 0.5, 0.7, color('#9a7b5c'));
      for (let x = VT.x0 + 4; x < VT.x1; x += 10) for (const z of [VT.z0 + 1.2, VT.z1 - 1.2]) { RM.box(x, y + 0.6, z, 0.15, 1.2, 0.15, color('#6b6f75')); lamps.push({ x, y: y + 1.3, z, c: '#ffe2b5', s: 1.1 }); }
      // Gente che passeggia sulla terrazza.
      const TH = TEAMS[A.team], wc = [TH.primary, TH.secondary, '#2b2e33', '#7a7f86', '#3a4f7a', '#5a4a3c'].filter(Boolean);
      for (let k = 0; k < 26; k++) { const zz = VT.z0 + 3 + rand() * (lz - 6), dir = rand() < 0.5 ? 1 : -1, L = lx - 6; extraMovers.push({ kind: 'walker', len: L, y, speed: 0.9 + rand() * 0.5, phase: rand() * L, color: pick3(rand, wc), path: u => [VT.x0 + 3 + (dir > 0 ? u : L - u), zz, dir > 0 ? Math.PI / 2 : -Math.PI / 2] }); }
    }
    roof.add(RM.mesh());
  } else if (E.folded) {
    // Copertura unica che segue i bordi delle facciate e sale piano verso il centro (vedi foldedSpec): membrana bianca
    // a fasce, con una cornice in lamiera grigia lungo il perimetro.
    const F = foldedSpec(), N = 48, RM = new Mesher(), white = color(E.roofColor || '#eef0f2'), seam = white.clone().multiplyScalar(0.93), metal = color('#9ca3a9');
    const P = (i, j) => { const x = X0 + (X1 - X0) * i / N, z = Z0 + (Z1 - Z0) * j / N; return [x, F.topAt(x, z) + 0.02, z]; };
    let hi = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const a = P(i, j), b = P(i + 1, j), c2 = P(i + 1, j + 1), d2 = P(i, j + 1), mx = (a[0] + c2[0]) / 2, mz = (a[2] + c2[2]) / 2;
      const rim = Math.min(mx - X0, X1 - mx, mz - Z0, Z1 - mz) < 3.2;
      RM.quad(a, d2, c2, b, rim ? metal : i % 3 === 0 ? seam : white); hi = Math.max(hi, a[1]);
    }
    roof.add(RM.mesh()); top = hi;
  } else if (kind === 'star') {
    // Falde incrociate (Davos): due tetti a capanna che si intersecano, timpani vetrati sui quattro lati.
    const M = new Mesher(), cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2, hx = (X1 - X0) / 2, hz = (Z1 - Z0) / 2, rise = E.rise ?? 20;
    const hgt = (x, z) => H + rise * Math.max(1 - Math.abs(z - cz) / hz, 1 - Math.abs(x - cx) / hx);
    const N = 32, k = color(E.roofColor || '#3d3a36'), k2 = k.clone().multiplyScalar(0.94);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x0 = X0 + (X1 - X0) * i / N, x1 = X0 + (X1 - X0) * (i + 1) / N, z0 = Z0 + (Z1 - Z0) * j / N, z1 = Z0 + (Z1 - Z0) * (j + 1) / N;
      const xm = (x0 + x1) / 2, zm = (z0 + z1) / 2, alongX = 1 - Math.abs(zm - cz) / hz > 1 - Math.abs(xm - cx) / hx;
      M.quad([x0, hgt(x0, z0), z0], [x1, hgt(x1, z0), z0], [x1, hgt(x1, z1), z1], [x0, hgt(x0, z1), z1], alongX ? k : k2);
    }
    roof.add(M.mesh({ flatShading: true }));
    const glass = nightMat(new THREE.MeshLambertMaterial({ map: glazingTexture(), emissiveMap: glazingNightTexture(E.glow || '#ffc879'), emissive: color('#ffffff'), emissiveIntensity: 0.06, side: THREE.DoubleSide }), 0.95, 'emissiveIntensity', 0.06);
    const tri = (a, b, c2) => { const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c2], 3)); g2.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, (Math.hypot(b[0] - a[0], b[2] - a[2])) / 8, 0, (Math.hypot(b[0] - a[0], b[2] - a[2])) / 16, (c2[1] - a[1]) / 8], 2)); g2.computeVertexNormals(); roof.add(new THREE.Mesh(g2, glass)); };
    // Timpani vetrati che chiudono i quattro triangoli sotto le falde.
    const e = 0.25; tri([X0 + e, H, Z0], [X0 + e, H, Z1], [X0 + e, H + rise, cz]); tri([X1 - e, H, Z0], [X1 - e, H, Z1], [X1 - e, H + rise, cz]);
    tri([X0, H, Z0 + e], [X1, H, Z0 + e], [cx, H + rise, Z0 + e]); tri([X0, H, Z1 - e], [X1, H, Z1 - e], [cx, H + rise, Z1 - e]);
    roof.add(new THREE.Mesh(stripGeometry(fp, H - 0.6, H + 0.15, { closed: true }), new THREE.MeshLambertMaterial({ color: E.eaveColor || '#5a3a26', side: THREE.DoubleSide })));
    top = H + rise;
  } else if (kind === 'pyramid') {
    const M = new Mesher(), cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2, apex = [cx, H + (E.rise ?? 14), cz], k = color(E.roofColor || '#4a3a2c');
    fp.forEach((p, i) => { const q = fp[(i + 1) % fp.length]; M.tri([p[0], H, p[1]], [q[0], H, q[1]], apex, i % 2 ? k : k.clone().multiplyScalar(0.88)); });
    roof.add(M.mesh()); top = apex[1];
  } else if (kind === 'hip') {
    // Tetto a padiglione (Kloten): due grandi falde lungo l'asse e due triangoli sulle testate, con gronda.
    const o = E.eaves ?? 1.4, x0 = X0 - o, x1 = X1 + o, z0 = Z0 - o, z1 = Z1 + o, zc = (z0 + z1) / 2, rise = E.rise ?? 7, hz = (z1 - z0) / 2, xa = x0 + hz * 0.8, xb = x1 - hz * 0.8;
    const M = new Mesher(), k = color(E.roofColor || '#7d8288'), y = H - 0.3, r = [xa, y + rise, zc], s = [xb, y + rise, zc];
    M.quad([x0, y, z0], [x1, y, z0], s, r, k); M.quad([x1, y, z1], [x0, y, z1], r, s, k.clone().multiplyScalar(0.9));
    M.tri([x0, y, z1], [x0, y, z0], r, k.clone().multiplyScalar(0.82)); M.tri([x1, y, z0], [x1, y, z1], s, k.clone().multiplyScalar(0.96));
    const fascia = color(E.wall || '#888').multiplyScalar(0.7);
    [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]].forEach(([a, b, c2, d]) => M.quad([a, y - 0.6, b], [c2, y - 0.6, d], [c2, y, d], [a, y, b], fascia));
    roof.add(M.mesh({ flatShading: true })); top = y + rise;
  } else if (kind === 'barrel') {
    // Volta a botte con l'asse lungo la pista, eventualmente arretrata dentro un bordo piano (Berna, Ambrì, Langnau, Lugano).
    const inset = E.inset ?? 0, eo = E.eaveOut ?? 0, bx0 = X0 + inset - eo, bx1 = X1 - inset + eo, bz0 = Z0 + inset - eo, bz1 = Z1 - inset + eo, zc = (bz0 + bz1) / 2, hz = (bz1 - bz0) / 2, rise = E.rise ?? hz * 0.35;
    if (inset > 0) { flatTop(fp, H + 0.02, E.rimMat || 'membrane'); parapet(fp, H, H + 1); }
    const N = 24, pos = [], uv = [], idx = [], base = H + (inset > 0 ? 0.6 : 0);
    let s = 0;
    for (let i = 0; i <= N; i++) {
      const u = -1 + 2 * i / N, z = zc + u * hz, y = base + rise * Math.sqrt(1 - u * u);
      if (i) { const pu = -1 + 2 * (i - 1) / N; s += Math.hypot(hz * 2 / N, rise * (Math.sqrt(1 - u * u) - Math.sqrt(1 - pu * pu))); }
      pos.push(bx0, y, z, bx1, y, z); uv.push(0, s / 9, (bx1 - bx0) / 9, s / 9);
      if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    const tex = roofTexture(mat, E.roofColor); tex.wrapT = THREE.RepeatWrapping;
    roof.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide })));
    const M = new Mesher(), cap = color(E.caps || E.wall || '#d7d3c9'), cx0 = bx0 + eo, cx1 = bx1 - eo;
    if (E.capsGlass) {
      // Testate vetrate sotto l'arco: di sera brillano come grandi finestre.
      const gp = [], gu = [], gi = [];
      for (const x of [cx0, cx1]) for (let i = 0; i <= N; i++) { const u = -1 + 2 * i / N, y = base + rise * Math.sqrt(1 - u * u) - 0.1, z = zc + u * hz; const k = gp.length / 3, xo = x + Math.sign(x) * 0.08; gp.push(xo, base + 0.05, z, xo, y, z); gu.push((z - bz0) / 3, 0, (z - bz0) / 3, (y - base) / 6); if (i) gi.push(k - 2, k - 1, k, k - 1, k + 1, k); }
      const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3)); gg.setAttribute('uv', new THREE.Float32BufferAttribute(gu, 2)); gg.setIndex(gi); gg.computeVertexNormals();
      roof.add(new THREE.Mesh(gg, nightMat(new THREE.MeshLambertMaterial({ map: glazingTexture(), emissiveMap: glazingNightTexture(E.glow || '#f4f1e6'), emissive: color('#ffffff'), emissiveIntensity: 0.05, side: THREE.DoubleSide }), 1.1, 'emissiveIntensity', 0.05)));
    } else for (let i = 0; i < N; i++) {
      const u0 = -1 + 2 * i / N, u1 = -1 + 2 * (i + 1) / N, y0 = base + rise * Math.sqrt(1 - u0 * u0), y1 = base + rise * Math.sqrt(1 - u1 * u1);
      for (const x of [cx0, cx1]) M.quad([x, base, zc + u0 * hz], [x, base, zc + u1 * hz], [x, y1, zc + u1 * hz], [x, y0, zc + u0 * hz], cap);
    }
    if (E.roofVents) for (let i = 0; i < E.roofVents.n; i++) { const x = bx0 + (bx1 - bx0) * (i + 1) / (E.roofVents.n + 1), u = (i % 2 ? 0.45 : -0.3), m = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.9, 20), new THREE.MeshLambertMaterial({ color: E.roofVents.color || '#c0392b' })); m.position.set(x, base + rise * Math.sqrt(1 - u * u) + 0.3, zc + u * hz); group.add(m); }
    if (inset <= 0) parapet(fp, H - 0.4, H + 0.3);
    roof.add(M.mesh()); top = base + rise;
  } else if (kind === 'canopy') {
    // Grande lastra sporgente (Zugo, Ginevra): può alzarsi verso un angolo; puntoni inclinati davanti alle facciate.
    const C = E.canopy || {}, o = { north: 0, south: 0, west: 0, east: 0, ...(C.out || {}) }, th = C.thick ?? 1.4;
    const x0 = X0 - o.west, x1 = X1 + o.east, z0 = Z0 - o.north, z1 = Z1 + o.south;
    const lift = (x, z) => H + 0.3 + (C.lift ?? 0) * ((x - x0) / (x1 - x0)) * ((z - z0) / (z1 - z0)) + (C.tilt ?? 0) * ((z - z0) / (z1 - z0));
    const M = new Mesher(), k = color(E.roofColor || '#d4d6d8'), under = k.clone().multiplyScalar(0.62), N = 8;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const a0 = x0 + (x1 - x0) * i / N, a1 = x0 + (x1 - x0) * (i + 1) / N, b0 = z0 + (z1 - z0) * j / N, b1 = z0 + (z1 - z0) * (j + 1) / N;
      M.quad([a0, lift(a0, b0), b0], [a1, lift(a1, b0), b0], [a1, lift(a1, b1), b1], [a0, lift(a0, b1), b1], k);
      M.quad([a0, lift(a0, b0) - th, b0], [a0, lift(a0, b1) - th, b1], [a1, lift(a1, b1) - th, b1], [a1, lift(a1, b0) - th, b0], under);
    }
    const edge = k.clone().multiplyScalar(0.85), ring = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    ring.forEach((p, i) => { const q = ring[(i + 1) % 4]; M.quad([p[0], lift(p[0], p[1]) - th, p[1]], [q[0], lift(q[0], q[1]) - th, q[1]], [q[0], lift(q[0], q[1]), q[1]], [p[0], lift(p[0], p[1]), p[1]], edge); });
    if (C.struts) {
      const strut = color(C.strutColor || '#cfcac0');
      for (const side of ['north', 'south']) { if (!o[side]) continue; const zf = side === 'north' ? Z0 : Z1, ze = side === 'north' ? z0 + 0.6 : z1 - 0.6; for (let x = X0 + 3; x < X1 - 1; x += 6.5) M.beam([x, 0, zf + (side === 'north' ? -0.4 : 0.4)], [x + 2.5, lift(x, ze) - th, ze], 0.55, strut, 0.9); }
    }
    roof.add(M.mesh({ flatShading: true })); top = H + (C.lift ?? 0) + (C.tilt ?? 0);
    // Fascia vetrata scura che chiude lo spazio tra facciata e lastra dove la copertura si alza.
    roof.add(new THREE.Mesh(stripGeometry(fp, H - 0.2, p => Math.max(H, lift(p[0], p[1]) - th + 0.1), { closed: true }), nightMat(new THREE.MeshLambertMaterial({ color: '#28323b', emissive: color('#ffd7a0'), emissiveIntensity: 0, side: THREE.DoubleSide }), 0.35)));
  } else {
    flatTop(fp, H + 0.02, mat); parapet(fp, H, H + 0.7);
    if (kind === 'shed') {
      const M = new Mesher(), k = color('#e9ecef'), g = color('#7f9db5');
      for (let z = Z0 + 4; z < Z1 - 4; z += 7) { M.quad([X0 + 3, H, z], [X1 - 3, H, z], [X1 - 3, H + 2.4, z + 2.2], [X0 + 3, H + 2.4, z + 2.2], g); M.quad([X0 + 3, H + 2.4, z + 2.2], [X1 - 3, H + 2.4, z + 2.2], [X1 - 3, H, z + 5.5], [X0 + 3, H, z + 5.5], k); }
      roof.add(M.mesh());
    }
  }

  // Cornici sporgenti che separano i livelli della facciata (es. zoccolo / vetrata / volta a Lugano).
  for (const f of E.ledges || []) {
    const y = H * f, ring = grow(fp, 0.55), L = new Mesher(), k = color(E.ledgeColor || '#e4e1da');
    ring.forEach((a, i) => { const b = ring[(i + 1) % ring.length], a0 = fp[i], b0 = fp[(i + 1) % fp.length];
      L.quad([a[0], y, a[1]], [b[0], y, b[1]], [b[0], y + 0.6, b[1]], [a[0], y + 0.6, a[1]], k);
      L.quad([a0[0], y + 0.6, a0[1]], [b0[0], y + 0.6, b0[1]], [b[0], y + 0.6, b[1]], [a[0], y + 0.6, a[1]], k.clone().multiplyScalar(1.05));
      L.quad([a0[0], y, a0[1]], [b0[0], y, b0[1]], [b[0], y, b[1]], [a[0], y, a[1]], k.clone().multiplyScalar(0.6)); });
    group.add(L.mesh());
  }

  // Insegna sul lato principale (sud).
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(30, 4.7), new THREE.MeshBasicMaterial({ map: signTexture(A, logo), transparent: true }));
  sign.position.set(E.signX ?? 0, E.signAt ? H * E.signAt : Math.min(H - 3, 9), Z1 + (E.overhang ? E.overhang.out ?? 2.2 : 0) + 0.15); group.add(sign);
  if (E.octaStar) sign.position.set(0, Math.max(2.4, H * 0.45), Z1 + 0.2);
  if (E.stack) {
    // Friburgo: scritta BCF ARENA sulla scatola alta, a sinistra del fronte, e sul risvolto della testata est.
    const to = E.stack.top?.out ?? 7, H2 = E.stack.top?.from ?? H * 0.52;
    sign.scale.setScalar(1.25); sign.position.set(X0 + 30, H2 + (H - H2) * 0.68, Z1 + to + 1.1);
    const s2 = sign.clone(); s2.scale.setScalar(1); s2.rotation.y = Math.PI / 2; s2.position.set(X1 + to + 1.1, H2 + (H - H2) * 0.68, 0); group.add(s2);
  }
  if (CT) {
    // Zurigo: insegna sul livello arretrato (nella fascia blu del fronte sud), sul suo risvolto est e sulla testata della sala d'allenamento.
    const V = curtainHall.vols, TB = V.top;
    // L'insegna (30 × 4,7 m) sta tutta dentro la faccia: centrata e ridotta se la faccia è più corta.
    if (TB) { sign.scale.setScalar(Math.min(0.95, (TB.x1 - TB.x0) * 0.8 / 30, (TB.y1 - TB.y0) * 0.75 / 4.7)); sign.position.set((TB.x0 + TB.x1) / 2, (TB.y0 + TB.y1) / 2, TB.z1 + 0.2);
      const s2 = sign.clone(); s2.rotation.y = Math.PI / 2; s2.position.set(TB.x1 + 0.2, (TB.y0 + TB.y1) / 2, (TB.z0 + TB.z1) / 2); group.add(s2); }
    if (V.west) { const s3 = sign.clone(); s3.scale.setScalar(0.8); s3.rotation.y = -Math.PI / 2; s3.position.set(V.west.x0 - 1, V.west.h - 5, (V.west.z0 + V.west.z1) / 2); group.add(s3); }
  }
  if (BK) {
    // Berna: insegna in cima al blocco uffici e una seconda, più grande, sulla testata est della sala.
    sign.position.set(X1 - 24, blockH() - 2.8, Zs + 0.2);
    const s2 = sign.clone(); s2.scale.setScalar(1.3); s2.rotation.y = Math.PI / 2; s2.position.set(X1 + (E.folded?.out ?? 1.8) + 0.5, foldedSpec().topAt(X1, Z1 - 30) - 9, Z1 - 30); group.add(s2);
  }

  // Alone sopra l'arena di notte: la luce della pista che esce da vetrate e lucernari.
  const halo = new THREE.Mesh(new THREE.PlaneGeometry((X1 - X0) * 2.2, (Z1 - Z0) * 2.4), nightMat(new THREE.MeshBasicMaterial({ map: radialTexture(), color: E.haloColor || '#ffe2b8', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }), 0.22, 'opacity'));
  halo.rotation.x = -Math.PI / 2; halo.position.y = top + 2; group.add(halo);

  /* ---------- dintorni ---------- */
  const place = (f, w, len) => {
    const d = f.dist ?? 30, off = f.offset ?? 0;
    if (f.side === 'north') return { cx: off, cz: Z0 - d - w / 2, lx: len, lz: w, along: 'x' };
    if (f.side === 'south') return { cx: off, cz: Zs + d + w / 2, lx: len, lz: w, along: 'x' };
    if (f.side === 'west') return { cx: X0 - d - w / 2, cz: off, lx: w, lz: len, along: 'z' };
    return { cx: X1 + d + w / 2, cz: off, lx: w, lz: len, along: 'z' };
  };
  const flat = (p, c, y = 0.012, m = null) => { const mesh = new THREE.Mesh(new THREE.PlaneGeometry(p.lx, p.lz), m || new THREE.MeshLambertMaterial({ color: c })); mesh.rotation.x = -Math.PI / 2; mesh.position.set(p.cx, y, p.cz); group.add(mesh); return mesh; };
  const along = (p, s, o) => p.along === 'x' ? [p.cx + s, p.cz + o] : [p.cx + o, p.cz + s];
  const cars = [], treeSpots = [...extraTrees], M = new Mesher(), slopeH = [];
  // Cose che si muovono (auto, camion, pedoni): percorso u → [x, z, yaw], lunghezza, velocità, fase; aggiornate a ogni frame.
  const extraTrain = [], movers = [...extraMovers];
  // 'ring' = strada che gira attorno all'arena: quattro tratti dritti che si incontrano negli angoli.
  const features = (E.features || []).flatMap(f => {
    if (f.type !== 'ring') return [f];
    const d = f.dist ?? 20, w = 10, lx = X1 - X0 + 2 * d + 2 * w, lz = Zs - Z0 + 2 * d + w;
    return [{ type: 'road', side: 'north', dist: d, len: lx }, { type: 'road', side: 'south', dist: d, len: lx },
      { type: 'road', side: 'west', dist: d, len: lz, offset: (Z0 + Zs) / 2 }, { type: 'road', side: 'east', dist: d, len: lz, offset: (Z0 + Zs) / 2 }];
  });
  for (const f of features) {
    const len = f.len ?? 1400;
    if (f.type === 'rail') {
      const w = (f.tracks ?? 3) * 5, p = place(f, w, len), steel = color('#5b5e63');
      flat(p, '#8a8378', 0.01);
      for (let i = 0; i < (f.tracks ?? 3); i++) for (const o of [-0.72, 0.72]) { const c = -w / 2 + 2.5 + i * 5 + o; if (p.along === 'x') M.box(p.cx, 0.12, p.cz + c, len, 0.15, 0.12, steel); else M.box(p.cx + c, 0.12, p.cz, 0.12, 0.15, len, steel); }
      for (let s = -300; s <= 300; s += 60) { const [x, z] = along(p, s, w / 2 + 2); M.box(x, 4, z, 0.3, 8, 0.3, color('#7b7e83')); }
      // Linea aerea: portali ogni 60 m sopra tutti i binari, con il filo di contatto su ogni binario.
      if (f.catenary) for (let s = -330; s <= 330; s += 60) { const a = along(p, s, -w / 2 - 1), b = along(p, s, w / 2 + 1); M.box(a[0], 4, a[1], 0.35, 8, 0.35, color('#7b7e83')); M.beam([a[0], 7.6, a[1]], [b[0], 7.6, b[1]], 0.25, color('#7b7e83')); }
      if (f.catenary) for (let i = 0; i < (f.tracks ?? 3); i++) { const c = -w / 2 + 2.5 + i * 5, a = along(p, -330, c), b = along(p, 330, c); M.beam([a[0], 6.2, a[1]], [b[0], 6.2, b[1]], 0.05, color('#3a3d42')); }
      // Treni (Zurigo): convogli di carrozze che scorrono sui binari nei due sensi; di sera i finestrini accesi.
      for (let k = 0; k < (f.trains ?? 0); k++) {
        const track = k % (f.tracks ?? 3), o = -w / 2 + 2.5 + track * 5, dir = track % 2 ? -1 : 1, cars = 4 + Math.floor(rand() * 5), speed = 14 + rand() * 12, phase = rand() * len;
        const kind = rand(), body = kind < 0.45 ? '#f1f1ef' : kind < 0.8 ? '#c8102e' : '#6d5a48', lit = [];
        for (let c = 0; c < cars; c++) {
          const ph = phase - c * 26.5;
          extraTrain.push({ kind: 'train', len, speed, phase: ph, color: c === 0 && kind < 0.45 ? '#c8102e' : body, path: u => { const s2 = dir > 0 ? u - len / 2 : len / 2 - u, [x, z] = along(p, s2, o); return [x, z, (p.along === 'x' ? Math.PI / 2 : 0) + (dir > 0 ? 0 : Math.PI)]; } });
          if (kind < 0.8) for (const d of [-8, -3, 2, 7]) { const [x, z] = along(p, 0, o + 1.55 * (p.along === 'x' ? 1 : 1)); lit.push({ x, y: 2.7, z, c: '#fff1d0', s: 1.2, m0: dir > 0 ? ph + d : -ph - d, sp: dir * speed }); const [x2, z2] = along(p, 0, o - 1.55); lit.push({ x: x2, y: 2.7, z: z2, c: '#fff1d0', s: 1.2, m0: dir > 0 ? ph + d : -ph - d, sp: dir * speed }); }
        }
        if (lit.length) group.add(glowPoints(lit, glow, time, { dir: p.along === 'x' ? [1, 0, 0] : [0, 0, 1], len }));
      }
      occupy(p.cx - p.lx / 2, p.cx + p.lx / 2, p.cz - p.lz / 2, p.cz + p.lz / 2);
    } else if (f.type === 'road' || f.type === 'motorway') {
      const motor = f.type === 'motorway', w = motor ? 26 : 10, p = place(f, w, len);
      flat(p, '#4a4c50', 0.1);
      const n = motor ? 3 : 1;
      for (let i = 1; i <= n; i++) { const o = -w / 2 + i * w / (n + 1); flat({ cx: p.along === 'x' ? p.cx : p.cx + o, cz: p.along === 'x' ? p.cz + o : p.cz, lx: p.along === 'x' ? len : 0.25, lz: p.along === 'x' ? 0.25 : len }, null, 0.14, new THREE.MeshBasicMaterial({ color: '#e8e8e2' })); }
      if (motor) for (const o of [-w / 2 - 0.4, 0, w / 2 + 0.4]) { const a = along(p, 0, o); M.box(a[0], 0.45, a[1], p.along === 'x' ? len : 0.3, 0.9, p.along === 'x' ? 0.3 : len, color('#c4c6c8')); }
      for (let s = -Math.min(360, len / 2 - 12); s <= Math.min(360, len / 2 - 12); s += motor ? 45 : 30) for (const o of motor ? [0] : [-w / 2 - 1.5, w / 2 + 1.5]) { const [x, z] = along(p, s, o); lampAt(x, z, motor ? 11 : 8, motor ? '#ffc58a' : '#ffd9a6'); }
      // Fari: bianchi in un senso, rossi nell'altro.
      const lanes = motor ? [[-9, 1], [-4.5, 1], [4.5, -1], [9, -1]] : [[-2.5, 1], [2.5, -1]], trail = [];
      for (const [o, dir] of lanes) for (let k = 0; k < len / 45; k++) { const [x, z] = along(p, 0, o); trail.push({ x, y: 0.9, z, c: dir > 0 ? '#fff4dc' : '#ff3b30', s: motor ? 1.5 : 1.3, m0: rand() * len, sp: dir * (motor ? 26 + rand() * 6 : 12 + rand() * 4) }); }
      group.add(glowPoints(trail, glow, time, { dir: p.along === 'x' ? [1, 0, 0] : [0, 0, 1], len }));
      // Traffico di giorno: auto e qualche camion su ogni corsia, nei due sensi (f.traffic = veicoli ogni 100 m per corsia).
      const dens = f.traffic ?? (motor ? 1.8 : 1.5);
      for (const [o, dir] of lanes) for (let k = 0; k < Math.round(len / 100 * dens); k++) {
        const kind = rand() < (motor ? 0.25 : 0.12) ? 'truck' : rand() < 0.08 ? 'bus' : 'car', sp = (motor ? 22 : 11) * (0.8 + rand() * 0.35) * (kind === 'car' ? 1 : 0.85);
        movers.push({ kind, len, speed: sp, phase: rand() * len, color: kind === 'car' ? pick3(rand, ['#e6e6e6', '#202226', '#8b9096', '#b3262c', '#2b4d7a', '#c7c9cc', '#3d5a3a']) : kind === 'bus' ? '#d23a2e' : pick3(rand, ['#f2f2f0', '#e8e8e4', '#1f4f9e', '#c9cbcc']),
          path: u => { const s2 = dir > 0 ? u - len / 2 : len / 2 - u, [x, z] = along(p, s2, o); return [x, z, (p.along === 'x' ? Math.PI / 2 : 0) + (dir > 0 ? 0 : Math.PI)]; } });
      }
      // Le strade non finiscono nel nulla: imbocco di galleria dentro una collina boscosa.
      for (const end of f.tunnels || []) {
        const sgn = end === 'start' ? -1 : 1, [tx, tz] = along(p, sgn * len / 2, 0), T = new Mesher(), conc = color('#b9b8b3'), dark = color('#0d0e10'), hill = color(snow ? '#d9e0e6' : '#4d6a3c');
        const bx = (a, b, c2, sx, sy, sz, k) => p.along === 'x' ? T.box(tx + a, b, tz + c2, sx, sy, sz, k) : T.box(tx + c2, b, tz + a, sz, sy, sx, k);
        bx(0, 4.5, 0, 3, 9, w + 6, conc); bx(-sgn * 1.6, 3.2, 0, 0.4, 6.2, w - 1, dark);
        for (let k = 0; k < 6; k++) bx(sgn * (8 + k * 9), 6 - k * 0.4, 0, 18, 14 - k * 1.2, w + 30 + k * 10, hill.clone().multiplyScalar(0.92 + (k % 2) * 0.08));
        group.add(T.mesh({ flatShading: true }));
        for (let i = 0; i < 40; i++) { const a = sgn * (6 + rand() * 50), o = (rand() - 0.5) * (w + 40); const [x, z] = p.along === 'x' ? [tx + a, tz + o] : [tx + o, tz + a]; treeSpots.push([x, z, 8 + rand() * 8, 12 - Math.abs(a) * 0.15, true]); }
      }
      occupy(p.cx - p.lx / 2, p.cx + p.lx / 2, p.cz - p.lz / 2, p.cz + p.lz / 2);
    } else if (f.type === 'river') {
      const p = place(f, f.w ?? 34, len);
      flat(p, null, 0.01, new THREE.MeshPhongMaterial({ color: '#4f7f95', shininess: 80, specular: color('#9bb7c6') }));
      occupy(p.cx - p.lx / 2, p.cx + p.lx / 2, p.cz - p.lz / 2, p.cz + p.lz / 2);
    } else if (f.type === 'runway') {
      const p = place(f, 30, len);
      flat(p, '#9c9d9a', 0.1);
      for (let s = -len / 2 + 10; s < len / 2; s += 30) flat({ cx: p.along === 'x' ? p.cx + s : p.cx, cz: p.along === 'x' ? p.cz : p.cz + s, lx: p.along === 'x' ? 14 : 0.8, lz: p.along === 'x' ? 0.8 : 14 }, null, 0.14, new THREE.MeshBasicMaterial({ color: '#f3f3f0' }));
      // Testate come una vera pista di decollo: soglia a strisce, numero, zona di sicurezza con chevron gialli,
      // poi nel prato una fila di luci di avvicinamento con le barre trasversali.
      const white = new THREE.MeshBasicMaterial({ color: '#f3f3f0' }), yellow = new THREE.MeshBasicMaterial({ color: '#e8c33a' }), fixture = color('#5d6166'), appr = [];
      const fr = (s0, o, ls, lo, m, y = 0.14) => { const [x, z] = along(p, s0, o); flat({ cx: x, cz: z, lx: p.along === 'x' ? ls : lo, lz: p.along === 'x' ? lo : ls }, null, y, m); };
      for (const sgn of [-1, 1]) {
        for (let k = -5; k <= 5; k++) if (k) fr(sgn * (len / 2 - 14), k * 2.4, 22, 1.3, white);
        fr(sgn * (len / 2 - 34), -2.2, 9, 1, white); fr(sgn * (len / 2 - 34), 2.2, 9, 1, white); fr(sgn * (len / 2 - 40), 0, 1, 5, white);
        fr(sgn * (len / 2 + 15), 0, 30, 30, new THREE.MeshLambertMaterial({ color: '#8f908c' }), 0.1);
        for (let c = 0; c < 3; c++) for (const o of [-1, 1]) { const [x, z] = along(p, sgn * (len / 2 + 6 + c * 9), o * 6); const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 12).rotateX(-Math.PI / 2), yellow); m.position.set(x, 0.15, z); m.rotation.y = (p.along === 'x' ? 0 : Math.PI / 2) + o * sgn * 0.8; group.add(m); }
        for (let k = 0; k < 6; k++) { const d = len / 2 + 34 + k * 12; for (const o of k % 3 === 2 ? [-9, -6, -3, 0, 3, 6, 9] : [0]) { const [x, z] = along(p, sgn * d, o); M.box(x, 0.6, z, 0.4, 1.2, 0.4, fixture); appr.push({ x, y: 1.3, z, c: '#fff6e0', s: 2.2 }); } }
      }
      group.add(glowPoints(appr, glow, time));
      const edge = []; for (let s = -len / 2 + 10; s <= len / 2 - 10; s += 30) for (const o of [-16, 16]) { const [x, z] = along(p, s, o); edge.push({ x, y: 0.4, z, c: '#9cc3ff', s: 1.2 }); }
      group.add(glowPoints(edge, glow, time));
      occupy(p.cx - p.lx / 2, p.cx + p.lx / 2, p.cz - p.lz / 2, p.cz + p.lz / 2);
    } else if (f.type === 'parking') {
      const p = place(f, f.w ?? 40, f.len ?? 60);
      flat(p, snow ? '#9ea4aa' : '#6f7175', 0.07);
      // Auto in file ordinate, una per stallo, senza sovrapposizioni.
      { const L = p.along === 'x' ? p.lx : p.lz, Wd = p.along === 'x' ? p.lz : p.lx, slots = [];
        for (let r = -Wd / 2 + 3.5; r <= Wd / 2 - 3.5; r += Wd < 14 ? 99 : 7.5) for (let u = -L / 2 + 3; u <= L / 2 - 3; u += 3) slots.push([u, Wd < 14 ? 0 : r]);
        const want = Math.min(f.cars ?? 40, Math.floor(slots.length * 0.6));
        for (let i = 0; i < want && slots.length; i++) { const [u, r] = slots.splice(Math.floor(rand() * slots.length), 1)[0]; cars.push(p.along === 'x' ? [p.cx + u, p.cz + r, 'z'] : [p.cx + r, p.cz + u, 'x']); } }
      for (let a = -p.lx / 2 + 8; a < p.lx / 2; a += 22) for (let b = -p.lz / 2 + 8; b < p.lz / 2; b += 22) { M.box(p.cx + a, 5, p.cz + b, 0.25, 10, 0.25, color('#8b8e93')); lampAt(p.cx + a, p.cz + b, 10, '#f4f1ff'); }
      occupy(p.cx - p.lx / 2, p.cx + p.lx / 2, p.cz - p.lz / 2, p.cz + p.lz / 2);
    } else if (f.type === 'pitch' || f.type === 'stadium') {
      // Campo di calcio; lo stadio ha un anello di tribune coperto (Bienne: stesso complesso dell'arena).
      // `turn`: il campo si allunga perpendicolare al lato, in fila con l'arena (complesso allungato, come a Bienne).
      const ring = f.type === 'stadium' ? 16 : 0, [pw, plen] = f.turn ? [110, 74] : [74, 110];
      // Con la pista d'atletica il campo occupa tutto l'anello (curve comprese) più i lampioni attorno.
      const p = f.track ? place(f, f.turn ? 196 : 116, f.turn ? 116 : 196) : place(f, pw + ring * 2, plen + ring * 2), xLong = p.lx > p.lz, pl = { ...p, lx: xLong ? 110 : 74, lz: xLong ? 74 : 110 };
      const pitchMat = nightMat(new THREE.MeshLambertMaterial({ map: pitchTexture(), emissive: color('#ffffff'), emissiveIntensity: 0 }), f.type === 'stadium' ? 0.55 : 0.35);
      pitchMat.emissiveMap = pitchMat.map;
      const pm = new THREE.Mesh(new THREE.PlaneGeometry(110, 74), pitchMat); pm.rotation.set(-Math.PI / 2, 0, xLong ? 0 : Math.PI / 2); pm.position.set(p.cx, f.track ? 0.13 : 0.06, p.cz); group.add(pm);
      if (f.type === 'stadium') {
        const h = f.h ?? H, k = color(f.color || E.wall || '#9da1a7'), green = color('#7d8a5c'), hx = p.lx / 2, hz2 = p.lz / 2;
        for (const [bx, bz, sx, sz] of [[0, -hz2 + ring / 2, p.lx, ring], [0, hz2 - ring / 2, p.lx, ring], [-hx + ring / 2, 0, ring, p.lz - ring * 2], [hx - ring / 2, 0, ring, p.lz - ring * 2]]) {
          M.box(p.cx + bx, h / 2, p.cz + bz, sx, h, sz, k); M.box(p.cx + bx, h + 0.15, p.cz + bz, sx, 0.3, sz, green);
        }
        buildingWindows(p.cx, p.cz, p.lx, p.lz, h, 0, 0.25);
      }
      // Pista d'atletica rosso mattone attorno al campo e cartelloni pubblicitari lungo il lato lungo (Friburgo, St-Léonard).
      if (f.track) {
        // Anello vero: rettilinei lunghi quanto il campo e curve a semicerchio larghe abbastanza da contenere gli angoli
        // del campo (raggio interno 40 m). Dentro, il prato delle curve; sulla pista 6 corsie con le linee bianche.
        const shape2 = (hl, hw) => roundedRect(xLong ? hl : hw, xLong ? hw : hl, hw, 16).map(([x, z]) => new THREE.Vector2(x, z));
        const R0 = 40, HL0 = 80, W = 8.5, flatRing = (hl, hw, d, y, c, mat) => { const sh = new THREE.Shape(shape2(hl + d, hw + d)); sh.holes.push(new THREE.Path(shape2(hl, hw))); const g2 = new THREE.ShapeGeometry(sh); g2.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g2, mat || new THREE.MeshLambertMaterial({ color: c })); m.position.set(pl.cx, y, pl.cz); group.add(m); return m; };
        const inField = new THREE.ShapeGeometry(new THREE.Shape(shape2(HL0, R0))); inField.rotateX(-Math.PI / 2);
        const fm = new THREE.Mesh(inField, new THREE.MeshLambertMaterial({ color: '#4c8239' })); fm.position.set(pl.cx, 0.03, pl.cz); group.add(fm);
        flatRing(HL0, R0, W, 0.09, '#b5583f');
        const lineM = new THREE.MeshBasicMaterial({ color: '#efe9e2' });
        for (let k = 0; k <= 6; k++) flatRing(HL0 + k * W / 6 - 0.06, R0 + k * W / 6 - 0.06, 0.12, 0.13, null, lineM);
        flatRing(HL0 + W, R0 + W, 3, 0.05, '#9a9790');
        const adC = ['#e8e6e1', '#d6452e', '#1f4f9e', '#f2c500', '#2b2e33', '#ffffff', '#e07a2b'];
        for (const sg of [-1, 1]) for (let u = -pl.lx / 2 + 3; u < pl.lx / 2 - 3; u += 6) { const x = xLong ? pl.cx + u : pl.cx + sg * (pl.lx / 2 + 1.2), z = xLong ? pl.cz + sg * (pl.lz / 2 + 1.2) : pl.cz + u; M.box(x, 0.5, z, xLong ? 5.6 : 0.15, 0.9, xLong ? 0.15 : 5.6, color(pick3(rand, adC))); }
        // Lampioni tutt'attorno all'anello, ogni ~16 m, appena fuori dalla pista.
        const ringPts = roundedRect(xLong ? HL0 + W + 5 : R0 + W + 5, xLong ? R0 + W + 5 : HL0 + W + 5, R0 + W + 5, 16);
        let acc = 0; for (let i = 1; i < ringPts.length; i++) { const [ax, az] = ringPts[i - 1], [bx, bz] = ringPts[i]; acc += Math.hypot(bx - ax, bz - az); if (acc >= 16) { acc = 0; M.box(pl.cx + bx, 5, pl.cz + bz, 0.22, 10, 0.22, color('#7d8186')); M.box(pl.cx + bx, 10.1, pl.cz + bz, 1.2, 0.3, 0.6, color('#5d6166')); lamps.push({ x: pl.cx + bx, y: 10, z: pl.cz + bz, c: '#f4f6ff', s: 2.8 }); pools.push([pl.cx + bx, pl.cz + bz]); } }
      }
      const mastH = f.masts ?? (f.type === 'stadium' ? (f.h ?? H) + 6 : 20);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const x = pl.cx + sx * (f.track ? (xLong ? 92 : 56) : pl.lx / 2 + 3), z = pl.cz + sz * (f.track ? (xLong ? 56 : 92) : pl.lz / 2 + 3); M.box(x, mastH / 2, z, f.masts ? 0.9 : 0.5, mastH, f.masts ? 0.9 : 0.5, color('#9a9da2')); if (f.masts) M.box(x, mastH + 1.2, z, 4.5, 2.6, 0.8, color('#d9dbde'), Math.atan2(-sx, -sz)); lamps.push({ x, y: mastH, z, c: '#ffffff', s: f.masts ? 8 : 6 }); }
      occupy(p.cx - p.lx / 2 - (f.track ? 2 : 8), p.cx + p.lx / 2 + (f.track ? 2 : 8), p.cz - p.lz / 2 - (f.track ? 2 : 8), p.cz + p.lz / 2 + (f.track ? 2 : 8));
    } else if (f.type === 'icerink') {
      // Pista all'aperto: ghiaccio bianco con balaustre, illuminata di sera (Davos, Losanna).
      const w = f.w ?? 30, l = f.len ?? 60, p = place(f, w, l), lx = p.along === 'x' ? l : w, lz = p.along === 'x' ? w : l;
      const geo = new THREE.ShapeGeometry(new THREE.Shape(roundedRect(lx / 2, lz / 2, Math.min(lx, lz) * 0.28, 8).map(([x, z]) => new THREE.Vector2(x, z))));
      geo.rotateX(-Math.PI / 2);
      const uvA = geo.attributes.uv, posA = geo.attributes.position; for (let i = 0; i < posA.count; i++) uvA.setXY(i, posA.getX(i) / lx + 0.5, posA.getZ(i) / lz + 0.5);
      const ice = new THREE.Mesh(geo, nightMat(new THREE.MeshPhongMaterial({ map: f.lines === false ? null : iceRinkTexture(), color: '#eef4f8', shininess: 90, emissive: color(f.glow || '#dfe9ff'), emissiveIntensity: 0 }), 0.75));
      ice.position.set(p.cx, 0.05, p.cz); group.add(ice);
      group.add(new THREE.Mesh(stripGeometry(roundedRect(lx / 2, lz / 2, Math.min(lx, lz) * 0.28, 8).map(([x, z]) => [x + p.cx, z + p.cz]), 0, 1.1, { closed: true }), new THREE.MeshLambertMaterial({ color: f.boards || '#f3f4f2', side: THREE.DoubleSide })));
      if (f.track) { const tr = new THREE.Mesh(new THREE.RingGeometry(1, 1.18, 48), new THREE.MeshLambertMaterial({ color: '#d4dbe2', side: THREE.DoubleSide })); tr.rotation.x = -Math.PI / 2; tr.scale.set(lx * 0.7, lz * 0.75, 1); tr.position.set(p.cx, 0.04, p.cz); group.add(tr); }
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]]) { const x = p.cx + sx * (lx / 2 + 2), z = p.cz + sz * (lz / 2 + 2); M.box(x, 7, z, 0.35, 14, 0.35, color('#9a9da2')); lamps.push({ x, y: 14, z, c: '#ffffff', s: 4.5 }); }
      occupy(p.cx - lx / 2 - 4, p.cx + lx / 2 + 4, p.cz - lz / 2 - 4, p.cz + lz / 2 + 4);
    } else if (f.type === 'pool') {
      const p = place(f, 26, 50);
      flat({ ...p, lx: p.lx + 8, lz: p.lz + 8 }, '#d9d4c8', 0.05);
      flat(p, null, 0.02, nightMat(new THREE.MeshPhongMaterial({ color: '#3fb2d6', shininess: 90, emissive: color('#2a9fd0'), emissiveIntensity: 0 }), 0.5));
      occupy(p.cx - p.lx / 2 - 4, p.cx + p.lx / 2 + 4, p.cz - p.lz / 2 - 4, p.cz + p.lz / 2 + 4);
    } else if (f.type === 'hall' || f.type === 'rink2' || f.type === 'garage') {
      const p = place(f, f.w ?? 40, f.len ?? 60), h = f.h ?? (f.type === 'garage' ? 9 : 12), k = color(f.color || (f.type === 'garage' ? '#9a9c9f' : '#d9dadc'));
      M.box(p.cx, h / 2, p.cz, p.lx, h, p.lz, k);
      if (f.roof === 'gable') {
        const r = f.rise ?? 4, rc = color(f.solar ? '#2c3a52' : f.roofColor || '#7e8288'), lx2 = p.lx / 2, lz2 = p.lz / 2;
        if (p.along === 'x') { M.quad([p.cx - lx2, h, p.cz - lz2], [p.cx + lx2, h, p.cz - lz2], [p.cx + lx2, h + r, p.cz], [p.cx - lx2, h + r, p.cz], rc); M.quad([p.cx + lx2, h, p.cz + lz2], [p.cx - lx2, h, p.cz + lz2], [p.cx - lx2, h + r, p.cz], [p.cx + lx2, h + r, p.cz], rc.clone().multiplyScalar(0.9)); for (const sx of [-1, 1]) M.tri([p.cx + sx * lx2, h, p.cz - lz2], [p.cx + sx * lx2, h, p.cz + lz2], [p.cx + sx * lx2, h + r, p.cz], k); }
        else { M.quad([p.cx - lx2, h, p.cz - lz2], [p.cx - lx2, h, p.cz + lz2], [p.cx, h + r, p.cz + lz2], [p.cx, h + r, p.cz - lz2], rc); M.quad([p.cx + lx2, h, p.cz + lz2], [p.cx + lx2, h, p.cz - lz2], [p.cx, h + r, p.cz - lz2], [p.cx, h + r, p.cz + lz2], rc.clone().multiplyScalar(0.9)); for (const sz of [-1, 1]) M.tri([p.cx - lx2, h, p.cz + sz * lz2], [p.cx + lx2, h, p.cz + sz * lz2], [p.cx, h + r, p.cz + sz * lz2], k); }
      } else if (f.top) M.box(p.cx, h + 0.1, p.cz, p.lx - 1, 0.2, p.lz - 1, color(f.top));
      if (f.type !== 'garage') buildingWindows(p.cx, p.cz, p.lx, p.lz, h, 0, 0.3);
      occupy(p.cx - p.lx / 2, p.cx + p.lx / 2, p.cz - p.lz / 2, p.cz + p.lz / 2);
    } else if (f.type === 'tower') {
      // Torre alta e stretta con finestre a nastro, che si allarga verso l'alto (Zugo, Park Tower).
      const w = f.w ?? 26, d = f.d ?? 24, h = f.h ?? 80, p = place(f, w, d), geo = new THREE.BoxGeometry(p.lx, h, p.lz), pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0 && pos.getX(i) * (f.leanDir ?? 1) > 0) pos.setX(i, pos.getX(i) + (f.lean ?? 8) * (f.leanDir ?? 1));
      geo.computeVertexNormals();
      const tt = towerTextures(A.team + (f.offset ?? 0), f.tint), tm = nightMat(new THREE.MeshLambertMaterial({ map: tt.day, emissiveMap: tt.night, emissive: color('#ffffff'), emissiveIntensity: 0 }), 1);
      const tower = new THREE.Mesh(geo, tm); tower.position.set(p.cx, h / 2, p.cz); group.add(tower);
      occupy(p.cx - p.lx / 2 - 4, p.cx + p.lx / 2 + 4, p.cz - p.lz / 2 - 4, p.cz + p.lz / 2 + 4);
    } else if (f.type === 'walkers') {
      // Pedoni che attraversano un piazzale verso l'arena e ritornano (camminano in fila sparsa, a velocità diverse), vestiti
      // con i colori della squadra di casa più qualche colore neutro. `y`: quota del piano su cui camminano (es. il cortile rialzato).
      const p = place(f, f.w ?? 30, f.len ?? 80), L = p.along === 'x' ? p.lx : p.lz, W = p.along === 'x' ? p.lz : p.lx, toArena = f.side === 'south' || f.side === 'east' ? -1 : 1;
      for (let k = 0; k < (f.n ?? 40); k++) {
        const s0 = (rand() - 0.5) * L * 0.9, dir = rand() < 0.75 ? toArena : -toArena, drift = (rand() - 0.5) * 6;
        const TH = TEAMS[A.team], cols = f.colors || [TH.primary, TH.secondary, TH.accent, TH.extra, '#2b2e33', '#7a7f86', '#3a4f7a', '#5a4a3c'].filter(Boolean);
        movers.push({ kind: 'walker', len: W, y: f.y ?? 0, speed: 1.1 + rand() * 0.6, phase: rand() * W, color: pick3(rand, cols),
          path: u => { const o = dir > 0 ? u - W / 2 : W / 2 - u, [x, z] = along(p, s0 + drift * (u / W), o); return [x, z, p.along === 'x' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2)]; } });
      }
    } else if (f.type === 'trees') {
      // Filare di alberi giovani su un piazzale (Friburgo), con la loro aiuola.
      const p = place(f, 4, f.len ?? 80), L = p.along === 'x' ? p.lx : p.lz, n = f.n ?? 8;
      for (let k = 0; k < n; k++) { const [x, z] = along(p, -L / 2 + (k + 0.5) * L / n, 0); treeSpots.push([x, z, f.h ?? 9, 0, false]); M.box(x, 0.08, z, 2.4, 0.16, 2.4, color('#7a6a52')); }
    } else if (f.type === 'terrace') {
      // Terrazza rialzata in cemento con una scalinata larga verso il piazzale (`stairs`: lato da cui si scende) e parapetto.
      const p = place(f, f.w ?? 24, f.len ?? 40), h = f.h ?? 3, conc = color(f.color || '#cfcdc7');
      M.box(p.cx, h / 2, p.cz, p.lx, h, p.lz, conc); M.box(p.cx, h + 0.02, p.cz, p.lx - 0.6, 0.04, p.lz - 0.6, color('#bdbab2'));
      const st = f.stairs || 'south', n = Math.round(h / 0.17), run = 0.33, sw = f.stairW ?? 12, so = f.stairAt ?? 0;
      for (let k = 0; k < n; k++) {
        const y = h * (n - k) / n, d = (k + 0.5) * run;
        if (st === 'south') M.box(p.cx + so, y / 2, p.cz + p.lz / 2 + d, sw, y, run + 0.02, conc);
        else if (st === 'north') M.box(p.cx + so, y / 2, p.cz - p.lz / 2 - d, sw, y, run + 0.02, conc);
        else if (st === 'east') M.box(p.cx + p.lx / 2 + d, y / 2, p.cz + so, run + 0.02, y, sw, conc);
        else M.box(p.cx - p.lx / 2 - d, y / 2, p.cz + so, run + 0.02, y, sw, conc);
      }
      const rail = color('#e1dfda'); for (const [a, b] of [[[p.cx - p.lx / 2, p.cz - p.lz / 2], [p.cx + p.lx / 2, p.cz - p.lz / 2]], [[p.cx - p.lx / 2, p.cz + p.lz / 2], [p.cx + p.lx / 2, p.cz + p.lz / 2]], [[p.cx - p.lx / 2, p.cz - p.lz / 2], [p.cx - p.lx / 2, p.cz + p.lz / 2]], [[p.cx + p.lx / 2, p.cz - p.lz / 2], [p.cx + p.lx / 2, p.cz + p.lz / 2]]]) M.box((a[0] + b[0]) / 2, h + 0.55, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) + 0.25, 1.1, Math.abs(b[1] - a[1]) + 0.25, rail);
      for (const [x, z] of [[p.cx - p.lx / 2 + 2, p.cz], [p.cx + p.lx / 2 - 2, p.cz]]) lampAt(x, z, h + 4);
      occupy(p.cx - p.lx / 2, p.cx + p.lx / 2, p.cz - p.lz / 2 - 6, p.cz + p.lz / 2 + 6);
    } else if (f.type === 'plaza') {
      // Piazzale pavimentato o percorso pedonale (anche colorato, es. la passerella rossa di Lugano), con lampioni bassi.
      const p = place(f, f.w ?? 20, f.len ?? 40);
      flat(p, f.color || '#c9c5bc', f.y ?? 0.05);
      const L = p.along === 'x' ? p.lx : p.lz; for (let u = -L / 2 + 4; u < L / 2; u += f.lampEvery ?? 12) { const [x, z] = along(p, u, (p.along === 'x' ? p.lz : p.lx) / 2 - 1); M.box(x, 2, z, 0.15, 4, 0.15, color('#6b6f75')); lamps.push({ x, y: 4, z, c: f.light || '#fff1d6', s: 1.6 }); pools.push([x, z]); }
      occupy(p.cx - p.lx / 2, p.cx + p.lx / 2, p.cz - p.lz / 2, p.cz + p.lz / 2);
    } else if (f.type === 'gates') {
      // Ingressi controllati: recinzione lungo il piazzale, cancelli con tornelli e piccole casse coperte.
      const p = place(f, 2, f.len ?? 40), L = p.along === 'x' ? p.lx : p.lz, fence = color('#7d8288'), kiosk = color(f.color || '#e8e6e1');
      for (let u = -L / 2; u <= L / 2; u += 2.5) { const [x, z] = along(p, u, 0); M.box(x, 1.1, z, 0.12, 2.2, 0.12, fence); }
      const a0 = along(p, -L / 2, 0), a1 = along(p, L / 2, 0); M.beam([a0[0], 2.1, a0[1]], [a1[0], 2.1, a1[1]], 0.06, fence); M.beam([a0[0], 0.3, a0[1]], [a1[0], 0.3, a1[1]], 0.06, fence);
      for (const u of f.at || [-L / 4, L / 4]) { const [x, z] = along(p, u, 0); M.box(x, 1.4, z, p.along === 'x' ? 6 : 3, 2.8, p.along === 'x' ? 3 : 6, kiosk); M.box(x, 2.95, z, p.along === 'x' ? 7.5 : 4, 0.3, p.along === 'x' ? 4 : 7.5, color('#3b3f45')); lamps.push({ x, y: 3.2, z, c: '#ffffff', s: 2 }); windows.push({ x, y: 1.6, z, c: '#ffe2b5', s: 1.6 }); }
    } else if (f.type === 'ducts') {
      // Condotte di ventilazione argentate addossate a una testata.
      const p = place(f, 3, f.len ?? 20), L = p.along === 'x' ? p.lx : p.lz, mat2 = new THREE.MeshLambertMaterial({ color: '#c9ccd0' });
      for (let k = 0; k < (f.n ?? 4); k++) { const r = f.r ?? 0.4, m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 12), mat2); const [x, z] = along(p, 0, 0); m.position.set(x, (f.y ?? 8) + k * r * 2.6, z); m.rotation.set(p.along === 'x' ? 0 : Math.PI / 2, 0, p.along === 'x' ? Math.PI / 2 : 0); group.add(m); }
    } else if (f.type === 'drum') {
      // Corpo cilindrico basso in cemento (scale e servizi) addossato a un angolo.
      const p = place(f, (f.r ?? 9) * 2, (f.r ?? 9) * 2), m = new THREE.Mesh(new THREE.CylinderGeometry(f.r ?? 9, f.r ?? 9, f.h ?? 10, 32), new THREE.MeshLambertMaterial({ color: f.color || '#d9d6cf' }));
      m.position.set(p.cx, (f.h ?? 10) / 2, p.cz); group.add(m); buildingWindows(p.cx, p.cz, (f.r ?? 9) * 1.4, (f.r ?? 9) * 1.4, f.h ?? 10, 0, 0.3);
      occupy(p.cx - p.lx / 2, p.cx + p.lx / 2, p.cz - p.lz / 2, p.cz + p.lz / 2);
    } else if (f.type === 'trucks') {
      // Camion parcheggiati in fila (regia TV, logistica): motrice e rimorchio, affiancati.
      const p = place(f, 16, f.len ?? 40), L = p.along === 'x' ? p.lx : p.lz, n = f.n ?? 4, cols = f.colors || ['#f2f2f0', '#e8e8e4', '#1f4f9e', '#f2f2f0', '#b8bcc2'];
      for (let i = 0; i < n; i++) {
        const u = -L / 2 + (i + 0.5) * L / n, k = color(cols[i % cols.length]), cab = color(i % 2 ? '#2b2e33' : '#d9dadc');
        const put = (o, len, w, h, c2) => { const [x, z] = along(p, u, o); if (p.along === 'x') M.box(x, h / 2 + 0.5, z, w, h, len, c2); else M.box(x, h / 2 + 0.5, z, len, h, w, c2); };
        put(-1.5, 13, 2.5, 3.6, k); put(6.4, 2.6, 2.5, 2.8, cab);
        const [x, z] = along(p, u, 0); windows.push({ x, y: 2.2, z, c: '#ffe2b5', s: 1 });
      }
      occupy(p.cx - p.lx / 2, p.cx + p.lx / 2, p.cz - p.lz / 2, p.cz + p.lz / 2);
    } else if (f.type === 'silos') {
      // Impianto di betonaggio: silos cilindrici e un nastro inclinato (accanto al Gottardo).
      const p = place(f, 30, 30), g = color('#c9cbcc');
      for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 22 + i * 3, 16), new THREE.MeshLambertMaterial({ color: g })); m.position.set(p.cx - 8 + i * 5.5, 11 + i * 1.5, p.cz); group.add(m); }
      M.box(p.cx + 4, 30, p.cz, 4, 60, 4, color('#9ea3a8')); M.beam([p.cx + 14, 0.5, p.cz + 18], [p.cx + 2, 14, p.cz + 2], 1.2, color('#7a7f85'));
      lamps.push({ x: p.cx + 4, y: 60, z: p.cz, c: '#ff4a3a', s: 2 });
    } else if (f.type === 'boulders') {
      // Volumi bianchi spigolosi lungo un fianco (Bienne: scale esterne).
      const p = place(f, 10, f.len ?? 160), white = color('#eef0f1');
      const L = p.along === 'x' ? p.lx : p.lz;
      for (let s = -L / 2 + 8, i = 0; s < L / 2; s += 22, i++) { const [x, z] = along(p, s, 0); M.box(x, 2.6, z, 8, 5.2, 6, white, 0.5 + (i % 3) * 0.35, 0.18); M.box(x + 3, 1.2, z + 1, 5, 2.4, 4, white.clone().multiplyScalar(0.92), -0.4, -0.12); }
    } else if (f.type === 'slope') {
      // Versante boscoso che sale vicino all'arena (Ambrì, Langnau, Lugano, Kloten).
      const depth = f.depth ?? 260, width = f.width ?? 1200, angle = f.angle ?? 0.45, d0 = f.dist ?? 40, N = 24;
      const S = new Mesher(), green = color(snow ? '#d9e0e6' : f.color || '#3f5a34');
      const pt = (u, v) => { const out = d0 + v * depth, yy = Math.max(0, (v * depth)) * Math.tan(angle) * (0.85 + 0.15 * Math.sin(u * 9)), s = (u - 0.5) * width; if (f.side === 'north') return [s, yy, Z0 - out]; if (f.side === 'south') return [s, yy, Z1 + out]; if (f.side === 'west') return [X0 - out, yy, s]; return [X1 + out, yy, s]; };
      for (let i = 0; i < N; i++) for (let j = 0; j < 8; j++) S.quad(pt(i / N, j / 8), pt((i + 1) / N, j / 8), pt((i + 1) / N, (j + 1) / 8), pt(i / N, (j + 1) / 8), green.clone().multiplyScalar(0.9 + ((i + j) % 2) * 0.08));
      group.add(S.mesh({ flatShading: true }));
      for (let i = 0; i < (f.trees ?? 500); i++) { const u = rand(), v = 0.02 + rand() * 0.98, q = pt(u, v); treeSpots.push([q[0], q[2], 8 + rand() * 10, q[1], f.conifers ?? true]); }
      if (f.houses) for (let i = 0; i < f.houses; i++) { const q = pt(rand(), 0.15 + rand() * 0.5); M.box(q[0], q[1] + 3, q[2], 8, 6, 7, color('#d8d0c2')); windows.push({ x: q[0], y: q[1] + 3, z: q[2], c: '#ffcf8a', s: 1.6 }); }
    } else if (f.type === 'city' || f.type === 'gardens') {
      const n = f.n ?? 40, spread = f.spread ?? 220;
      const toXZ = (al, out) => f.side === 'north' ? [al, Z0 - out] : f.side === 'south' ? [al, Zs + out] : f.side === 'west' ? [X0 - out, al] : [X1 + out, al];
      const house = (x, z, w, d, h, ry) => {
        M.box(x, h / 2, z, w, h, d, color(pick3(rand, f.palette || ['#d8d3c8', '#c9c4ba', '#b8b4ad', '#e2ddd2', '#a9a59e'])), ry);
        M.box(x, h + 0.4, z, w * 0.96, 0.8, d * 0.96, color(snow ? '#eef2f5' : f.roofColor || '#7c7a76'), ry);
        // Fasce di finestre a ogni piano, così i palazzi si leggono come case e non come blocchi.
        for (let fy = 2; fy < h - 1.5; fy += 3.2) M.box(x, fy, z, w + 0.12, 1.1, d + 0.12, color('#4a535c'), ry);
        buildingWindows(x, z, w, d, h, ry, 0.33);
      };
      if (f.type === 'gardens' && f.plots) {
        // Orti urbani (Zurigo-Altstetten): parcelle ordinate tra vialetti di ghiaia, ognuna con la sua casetta colorata,
        // aiuole a strisce, qualche albero da frutto e le siepi basse; di sera qualche lanterna.
        const p = place(f, f.depth ?? 120, f.len ?? 260), cw = 13, cd = 11, G = new Mesher(), gravel = color('#b8ae98');
        flat(p, null, 0.03, new THREE.MeshLambertMaterial({ color: gravel }));
        const huts = ['#c96f4a', '#e7d9b8', '#7fa0b8', '#9bb27a', '#d8c25a', '#b5523f', '#f0ece4', '#6f5a45'], beds = ['#6e4e33', '#7d5a3a', '#5f7f3e', '#7aa04c', '#8fb35a'];
        for (let a = -p.lx / 2 + cw / 2; a < p.lx / 2 - cw / 2; a += cw) for (let b = -p.lz / 2 + cd / 2; b < p.lz / 2 - cd / 2; b += cd) {
          const x = p.cx + a, z = p.cz + b;
          if (occupied.some(r => x + cw / 2 > r[0] && x - cw / 2 < r[1] && z + cd / 2 > r[2] && z - cd / 2 < r[3])) continue;
          if (rand() < 0.06) { for (let i = 0; i < 3; i++) treeSpots.push([x + (rand() - 0.5) * 8, z + (rand() - 0.5) * 6, 7 + rand() * 5, 0, false]); continue; }
          const w = cw - 1.6, d = cd - 1.6;
          G.quad([x - w / 2, 0.05, z - d / 2], [x + w / 2, 0.05, z - d / 2], [x + w / 2, 0.05, z + d / 2], [x - w / 2, 0.05, z + d / 2], color(pick3(rand, ['#6f9a4c', '#7ea455', '#88ab5e'])));
          for (let k = 0; k < 4; k++) { const bx = x - w / 2 + 1 + k * 1.6; G.quad([bx, 0.08, z - d / 2 + 1], [bx + 1.1, 0.08, z - d / 2 + 1], [bx + 1.1, 0.08, z + 1], [bx, 0.08, z + 1], color(pick3(rand, beds))); }
          const hx = x + w / 2 - 2.2, hz = z + (rand() - 0.5) * (d - 4), hk = color(pick3(rand, huts));
          G.box(hx, 1.1, hz, 2.8, 2.2, 2.4, hk); G.box(hx, 2.3, hz, 3.3, 0.25, 2.9, color(pick3(rand, ['#5a5550', '#7c3b2a', '#3e4a52'])), 0, rand() < 0.5 ? 0.1 : -0.1);
          if (rand() < 0.5) G.box(x, 0.35, z + d / 2, w, 0.7, 0.35, color('#4f7a3a'));
          if (rand() < 0.45) treeSpots.push([x - w / 4, z - d / 4 + rand() * d / 2, 4 + rand() * 3, 0, false]);
          if (rand() < 0.12) windows.push({ x: hx, y: 1.5, z: hz + 1.25, c: '#ffcf8a', s: 1.1 });
        }
        group.add(G.mesh());
        occupy(p.cx - p.lx / 2, p.cx + p.lx / 2, p.cz - p.lz / 2, p.cz + p.lz / 2);
        continue;
      }
      if (f.grid) {
        // Città fitta: isolati su una griglia di strade, un palazzo per isolato (a volte due), poche aree vuote.
        const cell = f.grid, street = f.street ?? 7, S2 = new Mesher(), asphalt = color('#56585c');
        for (let al = -spread; al < spread; al += cell) for (let out = f.dist ?? 40; out < (f.dist ?? 40) + (f.depth ?? 160); out += cell) {
          const [x, z] = toXZ(al + cell / 2, out + cell / 2);
          if (occupied.some(r => x + cell / 2 > r[0] && x - cell / 2 < r[1] && z + cell / 2 > r[2] && z - cell / 2 < r[3])) continue;
          S2.quad([x - cell / 2, 0.08, z - cell / 2], [x + cell / 2, 0.08, z - cell / 2], [x + cell / 2, 0.08, z + cell / 2], [x - cell / 2, 0.08, z + cell / 2], asphalt);
          const inner = cell - street;
          S2.quad([x - inner / 2, 0.1, z - inner / 2], [x + inner / 2, 0.1, z - inner / 2], [x + inner / 2, 0.1, z + inner / 2], [x - inner / 2, 0.1, z + inner / 2], color('#a3a199'));
          if (rand() < (f.empty ?? 0.08)) { for (let i = 0; i < 4; i++) treeSpots.push([x + (rand() - 0.5) * inner * 0.7, z + (rand() - 0.5) * inner * 0.7, 7 + rand() * 5, 0, false]); continue; }
          const h = 9 + rand() * (f.height ?? 22);
          if (rand() < 0.35) { const w2 = inner * 0.46; house(x - inner / 4, z, w2, inner * (0.7 + rand() * 0.25), h, 0); house(x + inner / 4, z, w2, inner * (0.7 + rand() * 0.25), 9 + rand() * (f.height ?? 22), 0); }
          else house(x, z, inner * (0.78 + rand() * 0.2), inner * (0.78 + rand() * 0.2), h, 0);
          lampAt(x + cell / 2 - street / 2, z + cell / 2 - street / 2, 7);
          occupy(x - cell / 2, x + cell / 2, z - cell / 2, z + cell / 2);
        }
        group.add(S2.mesh());
        continue;
      }
      for (let i = 0; i < n; i++) {
        const [x, z] = toXZ((rand() - 0.5) * spread * 2, (f.dist ?? 40) + rand() * (f.depth ?? 160));
        if (occupied.some(r => x > r[0] - 8 && x < r[1] + 8 && z > r[2] - 8 && z < r[3] + 8)) continue;
        if (f.type === 'gardens') { M.box(x, 0.05, z, 8 + rand() * 6, 0.1, 6 + rand() * 5, color(pick3(rand, ['#6f9a4c', '#8bab5a', '#a58a5c', '#5f8a45']))); if (rand() < 0.15) windows.push({ x, y: 2, z, c: '#ffcf8a', s: 1.2 }); continue; }
        const w = 12 + rand() * 18, d = 12 + rand() * 18, h = 8 + rand() * (f.height ?? 22), ry = rand() * 0.3;
        house(x, z, w, d, h, ry);
        if (rand() < 0.4) lampAt(x + w / 2 + 4, z + d / 2 + 4, 7);
        occupy(x - w / 2, x + w / 2, z - d / 2, z + d / 2);
      }
    }
  }
  // Prati: riquadri di verde diversi, con qualche campo falciato e i bordi più scuri, invece di un piano unico.
  if (E.meadows) {
    const F = new Mesher(), pal = (snow ? ['#e4e9ee', '#dde3e9', '#eef1f4'] : ['#6f8f4f', '#7a9a56', '#86a45c', '#68874a', '#91ab63', '#7c9150', '#a3a66a']).map(color);
    const R = E.meadows.r ?? 520, cell = E.meadows.cell ?? 46;
    for (let x = -R; x < R; x += cell) for (let z = -R; z < R; z += cell) {
      const w = cell - 2, d = cell - 2, cx = x + cell / 2, cz = z + cell / 2;
      if (occupied.some(q => cx + w / 2 > q[0] && cx - w / 2 < q[1] && cz + d / 2 > q[2] && cz - d / 2 < q[3])) continue;
      if (Math.hypot(cx, cz) > R * (0.65 + rand() * 0.35)) continue;
      const k = pick3(rand, pal), y = 0.04, q = (a, b, c2, dd, col, yy) => F.quad([a, yy, b], [c2, yy, b], [c2, yy, dd], [a, yy, dd], col);
      q(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, k, y);
      if (!snow && rand() < 0.35) for (let s2 = -w / 2 + 1; s2 < w / 2 - 1.5; s2 += 3.2) q(cx + s2, cz - d / 2 + 1, cx + s2 + 1.4, cz + d / 2 - 1, k.clone().multiplyScalar(1.1), y + 0.03);
      if (rand() < 0.18) for (let i = 0; i < 6; i++) treeSpots.push([cx - w / 2 + rand() * w, cz + d / 2, 7 + rand() * 6, 0, rand() < 0.5]);
    }
    group.add(F.mesh());
  }
  movers.push(...extraTrain);
  if (!M.empty) group.add(M.mesh());
  if (movers.length) {
    // Una InstancedMesh per tipo; le posizioni si ricalcolano prima di ogni disegno dal tempo della vista.
    const SIZE = { train: [3, 3.9, 25.5, 2.35], car: [1.9, 1.4, 4.4, 0.75], truck: [2.5, 3.6, 13, 2.1], bus: [2.5, 3.1, 12, 1.85], walker: [0.5, 1.7, 0.35, 0.85] };
    const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v3 = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), kc = new THREE.Color();
    for (const kind of Object.keys(SIZE)) {
      const list = movers.filter(m => m.kind === kind); if (!list.length) continue;
      const [sx, sy, sz, y] = SIZE[kind], inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), list.length);
      list.forEach((m, i) => inst.setColorAt(i, kc.set(m.color)));
      const place2 = () => { list.forEach((m, i) => { const u = ((m.phase + time.value * m.speed) % m.len + m.len) % m.len, [x, z, yaw] = m.path(u); q4.setFromAxisAngle(up, yaw); m4.compose(v3.set(x, y + (m.y || 0) + (kind === 'walker' ? Math.abs(Math.sin(u * 3)) * 0.06 : 0), z), q4, sc.set(sx, sy, sz)); inst.setMatrixAt(i, m4); }); inst.instanceMatrix.needsUpdate = true; };
      place2(); inst.frustumCulled = false; inst.onBeforeRender = place2; group.add(inst);
      if (kind === 'truck') { const cabs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: '#2b2e33' }), list.length); const placeC = () => { list.forEach((m, i) => { const u = ((m.phase + time.value * m.speed) % m.len + m.len) % m.len, [x, z, yaw] = m.path(u); q4.setFromAxisAngle(up, yaw); m4.compose(v3.set(x + Math.sin(yaw) * 7.6, 1.6, z + Math.cos(yaw) * 7.6), q4, sc.set(2.4, 2.8, 2.4)); cabs.setMatrixAt(i, m4); }); cabs.instanceMatrix.needsUpdate = true; }; placeC(); cabs.frustumCulled = false; cabs.onBeforeRender = placeC; group.add(cabs); }
    }
  }
  if (cars.length) {
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), cars.length), m = new THREE.Matrix4(), k = new THREE.Color();
    cars.forEach(([x, z, al], i) => { m.compose(new THREE.Vector3(x, 0.75, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), al === 'x' ? Math.PI / 2 : 0), new THREE.Vector3(1.9, 1.4, 4.4)); inst.setMatrixAt(i, m); inst.setColorAt(i, k.set(pick3(rand, ['#e6e6e6', '#202226', '#8b9096', '#b3262c', '#2b4d7a', '#c7c9cc']))); });
    group.add(inst);
  }

  // Alberi: bosco attorno o sparsi, più quelli sui versanti.
  const treeCount = E.trees ?? 160, rMin = Math.max(X1, Z1) + 22, rMax = rMin + (E.forest ? 140 : 260);
  for (let i = 0, tries = 0; i < treeCount && tries < treeCount * 8; tries++) {
    const a = rand() * Math.PI * 2, r = (E.forest ? Math.max(X1, Z1) + 16 : rMin) + Math.pow(rand(), E.forest ? 0.8 : 1.4) * (rMax - rMin), x = Math.cos(a) * r * 1.15, z = Math.sin(a) * r;
    if (occupied.some(q => x > q[0] - 3 && x < q[1] + 3 && z > q[2] - 3 && z < q[3] + 3)) continue;
    treeSpots.push([x, z, 9 + rand() * 12, 0, E.conifers ?? true]); i++;
  }
  if (treeSpots.length) {
    const m = new THREE.Matrix4(), k = new THREE.Color(), q = new THREE.Quaternion(), byKind = [true, false].map(c => treeSpots.filter(t => t[4] === c));
    const tg = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 1, 5), new THREE.MeshLambertMaterial({ color: '#5a4430' }), treeSpots.length);
    treeSpots.forEach(([x, z, h, y], i) => { m.compose(new THREE.Vector3(x, y + h * 0.15, z), q, new THREE.Vector3(1, h * 0.3, 1)); tg.setMatrixAt(i, m); });
    group.add(tg);
    byKind.forEach((list, ci) => {
      if (!list.length) return;
      const conifer = ci === 0, cg = new THREE.InstancedMesh(conifer ? new THREE.ConeGeometry(1, 1, 7) : new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial(), list.length);
      list.forEach(([x, z, h, y], i) => { const v = rand(); m.compose(new THREE.Vector3(x, y + h * (conifer ? 0.6 : 0.62), z), q, conifer ? new THREE.Vector3(h * 0.22, h * 0.8, h * 0.22) : new THREE.Vector3(h * 0.3, h * 0.32, h * 0.3)); cg.setMatrixAt(i, m); cg.setColorAt(i, k.set(snow && v < 0.35 ? '#dfe6ea' : conifer ? (v < 0.5 ? '#2f4f2f' : '#3a5d36') : (v < 0.5 ? '#4f7a3a' : '#5f8a44'))); });
      group.add(cg);
    });
  }

  // Montagne all'orizzonte.
  if (E.mountains) {
    const n = E.mountains, MM = new Mesher();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand() * 0.3, r = (E.mountainDist ?? 520) + rand() * 380, x = Math.cos(a) * r, z = Math.sin(a) * r, h = 140 + rand() * 300, w = Math.min(160 + rand() * 220, r * 0.38);
      const peak = [x, h, z], segs = 7, base = Array.from({ length: segs }, (_, j) => { const b = j / segs * Math.PI * 2; return [x + Math.cos(b) * w, -1, z + Math.sin(b) * w]; });
      const rock = color(rand() < 0.5 ? '#6e7568' : '#7d8273'), snowC = color('#f1f3f4');
      base.forEach((p, j) => {
        const qq = base[(j + 1) % segs], mid = (s, t) => [s[0] + (t[0] - s[0]) * 0.72, s[1] + (t[1] - s[1]) * 0.72, s[2] + (t[2] - s[2]) * 0.72];
        const p2 = mid(p, peak), q2 = mid(qq, peak);
        MM.quad(p, qq, q2, p2, snow ? snowC.clone().multiplyScalar(0.9) : j % 2 ? rock : rock.clone().multiplyScalar(0.9));
        MM.tri(p2, q2, peak, h > 260 || snow ? snowC : rock.clone().multiplyScalar(1.08));
      });
    }
    group.add(MM.mesh({ flatShading: true }));
  }

  // Luci della notte: finestre, lampioni (con le pozze di luce a terra).
  if (windows.length) group.add(glowPoints(windows, glow, time));
  if (lamps.length) {
    group.add(glowPoints(lamps, glow, time));
    const poolMat = nightMat(new THREE.MeshBasicMaterial({ map: radialTexture(), color: '#ffcf96', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }), 0.42, 'opacity');
    const inst = new THREE.InstancedMesh(new THREE.PlaneGeometry(16, 16).rotateX(-Math.PI / 2), poolMat, pools.length), m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    pools.forEach(([x, z], i) => { m.compose(new THREE.Vector3(x, 0.2, z), q, one); inst.setMatrixAt(i, m); });
    inst.frustumCulled = false; inst.renderOrder = 2; group.add(inst);
  }

  return { group, roof, facade, height: top, footprint: fp, night, sky: { uniforms: skyU } };
}
