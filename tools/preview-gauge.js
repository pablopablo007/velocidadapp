#!/usr/bin/env node
/**
 * Vista previa del velocímetro sin necesidad del teléfono.
 *
 * Dibuja el dial en un HTML usando la MISMA geometría que el componente
 * (`src/utils/gauge.ts`) y la misma escala de color (`src/theme/theme.ts`), a
 * varias velocidades. Sirve para comprobar de un vistazo que la aguja apunta
 * donde debe y que la lectura central no invade las cifras del dial: los dos
 * fallos que tuvo esta pantalla.
 *
 *   npm run preview:gauge   →   abre el archivo que imprime en cualquier navegador
 */
const fs = require('fs');
const path = require('path');

const BUILD = path.join(__dirname, '..', '.sim-build');
const OUT = path.join(__dirname, '..', '.sim-build', 'gauge-preview.html');

const {
  gaugeDegFor,
  gaugeArcLength,
  polar,
  arcPath,
  GAUGE_START_DEG: START,
  GAUGE_SWEEP_DEG: SWEEP,
  GAUGE_UP_DEG: UP,
} = require(path.join(BUILD, 'utils/gauge.js'));
const { speedColor, SPEED_GRADIENT } = require(path.join(BUILD, 'theme/theme.js'));

const C = {
  track: 'rgba(255,255,255,0.08)',
  border: 'rgba(255,255,255,0.10)',
  text: '#FFFFFF',
  textFaint: '#5C5C66',
  danger: '#FF2D3A',
  amber: '#FFC21A',
};

