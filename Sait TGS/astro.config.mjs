import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://tg-studio.by',
  trailingSlash: 'never',
  build: {
    format: 'directory',
  },
});
