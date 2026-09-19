/* ── predictor ───────────────────────────────── */
const DATA = {
  jee: { label:"All-India rank (CRL)", seats:[
    { c:"NIT Trichy",     b:"Computer Science",   cr:1100  },
    { c:"NIT Warangal",   b:"Electronics & Comm", cr:4200  },
    { c:"NIT Surathkal",  b:"Mechanical",         cr:11500 },
    { c:"IIIT Allahabad", b:"Information Tech",   cr:15800 },
    { c:"NIT Bhopal",     b:"Mechanical",         cr:24500 },
    { c:"NIT Jalandhar",  b:"Civil",              cr:46000 },
  ]},
  neet:{ label:"NEET all-India rank", seats:[
    { c:"MAMC, Delhi",            b:"MBBS · AIQ",   cr:260    },
    { c:"Grant Medical, Mumbai",  b:"MBBS · AIQ",   cr:3400   },
    { c:"GMC Nagpur",             b:"MBBS · State", cr:12500  },
    { c:"Govt Dental, Bengaluru", b:"BDS · AIQ",    cr:34000  },
    { c:"GMC Kannur",             b:"MBBS · State", cr:62000  },
    { c:"Govt Ayurveda, Nashik",  b:"BAMS · AIQ",   cr:148000 },
  ]}
};
let exam = "jee";
const $rank=document.getElementById("rank"), $cat=document.getElementById("cat"),
      $out=document.getElementById("results"), $ring=document.getElementById("ring"),
      $any=document.getElementById("anySeat");
const fmt = n => n.toLocaleString("en-IN");

const tier = p => p>=0.72 ? {t:"Safe",   cls:"border-emerald-200 bg-emerald-50 text-emerald-700", bar:"bg-emerald-500"}
              : p>=0.32 ? {t:"Likely", cls:"border-amber-200 bg-amber-50 text-amber-700",     bar:"bg-amber-500"}
                        : {t:"Reach",  cls:"border-rose-200 bg-rose-50 text-rose-600",        bar:"bg-rose-400"};

function render(){
  const rank = Math.max(1, Number($rank.value)||1), mult = Number($cat.value);
  const rows = DATA[exam].seats
    .map(s => ({...s, p: 1/(1+Math.pow(rank/(s.cr/mult), 2.6))}))
    .sort((a,b)=>b.p-a.p);

  $out.innerHTML = rows.map(r=>{
    const T=tier(r.p), pct=Math.round(r.p*100);
    return `<tr>
      <td class="px-4 py-3">
        <p class="text-[14px] font-semibold text-neutral-900">${r.c}</p>
        <p class="text-[13px] text-neutral-500">${r.b}</p>
      </td>
      <td class="px-4 py-3 font-mono text-[12px] text-neutral-500" style="font-variant-numeric:tabular-nums">${fmt(r.cr)}</td>
      <td class="px-4 py-3">
        <div class="flex items-center gap-2">
          <span class="w-9 font-mono text-[12px] text-neutral-900" style="font-variant-numeric:tabular-nums">${pct}%</span>
          <span class="rounded-full border ${T.cls} px-2 py-0.5 font-mono text-[9.5px]">${T.t}</span>
        </div>
        <div class="mt-2 h-1 w-full overflow-hidden rounded-full bg-neutral-100">
          <div class="bar h-full rounded-full ${T.bar}" style="width:${Math.max(2,pct)}%"></div>
        </div>
      </td></tr>`;
  }).join("");

  const any = 1 - rows.reduce((a,r)=>a*(1-r.p),1), pct = Math.round(any*100);
  $any.textContent = pct + "%";
  $ring.setAttribute("stroke-dashoffset", (113 - 113*any).toFixed(1));
}

document.querySelectorAll(".exam-btn").forEach((btn,i)=>{
  btn.addEventListener("click",()=>{
    exam = btn.dataset.exam;
    document.getElementById("segPill").style.transform = `translateX(${i*100}%)`;
    document.querySelectorAll(".exam-btn").forEach(b=>{
      b.className = "exam-btn relative z-10 flex-1 py-1.5 transition-colors " +
        (b.dataset.exam===exam ? "text-neutral-900" : "text-neutral-500");
    });
    document.getElementById("rankLabel").textContent = DATA[exam].label;
    $rank.value = exam==="jee" ? 18500 : 42000;
    render();
  });
});
document.querySelector('.exam-btn[data-exam="jee"]').click();
$rank.addEventListener("input", render);
$cat.addEventListener("change", render);

/* ── swap impact ─────────────────────────────── */
const SWAP={
  before:[{n:"1. CSE, NIT Warangal",p:6},{n:"2. ECE, NIT Warangal",p:38},{n:"3. CSE, NIT Trichy",p:9},{n:"4. Mech, NIT Surathkal",p:41}],
  after: [{n:"1. CSE, NIT Warangal",p:6},{n:"2. CSE, NIT Trichy",p:9},{n:"3. ECE, NIT Warangal",p:35},{n:"4. Mech, NIT Surathkal",p:40}]
};
const bars=(list,el)=>el.innerHTML=list.map(r=>`
  <div><div class="flex items-baseline justify-between gap-3">
    <p class="text-[14px] text-neutral-700">${r.n}</p>
    <p class="font-mono text-[12px] text-neutral-900" style="font-variant-numeric:tabular-nums">${r.p}%</p></div>
  <div class="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-neutral-100">
    <div class="bar h-full rounded-full bg-neutral-800" style="width:${Math.max(2,r.p)}%"></div></div></div>`).join("");
