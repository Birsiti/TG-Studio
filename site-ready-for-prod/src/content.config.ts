import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// One markdown file = one article. Filename becomes the URL slug
// (/novosti/<filename>), so adding a new post never touches page code —
// drop a .md file with this frontmatter into src/content/news/.
const news = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/news' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.enum(['Боты', 'Telegram-приложения', 'ИИ']),
    date: z.coerce.date(),
    // slug of the commercial page this article should funnel readers to,
    // e.g. "mini-apps", "boty", "crm-integracii", "ai-gpt"
    relatedService: z.string(),
  }),
});

// Same pattern for case studies: one file = one case at /keysy/<filename>.
const keysy = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/keysy' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    client: z.string(),
    date: z.coerce.date(),
  }),
});

export const collections = { news, keysy };
