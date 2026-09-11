import { XMLParser } from 'fast-xml-parser';
import { readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from 'fs';
import { gunzipSync } from 'zlib';
import { join } from 'path';

interface AnimeTitle {
  aid: number;
  title: string;
}

export class AnimeTitlesIndex {
  private index: Map<string, number[]> = new Map();
  private dataPath: string;
  private cachePath: string;
  private gzPath: string;
  private localFile?: string;
  private refreshInterval: NodeJS.Timeout | null = null;
  private static readonly REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

  constructor(config: { dataPath?: string; localFile?: string } = {}) {
    this.dataPath = config.dataPath || './data';
    this.cachePath = join(this.dataPath, 'titles-index.json');
    this.gzPath = join(this.dataPath, 'anime-titles.xml.gz');
    this.localFile = config.localFile;
  }

  async load(): Promise<void> {
    console.log('[Titles] Loading anime titles index...');
    
    if (this.needsRefresh()) {
      console.log('[Titles] Cache expired or not found, downloading...');
      await this.downloadAndParse();
      this.saveCache();
      console.log(`[Titles] Index built with ${this.index.size} entries`);
    } else {
      console.log('[Titles] Loading from cache...');
      const cacheData = readFileSync(this.cachePath, 'utf-8');
      const cacheObj = JSON.parse(cacheData);
      this.index = new Map(Object.entries(cacheObj));
      console.log(`[Titles] Loaded ${this.index.size} entries from cache`);
    }
  }

  private needsRefresh(): boolean {
    if (!existsSync(this.cachePath)) return true;
    const cacheStat = statSync(this.cachePath);
    const oneDayMs = 24 * 60 * 60 * 1000;
    return Date.now() - cacheStat.mtimeMs >= oneDayMs;
  }

  startAutoRefresh(): void {
    if (this.refreshInterval) return;

    this.refreshInterval = setInterval(async () => {
      console.log('[Titles] Auto-refresh: checking cache...');
      if (this.needsRefresh()) {
        console.log('[Titles] Auto-refresh: downloading new data...');
        try {
          await this.downloadAndParse();
          this.saveCache();
          console.log(`[Titles] Auto-refresh: index updated with ${this.index.size} entries`);
        } catch (error) {
          console.error('[Titles] Auto-refresh failed:', error instanceof Error ? error.message : error);
        }
      } else {
        console.log('[Titles] Auto-refresh: cache is fresh, skipping');
      }
    }, AnimeTitlesIndex.REFRESH_INTERVAL_MS);
  }

  stopAutoRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  async forceRefresh(): Promise<number> {
    console.log('[Titles] Force refresh: downloading...');
    await this.downloadAndParse();
    this.saveCache();
    console.log(`[Titles] Force refresh: index updated with ${this.index.size} entries`);
    return this.index.size;
  }

  private async downloadAndParse(): Promise<void> {
    if (!existsSync(this.dataPath)) {
      mkdirSync(this.dataPath, { recursive: true });
    }

    let buffer: Buffer;

    if (this.localFile && existsSync(this.localFile)) {
      console.log(`[Titles] Using local file: ${this.localFile}`);
      buffer = readFileSync(this.localFile);
    } else {
      console.log('[Titles] Downloading from anidb.net...');
      const response = await fetch('https://anidb.net/api/anime-titles.xml.gz', {
        headers: {
          'User-Agent': 'AnimeEpisodeConversion/1.0'
        }
      });
      if (!response.ok) {
        throw new Error(`Failed to download anime-titles.xml.gz: ${response.status}`);
      }
      buffer = Buffer.from(await response.arrayBuffer());
      writeFileSync(this.gzPath, buffer);
      console.log(`[Titles] Saved .gz file to: ${this.gzPath}`);
    }

    const decompressed = gunzipSync(buffer);
    
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_'
    });

    const parsed = parser.parse(decompressed.toString());
    const animeTitles = parsed['animetitles'] ?? parsed['anime-titles'];
    const animeList = Array.isArray(animeTitles?.anime) ? animeTitles.anime : [animeTitles?.anime].filter(Boolean);

    for (const anime of animeList) {
      const aid = parseInt(anime['@_aid']);
      const titles = anime.title;
      
      if (Array.isArray(titles)) {
        for (const title of titles) {
          const titleText = typeof title === 'string' || typeof title === 'number'
            ? String(title)
            : title['#text'];
          if (typeof titleText === 'string') {
            const normalized = this.normalize(titleText);
            const existing = this.index.get(normalized) || [];
            if (!existing.includes(aid)) {
              existing.push(aid);
              this.index.set(normalized, existing);
            }
          }
        }
      } else if (titles) {
        const titleText = typeof titles === 'string' || typeof titles === 'number'
          ? String(titles)
          : titles['#text'];
        if (typeof titleText !== 'string') continue;
        const normalized = this.normalize(titleText);
        const existing = this.index.get(normalized) || [];
        if (!existing.includes(aid)) {
          existing.push(aid);
          this.index.set(normalized, existing);
        }
      }
    }
  }

  private saveCache(): void {
    const cacheObj = Object.fromEntries(this.index);
    writeFileSync(this.cachePath, JSON.stringify(cacheObj));
  }

  private normalize(title: string): string {
    return title.toLowerCase().trim();
  }

  findAids(title: string): number[] {
    const normalized = this.normalize(title);
    return this.index.get(normalized) || [];
  }

  findAidsPrefix(query: string): number[] {
    const normalized = this.normalize(query);
    if (normalized.length < 3) return [];

    const aids = new Set<number>();
    for (const [key, values] of this.index) {
      if (key.startsWith(normalized)) {
        for (const aid of values) {
          aids.add(aid);
        }
      }
    }
    return Array.from(aids);
  }

  findAidsForTitles(titles: string[]): number[] {
    const aids = new Set<number>();
    for (const title of titles) {
      const exact = this.findAids(title);
      const prefix = this.findAidsPrefix(title);
      const found = [...new Set([...exact, ...prefix])];

      const parts: string[] = [];
      if (exact.length > 0) parts.push(`exact: ${exact.length}`);
      if (prefix.length > 0) parts.push(`prefix: ${prefix.length}`);
      console.log(`[Titles] "${title}" -> ${parts.length > 0 ? parts.join(', ') : '0'} AIDs: ${found.join(', ') || 'none'}`);

      for (const aid of found) {
        aids.add(aid);
      }
    }
    const result = Array.from(aids);
    console.log(`[Titles] Total unique AIDs: ${result.length}`);
    return result;
  }
}
