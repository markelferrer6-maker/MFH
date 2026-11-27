#!/usr/bin/env node
/**
 * Genera los iconos PNG de la app a partir de public/icon.svg usando Chromium (Playwright).
 * Solo hace falta volver a ejecutarlo si cambia el SVG:  node scripts/make-icons.mjs
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8');
// iOS y los iconos "maskable" recortan las esquinas ellos mismos: fondo cuadrado y dibujo más pequeño.
const square = svg.replace('rx="112"', 'rx="0"');
const padded = (scale) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#0b0d10"/>` +
  `<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${square.replace(/<\/?svg[^>]*>/g, '')}</g></svg>`;

const targets = [
  { file: 'icon-192.png', size: 192, markup: svg, transparent: true },
  { file: 'icon-512.png', size: 512, markup: svg, transparent: true },
  { file: 'icon-512-maskable.png', size: 512, markup: padded(0.78), transparent: false },
  { file: 'apple-touch-icon.png', size: 180, markup: padded(0.9), transparent: false },
];

const browser = await chromium.launch();
for (const t of targets) {
  const page = await browser.newPage({ viewport: { width: t.size, height: t.size }, deviceScaleFactor: 1 });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${t.size}px;height:${t.size}px}</style>${t.markup}`,
  );
  await page.screenshot({ path: new URL(`../public/${t.file}`, import.meta.url).pathname, omitBackground: t.transparent });
  await page.close();
  console.log(`public/${t.file}`);
}
await browser.close();
