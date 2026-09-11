export interface AnidbEpisode {
  epno: string;
  type: AnidbEpisodeType;
  airdate: string | null;
  titleEN: string | null;
  titleJA: string | null;
}

export type AnidbEpisodeType = 
  | '1' // Regular episode
  | '2' // Credits
  | '3' // Special
  | '4' // Trailer
  | '5' // Parody
  | '6'; // Other

export interface AnidbAnime {
  aid: number;
  type: string;
  episodeCount: number;
  titles: string[];
  startdate: string | null;
  enddate: string | null;
  episodes: AnidbEpisode[];
}

export interface AnidbClient {
  getAnime(aid: number): Promise<AnidbAnime>;
}
