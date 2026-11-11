#!/usr/bin/env node
/**
 * Vista previa del velocímetro sin necesidad del teléfono.
 *
 * Dibuja el dial en un HTML usando la MISMA geometría que el componente
 * (`src/utils/gauge.ts`) y la misma escala de color (`src/theme/theme.ts`), a
 * varias velocidades. Sirve para comprobar de un vistazo que el arco arranca
 * abajo a la izquierda, que las marcas se encienden hasta la velocidad y que
 * la lectura central no invade las cifras del dial.
 *
 *   npm run preview:gauge   →   abre el archivo que imprime en cualquier navegador
 */
const fs = require('fs');
const path = require('path');

const BUILD = path.join(__dirname, '..', '.sim-build');
const OUT = path.join(__dirname, '..', '.sim-build', 'gauge-preview.html');

const {
  gaugeDegFor,
  polar,
  arcPath,
  GAUGE_START_DEG: START,
  GAUGE_SWEEP_DEG: SWEEP,
} = require(path.join(BUILD, 'utils/gauge.js'));
const { speedColor } = require(path.join(BUILD, 'theme/theme.js'));

const C = {
  band: '#1C1C1F',
  border: 'rgba(255,255,255,0.07)',
  text: '#F5F5F7',
  muted: '#8E8E93',
  danger: '#FF2D46',
};

// Misma construcción que src/components/Speedometer.tsx.
function gauge(value, { max = 200, size = 320, vehicleTop = 187, limit = 50, peak = 0, overLimit = false }) {
  const cx = size / 2;
  const cy = size / 2;
  const band = size * 0.075;
  const rBand = size / 2 - band / 2 - size * 0.02;
  const rInner = rBand - band / 2;
  const rOuter = rBand + band / 2;
  const majorStep = max <= 260 ? 20 : 40;
  const tint = overLimit ? C.danger : speedColor(value);
  const moving = value > 0.5;
  const deg = (v) => gaugeDegFor(v, max);

  let ticks = '';
  let nums = '';
  for (let v = 0; v <= max + 0.001; v += majorStep / 4) {
    const major = Math.abs(v % majorStep) < 0.001;
    const largo = major ? band * 0.62 : band * 0.36;
    const a = polar(cx, cy, rOuter - band * 0.18, deg(v));
    const b = polar(cx, cy, rOuter - band * 0.18 - largo, deg(v));
    const past = moving && v <= value + 0.01;
    ticks += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${past ? tint : C.muted}" stroke-opacity="${past ? 1 : major ? 0.75 : 0.4}" stroke-width="${major ? 2 : 1.2}" stroke-linecap="round"/>`;
    if (major) {
      const n = polar(cx, cy, rInner - size * 0.055, deg(v));
      nums += `<text x="${n.x}" y="${n.y + size * 0.014}" fill="${past ? C.text : C.muted}" font-size="${size * 0.04}" text-anchor="middle" font-family="Chakra Petch">${Math.round(v)}</text>`;
    }
  }
  const la = polar(cx, cy, rOuter + 3, deg(limit));
  const lb = polar(cx, cy, rInner - 3, deg(limit));
  const pk = polar(cx, cy, rOuter + size * 0.018, deg(peak));

  return `<div class="cell"><div class="gauge" style="width:${size}px;height:${size}px">
<svg width="${size}" height="${size}">
 <path d="${arcPath(cx, cy, rBand, START, START + SWEEP)}" stroke="${C.band}" stroke-width="${band}" fill="none"/>
 <path d="${arcPath(cx, cy, rOuter + 1, START, START + SWEEP)}" stroke="${C.border}" stroke-width="1" fill="none"/>
 <path d="${arcPath(cx, cy, rOuter - 1.5, deg(vehicleTop), START + SWEEP)}" stroke="${C.danger}" stroke-opacity="0.7" stroke-width="2" fill="none"/>
 ${ticks}${nums}
 ${moving ? `<path d="${arcPath(cx, cy, rInner + 1.5, START, deg(value))}" stroke="${tint}" stroke-width="3" stroke-linecap="round" fill="none"/>` : ''}
 <line x1="${la.x}" y1="${la.y}" x2="${lb.x}" y2="${lb.y}" stroke="${C.danger}" stroke-width="2.5" stroke-linecap="round"/>
 ${peak > 0.5 ? `<circle cx="${pk.x}" cy="${pk.y}" r="${size * 0.009}" fill="${C.text}"/>` : ''}
</svg>
<div class="overlay">
 <div style="font-size:${size * 0.042}px;color:${overLimit ? C.danger : C.muted}">${overLimit ? 'límite ' + limit : 'velocidad'}</div>
 <div class="value" style="font-size:${size * 0.27}px;color:${overLimit ? C.danger : C.text}">${Math.round(value)}</div>
 <div style="font-size:${size * 0.045}px;color:${C.muted}">km/h</div>
</div></div><div class="label">${value} km/h${overLimit ? ' · sobre el límite' : ''}</div></div>`;
}

const cells = [
  gauge(0, { peak: 0 }),
  gauge(38, { peak: 47 }),
  gauge(88, { peak: 92, overLimit: true }),
  gauge(165, { peak: 171, overLimit: true }),
];

fs.writeFileSync(
  OUT,
  `<!doctype html><meta charset="utf-8"><title>Velocímetro · vista previa</title>
<link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500&display=swap" rel="stylesheet"><style>
*{margin:0;box-sizing:border-box}
body{background:#0A0A0B;font-family:system-ui,-apple-system,sans-serif;padding:28px;
     display:grid;grid-template-columns:1fr 1fr;gap:24px;width:800px}
.cell{display:flex;flex-direction:column;align-items:center;gap:8px}
.gauge{position:relative}
.overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.value{text-align:center;font-family:'Chakra Petch';font-weight:500;letter-spacing:-1px;line-height:1.1}
.label{color:#4A4A50;font-size:12px;font-family:Menlo,monospace}
</style>${cells.join('')}`
);

console.log(`Vista previa escrita en:\n  ${OUT}\nÁbrela en cualquier navegador.`);
