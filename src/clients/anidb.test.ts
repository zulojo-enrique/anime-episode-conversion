import { describe, it, expect, vi, afterEach } from 'vitest';
import { AnidbHttpClient } from './anidb.js';

const AIRING_XML = `<?xml version="1.0" encoding="UTF-8"?>
<anime aid="69">
  <type>TV Series</type>
  <episodecount>1000</episodecount>
  <startdate>1999-10-20</startdate>
  <titles>
    <title xml:lang="ja">ONE PIECE</title>
  </titles>
  <episodes>
    <episode>
      <epno type="1">1</epno>
      <airdate>1999-10-20</airdate>
      <title xml:lang="en">I'm Luffy!</title>
      <title xml:lang="ja">俺はルフィ!</title>
    </episode>
  </episodes>
</anime>`;

const COMPLETED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<anime aid="1">
  <type>TV Series</type>
  <episodecount>12</episodecount>
  <startdate>2024-01-01</startdate>
  <enddate>2024-03-25</enddate>
  <titles>
    <title xml:lang="en">Test Anime</title>
  </titles>
  <episodes>
    <episode>
      <epno type="1">1</epno>
      <airdate>2024-01-01</airdate>
    </episode>
  </episodes>
</anime>`;

function createClient(): AnidbHttpClient {
  return new AnidbHttpClient({ minIntervalMs: 0, timeout: 1000 });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AnidbHttpClient caching', () => {
  it('caches airing anime (no enddate) and avoids a second fetch', async () => {
    const fetchMock = vi.fn(async () => new Response(AIRING_XML, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createClient();

    const first = await client.getAnime(69);
    const second = await client.getAnime(69);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(first.enddate).toBeNull();
    expect(first.startdate).toBe('1999-10-20');
    expect(first.episodes).toHaveLength(1);
    expect(first.episodes[0].airdate).toBe('1999-10-20');
  });

  it('caches completed anime and avoids a second fetch', async () => {
    const fetchMock = vi.fn(async () => new Response(COMPLETED_XML, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createClient();

    await client.getAnime(1);
    await client.getAnime(1);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps separate cache entries per AID', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      return new Response(url.includes('aid=69') ? AIRING_XML : COMPLETED_XML, { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createClient();

    await client.getAnime(69);
    await client.getAnime(1);
    await client.getAnime(69);
    await client.getAnime(1);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('AnidbHttpClient errors', () => {
  it('surfaces AniDB <error> without retrying', async () => {
    const fetchMock = vi.fn(async () => new Response('<error code="500">banned</error>', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createClient();

    await expect(client.getAnime(69)).rejects.toThrow(/banned/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws on malformed response', async () => {
    const fetchMock = vi.fn(async () => new Response('<html></html>', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createClient();

    await expect(client.getAnime(69)).rejects.toThrow(/Invalid AniDB response/);
  });
});
