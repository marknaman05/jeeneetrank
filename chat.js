/* jeeneetrank chat widget.
 *
 * A floating panel on the predictor page.  Every message goes to the chat
 * Worker (chat/worker.js) together with the page's live state -- inputs,
 * top seats with probabilities, the choice list -- so the assistant talks
 * about this student's numbers.  Replies stream in; a trailing
 * "SUGGEST: id,id" line becomes one-click "add to list" chips.
 *
 * Needs window.JNR_PAGE = { data(), result(), list(), candidate(), addSeat(id) }
 * from predict.html.
 */

const CHAT_ENDPOINT = "https://jeeneetrank-chat.marknaman05.workers.dev/chat";
const MAX_TURNS = 12;

(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const history = [];   // {role, content}
  let busy = false;

  // ── markup ────────────────────────────────────────────────────────────
  const root = document.createElement("div");
  root.id = "jnrChat";
  root.innerHTML = `
    <button id="jnrChatFab" type="button" aria-label="Ask about your seats">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.3 7.3L4 21l1.7-5.7A8 8 0 1 1 21 12z"/></svg>
      <span>Ask about my seats</span>
    </button>
    <section id="jnrChatPanel" hidden aria-label="Chat">
      <header>
        <div>
          <p class="jnr-k">jeeneetrank · assistant</p>
          <p class="jnr-t">Ask anything about your seats</p>
        </div>
        <button id="jnrChatClose" type="button" aria-label="Close">✕</button>
      </header>
      <div id="jnrChatLog"></div>
      <div id="jnrChatHints">
        <button type="button">Which of my choices are realistic?</button>
        <button type="button">Is my list safe enough at the bottom?</button>
        <button type="button">Should I float or freeze?</button>
        <button type="button">HS vs OS quota — what does it mean for me?</button>
      </div>
      <form id="jnrChatForm">
        <textarea id="jnrChatInput" rows="1" placeholder="Type a question… (English / Hindi)" maxlength="2000"></textarea>
        <button type="submit" aria-label="Send">↑</button>
      </form>
      <p class="jnr-fine">Answers use the numbers on this page. Verify on josaa.nic.in before you submit. No login, nothing stored.</p>
    </section>`;
  document.body.appendChild(root);

  const style = document.createElement("style");
  style.textContent = `
    #jnrChat{position:fixed;right:20px;bottom:20px;z-index:70;font-family:Geist,ui-sans-serif,system-ui,sans-serif;letter-spacing:-0.02em}
    #jnrChatFab{display:flex;align-items:center;gap:8px;background:#171717;color:#fff;border:0;border-radius:999px;padding:12px 18px;font:500 14px/1 inherit;box-shadow:0 20px 25px -5px rgba(0,0,0,.25);cursor:pointer}
    #jnrChatFab:hover{background:#000}
    #jnrChatPanel{position:absolute;right:0;bottom:0;width:min(420px,calc(100vw - 32px));height:min(640px,calc(100vh - 48px));display:flex;flex-direction:column;background:#fff;border:1px solid #e5e5e5;border-radius:16px;box-shadow:0 25px 50px -12px rgba(0,0,0,.3);overflow:hidden}
    #jnrChatPanel header{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:#171717;color:#fff}
    #jnrChatPanel .jnr-k{margin:0;font-family:"Geist Mono",ui-monospace,monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#a3a3a3}
    #jnrChatPanel .jnr-t{margin:2px 0 0;font-family:"Instrument Serif",ui-serif,Georgia,serif;font-size:19px;letter-spacing:0}
    #jnrChatClose{background:none;border:0;color:#a3a3a3;font-size:16px;cursor:pointer}
    #jnrChatClose:hover{color:#fff}
    #jnrChatLog{flex:1;overflow-y:auto;padding:14px 14px 4px;display:flex;flex-direction:column;gap:10px;background:#fafafa}
    .jnr-m{max-width:88%;padding:10px 13px;border-radius:14px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word}
    .jnr-m.u{align-self:flex-end;background:#171717;color:#fff;border-bottom-right-radius:4px}
    .jnr-m.a{align-self:flex-start;background:#fff;border:1px solid #e5e5e5;color:#171717;border-bottom-left-radius:4px}
    .jnr-m.a b{font-weight:600}
    .jnr-m.err{align-self:center;background:#fff1f2;color:#be123c;border:1px solid #fecdd3;font-size:13px}
    .jnr-sug{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
    .jnr-sug button{border:1px solid #171717;background:#fff;border-radius:999px;padding:4px 10px;font:500 12px/1.3 inherit;color:#171717;cursor:pointer}
    .jnr-sug button:hover{background:#171717;color:#fff}
    .jnr-sug button[disabled]{opacity:.45;cursor:default}
    #jnrChatHints{display:flex;flex-wrap:wrap;gap:6px;padding:8px 14px;background:#fafafa}
    #jnrChatHints button{border:1px solid #e5e5e5;background:#fff;border-radius:999px;padding:5px 10px;font:400 12px/1.3 inherit;color:#404040;cursor:pointer}
    #jnrChatHints button:hover{border-color:#171717;color:#171717}
    #jnrChatForm{display:flex;gap:8px;padding:10px 12px;border-top:1px solid #e5e5e5;background:#fff}
    #jnrChatInput{flex:1;resize:none;border:1px solid #e5e5e5;border-radius:10px;padding:10px 12px;font:14px/1.4 inherit;max-height:120px;outline:none}
    #jnrChatInput:focus{border-color:#171717}
    #jnrChatForm button{width:40px;border:0;border-radius:10px;background:#171717;color:#fff;font-size:16px;cursor:pointer}
    #jnrChatForm button[disabled]{opacity:.4;cursor:default}
    .jnr-fine{margin:0;padding:0 14px 10px;font-family:"Geist Mono",ui-monospace,monospace;font-size:10px;color:#a3a3a3;background:#fff}
    .jnr-dots i{display:inline-block;width:5px;height:5px;margin-right:3px;border-radius:50%;background:#a3a3a3;animation:jnrb 1s infinite}
    .jnr-dots i:nth-child(2){animation-delay:.15s}.jnr-dots i:nth-child(3){animation-delay:.3s}
    @keyframes jnrb{0%,80%,100%{opacity:.3}40%{opacity:1}}
    @media (max-width:640px){#jnrChat{right:12px;bottom:12px}#jnrChatFab span{display:none}#jnrChatFab{padding:14px}}
  `;
  document.head.appendChild(style);

  const fab = $("#jnrChatFab"), panel = $("#jnrChatPanel"), log = $("#jnrChatLog"), form = $("#jnrChatForm"), input = $("#jnrChatInput");

  fab.addEventListener("click", () => { panel.hidden = false; fab.hidden = true; input.focus(); if (!log.children.length) greet(); });
  $("#jnrChatClose").addEventListener("click", () => { panel.hidden = true; fab.hidden = false; });
  $("#jnrChatHints").addEventListener("click", e => { const b = e.target.closest("button"); if (b) send(b.textContent); });
  form.addEventListener("submit", e => { e.preventDefault(); send(input.value); });
  input.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input.value); } });
  input.addEventListener("input", () => { input.style.height = "auto"; input.style.height = Math.min(120, input.scrollHeight) + "px"; });

  function greet() {
    const page = window.JNR_PAGE, has = page && page.result();
    bubble("a", has
      ? "Hi. I can see your inputs, your eligible seats and your choice list. Ask me anything — which seats are realistic, whether the list is safe, what a quota means, freeze or float."
      : "Hi. Fill in your rank and state and press “Show my chances” first — then I can talk about your actual seats.");
  }

  function bubble(kind, text) {
    const el = document.createElement("div");
    el.className = "jnr-m " + kind;
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  // ── page state → compact context ──────────────────────────────────────
  function context() {
    const page = window.JNR_PAGE;
    if (!page) return {};
    const data = page.data(), result = page.result();
    const ctx = { site: "jeeneetrank.com JoSAA predictor", season: data && data.season };
    if (!data || !result) return ctx;
    const { elig, sim } = result;
    const seatRow = i => {
      const s = data.seats[elig[i].s], inst = data.institutes[s[0]];
      return { id: elig[i].s, institute: inst.short, type: inst.type, state: inst.state, program: data.programs[s[1]].replace(/\s*\(.*?\)\s*$/, ""),
        quota: data.quotas[s[2]], category: data.categories[s[3]], female_only: data.genders[s[4]].startsWith("Female"),
        closing_last_season: s[5], closing_two_seasons_ago: s[7], your_rank: elig[i].rank, chance: Math.round(sim.p[i] * 100) / 100 };
    };
    ctx.candidate = page.candidate();
    ctx.eligible_seats_total = elig.length;
    // What the student is looking at: the filtered view, top of it.
    const view = page.visible();
    ctx.seats_in_current_view = view.length;
    ctx.top_seats_in_view = view.slice(0, 45).map(seatRow);
    // Plus the borderline ones, which is where advice matters.
    const likely = [...elig.keys()].filter(i => sim.p[i] >= 0.2 && sim.p[i] <= 0.85).sort((a, b) => data.seats[elig[a].s][5] - data.seats[elig[b].s][5]).slice(0, 30);
    ctx.borderline_seats = likely.map(seatRow);
    const list = page.list();
    ctx.choice_list = list.entries.map((e, k) => ({ position: k + 1, ...(e.i >= 0 ? seatRow(e.i) : { id: e.s, note: "not eligible with current inputs" }), chance_you_land_here: Math.round(e.perPos * 100) / 100 }));
    ctx.choice_list_any_seat = Math.round(list.any * 100) / 100;
    const adv = page.advisor();
    if (adv) ctx.round_advisor = adv;
    return ctx;
  }

  // ── send / stream ─────────────────────────────────────────────────────
  async function send(text) {
    text = (text || "").trim();
    if (!text || busy) return;
    busy = true; input.value = ""; input.style.height = "auto"; form.querySelector("button").disabled = true;
    bubble("u", text);
    history.push({ role: "user", content: text });
    const el = bubble("a", ""); el.innerHTML = `<span class="jnr-dots"><i></i><i></i><i></i></span>`;
    let full = "";
    try {
      const r = await fetch(CHAT_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.slice(-MAX_TURNS), context: context() }) });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || `error ${r.status}`); }
      const reader = r.body.getReader(), dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n\n")) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 2);
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") break;
          let ev; try { ev = JSON.parse(payload); } catch { continue; }
          if (ev.error) throw new Error(ev.error);
          full += ev.t || ""; render(el, full); log.scrollTop = log.scrollHeight;
        }
      }
      history.push({ role: "assistant", content: full });
      render(el, full, true);
    } catch (err) {
      el.remove(); bubble("err", err.message === "Failed to fetch" ? "Can't reach the assistant right now." : err.message);
      history.pop();
    } finally {
      busy = false; form.querySelector("button").disabled = false; input.focus();
    }
  }

  // Minimal markdown: **bold**, bullets, and the SUGGEST line → chips.
  function render(el, text, final = false) {
    let body = text, suggest = null;
    const m = body.match(/\n?SUGGEST:\s*([\d,\s]+)\s*$/);
    if (m) { suggest = m[1].split(",").map(s => parseInt(s, 10)).filter(Number.isInteger); body = body.slice(0, m.index); }
    const esc = s => s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    let html = esc(body).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/^\s*[-•]\s+/gm, "• ");
    el.innerHTML = html || `<span class="jnr-dots"><i></i><i></i><i></i></span>`;
    if (final && suggest && suggest.length && window.JNR_PAGE) {
      const data = window.JNR_PAGE.data(), wrap = document.createElement("div"); wrap.className = "jnr-sug";
      for (const id of suggest.slice(0, 6)) {
        const s = data.seats[id]; if (!s) continue;
        const b = document.createElement("button"); b.type = "button";
        b.textContent = `+ ${data.institutes[s[0]].short} · ${data.programs[s[1]].replace(/\s*\(.*?\)\s*$/, "")}`;
        b.addEventListener("click", () => { window.JNR_PAGE.addSeat(id); b.disabled = true; b.textContent = "✓ " + b.textContent.slice(2); });
        wrap.appendChild(b);
      }
      el.appendChild(wrap);
    }
  }
})();
