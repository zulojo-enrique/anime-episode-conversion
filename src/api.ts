import { Hono } from 'hono';
import { ConversionService } from './service.js';

export function createApi(service: ConversionService): Hono {
  const app = new Hono();

  app.get('/', (c) => {
    return c.json({ status: 'ok' });
  });

  app.post('/refresh-titles', async (c) => {
    console.log('[API] Force refresh titles requested');
    try {
      const count = await service.forceRefreshTitles();
      return c.json({ status: 'ok', entries: count });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.log(`[API] Refresh titles error: ${message}`);
      return c.json({ error: message }, 500);
    }
  });

  app.get('/tmdb-to-anidb/:id/:season?/:episode?', async (c) => {
    const id = parseInt(c.req.param('id'));
    const season = c.req.param('season');
    const episode = c.req.param('episode');

    if (isNaN(id)) {
      return c.json({ error: 'Invalid ID parameter' }, 400);
    }

    if (season && episode) {
      const seasonNum = parseInt(season);
      const episodeNum = parseInt(episode);
      console.log(`\n[API] New TV request: /convert/${id}/${seasonNum}/${episodeNum}`);

      if (isNaN(seasonNum) || isNaN(episodeNum)) {
        return c.json({ error: 'Invalid season/episode parameters' }, 400);
      }

      try {
        const result = await service.convert(id, seasonNum, episodeNum);
        console.log(`[API] Response: ${result.results.length} matches found`);
        return c.json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.log(`[API] Error: ${message}`);
        return c.json({ error: message }, 500);
      }
    } else {
      console.log(`\n[API] New movie request: /convert/${id}`);

      try {
        const result = await service.convertMovie(id);
        console.log(`[API] Response: ${result.results.length} matches found`);
        return c.json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.log(`[API] Error: ${message}`);
        return c.json({ error: message }, 500);
      }
    }
  });

  return app;
}
