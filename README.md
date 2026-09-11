# Anime Episode Conversion

TMDB → AniDB Episode Converter API.

## How It Works

TMDB and AniDB often use different season and episode numbering systems. For example, a TMDB "Season 2" might be AniDB "Season 3", or episode counts may differ between databases. Direct ID-based mapping between these services is unreliable.

This API solves the problem by using **air dates** as the bridge between both databases:

1. **TMDB** provides the episode's air date (`air_date` field from `/tv/{id}/season/{season}/episode/{episode}`)
2. The API fetches the show title from TMDB (including Romaji alternative title)
3. Title lookup finds candidate anime in AniDB using the `anime-titles.xml` index (exact + prefix matching)
4. For each candidate, the API fetches full episode data from AniDB's HTTP API
5. **Matching** compares the TMDB air date against all AniDB episode air dates for that anime
6. All AniDB episodes that aired on the same date are returned as results

This means the season/episode numbers in the response come from **AniDB**, not TMDB. If a show has multiple episodes on the same date, all of them are returned.

### Limitations

- Matching depends on accurate air dates in both databases
- If an episode has no air date in TMDB, it cannot be matched
- Title lookup may fail if the show has very different names between TMDB and AniDB


## Setup

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Copy `.env.example` to `.env` and add your TMDB API key:
   ```bash
   cp .env.example .env
   ```

3. Run the development server:
   ```bash
   pnpm dev
   ```


## Build

```bash
pnpm build
pnpm start
```

## Docker

### Build and run manually

```bash
docker build -t anime-episode-conversion .
docker run -p 3001:3001 -e TMDB_API_KEY=your_key anime-episode-conversion
```

### Docker Compose

```bash
docker compose up -d
```

The `data/` folder is mounted as a volume, so the AniDB titles index persists across container restarts.

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TMDB_API_KEY` | Yes | TMDB API v3 Bearer token |
| `ANIDB_API_URL` | Yes | AniDB HTTP API URL |
| `ANIDB_CLIENT` | Yes | Client name for AniDB API |
| `ANIDB_CLIENTVER` | Yes | Client version for AniDB API |
| `ANIDB_TITLES_FILE` | No | Local path to `anime-titles.xml.gz`. If empty, downloads from anidb.net and saves to `data/`. The titles index cache is always stored in `data/titles-index.json` |
| `PORT` | No | Server port (default: `3001`) |

### CI/CD

A GitHub Actions workflow (`.github/workflows/docker.yml`) automatically builds and pushes the Docker image to GHCR on push to `main`.

To enable Portainer auto-deploy, create a repository variable:
- **Settings → Secrets and variables → Actions → Variables**
- Name: `DEPLOY_TO_PORTAINER`
- Value: `true`

And a secret:
- Name: `PORTAINER_WEBHOOK_URL`
- Value: Your Portainer webhook URL


## Usage

### TV Series

Convert a TMDB TV episode to AniDB:

```
GET /tmdb-to-anidb/:tvId/:season/:episode
```

Example:
```
http://localhost:3001/tmdb-to-anidb/94664/1/1
```

### Movies

Convert a TMDB movie to AniDB (ID only):

```
GET /tmdb-to-anidb/:movieId
```

Example:
```
http://localhost:3001/tmdb-to-anidb/1218925
```

### TMDB → IMDB / TVDB Conversion

To convert TMDB IDs to IMDB or TVDB, use the official TMDB API:

```
GET /tv/{id}/external_ids
```

Reference: https://developer.themoviedb.org/reference/tv-episode-external-ids

## Available Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/` | Health check |
| POST | `/refresh-titles` | Refresh AniDB titles index (see warning below) |
| GET | `/tmdb-to-anidb/:id/:season?/:episode?` | Convert TMDB to AniDB (TV series and movies) |

> **Warning:** AniDB rate-limits title refreshes to once per day. The project already downloads and updates the titles index automatically on a daily basis. Only use `/refresh-titles` if you need to force an immediate refresh.

