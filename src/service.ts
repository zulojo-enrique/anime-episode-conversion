import type { TmdbClient } from './types/tmdb.js';
import type { AnidbClient } from './types/anidb.js';
import type { ConversionResult } from './types/result.js';
import { AnimeTitlesIndex } from './anidb/anime-titles.js';
import { findMatches } from './matching.js';

export interface ConversionServiceConfig {
  tmdbClient: TmdbClient;
  anidbClient: AnidbClient;
  titlesIndex: AnimeTitlesIndex;
}

export class ConversionService {
  private tmdbClient: TmdbClient;
  private anidbClient: AnidbClient;
  private titlesIndex: AnimeTitlesIndex;

  constructor(config: ConversionServiceConfig) {
    this.tmdbClient = config.tmdbClient;
    this.anidbClient = config.anidbClient;
    this.titlesIndex = config.titlesIndex;
  }

  async convert(
    tvId: number,
    seasonNumber: number,
    episodeNumber: number
  ): Promise<ConversionResult> {
    console.log(`[Service] Starting conversion: tvId=${tvId}, season=${seasonNumber}, episode=${episodeNumber}`);
    
    const episode = await this.tmdbClient.getEpisode(tvId, seasonNumber, episodeNumber);
    
    if (!episode.airDate) {
      console.log(`[Service] Episode has no air date, aborting`);
      throw new Error('Episode has no air date');
    }
    console.log(`[Service] Episode air date: ${episode.airDate}`);

    const show = await this.tmdbClient.getShow(tvId);
    console.log(`[Service] Show: name="${show.name}", originalName="${show.originalName}"`);

    const alternativeTitles = await this.tmdbClient.getAlternativeTitles(tvId);
    const romajiTitle = alternativeTitles.titles.find(
      (t) => t.type.toLowerCase() === 'romaji'
    )?.title;
    console.log(`[Service] Romaji title: ${romajiTitle || 'none'}`);

    const allTitles = [show.name, show.originalName];
    if (romajiTitle) {
      allTitles.push(romajiTitle);
    }
    console.log(`[Service] Searching for AIDs with titles: ${allTitles.join(', ')}`);
    
    const candidateAids = this.titlesIndex.findAidsForTitles(allTitles);
    console.log(`[Service] Found ${candidateAids.length} candidate AIDs: ${candidateAids.join(', ') || 'none'}`);
    
    if (candidateAids.length === 0) {
      console.log(`[Service] No candidates found, returning empty results`);
      return { results: [] };
    }

    console.log(`[Service] Fetching anime info from AniDB for ${candidateAids.length} AIDs...`);
    const anidbAnime = await Promise.all(
      candidateAids.map((aid) => this.anidbClient.getAnime(aid))
    );

    console.log(`[Service] Running matching algorithm...`);
    const matches = findMatches(episode.airDate, anidbAnime);
    console.log(`[Service] Found ${matches.length} matches`);
    
    return { results: matches };
  }

  async convertMovie(movieId: number): Promise<ConversionResult> {
    console.log(`[Service] Starting movie conversion: movieId=${movieId}`);
    
    const movie = await this.tmdbClient.getMovie(movieId);
    console.log(`[Service] Movie: name="${movie.name}", originalName="${movie.originalName}"`);

    if (!movie.releaseDate) {
      console.log(`[Service] Movie has no release date, aborting`);
      throw new Error('Movie has no release date');
    }
    console.log(`[Service] Movie release date: ${movie.releaseDate}`);

    const alternativeTitles = await this.tmdbClient.getMovieAlternativeTitles(movieId);
    const romajiTitle = alternativeTitles.titles.find(
      (t) => t.type.toLowerCase() === 'romaji'
    )?.title;
    console.log(`[Service] Romaji title: ${romajiTitle || 'none'}`);

    const allTitles = [movie.name, movie.originalName];
    if (romajiTitle) {
      allTitles.push(romajiTitle);
    }
    console.log(`[Service] Searching for AIDs with titles: ${allTitles.join(', ')}`);
    
    const candidateAids = this.titlesIndex.findAidsForTitles(allTitles);
    console.log(`[Service] Found ${candidateAids.length} candidate AIDs: ${candidateAids.join(', ') || 'none'}`);
    
    if (candidateAids.length === 0) {
      console.log(`[Service] No candidates found, returning empty results`);
      return { results: [] };
    }

    console.log(`[Service] Fetching anime info from AniDB for ${candidateAids.length} AIDs...`);
    const anidbAnime = await Promise.all(
      candidateAids.map((aid) => this.anidbClient.getAnime(aid))
    );

    console.log(`[Service] Running matching algorithm...`);
    const matches = findMatches(movie.releaseDate, anidbAnime);
    console.log(`[Service] Found ${matches.length} matches`);
    
    return { results: matches };
  }

  async forceRefreshTitles(): Promise<number> {
    return this.titlesIndex.forceRefresh();
  }
}
