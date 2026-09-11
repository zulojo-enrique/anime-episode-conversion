import type { TmdbClient, TmdbShow, TmdbMovie, TmdbEpisode, TmdbAlternativeTitles } from '../types/tmdb.js';

interface TmdbCacheEntry {
  data: TmdbShow | TmdbMovie | TmdbEpisode | TmdbAlternativeTitles;
  cachedAt: number;
}

export class TmdbApiClient implements TmdbClient {
  private baseUrl: string;
  private apiKey: string;
  private timeout: number;
  private cache: Map<string, TmdbCacheEntry> = new Map();
  private static readonly CACHE_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
  private static readonly CLEANUP_INTERVAL_MS = 8 * 60 * 60 * 1000; // 8 hours

  constructor(config: { apiKey: string; baseUrl?: string; timeout?: number }) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.themoviedb.org/3';
    this.timeout = config.timeout || 30000;
    setInterval(() => this.cleanup(), TmdbApiClient.CLEANUP_INTERVAL_MS);
  }

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > TmdbApiClient.CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  private setCache(key: string, data: TmdbShow | TmdbMovie | TmdbEpisode | TmdbAlternativeTitles): void {
    this.cache.set(key, { data, cachedAt: Date.now() });
  }

  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this.cache) {
      if (now - entry.cachedAt > TmdbApiClient.CACHE_TTL_MS) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`[TMDB] Cache cleanup: removed ${cleaned} expired entries`);
    }
  }

  async getShow(tvId: number): Promise<TmdbShow> {
    const key = `show:${tvId}`;
    const cached = this.getCached<TmdbShow>(key);
    if (cached) {
      console.log(`[TMDB] Cache hit for show tvId=${tvId}`);
      return cached;
    }

    const url = `${this.baseUrl}/tv/${tvId}`;
    console.log(`[TMDB] Fetching show: tvId=${tvId}`);

    const response = await fetch(url, {
      headers: {
        'accept': 'application/json',
        'authorization': `Bearer ${this.apiKey}`,
      },
      signal: AbortSignal.timeout(this.timeout),
    });

    console.log(`[TMDB] Show response status: ${response.status}`);

    if (response.status === 404) {
      throw new Error('Show not found');
    }

    if (response.status === 401) {
      throw new Error('Invalid API key');
    }

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const data = await response.json() as {
      name: string;
      original_name: string;
    };

    console.log(`[TMDB] Show found: name="${data.name}", original_name="${data.original_name}"`);

    const result: TmdbShow = {
      name: data.name,
      originalName: data.original_name,
    };

    this.setCache(key, result);
    return result;
  }

  async getMovie(movieId: number): Promise<TmdbMovie> {
    const key = `movie:${movieId}`;
    const cached = this.getCached<TmdbMovie>(key);
    if (cached) {
      console.log(`[TMDB] Cache hit for movie movieId=${movieId}`);
      return cached;
    }

    const url = `${this.baseUrl}/movie/${movieId}`;
    console.log(`[TMDB] Fetching movie: movieId=${movieId}`);

    const response = await fetch(url, {
      headers: {
        'accept': 'application/json',
        'authorization': `Bearer ${this.apiKey}`,
      },
      signal: AbortSignal.timeout(this.timeout),
    });

    console.log(`[TMDB] Movie response status: ${response.status}`);

    if (response.status === 404) {
      throw new Error('Movie not found');
    }

    if (response.status === 401) {
      throw new Error('Invalid API key');
    }

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const data = await response.json() as {
      title: string;
      original_title: string;
      release_date?: string;
    };

    console.log(`[TMDB] Movie found: title="${data.title}", original_title="${data.original_title}"`);

    const result: TmdbMovie = {
      name: data.title,
      originalName: data.original_title,
      releaseDate: data.release_date || null,
    };

    this.setCache(key, result);
    return result;
  }

  async getEpisode(
    tvId: number,
    seasonNumber: number,
    episodeNumber: number
  ): Promise<TmdbEpisode> {
    const key = `episode:${tvId}:${seasonNumber}:${episodeNumber}`;
    const cached = this.getCached<TmdbEpisode>(key);
    if (cached) {
      console.log(`[TMDB] Cache hit for episode tvId=${tvId}, s=${seasonNumber}, e=${episodeNumber}`);
      return cached;
    }

    const url = `${this.baseUrl}/tv/${tvId}/season/${seasonNumber}/episode/${episodeNumber}`;
    console.log(`[TMDB] Fetching episode: tvId=${tvId}, season=${seasonNumber}, episode=${episodeNumber}`);
    
    const response = await fetch(url, {
      headers: {
        'accept': 'application/json',
        'authorization': `Bearer ${this.apiKey}`,
      },
      signal: AbortSignal.timeout(this.timeout),
    });
    
    console.log(`[TMDB] Response status: ${response.status}`);
    
    if (response.status === 404) {
      throw new Error('Episode not found');
    }
    
    if (response.status === 401) {
      throw new Error('Invalid API key');
    }
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    const data = await response.json() as {
      id: number;
      name: string;
      air_date?: string;
      season_number: number;
      episode_number: number;
    };
    
    console.log(`[TMDB] Episode found: "${data.name}", airDate=${data.air_date || 'null'}`);
    
    const result: TmdbEpisode = {
      id: data.id,
      name: data.name,
      airDate: data.air_date || null,
      seasonNumber: data.season_number,
      episodeNumber: data.episode_number
    };

    this.setCache(key, result);
    return result;
  }

  async getAlternativeTitles(tvId: number): Promise<TmdbAlternativeTitles> {
    const key = `altTitles:${tvId}`;
    const cached = this.getCached<TmdbAlternativeTitles>(key);
    if (cached) {
      console.log(`[TMDB] Cache hit for alt titles tvId=${tvId}`);
      return cached;
    }

    const url = `${this.baseUrl}/tv/${tvId}/alternative_titles`;
    console.log(`[TMDB] Fetching alternative titles: tvId=${tvId}`);
    
    const response = await fetch(url, {
      headers: {
        'accept': 'application/json',
        'authorization': `Bearer ${this.apiKey}`,
      },
      signal: AbortSignal.timeout(this.timeout),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    const data = await response.json() as {
      results?: Array<{ title: string; type: string }>;
    };

    const titles = data.results || [];
    console.log(`[TMDB] Found ${titles.length} alternative titles`);

    const result: TmdbAlternativeTitles = { titles };

    this.setCache(key, result);
    return result;
  }

  async getMovieAlternativeTitles(movieId: number): Promise<TmdbAlternativeTitles> {
    const key = `movieAltTitles:${movieId}`;
    const cached = this.getCached<TmdbAlternativeTitles>(key);
    if (cached) {
      console.log(`[TMDB] Cache hit for movie alt titles movieId=${movieId}`);
      return cached;
    }

    const url = `${this.baseUrl}/movie/${movieId}/alternative_titles`;
    console.log(`[TMDB] Fetching movie alternative titles: movieId=${movieId}`);
    
    const response = await fetch(url, {
      headers: {
        'accept': 'application/json',
        'authorization': `Bearer ${this.apiKey}`,
      },
      signal: AbortSignal.timeout(this.timeout),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    const data = await response.json() as {
      titles?: Array<{ title: string; type: string }>;
    };

    const titles = data.titles || [];
    console.log(`[TMDB] Found ${titles.length} movie alternative titles`);

    const result: TmdbAlternativeTitles = { titles };

    this.setCache(key, result);
    return result;
  }
}
