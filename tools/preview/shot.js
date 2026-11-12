// Captura de la app exportada para web, con un GPS simulado. Ver README.
//
// Uso: DIST=<carpeta exportada> node shot.js <salida.png> <ancho> <alto> [ruta] [espera_ms]
//   SPEED=<km/h>          velocidad del recorrido simulado (0 = parado)
//   SWITCH=1              toca "cambiar de vehículo" antes de capturar
//   CLICK=<selector CSS>  toca ese elemento antes de capturar
//   La ruta "/?wid=1" hace que las lecturas simuladas lleguen de forma continua.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const DIST = process.env.DIST;
const [out, w, h, route = '/', wait = '2500'] = process.argv.slice(2);
const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.ttf': 'font/ttf', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  let f = path.join(DIST, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, 'index.html');
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
server.listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: +w, height: +h },
    deviceScaleFactor: 2,
    permissions: ['geolocation'],
    geolocation: { latitude: -2.9006, longitude: -79.0045, accuracy: 5 },
  });
  const page = await ctx.newPage();
  // Conducción simulada: sustituye el GPS del navegador por un recorrido a
  // velocidad conocida (SPEED en km/h) rumbo al noreste.
  const kmh = +(process.env.SPEED || 0);
  await page.addInitScript((kmh) => {
    let lat = -2.9006, lon = -79.0045, n = 0, n0 = +(new URLSearchParams(location.search).get("wid") || 1); const timers = {};
    const v = kmh / 3.6;
    const fix = () => {
      n++;
      lat += (v * 0.7) / 111132; lon += (v * 0.7) / 111320;
      return { coords: { latitude: lat, longitude: lon, altitude: 2560, accuracy: 5, altitudeAccuracy: 3, speed: v, heading: 45 }, timestamp: Date.now() };
    };
    const geo = {
      getCurrentPosition: (ok) => ok(fix()),
      // Los navegadores numeran las suscripciones 1, 2, 3…; expo-location cuenta con eso.
      watchPosition: (ok) => { const id = ++n0; timers[id] = setInterval(() => ok(fix()), 1000); setTimeout(() => ok(fix()), 0); return id; },
      clearWatch: (id) => clearInterval(timers[id]),
    };
    Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
  }, kmh);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('console', (m) => { if (m.text().startsWith('DBG')) console.log(m.text()); });
  await page.goto(`http://127.0.0.1:${port}${route}`);
  await page.waitForTimeout(+wait);
  if (process.env.SWITCH) {
    await page.locator('[aria-label^="Cambiar de vehículo"]').first().click();
    await page.waitForTimeout(+(process.env.SWITCH_WAIT || 3600));
  }
  if (process.env.CLICK) {
    await page.locator(process.env.CLICK).first().click();
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: out });
  if (errors.length) console.log('ERRORES:\n' + [...new Set(errors)].slice(0, 8).join('\n'));
  await browser.close();
  server.close();
});
