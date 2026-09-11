import 'dotenv/config';
import { serve } from '@hono/node-server';
import { TmdbApiClient } from './clients/tmdb.js';
import { AnidbHttpClient } from './clients/anidb.js';
import { AnimeTitlesIndex } from './anidb/anime-titles.js';
import { ConversionService } from './service.js';
import { createApi } from './api.js';

const tmdbApiKey = process.env.TMDB_API_KEY;
if (!tmdbApiKey) {
  throw new Error('TMDB_API_KEY environment variable is required');
}

const tmdbClient = new TmdbApiClient({ apiKey: tmdbApiKey });

const anidbClient = new AnidbHttpClient({
  baseUrl: process.env.ANIDB_API_URL,
  client: process.env.ANIDB_CLIENT,
  clientver: process.env.ANIDB_CLIENTVER
});

const titlesIndex = new AnimeTitlesIndex({
  localFile: process.env.ANIDB_TITLES_FILE
});

try {
  await titlesIndex.load();
  titlesIndex.startAutoRefresh();
  console.log('Anime titles index loaded');
} catch (error) {
  console.warn('Failed to load anime titles index:', error instanceof Error ? error.message : error);
  console.warn('Conversions will not work until the index is loaded');
}

const service = new ConversionService({
  tmdbClient,
  anidbClient,
  titlesIndex
});

const app = createApi(service);

const port = parseInt(process.env.PORT || '3001');

serve({
  fetch: app.fetch,
  port
}, (info) => {
  console.log(`Server running on port http://localhost:${info.port}`);
});
