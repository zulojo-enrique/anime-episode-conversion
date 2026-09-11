export interface TmdbShow {
  name: string;
  originalName: string;
}

export interface TmdbMovie {
  name: string;
  originalName: string;
  releaseDate: string | null;
}

export interface TmdbEpisode {
  id: number;
  name: string;
  airDate: string | null;
  seasonNumber: number;
  episodeNumber: number;
}

export interface TmdbAlternativeTitles {
  titles: Array<{ title: string; type: string }>;
}

export interface TmdbClient {
  getShow(tvId: number): Promise<TmdbShow>;
  getMovie(movieId: number): Promise<TmdbMovie>;
  getEpisode(
    tvId: number,
    seasonNumber: number,
    episodeNumber: number
  ): Promise<TmdbEpisode>;
  getAlternativeTitles(tvId: number): Promise<TmdbAlternativeTitles>;
  getMovieAlternativeTitles(movieId: number): Promise<TmdbAlternativeTitles>;
}
