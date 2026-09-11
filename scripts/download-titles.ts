/// <reference types="node" />

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'zlib';
import { join } from 'path';
import { XMLParser } from 'fast-xml-parser';

const dataPath = './data';
const outputPath = join(dataPath, 'anime-titles.xml.gz');
const cachePath = join(dataPath, 'titles-index.json');

if (!existsSync(dataPath)) {
  mkdirSync(dataPath, { recursive: true });
}

console.log('Downloading anime-titles.xml.gz...');

const response = await fetch('https://anidb.net/api/anime-titles.xml.gz', {
  headers: {
    'User-Agent': 'AnimeEpisodeConversion/1.0'
  }
});

if (!response.ok) {
  throw new Error(`Failed to download: ${response.status}`);
}

const buffer = Buffer.from(await response.arrayBuffer());
writeFileSync(outputPath, buffer);
console.log(`Saved to ${outputPath}`);

console.log('Parsing and building index...');
const decompressed = gunzipSync(buffer);
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_'
});

const parsed = parser.parse(decompressed.toString());
const animeTitles = parsed['animetitles'] ?? parsed['anime-titles'];
const animeList = Array.isArray(animeTitles?.anime) ? animeTitles.anime : [animeTitles?.anime].filter(Boolean);

const index = new Map<string, number[]>();

for (const anime of animeList) {
  const aid = parseInt(anime['@_aid']);
  const titles = anime.title;
  
  if (Array.isArray(titles)) {
    for (const title of titles) {
      const titleText = typeof title === 'string' || typeof title === 'number'
        ? String(title)
        : title['#text'];
      if (typeof titleText === 'string') {
        const normalized = titleText.toLowerCase().trim();
        const existing = index.get(normalized) || [];
        if (!existing.includes(aid)) {
          existing.push(aid);
          index.set(normalized, existing);
        }
      }
    }
  } else if (titles) {
    const titleText = typeof titles === 'string' || typeof titles === 'number'
      ? String(titles)
      : titles['#text'];
    if (typeof titleText !== 'string') continue;
    const normalized = titleText.toLowerCase().trim();
    const existing = index.get(normalized) || [];
    if (!existing.includes(aid)) {
      existing.push(aid);
      index.set(normalized, existing);
    }
  }
}

const cacheObj = Object.fromEntries(index);
writeFileSync(cachePath, JSON.stringify(cacheObj));
console.log(`Index built with ${index.size} entries, saved to ${cachePath}`);
