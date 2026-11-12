#!/usr/bin/env node
/**
 * Busca, en las animaciones de Reanimated, llamadas a funciones que no son
 * "worklets".
 *
 * Los callbacks de useAnimatedStyle, useAnimatedProps, useDerivedValue,
 * useAnimatedReaction y useFrameCallback corren en el hilo de interfaz. Si
 * llaman a una función normal (por ejemplo, una importada de otro archivo sin
 * la marca 'worklet'), en el iPhone la app se cierra en cuanto se dibuja esa
 * pantalla. En el navegador no falla, así que hay que buscarlo así.
 *
 *   npm run check:worklets
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HOOKS = /\b(useAnimatedStyle|useAnimatedProps|useDerivedValue|useAnimatedReaction|useFrameCallback)\(/g;
// Funciones que sí se pueden llamar desde un worklet.
const ALLOWED = new Set([
  'interpolate', 'interpolateColor', 'withTiming', 'withSpring', 'withDelay', 'withSequence',
  'withRepeat', 'withDecay', 'cancelAnimation', 'scheduleOnRN', 'runOnJS', 'String', 'Number',
  'Boolean', 'if', 'for', 'while', 'switch', 'return', 'typeof',
]);
const KEYWORD_CALL = /(?<![.\w])([A-Za-z_$][\w$]*)\s*\(/g;

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return d.name === 'node_modules' ? [] : files(p);
    return /\.(tsx?|jsx?)$/.test(d.name) ? [p] : [];
  });
}

/** Funciones del proyecto marcadas como worklet: esas sí se pueden llamar. */
function workletNames(all) {
  const names = new Set();
  for (const f of all) {
    const s = fs.readFileSync(f, 'utf8');
    const re = /function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)[^{]*\{\s*['"]worklet['"]/g;
    let m;
    while ((m = re.exec(s))) names.add(m[1]);
  }
  return names;
}

const all = [...files(path.join(ROOT, 'app')), ...files(path.join(ROOT, 'src'))];
const worklets = workletNames(all);
let problems = 0;

for (const f of all) {
  const s = fs.readFileSync(f, 'utf8');
  let m;
  HOOKS.lastIndex = 0;
  while ((m = HOOKS.exec(s))) {
    // Cuerpo del primer argumento: hasta cerrar el paréntesis del hook.
    let i = m.index + m[0].length;
    let depth = 1;
    while (depth && i < s.length) {
      if (s[i] === '(') depth++;
      else if (s[i] === ')') depth--;
      i++;
    }
    const body = s.slice(m.index + m[0].length, i);
    let c;
    KEYWORD_CALL.lastIndex = 0;
    while ((c = KEYWORD_CALL.exec(body))) {
      const name = c[1];
      if (ALLOWED.has(name) || worklets.has(name) || name === 'Math') continue;
      const line = s.slice(0, m.index).split('\n').length;
      console.log(`FALLA ${path.relative(ROOT, f)}:${line} ${m[1]} llama a «${name}», que no es un worklet`);
      problems++;
    }
  }
}

if (problems) {
  console.log(`\n${problems} llamadas que cerrarían la app en el iPhone. Márcalas con 'worklet' o sácalas del callback.`);
  process.exit(1);
}
console.log('Worklets: ninguna llamada a funciones normales desde el hilo de interfaz.');
