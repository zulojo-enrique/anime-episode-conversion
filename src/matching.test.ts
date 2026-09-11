import { describe, it, expect } from 'vitest';
import { findMatches } from './matching.js';
import type { AnidbAnime } from './types/anidb.js';

describe('findMatches', () => {
  const createAnime = (
    aid: number,
    titles: string[],
    startdate: string,
    enddate: string,
    episodes: { epno: string; type: string; airdate: string | null }[]
  ): AnidbAnime => ({
    aid,
    titles,
    startdate,
    enddate,
    episodes: episodes.map(ep => ({
      epno: ep.epno,
      type: ep.type as any,
      airdate: ep.airdate
    }))
  });

  it('should find simple match', () => {
    const anime = createAnime(1, ['Test Anime'], '2024-01-01', '2024-12-31', [
      { epno: '1', type: '1', airdate: '2024-04-08' }
    ]);

    const result = findMatches('2024-04-08', [anime]);

    expect(result).toHaveLength(1);
    expect(result[0].aid).toBe(1);
    expect(result[0].episode).toBe(1);
  });

  it('should find multiple episodes with same date', () => {
    const anime = createAnime(1, ['Test Anime'], '2024-01-01', '2024-12-31', [
      { epno: '1', type: '1', airdate: '2024-04-08' },
      { epno: '2', type: '1', airdate: '2024-04-08' }
    ]);

    const result = findMatches('2024-04-08', [anime]);

    expect(result).toHaveLength(2);
  });

  it('should ignore different episode types by default', () => {
    const anime = createAnime(1, ['Test Anime'], '2024-01-01', '2024-12-31', [
      { epno: '2', type: '1', airdate: '2024-04-15' },
      { epno: 'C1', type: '3', airdate: '2024-04-15' },
      { epno: 'C2', type: '3', airdate: '2024-04-15' }
    ]);

    const result = findMatches('2024-04-15', [anime]);

    expect(result).toHaveLength(1);
    expect(result[0].episode).toBe(2);
  });

  it('should find matches across multiple AIDs', () => {
    const anime1 = createAnime(1, ['Anime 1'], '2024-01-01', '2024-12-31', [
      { epno: '1', type: '1', airdate: '2024-04-08' }
    ]);
    const anime2 = createAnime(2, ['Anime 2'], '2024-01-01', '2024-12-31', [
      { epno: '1', type: '1', airdate: '2024-04-08' }
    ]);

    const result = findMatches('2024-04-08', [anime1, anime2]);

    expect(result).toHaveLength(2);
  });

  it('should discard AID with wrong date range', () => {
    const anime = createAnime(1, ['Test Anime'], '2021-01-01', '2021-12-31', [
      { epno: '1', type: '1', airdate: '2024-04-08' }
    ]);

    const result = findMatches('2024-04-08', [anime]);

    expect(result).toHaveLength(0);
  });

  it('should not match when episode number matches but date differs', () => {
    const anime = createAnime(1, ['Test Anime'], '2024-01-01', '2024-12-31', [
      { epno: '12', type: '1', airdate: '2024-06-24' }
    ]);

    const result = findMatches('2024-07-01', [anime]);

    expect(result).toHaveLength(0);
  });

  it('should match when date matches but episode number differs', () => {
    const anime = createAnime(1, ['Test Anime'], '2024-01-01', '2024-12-31', [
      { epno: '1', type: '1', airdate: '2024-04-08' }
    ]);

    const result = findMatches('2024-04-08', [anime]);

    expect(result).toHaveLength(1);
    expect(result[0].episode).toBe(1);
  });
});
