# jeeneetrank chat worker

A Cloudflare Worker that proxies the site's chat to the Claude API, streams the reply, and rate-limits per IP. The API key lives only here.

```
cd chat
npx wrangler login                          # once; opens the browser
npx wrangler secret put ANTHROPIC_API_KEY   # paste the key
npx wrangler deploy                         # prints https://jeeneetrank-chat.<you>.workers.dev
```

Put that URL (plus `/chat`) in `CHAT_ENDPOINT` at the top of `../chat.js` and push the site.

Tuning: `MODEL` and `ALLOWED_ORIGINS` in `wrangler.toml`; per-IP limit in the `[[ratelimits]]` block; token caps at the top of `worker.js`.
