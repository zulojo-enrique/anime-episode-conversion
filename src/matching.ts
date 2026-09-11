import type { AnidbAnime, AnidbEpisode } from './types/anidb.js';
import type { MatchResult } from './types/result.js';

export function findMatches(
  airDate: string,
  candidates: AnidbAnime[],
  allowedTypes: string[] = ['1']
): MatchResult[] {
  const results: MatchResult[] = [];

  for (const anime of candidates) {
    if (!isDateInRange(airDate, anime.startdate, anime.enddate)) {
      continue;
    }

    const matchingEpisodes = anime.episodes.filter(
      (ep) => ep.airdate === airDate && allowedTypes.includes(ep.type)
    );

    for (const episode of matchingEpisodes) {
      const episodeNum = parseEpisodeNumber(episode.epno);
      const title = anime.titles[0] || '';

      results.push({
        aid: anime.aid,
        type: anime.type,
        season: title,
        episode: episodeNum,
        date: airDate,
        episodeCount: anime.episodeCount,
        seasonDate: anime.startdate || '',
        titleEN: episode.titleEN,
        titleJA: episode.titleJA
      });
    }
  }

  return results;
}

function isDateInRange(
  date: string,
  startdate: string | null,
  enddate: string | null
): boolean {
  if (!startdate || !enddate) {
    return false;
  }

  return date >= startdate && date <= enddate;
}

function parseEpisodeNumber(epno: string): number {
  const match = String(epno).match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}
