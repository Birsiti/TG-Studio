// Ad-hoc helper for the temporary GitHub Pages preview only.
// tg-studio.by will eventually be served from the domain root (Netlify),
// so the site is built with root-relative paths ("/mini-apps",
// "/assets/..."). GitHub Pages serves this repo at
// https://birsiti.github.io/TG-Studio/, i.e. under a /TG-Studio subpath,
// so every root-relative href/src/srcset in the already-built dist/ HTML
// needs that prefix. This never touches src/ or the real (Netlify) build —
// it only rewrites a throwaway copy of dist/ made for the GH Pages preview.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2];
const dir = process.argv[3];
if (!BASE || !dir) {
  console.error('usage: node gh-pages-prefix.mjs /TG-Studio <dir>');
  process.exit(1);
}

function walk(d) {
  for (const entry of readdirSync(d)) {
    const p = path.join(d, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.html')) rewrite(p);
  }
}

function rewrite(file) {
  let html = readFileSync(file, 'utf-8');
  html = html.replace(/srcset="([^"]+)"/g, (_, val) =>
    `srcset="${val
      .split(',')
      .map(part => {
        const trimmed = part.trim();
        return trimmed.startsWith('/') ? BASE + trimmed : trimmed;
      })
      .join(', ')}"`
  );
  html = html.replace(/(href|src|action)="\/(?!\/)/g, `$1="${BASE}/`);
  writeFileSync(file, html);
}

walk(dir);
console.log(`Rewrote root-relative paths to ${BASE}/ under ${dir}`);
