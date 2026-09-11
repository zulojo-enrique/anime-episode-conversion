import type { AnidbClient, AnidbAnime, AnidbEpisode } from '../types/anidb.js';
import { XMLParser } from 'fast-xml-parser';

interface CacheEntry {
  data: AnidbAnime;
  cachedAt: number;
}

export class AnidbHttpClient implements AnidbClient {
  private baseUrl: string;
  private client: string;
  private clientver: string;
  private timeout: number;
  private cache: Map<number, CacheEntry> = new Map();
  private static readonly AIRING_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
  private static readonly COMPLETED_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 1 month
  private static readonly COMPLETED_MARGIN_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
  private static readonly CLEANUP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

  constructor(config: {
    baseUrl?: string;
    client?: string;
    clientver?: string;
    timeout?: number;
  }) {
    this.baseUrl = config.baseUrl || 'http://api.anidb.net:9001';
    this.client = config.client || 'animeconversion';
    this.clientver = config.clientver || '1';
    this.timeout = config.timeout || 10000;
    setInterval(() => this.cleanup(), AnidbHttpClient.CLEANUP_INTERVAL_MS);
  }

  async getAnime(aid: number): Promise<AnidbAnime> {
    const entry = this.cache.get(aid);
    if (entry && this.isCacheValid(entry)) {
      console.log(`[AniDB] Cache hit for AID=${aid}`);
      return entry.data;
    }

    const url = `${this.baseUrl}/httpapi?request=anime&client=${this.client}&clientver=${this.clientver}&protover=1&aid=${aid}`;
    console.log(`[AniDB] Fetching anime: AID=${aid}`);
    
    const response = await this.fetchWithTimeout(url);
    console.log(`[AniDB] Response status: ${response.status}`);
    
    if (!response.ok) {
      throw new Error(`AniDB API error: ${response.status}`);
    }

    const text = await response.text();
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_'
    });

    const parsed = parser.parse(text);
    const anime = parsed.anime;

    if (!anime) {
      throw new Error('Invalid AniDB response');
    }

    const titles: string[] = [];
    const titlesData = anime.titles?.title;
    if (Array.isArray(titlesData)) {
      for (const t of titlesData) {
        if (t['#text']) titles.push(t['#text']);
      }
    } else if (titlesData?.['#text']) {
      titles.push(titlesData['#text']);
    }

    const episodes: AnidbEpisode[] = [];
    const episodesData = anime.episodes?.episode;
    if (Array.isArray(episodesData)) {
      for (const ep of episodesData) {
        const airdateParsed = ep.airdate?.['#text'] || (typeof ep.airdate === 'string' ? ep.airdate : null);
        let titleEN: string | null = null;
        let titleJA: string | null = null;
        if (Array.isArray(ep.title)) {
          for (const t of ep.title) {
            const text = t?.['#text'];
            if (!text) continue;
            if (t['@_xml:lang'] === 'en') titleEN = text;
            if (t['@_xml:lang'] === 'ja') titleJA = text;
          }
        } else if (ep.title?.['#text']) {
          if (ep.title['@_xml:lang'] === 'en') titleEN = ep.title['#text'];
          if (ep.title['@_xml:lang'] === 'ja') titleJA = ep.title['#text'];
        }
        episodes.push({
          epno: String(ep.epno?.['#text'] || ep.epno),
          type: ep.epno?.['@_type'] || '1',
          airdate: airdateParsed,
          titleEN,
          titleJA
        });
      }
    } else if (episodesData) {
      const airdateParsed = episodesData.airdate?.['#text'] || (typeof episodesData.airdate === 'string' ? episodesData.airdate : null);
      let titleEN: string | null = null;
      let titleJA: string | null = null;
      if (Array.isArray(episodesData.title)) {
        for (const t of episodesData.title) {
          const text = t?.['#text'];
          if (!text) continue;
          if (t['@_xml:lang'] === 'en') titleEN = text;
          if (t['@_xml:lang'] === 'ja') titleJA = text;
        }
      } else if (episodesData.title?.['#text']) {
        if (episodesData.title['@_xml:lang'] === 'en') titleEN = episodesData.title['#text'];
        if (episodesData.title['@_xml:lang'] === 'ja') titleJA = episodesData.title['#text'];
      }
      episodes.push({
        epno: String(episodesData.epno?.['#text'] || episodesData.epno),
        type: episodesData.epno?.['@_type'] || '1',
        airdate: airdateParsed,
        titleEN,
        titleJA
      });
    }

    const animeType = typeof anime.type === 'string' ? anime.type : anime.type?.['#text'] || '';
    const rawCount = anime.episodecount;
    const episodeCount = typeof rawCount === 'number' ? rawCount : typeof rawCount === 'string' ? parseInt(rawCount, 10) : parseInt(rawCount?.['#text'], 10) || 0;

    const result: AnidbAnime = {
      aid,
      type: animeType,
      episodeCount,
      titles,
      startdate: anime.startdate?.['#text'] || (typeof anime.startdate === 'string' ? anime.startdate : null),
      enddate: anime.enddate?.['#text'] || (typeof anime.enddate === 'string' ? anime.enddate : null),
      episodes
    };

    this.cache.set(aid, { data: result, cachedAt: Date.now() });
    return result;
  }

  private isCacheValid(entry: CacheEntry): boolean {
    const enddate = entry.data.enddate;
    if (!enddate) return false;

    const enddateMs = new Date(enddate).getTime();
    const marginMs = enddateMs + AnidbHttpClient.COMPLETED_MARGIN_MS;

    if (Date.now() < marginMs) {
      const ageMs = Date.now() - entry.cachedAt;
      return ageMs < AnidbHttpClient.AIRING_TTL_MS;
    }

    const ageMs = Date.now() - entry.cachedAt;
    return ageMs < AnidbHttpClient.COMPLETED_TTL_MS;
  }

  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [aid, entry] of this.cache) {
      const enddate = entry.data.enddate;
      if (!enddate) {
        this.cache.delete(aid);
        cleaned++;
        continue;
      }

      const enddateMs = new Date(enddate).getTime();
      const marginMs = enddateMs + AnidbHttpClient.COMPLETED_MARGIN_MS;
      const ttl = now < marginMs
        ? AnidbHttpClient.AIRING_TTL_MS
        : AnidbHttpClient.COMPLETED_TTL_MS;

      if (now - entry.cachedAt > ttl) {
        this.cache.delete(aid);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`[AniDB] Cache cleanup: removed ${cleaned} expired entries`);
    }
  }

  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    
    try {
      return await fetch(url, { signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
