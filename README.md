# jeeneetrank.com

Landing page for jeeneetrank — a JEE / NEET counselling simulator.

Static site: `index.html`, `predict.html`, `app.js`, `predict.js`. Tailwind v4 is built to `styles.css` (committed): `npm install && npm run css` after changing classes (`npm run css:watch` while editing).

Deployed with GitHub Pages at https://jeeneetrank.com (custom domain via `CNAME`).

Local preview: `python3 -m http.server 8080` then open http://localhost:8080.

The waitlist form posts to a Google Form (see `WAITLIST` in `app.js`); responses land in that form's Responses tab.

## Data pipeline (`data/`)

Python, managed with `uv` (`cd data && uv sync`).

- `josaa/scrape.py` — pulls JoSAA opening/closing ranks for every year (2016→) and round into `josaa/orcr.parquet`. Raw HTML is cached in `josaa/raw/` (gitignored, ~800 MB); `--parse-only` rebuilds the parquet from it.
- `josaa/model.py` — the drift model (year shock + institute shock + seat noise on log closing rank) and `--backtest YEAR` calibration scorecard.
- `josaa/rounds.py` — per-round loosening (log final closing / round-r closing, 2018→) as quantiles, for the freeze/float advisor.
- `josaa/export.py` — writes `site-data/josaa.json` (latest final-round seats + drift parameters + institute states) for the browser predictor.

Yearly refresh: `uv run python josaa/scrape.py --years <year> && uv run python josaa/model.py && uv run python josaa/export.py`, then commit `site-data/josaa.json`.

## Predictor (`predict.html` + `predict.js`)

Runs entirely client-side. For each eligible seat (category, gender, home-state quota, IIT only with an Advanced rank) it simulates 2,000 next-season closing ranks with correlated year/institute shocks and reports the share in which the candidate's rank gets in. Backtest on 2025: Brier 0.116, buckets within a few points of calibrated.

The choice-list builder scores an ordered list by the first seat that admits in each simulated season (per-position odds, most likely outcome, any-seat). The round advisor conditions on "not admitted in round r" and samples that round's historical loosening to estimate what floating could still win by the final round.

## Chat assistant (`chat.js` + `chat/`)

A floating assistant on the predictor. Each message carries the page state (inputs, top seats with probabilities, borderline seats, the choice list with per-position odds, round-advisor state) to a Cloudflare Worker in `chat/`, which holds the OpenRouter key (DeepSeek model), streams the reply and rate-limits per IP. Replies can end with `SUGGEST: id,…`, rendered as one-click add-to-list chips. Deploy steps in `chat/README.md`; set `CHAT_ENDPOINT` in `chat.js`.

## 1:1 session bookings (`book.html`)

Slots are 45 min, 6–9 pm IST weekdays / 11 am–9 pm weekends, next 14 days. Pay-first: `POST /book` validates, holds the slot for 15 minutes and returns a Dodo checkout URL (₹399 + GST product); Dodo's `payment.succeeded` webhook at `/dodo-webhook` confirms it; the page polls `GET /booking?id=`. Worker vars `DODO_ENV`, `DODO_PRODUCT_ID`, `SITE_URL`; secrets `DODO_API_KEY`, `DODO_WEBHOOK_KEY`. Read them with:

```
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://jeeneetrank-chat.marknaman05.workers.dev/bookings
```

(`ADMIN_TOKEN` is a Worker secret; a copy is in `chat/.dev.vars`, gitignored.) Only `status: "paid"` bookings are real; `?status=paid` filters. On payment the Worker also creates a Google Calendar event (with a Meet link, student invited) in the counsellor's calendar — one-time auth via `chat/google-auth.py`, secrets `GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN`.
