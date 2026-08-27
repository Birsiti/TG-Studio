// Runs after `astro build`. Regenerates dist/sitemap.xml from the static
// route list plus every markdown file in the news/keysy content
// collections, so a new article dropped into src/content/news/ shows up in
// the sitemap on the next build without any code changes.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(root, '..');
const SITE_URL = 'https://tg-studio.by';

function frontmatterDate(filePath) {
  const raw = readFileSync(filePath, 'utf-8');
  const match = raw.match(/^date:\s*"?([\d-]+)"?/m);
  return match ? match[1] : null;
}

function collectionSlugs(dir) {
  try {
    return readdirSync(dir)
      .filter(f => f.endsWith('.md'))
      .map(f => ({
        slug: f.replace(/\.md$/, ''),
        date: frontmatterDate(path.join(dir, f)),
      }));
  } catch {
    return [];
  }
}

const staticRoutes = [
  { loc: '/', changefreq: 'weekly', priority: '1.0' },
  { loc: '/mini-apps', changefreq: 'monthly', priority: '0.8' },
  { loc: '/boty', changefreq: 'monthly', priority: '0.8' },
  { loc: '/crm-integracii', changefreq: 'monthly', priority: '0.8' },
  { loc: '/ai-gpt', changefreq: 'monthly', priority: '0.8' },
  { loc: '/novosti', changefreq: 'daily', priority: '0.7' },
];

const keysyRoutes = collectionSlugs(path.join(projectRoot, 'src/content/keysy')).map(({ slug, date }) => ({
  loc: `/keysy/${slug}`,
  changefreq: 'monthly',
  priority: '0.7',
  lastmod: date,
}));

const newsRoutes = collectionSlugs(path.join(projectRoot, 'src/content/news')).map(({ slug, date }) => ({
  loc: `/novosti/${slug}`,
  changefreq: 'monthly',
  priority: '0.6',
  lastmod: date,
}));

const allRoutes = [...staticRoutes, ...keysyRoutes, ...newsRoutes];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allRoutes
  .map(
    r => `  <url>
    <loc>${SITE_URL}${r.loc}</loc>
${r.lastmod ? `    <lastmod>${r.lastmod}</lastmod>\n` : ''}    <changefreq>${r.changefreq}</changefreq>
    <priority>${r.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>
`;

writeFileSync(path.join(projectRoot, 'dist/sitemap.xml'), xml);
console.log(`sitemap.xml written with ${allRoutes.length} URLs`);