function gauge(value, { max = 200, size = 320, vehicleTop = 187, limit = 100, peak = 0, overLimit = false }) {
  const cx = size / 2;
  const cy = size / 2;
  const stroke = size * 0.058;
  const radius = cx - stroke / 2 - size * 0.085;
  const arcLen = gaugeArcLength(radius);
  const ratio = value / max;
  const off = arcLen * (1 - ratio);
  const track = arcPath(cx, cy, radius, START, START + SWEEP);
  const tint = overLimit ? C.danger : speedColor(value);
  const deg = gaugeDegFor(value, max);
  const rot = (v) => `rotate(${gaugeDegFor(v, max) - UP}, ${cx}, ${cy})`;
  const p = polar(cx, cy, radius, deg);
  const nIn = radius * 0.6;
  const nOut = radius - stroke * 0.85;
  const majorStep = max <= 120 ? 20 : max <= 260 ? 40 : 60;

  let ticks = '';
  for (let v = 0; v <= max + 0.001; v += majorStep / 4) {
    const d = gaugeDegFor(v, max);
    const major = Math.abs(v % majorStep) < 0.001;
    const rO = radius - stroke * 0.62;
    const rI = rO - (major ? size * 0.036 : size * 0.016);
    const a = polar(cx, cy, rO, d);
    const b = polar(cx, cy, rI, d);
    const lb = polar(cx, cy, rI - size * 0.038, d);
    const past = v <= value;
    ticks += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${major ? C.text : C.textFaint}" stroke-opacity="${major ? (past ? 0.95 : 0.55) : past ? 0.6 : 0.3}" stroke-width="${major ? 2.4 : 1.2}" stroke-linecap="round"/>`;
    if (major) {
      ticks += `<text x="${lb.x}" y="${lb.y + size * 0.017}" fill="${past ? C.text : C.textFaint}" font-size="${size * 0.047}" font-weight="700" text-anchor="middle" font-family="system-ui">${Math.round(v)}</text>`;
    }
  }

  const glow =
    ratio > 0.01
      ? [
          [stroke * 2.4, 0.1],
          [stroke * 1.7, 0.16],
        ]
          .map(
            ([w, o]) =>
              `<path d="${track}" stroke="${tint}" stroke-opacity="${o}" stroke-width="${w}" stroke-linecap="round" fill="none" stroke-dasharray="${arcLen} ${arcLen}" stroke-dashoffset="${off}"/>`
          )
          .join('')
      : '';

  const id = `g${Math.round(value)}`;
  return `<div class="cell"><div class="gauge" style="width:${size}px;height:${size}px">
<svg width="${size}" height="${size}">
 <defs>
  <linearGradient id="arc${id}" x1="0" y1="0.5" x2="1" y2="0.5">
   ${SPEED_GRADIENT.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>
  <radialGradient id="core${id}" cx="50%" cy="50%" r="50%">
   <stop offset="0" stop-color="${tint}" stop-opacity="${overLimit ? 0.15 : 0.3}"/>
   <stop offset="0.55" stop-color="${tint}" stop-opacity="${overLimit ? 0.05 : 0.09}"/>
   <stop offset="1" stop-color="${tint}" stop-opacity="0"/></radialGradient>
 </defs>
 <circle cx="${cx}" cy="${cy}" r="${radius * 0.92}" fill="url(#core${id})"/>
 <path d="${arcPath(cx, cy, radius + stroke * 0.78, START, START + SWEEP)}" stroke="${C.border}" stroke-width="1" fill="none"/>
 <path d="${track}" stroke="${C.track}" stroke-width="${stroke}" stroke-linecap="round" fill="none"/>
 <path d="${arcPath(cx, cy, radius, gaugeDegFor(vehicleTop, max), START + SWEEP)}" stroke="${C.danger}" stroke-opacity="0.3" stroke-width="${stroke}" fill="none"/>
 ${glow}
 <path d="${track}" stroke="url(#arc${id})" stroke-width="${stroke}" stroke-linecap="round" fill="none" stroke-dasharray="${arcLen} ${arcLen}" stroke-dashoffset="${off}"/>
 ${overLimit ? `<path d="${arcPath(cx, cy, radius + stroke * 0.78, START, START + SWEEP)}" stroke="${C.danger}" stroke-opacity="0.55" stroke-width="2.5" fill="none"/>` : ''}
 ${ticks}
 <g transform="${rot(limit)}"><polygon points="${cx},${cy - radius - stroke * 0.52} ${cx - size * 0.021},${cy - radius - stroke * 0.52 - size * 0.032} ${cx + size * 0.021},${cy - radius - stroke * 0.52 - size * 0.032}" fill="${C.amber}"/></g>
 ${peak > 0 ? `<g transform="${rot(peak)}"><line x1="${cx}" y1="${cy - radius - stroke * 0.55}" x2="${cx}" y2="${cy - radius + stroke * 0.55}" stroke="#fff" stroke-opacity="0.9" stroke-width="3" stroke-linecap="round"/></g>` : ''}
 <g transform="rotate(${deg - UP}, ${cx}, ${cy})">
  <line x1="${cx}" y1="${cy - nIn}" x2="${cx}" y2="${cy - nOut}" stroke="${tint}" stroke-opacity="0.22" stroke-width="${size * 0.036}" stroke-linecap="round"/>
  <line x1="${cx}" y1="${cy - nIn}" x2="${cx}" y2="${cy - nOut}" stroke="${tint}" stroke-width="${size * 0.014}" stroke-linecap="round"/>
 </g>
 <circle cx="${p.x}" cy="${p.y}" r="${stroke * 0.62}" fill="${tint}" opacity="0.28"/>
 <circle cx="${p.x}" cy="${p.y}" r="${stroke * 0.3}" fill="#fff" stroke="${tint}" stroke-width="2.5"/>
</svg>
<div class="overlay">
 <div class="value" style="width:${size * 0.4}px;font-size:${size * 0.21}px;color:${overLimit ? C.danger : C.text}">${Math.round(value)}</div>
 <div class="pill" style="border-color:${tint}66;background:${tint}1A"><span style="font-size:${size * 0.034}px;color:${tint}">KM/H</span></div>
</div></div><div class="label">${value} km/h${overLimit ? ' · sobre el límite' : ''}</div></div>`;
}

const cells = [
  gauge(0, { peak: 0 }),
  gauge(47, { peak: 62 }),
  gauge(118, { peak: 118, overLimit: true }),
  gauge(178, { peak: 178, overLimit: true }),
];

fs.writeFileSync(
  OUT,
  `<!doctype html><meta charset="utf-8"><title>Velocímetro · vista previa</title><style>
*{margin:0;box-sizing:border-box}
body{background:#05070B;font-family:system-ui,-apple-system,sans-serif;padding:28px;
     display:grid;grid-template-columns:1fr 1fr;gap:24px;width:800px}
.cell{display:flex;flex-direction:column;align-items:center;gap:8px}
.gauge{position:relative}
.overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.value{text-align:center;font-weight:200;letter-spacing:-2px;font-variant-numeric:tabular-nums;line-height:1}
.pill{border:1px solid;border-radius:999px;padding:2px 10px;margin-top:4px}
.pill span{font-weight:800;letter-spacing:1.5px}
.label{color:#5A6474;font-size:12px;font-family:Menlo,monospace}
</style>${cells.join('')}`
);

console.log(`Vista previa escrita en:\n  ${OUT}\nÁbrela en cualquier navegador.`);
