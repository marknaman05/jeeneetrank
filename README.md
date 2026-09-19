# jeeneetrank.com

Landing page for jeeneetrank — a JEE / NEET counselling simulator.

Static site: `index.html` + `app.js`, Tailwind via CDN. No build step.

Deployed with GitHub Pages at https://jeeneetrank.com (custom domain via `CNAME`).

Local preview: `python3 -m http.server 8080` then open http://localhost:8080.

The waitlist form posts to a Google Form (see `WAITLIST` in `app.js`); responses land in that form's Responses tab.

## Data pipeline (`data/`)

Python, managed with `uv` (`cd data && uv sync`).

- `josaa/scrape.py` — pulls JoSAA opening/closing ranks for every year (2016→) and round into `josaa/orcr.parquet`. Raw HTML is cached in `josaa/raw/` (gitignored, ~800 MB); `--parse-only` rebuilds the parquet from it.
- `josaa/model.py` — the drift model (year shock + institute shock + seat noise on log closing rank) and `--backtest YEAR` calibration scorecard.
- `josaa/export.py` — writes `site-data/josaa.json` (latest final-round seats + drift parameters + institute states) for the browser predictor.

Yearly refresh: `uv run python josaa/scrape.py --years <year> && uv run python josaa/model.py && uv run python josaa/export.py`, then commit `site-data/josaa.json`.

## Predictor (`predict.html` + `predict.js`)

Runs entirely client-side. For each eligible seat (category, gender, home-state quota, IIT only with an Advanced rank) it simulates 2,000 next-season closing ranks with correlated year/institute shocks and reports the share in which the candidate's rank gets in. Backtest on 2025: Brier 0.116, buckets within a few points of calibrated.
