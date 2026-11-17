# Mandelduck Studios social analytics

Static one-page dashboard for how posts are doing on X, Instagram, YouTube and TikTok.

The live page is [https://mandelmonkey.github.io/mandelduck-dashboard/](https://mandelmonkey.github.io/mandelduck-dashboard/). It is plain HTML, CSS and JavaScript served from the repository root. There is no build step. Chart.js is loaded from a CDN.

`data/stats.json` is a real snapshot when `"example"` is `false`. The page only shows the “Example data” banner when `"example"` is `true`.

Counts that are not publicly available, and 7-day or 28-day figures that need more daily snapshots, are stored as `null`. The page shows an em dash or “not available yet” for those fields. Never substitute a guess or a rounded display value (for example Instagram’s “5K followers”).

## Update the numbers

1. Replace `data/stats.json` with a file that matches the schema below.
2. Set `"example": false` only when the file holds real stats. While it is `true`, the banner stays on the page.
3. Check the file:

   ```bash
   python3 scripts/validate_stats.py
   ```

4. Commit the file to `main`. GitHub Pages serves that branch’s root, so a refresh picks up the new file.

Preview locally with any static server (opening the HTML file directly will not let the page fetch the JSON):

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/`.

## What the page shows

- A headline card per platform: followers, 7-day follower change, and 28-day views.
- A “Best performers this week” callout: posts published in the 7 days before `updated_at`, ranked by engagement rate.
- Follower and daily-view trend charts drawn from `history`.
- A top-posts table that filters by platform and series, and sorts by views, likes or engagement rate.
- “Last updated”, shown in the `Europe/London` timezone.

Engagement rate is calculated in the page as `(likes + comments + shares) / views`. Posts with zero views have no rate.

## `data/stats.json` schema

The file is one JSON object. `scripts/validate_stats.py` checks this shape and nothing else (it does not require the post rows to add up to the platform totals).

| Field | Type | Meaning |
| --- | --- | --- |
| `updated_at` | string | ISO-8601 datetime the snapshot was taken, with a time component. Example: `"2026-11-17T12:00:00Z"`. |
| `example` | boolean | `true` while the file is sample data. The page shows the example banner only when this is `true`. |
| `platforms` | object | One object per platform. All four keys are required. |
| `posts` | array | One object per post. May be empty. |
| `history` | array | Daily snapshots, one object per platform per date. May be empty. |

Unknown keys are rejected. Counts are integers. Booleans are not accepted as numbers.

### `platforms`

Keys, in the order the page lists them: `x`, `instagram`, `youtube`, `tiktok`.

| Field | Type | Meaning |
| --- | --- | --- |
| `followers` | non-negative integer or `null` | Follower or subscriber count at `updated_at`. `null` if a public exact count is not available. |
| `followers_change_7d` | integer or `null` | Change in followers over the 7 days ending at `updated_at`. Negative means a drop. `null` until a snapshot from 7 days earlier exists. |
| `views_28d` | non-negative integer or `null` | Views on that platform over the 28 days ending at `updated_at`. `null` until 28 daily snapshots exist. |
| `engagement_28d` | non-negative integer or `null` | Engagements (likes, comments and shares combined) on that platform over those same 28 days. Account-level figure, not a sum the page computes from `posts`. `null` when a public 28-day total is not available. |

### `posts`

| Field | Type | Meaning |
| --- | --- | --- |
| `platform` | string | `x`, `instagram`, `youtube` or `tiktok`. |
| `id` | string | Non-empty id, unique for that platform. |
| `title` | string | Non-empty title shown in the table. |
| `url` | string | `http://` or `https://` link. The title opens this URL. |
| `published_at` | string | ISO-8601 datetime the post was published. |
| `series` | string | `my-wife-is-a-mystery`, `history`, `office` or `other`. |
| `views` | non-negative integer or `null` | Views counted for the post. |
| `likes` | non-negative integer or `null` | Likes counted for the post. |
| `comments` | non-negative integer or `null` | Comments counted for the post. |
| `shares` | non-negative integer or `null` | Shares counted for the post. |

### `history`

Each item is one platform’s snapshot for one calendar date. A date plus platform may appear only once.

| Field | Type | Meaning |
| --- | --- | --- |
| `date` | string | Calendar date `YYYY-MM-DD`. |
| `platform` | string | `x`, `instagram`, `youtube` or `tiktok`. |
| `followers` | non-negative integer or `null` | Follower count recorded for that date. |
| `views` | non-negative integer or `null` | Views on that date for that platform. This is the day’s views, not a running total. |

### Example shape

```json
{
  "updated_at": "2026-11-17T12:00:00Z",
  "example": true,
  "platforms": {
    "x": {
      "followers": 100,
      "followers_change_7d": 10,
      "views_28d": 1000,
      "engagement_28d": 100
    },
    "instagram": { "followers": 0, "followers_change_7d": 0, "views_28d": 0, "engagement_28d": 0 },
    "youtube": { "followers": 0, "followers_change_7d": 0, "views_28d": 0, "engagement_28d": 0 },
    "tiktok": { "followers": 0, "followers_change_7d": 0, "views_28d": 0, "engagement_28d": 0 }
  },
  "posts": [
    {
      "platform": "x",
      "id": "example-x-other-a",
      "title": "Example: other clip A",
      "url": "https://example.com/mandelduck/example-x-other-a",
      "published_at": "2026-11-15T09:00:00Z",
      "series": "other",
      "views": 100,
      "likes": 10,
      "comments": 1,
      "shares": 1
    }
  ],
  "history": [
    { "date": "2026-11-17", "platform": "x", "followers": 360, "views": 260 }
  ]
}
```

The numbers above are only a sketch of the fields. The file shipped in this repo is the full example, and it is still labelled `example: true`.

## GitHub Pages

Pages is set to deploy from the `main` branch root (`/`). `/.nojekyll` is present so Pages serves the files as they are, including `data/stats.json`.

If the site is not published, open the repository **Settings → Pages**, choose **Deploy from a branch**, select `main` and `/ (root)`, and save.
