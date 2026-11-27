#!/usr/bin/env node
/**
 * Genera src/data/bodyMap.json: la figura humana (frente y espalda) con cada grupo
 * muscular como trazados SVG independientes.
 *
 * Los trazados son de react-native-body-highlighter 3.2.0 (MIT, © 2022 ELABBASSI Hicham);
 * su licencia está en src/data/bodyMap.LICENSE. No se instala la librería: solo se leen
 * sus archivos de datos como texto (no se ejecuta nada del paquete).
 *
 * Uso:
 *   npm pack react-native-body-highlighter@3.2.0 && tar -xzf react-native-body-highlighter-3.2.0.tgz
 *   node scripts/build-body-map.mjs ./package
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const pkg = process.argv[2];
if (!pkg) {
  console.error('Uso: node scripts/build-body-map.mjs <carpeta del paquete descomprimido>');
  process.exit(1);
}

/** Lee un archivo de datos del paquete y devuelve [{ slug, paths }] sin evaluarlo. */
function parseAsset(file) {
  const text = readFileSync(join(pkg, 'dist/assets', file), 'utf8');
  const out = [];
  for (const block of text.split(/slug:\s*"/).slice(1)) {
    const slug = block.slice(0, block.indexOf('"'));
    // Los trazados son las cadenas que empiezan por un comando "M"; los colores (#...) se descartan.
    const paths = [...block.matchAll(/"([Mm][^"]+)"/g)].map((m) => m[1].replace(/\s+/g, ' ').trim());
    if (paths.length > 0) out.push({ slug, paths });
  }
  return out;
}

const wrapper = readFileSync(join(pkg, 'dist/components/SvgMaleWrapper.js'), 'utf8');
const outline = (side) => {
  const line = wrapper.split('\n').find((l) => l.includes(`side === "${side}" &&`));
  const d = line?.match(/ d="([^"]+)"/)?.[1];
  if (!d) throw new Error(`No se encontró la silueta "${side}" en el paquete.`);
  return d.replace(/\s+/g, ' ').trim();
};

const data = {
  source: 'react-native-body-highlighter@3.2.0 (MIT)',
  viewBox: { front: '0 0 724 1448', back: '724 0 724 1448' },
  outline: { front: outline('front'), back: outline('back') },
  front: parseAsset('bodyFront.js'),
  back: parseAsset('bodyBack.js'),
};

const target = new URL('../src/data/bodyMap.json', import.meta.url);
writeFileSync(target, `${JSON.stringify(data)}\n`);
writeFileSync(new URL('../src/data/bodyMap.LICENSE', import.meta.url), readFileSync(join(pkg, 'LICENSE'), 'utf8'));
for (const side of ['front', 'back']) {
  console.log(side, data[side].map((m) => `${m.slug}(${m.paths.length})`).join(' '));
}
