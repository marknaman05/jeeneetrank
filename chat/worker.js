/* jeeneetrank chat — a thin, rate-limited proxy in front of OpenRouter (DeepSeek).
 *
 * POST /chat  { messages: [{role, content}], context: {...} }
 *   -> text/event-stream of `data: {"t": "..."}` chunks, then `data: [DONE]`.
 *
 * The browser sends the page's current state as `context` (the candidate's
 * inputs, the top seats with probabilities, the choice list); the system
 * prompt is built here so the site cannot be talked into a different role.
 * The OpenRouter key never leaves this Worker.
 */

const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 2000;
const MAX_CONTEXT_CHARS = 16000;
const MAX_TOKENS = 450;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim());
    const cors = {
      "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST" || new URL(request.url).pathname !== "/chat") {
      return new Response("jeeneetrank chat: POST /chat", { status: 404, headers: cors });
    }
    if (!allowed.includes(origin)) return json({ error: "origin not allowed" }, 403, cors);

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (env.RATE) {
      const { success } = await env.RATE.limit({ key: ip });
      if (!success) return json({ error: "Too many messages — wait a minute and try again." }, 429, cors);
    }

    let body;
    try { body = await request.json(); } catch { return json({ error: "bad json" }, 400, cors); }
    const messages = sanitise(body.messages);
    if (!messages.length) return json({ error: "no message" }, 400, cors);
    const context = JSON.stringify(body.context || {}).slice(0, MAX_CONTEXT_CHARS);

    // OpenRouter speaks the OpenAI chat format; the system prompt goes in as
    // the first message.  Referer/Title are what OpenRouter uses to label
    // the traffic in its dashboard.
    const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://jeeneetrank.com",
        "X-Title": "jeeneetrank",
      },
      body: JSON.stringify({
        model: env.MODEL || "deepseek/deepseek-chat-v3.1",
        max_tokens: MAX_TOKENS,
        temperature: 0.4,
        stream: true,
        // DeepSeek's newer models "think" first and can spend the whole
        // budget on it; this is a chat, not a maths olympiad.
        reasoning: { enabled: false },
        messages: [{ role: "system", content: system(context) }, ...messages],
      }),
    });
    if (!upstream.ok) {
      const detail = await upstream.text();
      return json({ error: `model error ${upstream.status}`, detail: detail.slice(0, 300) }, 502, cors);
    }

    // Re-emit only the text deltas, so the browser never sees provider internals.
    const { readable, writable } = new TransformStream();
    (async () => {
      const writer = writable.getWriter(), enc = new TextEncoder(), dec = new TextDecoder();
      const reader = upstream.body.getReader();
      let buf = "";
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (payload === "[DONE]") continue;
            let ev; try { ev = JSON.parse(payload); } catch { continue; }
            const text = ev.choices?.[0]?.delta?.content;
            if (text) await writer.write(enc.encode(`data: ${JSON.stringify({ t: text })}\n\n`));
            else if (ev.error) await writer.write(enc.encode(`data: ${JSON.stringify({ error: ev.error.message || "error" })}\n\n`));
          }
        }
      } finally {
        await writer.write(enc.encode("data: [DONE]\n\n"));
        await writer.close();
      }
    })();
    return new Response(readable, { headers: { ...cors, "content-type": "text/event-stream", "cache-control": "no-store" } });
  },
};

function sanitise(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const m of list.slice(-MAX_MESSAGES)) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") continue;
    const content = m.content.trim().slice(0, MAX_MESSAGE_CHARS);
    if (!content) continue;
    // The API wants strictly alternating roles starting with the user.
    if (out.length && out[out.length - 1].role === m.role) out[out.length - 1].content += "\n" + content;
    else out.push({ role: m.role, content });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { ...headers, "content-type": "application/json" } });
}

function system(context) {
  return `You are the counselling assistant on jeeneetrank.com, a free JoSAA (JEE) seat predictor. You are talking to a student (or parent) during engineering admissions counselling in India.

You have the live state of their predictor page as JSON below: their inputs, the seats they are eligible for with the site's simulated probability for each, and their choice list with per-position odds. Use ONLY these numbers when you cite chances or closing ranks; never invent a closing rank or probability. If a seat they ask about is not in the context, say so and tell them to search for it on the page (the context only holds the top of the list).

How the site's numbers work: for each seat, the closing rank of last season is moved by a simulated year-to-year drift fitted on JoSAA 2016-${new Date().getFullYear() - 1}; the probability is the share of 2,000 simulated seasons in which the candidate's rank is within the seat's final-round closing rank. "At this position" in the choice list is the chance that seat is the one allotted, given every choice above it is tried first. Reordering never changes the chance of getting *a* seat, only which one; adding safer seats at the bottom is what raises it.

JoSAA facts you may rely on: IIT seats use JEE Advanced rank, NIT/IIIT/GFTI seats use JEE Main rank; OPEN seats are judged on CRL, category seats on category rank; NITs split seats 50/50 into Home State (HS) and Other State (OS) quotas by where class XII was passed; female-only supernumerary seats are extra seats only women compete for; Freeze = accept and exit, Float = accept but keep trying higher choices (the held seat is never lost), Slide = same institute, higher-listed programme; CSAB special rounds follow JoSAA for NIT+ seats; deadlines and fees must be checked on josaa.nic.in.

Style: concise, warm, direct — under 120 words unless the student asks for detail. Plain language; short paragraphs or a short list. Name at most 5 seats per answer. Answer in the language the student writes in (English, Hindi or Hinglish). Do not moralise. Say clearly when something is uncertain. Never suggest paying anyone for a seat; refer official matters to josaa.nic.in.

If you recommend specific seats from the context to add to their list, end your reply with one line exactly like: SUGGEST: id1,id2,id3 (using the "id" numbers from the context, at most 6). Otherwise do not include that line.

PAGE CONTEXT (JSON):
${context}`;
}
