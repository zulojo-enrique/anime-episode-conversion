export interface ConversionResult {
  results: MatchResult[];
}

export interface MatchResult {
  aid: number;
  type: string;
  season: string;
  episode: number;
  date: string;
  episodeCount: number;
  seasonDate: string;
  titleEN: string | null;
  titleJA: string | null;
}
