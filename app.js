/* ── predictor front door ────────────────────── */
const STATES = ["Andaman and Nicobar Islands","Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chandigarh","Chhattisgarh","Dadra and Nagar Haveli","Daman and Diu","Delhi","Goa","Gujarat","Haryana","Himachal Pradesh","Jammu and Kashmir","Jharkhand","Karnataka","Kerala","Ladakh","Lakshadweep","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Puducherry","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal","Outside India"];
document.getElementById("heroState").innerHTML =
  '<option value="" disabled selected>Choose…</option>' + STATES.map(s => `<option>${s}</option>`).join("");

/* ── swap impact ─────────────────────────────── */
const SWAP={
  before:[{n:"1. CSE, NIT Warangal",p:6},{n:"2. ECE, NIT Warangal",p:31},{n:"3. CSE, NIT Trichy",p:4},{n:"4. Mech, NIT Surathkal",p:27}],
  after: [{n:"1. CSE, NIT Warangal",p:6},{n:"2. CSE, NIT Trichy",p:9},{n:"3. ECE, NIT Warangal",p:26},{n:"4. Mech, NIT Surathkal",p:27}]
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
  { q:"My list ended at #22 with a 61% chance of any seat and I had no idea. The simulator showed it; I added six safe options at the bottom and went into Round 1 at 96%. I'd never have worked that out on a spreadsheet.",
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
// Addresses go to a Google Form (Responses tab / linked sheet).  Google does
// not allow the response to be read cross-origin, so the request is sent
// no-cors and the page assumes it landed.
const WAITLIST = {
  action: "https://docs.google.com/forms/d/e/1FAIpQLSctecQDQsz7IHUEXrMXOt_GNsgAMvuWv9AA4SEgBYSwm-Ofjw/formResponse",
  email: "entry.737565681",
};
document.getElementById("nl").addEventListener("submit", async e=>{
  e.preventDefault();
  const form = e.target, button = form.querySelector("button");
  const body = new URLSearchParams({ [WAITLIST.email]: form.email.value });
  button.disabled = true;
  try {
    await fetch(WAITLIST.action, { method:"POST", mode:"no-cors", body,
      headers:{ "Content-Type":"application/x-www-form-urlencoded" } });
    form.reset();
    document.getElementById("nlMsg").hidden=false;
  } catch (_) {
    alert("Couldn't reach the sign-up form — please try again.");
  }
  button.disabled = false;
});