bars(SWAP.before, document.getElementById("beforeList"));
bars(SWAP.after,  document.getElementById("afterList"));

/* ── testimonial carousel ────────────────────── */
const T = [
  { q:"I had ECE Warangal at #14. The simulator showed it was worth more at #6, and my odds of any NIT went up nine points. I'd never have worked that out on a spreadsheet.",
    n:"Aditya S.", r:"JEE Main · AIR 21,400 · Patna", a:"AS" },
  { q:"My EWS certificate was from the wrong financial year and nobody told me. jeeneetrank caught it eleven days before Round 2 reporting.",
    n:"Riya K.", r:"NEET UG · AIR 44,900 · Nagpur", a:"RK" },
  { q:"We paid ₹499 instead of ₹40,000 to a consultant, and the fee-and-bond breakdown was the first honest number anyone gave us.",
    n:"Mahesh J.", r:"Parent · Coimbatore", a:"MJ" },
];
const star = '<svg viewBox="0 0 24 24" fill="#171717" class="h-3.5 w-3.5"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/></svg>';
document.getElementById("stars").innerHTML = star.repeat(5);
const $q=document.getElementById("tQuote"), $who=document.getElementById("tWho"),
      $dots=document.getElementById("dots");
let ti = 0;
function paint(i){
  const t=T[i];
  $q.textContent = '“' + t.q + '”';
  document.getElementById("tName").textContent = t.n;
  document.getElementById("tRole").textContent = t.r;
  document.getElementById("tAv").textContent = t.a;
  $dots.innerHTML = T.map((_,k)=>`<button data-i="${k}" aria-label="Testimonial ${k+1}"
    class="h-1.5 rounded-full transition-all duration-500 ease-smooth ${k===i?'w-5 bg-neutral-900':'w-1.5 bg-neutral-300'}"></button>`).join("");
  $dots.querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>{ti=+b.dataset.i;swap();}));
}
function swap(){
  $q.classList.remove("on"); $who.classList.remove("on");
  setTimeout(()=>{ paint(ti); $q.classList.add("on"); $who.classList.add("on"); }, 220);
}
paint(0);
setInterval(()=>{ ti=(ti+1)%T.length; swap(); }, 6000);

/* ── pricing toggle ──────────────────────────── */
const PLANS={
  jee:{ price:"₹499", note:"Covers the whole JoSAA + CSAB cycle. Not a subscription.",
        rounds:"Round-by-round freeze / float / slide calls",
        free:"Fee and placement details on every college" },
  neet:{ price:"₹699", note:"Covers AIQ, state, deemed and mop-up rounds. Not a subscription.",
        rounds:"Round-by-round freeze / upgrade / mop-up calls",
        free:"Fee, bond and total-cost details on every college" }
};
document.querySelectorAll(".plan-btn").forEach((btn,i)=>{
  btn.addEventListener("click",()=>{
    const k=btn.dataset.plan, P=PLANS[k];
    document.getElementById("planPill").style.transform = `translateX(${i*100}%)`;
    document.querySelectorAll(".plan-btn").forEach(b=>{
      b.className="plan-btn relative z-10 px-5 py-1.5 transition-colors "+
        (b.dataset.plan===k ? "text-neutral-900" : "text-neutral-500");
    });
    document.getElementById("price").textContent=P.price;
    document.getElementById("planNote").textContent=P.note;
    document.getElementById("paidRounds").textContent=P.rounds;
    document.getElementById("freeExtra").textContent=P.free;
  });
});
document.querySelector('.plan-btn[data-plan="jee"]').click();

/* ── countdown (days / hours / minutes) ──────── */
const TARGET=new Date("2027-06-10T10:00:00+05:30").getTime();
function tick(){
  const d=Math.max(0,TARGET-Date.now());
  const parts=[["Days",Math.floor(d/864e5)],["Hours",Math.floor(d%864e5/36e5)],["Minutes",Math.floor(d%36e5/6e4)]];
  document.getElementById("countdown").innerHTML = parts.map(([l,v])=>`
    <div class="flex-1 rounded-lg border border-neutral-200 py-3">
      <p class="font-serif text-[32px] leading-none text-neutral-900" style="font-variant-numeric:tabular-nums">${String(v).padStart(2,"0")}</p>
      <p class="mt-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-neutral-400">${l}</p></div>`).join("");
}
tick(); setInterval(tick,30000);

/* ── waitlist ────────────────────────────────── */
// Static site: there is no backend yet, so the form only confirms.  Wire
// WAITLIST_ENDPOINT to a Formspree / Google Form / worker URL to collect
// addresses for real.
const WAITLIST_ENDPOINT = "";
document.getElementById("nl").addEventListener("submit", async e=>{
  e.preventDefault();
  const form = e.target;
  if (WAITLIST_ENDPOINT) {
    try { await fetch(WAITLIST_ENDPOINT, { method:"POST", body:new FormData(form), headers:{Accept:"application/json"} }); }
    catch (_) {}
  }
  form.reset();
  document.getElementById("nlMsg").hidden=false;
});
