# jeeneetrank.com

Landing page for jeeneetrank — a JEE / NEET counselling simulator.

Static site: `index.html` + `app.js`, Tailwind via CDN. No build step.

Deployed with GitHub Pages at https://jeeneetrank.com (custom domain via `CNAME`).

Local preview: `python3 -m http.server 8080` then open http://localhost:8080.

The waitlist form is front-end only until `WAITLIST_ENDPOINT` in `app.js` points at a form backend.
