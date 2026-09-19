/* jeeneetrank predictor — runs entirely in the browser.
 *
 * Data: site-data/josaa.json (every JoSAA seat from the latest final round
 * with its closing rank, plus the drift model fitted in data/josaa/model.py).
 *
 * Model, same as the Python: next year's closing rank for a seat is
 *   closing × exp(year shock + institute shock + seat noise)
 * where the year shock is shared by every seat, the institute shock by the
 * institute's seats, and the noise is per seat (t4-distributed, scale by
 * rank band).  A candidate gets the seat if their rank <= closing rank.  We
 * draw RUNS such years and count.  The shared shocks are what make P(any
 * seat) honest: a bad year sinks every choice at once.
 */

const RUNS = 2000;

// ── deterministic PRNG so the same inputs always give the same numbers ──
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function gaussian(rand) {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
// Student t with 4 degrees of freedom: normal / sqrt(chi2_4 / 4).
function student4(rand) {
  const z = gaussian(rand);
  let chi = 0;
  for (let i = 0; i < 4; i++) { const g = gaussian(rand); chi += g * g; }
  return z / Math.sqrt(chi / 4);
}

// ── eligibility ─────────────────────────────────────────────────────────
const STATE_QUOTAS = { "Goa": "GO", "Jammu and Kashmir": "JK", "Ladakh": "LA" };

/* Which seats this candidate can be allotted, and at which rank each is
 * judged.  Returns [{seat index, rank}].
 *
 *  - IIT seats are judged on the JEE Advanced rank; everything else on the
 *    JEE Main rank.  No Advanced rank → IITs are skipped.
 *  - OPEN seats are open to all, at the CRL.  Category seats (OBC-NCL, SC,
 *    ST, EWS) at the category rank.  PwD candidates see the PwD seats of
 *    their category and the non-PwD ones too.
 *  - Female candidates see Gender-Neutral and Female-only seats; others
 *    only Gender-Neutral.
 *  - Quota: AI everywhere; HS at institutes in the home state, OS at the
 *    rest; GO / JK / LA only for candidates from those places.
 */
function eligible(data, c) {
  const I = data.institutes, Q = data.quotas, C = data.categories, G = data.genders;
  const out = [];
  for (let s = 0; s < data.seats.length; s++) {
    const [inst, , quota, cat, gender] = data.seats[s];
    const institute = I[inst];
    const isIIT = institute.type === "IIT";
    const mainRank = c.mainRank, advRank = c.advRank;

    const catName = C[cat];
    const base = catName.replace(" (PwD)", "");
    const pwd = catName.endsWith("(PwD)");
    if (pwd && !c.pwd) continue;
    let rankKey;
    if (base === "OPEN") rankKey = "crl";
    else if (base === c.category) rankKey = "cat";
    else continue;

    const g = G[gender];
    if (g.startsWith("Female") && c.gender !== "F") continue;

    const q = Q[quota];
    if (q === "HS" && institute.state !== c.state) continue;
    if (q === "OS" && institute.state === c.state) continue;
    if ((q === "GO" || q === "JK" || q === "LA") && STATE_QUOTAS[c.state] !== q) continue;

    // Which number to compare with the closing rank.
    let rank;
    if (isIIT) { if (!advRank) continue; rank = rankKey === "crl" ? advRank.crl : advRank.cat; }
    else rank = rankKey === "crl" ? mainRank.crl : mainRank.cat;
    if (!rank) continue;
    out.push({ s, rank, pwd });
  }
  return out;
}

// ── simulation ──────────────────────────────────────────────────────────
function noiseSigma(drift, closing) {
  const b = drift.bands;
  for (let i = 0; i < b.length - 1; i++) {
    const hi = b[i + 1] === null ? Infinity : b[i + 1];
    if (closing < hi) return drift.noise_sigma_by_band[i];
  }
  return drift.noise_sigma_by_band[drift.noise_sigma_by_band.length - 1];
}

/* For the eligible seats, RUNS simulated closing ranks; returns for each
 * seat the fraction of runs in which the candidate gets it, and the matrix
 * of hits (Uint8Array runs×n) for list simulation. */
function simulate(data, elig, seed = 1) {
  const rand = mulberry32(seed);
  const d = data.drift, n = elig.length;
  const closing = new Float64Array(n), sigma = new Float64Array(n), inst = new Int32Array(n), rank = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const seat = data.seats[elig[i].s];
    closing[i] = seat[5]; sigma[i] = noiseSigma(d, seat[5]) / Math.SQRT2; inst[i] = seat[0]; rank[i] = elig[i].rank;
  }
  const nInst = data.institutes.length;
  const hits = new Uint8Array(RUNS * n);
  const count = new Uint32Array(n);
  const instShock = new Float64Array(nInst);
  for (let r = 0; r < RUNS; r++) {
    const year = d.year_shock_mean + d.year_shock_sigma * gaussian(rand);
    for (let k = 0; k < nInst; k++) instShock[k] = d.inst_shock_sigma * gaussian(rand);
    const row = r * n;
    for (let i = 0; i < n; i++) {
      const cr = closing[i] * Math.exp(year + instShock[inst[i]] + sigma[i] * student4(rand));
      if (rank[i] <= cr) { hits[row + i] = 1; count[i]++; }
    }
  }
  const p = new Float64Array(n);
  for (let i = 0; i < n; i++) p[i] = count[i] / RUNS;
  return { p, hits, n };
}

/* Given an ordered list of indices into `elig`, the probability of ending
 * up at each position, and of getting anything at all. */
function simulateList(sim, order) {
  const perPos = new Float64Array(order.length);
  let any = 0;
  for (let r = 0; r < RUNS; r++) {
    const row = r * sim.n;
    for (let k = 0; k < order.length; k++) {
      if (sim.hits[row + order[k]]) { perPos[k]++; any++; break; }
    }
  }
  for (let k = 0; k < order.length; k++) perPos[k] /= RUNS;
  return { perPos, any: any / RUNS };
}

/* P(at least one of these seats admits) — the "any seat" number. */
function anyOf(sim, indices) {
  let any = 0;
  for (let r = 0; r < RUNS; r++) {
    const row = r * sim.n;
    for (const i of indices) if (sim.hits[row + i]) { any++; break; }
  }
  return any / RUNS;
}

window.JNR = { eligible, simulate, simulateList, anyOf, RUNS };