## Response Format

```json
{
  "results": [
    {
      "aid": 18324,
      "type": "Movie",
      "season": "Gekijouban Chainsaw Man: Reze Hen",
      "episode": 1,
      "date": "2025-09-19",
      "episodeCount": 1,
      "seasonDate": "2025-09-19",
      "titleEN": "Complete Movie",
      "titleJA": null
    }
  ]
}
```

### Multiple Results

When two or more episodes air on the same date, the API returns all of them:

```json
{
  "results": [
    {
      "aid": 18727,
      "type": "TV Series",
      "season": "Mushoku Tensei III: Isekai Ittara Honki Dasu",
      "episode": 1,
      "date": "2026-07-04",
      "episodeCount": 14,
      "seasonDate": "2026-07-04",
      "titleEN": "Burn Bright, Mad Dog",
      "titleJA": "燃えよ狂犬"
    },
    {
      "aid": 18727,
      "type": "TV Series",
      "season": "Mushoku Tensei III: Isekai Ittara Honki Dasu",
      "episode": 2,
      "date": "2026-07-04",
      "episodeCount": 14,
      "seasonDate": "2026-07-04",
      "titleEN": "Howl, Mad Dog",
      "titleJA": "吠えよ狂犬"
    }
  ]
}
```

This happens when a show airs multiple episodes on the same day (double premiere, recap + new episode, etc.). All matching episodes are included in the `results` array with their respective episode numbers and titles.

| Field | Description |
|-------|-------------|
| `aid` | AniDB Anime ID (unique identifier in AniDB) |
| `type` | Anime type (`TV`, `Movie`, `OVA`, `ONA`, `Special`) |
| `season` | First title from AniDB (usually the Japanese title) |
| `episode` | AniDB episode number (not TMDB episode number) |
| `date` | Air date used for matching (`YYYY-MM-DD`) |
| `episodeCount` | Total episode count of the anime in AniDB |
| `seasonDate` | Start date of the anime in AniDB |
| `titleEN` | Episode title in English |
| `titleJA` | Episode title in Japanese |

## Adding More Fields from AniDB

The AniDB XML response contains more data than what is currently returned. To add new fields, modify these files in order:

### 1. `src/types/anidb.ts` — Add fields to the type definitions

```typescript
// Example: add to AnidbAnime interface
description?: string;
rating?: string;
picture?: string;
url?: string;
```

### 2. `src/clients/anidb.ts` — Parse the new fields from XML

```typescript
// Example: extract from parsed XML in getAnime()
const description = anime.description?.['#text'] || null;
const rating = anime.ratings?.rating?.['#text'] || null;
const picture = anime.picture || null;
```

### 3. `src/matching.ts` — Pass new fields into MatchResult

```typescript
results.push({
  // ... existing fields ...
  description: anime.description,
  rating: anime.rating,
});
```

### 4. `src/types/result.ts` — Add new fields to MatchResult interface

```typescript
description?: string | null;
rating?: string | null;
```

### Available fields in AniDB XML (not currently parsed)

**Anime level:** `description`, `ratings`, `picture`, `url`, `tags`, `categories`, `relatedanime`, `characters`, `creators`, `resources`

**Episode level:** `length`, `rating`, `votes`, `summary`


### Cache

Results are cached in memory to avoid repeated API calls:

| Source | TTL | Description |
|--------|-----|-------------|
| TMDB | 8 hours | Show info, episode data, alternative titles |
| AniDB (airing) | 12 hours | Anime info for shows still airing |
| AniDB (completed) | 1 month | Anime info for completed shows |


## Licenses and Data Usage
This project uses third-party APIs and data under the following conditions:
* **AniDB:** Anime and episode data belong to AniDB and are licensed under CC BY-NC-SA 4.0. **This project CANNOT be used for commercial purposes.**
* **TMDB:** This product uses the TMDB API but is not endorsed or certified by TMDB.
