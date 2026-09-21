import { PEOPLE, CURRENCY, firebaseConfig } from "./config.js";

/* ============================================================
   Constants
   ============================================================ */
const CATS = [
  { key: "gift",   label: "Gift",       emoji: "🎁" },
  { key: "exp",    label: "Experience", emoji: "🎢" },
  { key: "food",   label: "Food",       emoji: "🍽️" },
  { key: "trip",   label: "Trip",       emoji: "✈️" },
  { key: "clothes",label: "Clothes",    emoji: "👗" },
  { key: "beauty", label: "Beauty",     emoji: "💄" },
  { key: "home",   label: "Home",       emoji: "🏡" },
  { key: "tech",   label: "Tech",       emoji: "📱" },
  { key: "book",   label: "Book",       emoji: "📚" },
  { key: "other",  label: "Other",      emoji: "✨" },
];
const PRIO = { 1: "Must have", 2: "Would love", 3: "Someday" };
const CLAIM = { idea: "💡 Planning", got: "✅ Got it", done: "🎉 Given" };

const catOf = (k) => CATS.find((c) => c.key === k) || CATS[CATS.length - 1];
const person = (k) => PEOPLE.find((p) => p.key === k);
const partnerOf = (k) => (k === "her" ? "him" : "her");
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (sel, root = document) => root.querySelector(sel);

/* ============================================================
   Store adapters
   Both expose the same interface:
     start(onAuth)               -> calls onAuth(roleKey | null | "denied")
     signIn(role?) / signOut()
     onWishes(cb)                -> cb(wishes[])  (all wishes, both owners)
     onClaims(partnerRole, cb)   -> cb({wishId: claim})  (only partner's list)
     onNotes(role, cb)           -> cb(text)
     addWish / updateWish / deleteWish
     setClaim(wishId, owner, data|null)
     setNotes(role, text)
   ============================================================ */

class LocalStore {
  constructor() {
    this.key = "wishes.local.v1";
    this.data = this._load();
    this.subs = { wishes: [], claims: [], notes: [] };
    this.mode = "local";
  }
  _load() {
    try { return JSON.parse(localStorage.getItem(this.key)) || { wishes: [], claims: {}, notes: {}, role: null }; }
    catch { return { wishes: [], claims: {}, notes: {}, role: null }; }
  }
  _save() {
    try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch {}
    this._emit();
  }
  _emit() {
    this.subs.wishes.forEach((cb) => cb(this.data.wishes.slice()));
    this.subs.claims.forEach(({ owner, cb }) => cb(Object.fromEntries(Object.entries(this.data.claims).filter(([, c]) => c.owner === owner))));
    this.subs.notes.forEach(({ role, cb }) => cb(this.data.notes[role] || ""));
  }
  start(onAuth) { this.onAuth = onAuth; onAuth(this.data.role || null); }
  async signIn(role) { this.data.role = role; this._save(); this.onAuth(role); }
  async signOut() { this.data.role = null; this._save(); this.onAuth(null); }
  onWishes(cb) { this.subs.wishes.push(cb); cb(this.data.wishes.slice()); return () => (this.subs.wishes = this.subs.wishes.filter((x) => x !== cb)); }
  onClaims(owner, cb) {
    const s = { owner, cb }; this.subs.claims.push(s);
    cb(Object.fromEntries(Object.entries(this.data.claims).filter(([, c]) => c.owner === owner)));
    return () => (this.subs.claims = this.subs.claims.filter((x) => x !== s));
  }
  onNotes(role, cb) { const s = { role, cb }; this.subs.notes.push(s); cb(this.data.notes[role] || ""); return () => (this.subs.notes = this.subs.notes.filter((x) => x !== s)); }
  async addWish(w) { this.data.wishes.push(w); this._save(); }
  async updateWish(id, patch) { const w = this.data.wishes.find((x) => x.id === id); if (w) Object.assign(w, patch); this._save(); }
  async deleteWish(id) { this.data.wishes = this.data.wishes.filter((x) => x.id !== id); delete this.data.claims[id]; this._save(); }
  async setClaim(wishId, owner, data) { if (data) this.data.claims[wishId] = { ...data, owner, wishId }; else delete this.data.claims[wishId]; this._save(); }
  async setNotes(role, text) { this.data.notes[role] = text; this._save(); }
}

class FirebaseStore {
  constructor(cfg) { this.cfg = cfg; this.mode = "cloud"; }
  async _init() {
    const v = "10.12.2";
    const [app, auth, fs] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${v}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${v}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${v}/firebase-firestore.js`),
    ]);
    this.fsm = fs; this.authm = auth;
    this.app = app.initializeApp(this.cfg);
    this.auth = auth.getAuth(this.app);
    this.db = fs.initializeFirestore(this.app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
  }
  async start(onAuth) {
    await this._init();
    this.authm.onAuthStateChanged(this.auth, (u) => {
      if (!u) return onAuth(null);
      const email = (u.email || "").toLowerCase();
      const p = PEOPLE.find((x) => x.email.toLowerCase() === email);
      this.user = u;
      onAuth(p ? p.key : "denied");
    });
  }
  async signIn() {
    const provider = new this.authm.GoogleAuthProvider();
    try { await this.authm.signInWithPopup(this.auth, provider); }
    catch { await this.authm.signInWithRedirect(this.auth, provider); }
  }
  async signOut() { await this.authm.signOut(this.auth); }
  onWishes(cb) {
    const { collection, onSnapshot } = this.fsm;
    return onSnapshot(collection(this.db, "wishes"), (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => toast("Sync error: " + e.message));
  }
  onClaims(owner, cb) {
    const { collection, query, where, onSnapshot } = this.fsm;
    const q = query(collection(this.db, "claims"), where("owner", "==", owner));
    return onSnapshot(q, (snap) => { const o = {}; snap.docs.forEach((d) => (o[d.id] = d.data())); cb(o); }, (e) => toast("Sync error: " + e.message));
  }
  onNotes(role, cb) {
    const { doc, onSnapshot } = this.fsm;
    return onSnapshot(doc(this.db, "notes", role), (d) => cb(d.exists() ? d.data().text || "" : ""), (e) => toast("Sync error: " + e.message));
  }
  async addWish(w) { const { doc, setDoc } = this.fsm; await setDoc(doc(this.db, "wishes", w.id), w); }
  async updateWish(id, patch) { const { doc, updateDoc } = this.fsm; await updateDoc(doc(this.db, "wishes", id), patch); }
  async deleteWish(id) { const { doc, deleteDoc } = this.fsm; await deleteDoc(doc(this.db, "wishes", id)); }
  async setClaim(wishId, owner, data) {
    const { doc, setDoc, deleteDoc } = this.fsm;
    if (data) await setDoc(doc(this.db, "claims", wishId), { ...data, owner, wishId });
    else await deleteDoc(doc(this.db, "claims", wishId));
  }
  async setNotes(role, text) { const { doc, setDoc } = this.fsm; await setDoc(doc(this.db, "notes", role), { text, updatedAt: Date.now() }); }
}

const store = firebaseConfig ? new FirebaseStore(firebaseConfig) : new LocalStore();

/* ============================================================
   State
   ============================================================ */
const state = {
  me: undefined,          // undefined = loading, null = signed out, "denied", or "her"/"him"
  view: null,             // "her" | "him" | "notes" | "settings"
  wishes: [],
  claims: {},             // only partner's list
  notes: "",
  q: "",
  cat: "all",
  status: "all",          // partner list: all | open | idea | got | done
  showArchived: false,
  unsub: [],
};

function daysUntil(mmdd) {
  if (!mmdd || !/^\d{2}-\d{2}$/.test(mmdd)) return null;
  const [m, d] = mmdd.split("-").map(Number);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  let next = new Date(now.getFullYear(), m - 1, d);
  if (next < now) next = new Date(now.getFullYear() + 1, m - 1, d);
  return Math.round((next - now) / 86400000);
}

function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2200);
}

function fmtPrice(p) {
  if (p === null || p === undefined || p === "") return "";
  const n = Number(p); if (Number.isNaN(n)) return "";
  return `${CURRENCY}${n.toLocaleString()}`;
}

function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } }

/* ============================================================
   Rendering
   ============================================================ */
const app = $("#app");

function render() {
  if (state.me === undefined) { app.innerHTML = `<div class="hero"><div class="big">💝</div><p>Loading…</p></div>`; return; }
  if (state.me === null) return renderSignIn();
  if (state.me === "denied") {
    app.innerHTML = `<div class="hero"><div class="big">🚫</div><h1>Not on the list</h1>
      <p>This app is only for the two people in <code>config.js</code>. You signed in with an account that isn't there.</p>
      <div class="stack"><button class="btn" data-act="signout">Sign out</button></div></div>`;
    return;
  }
  if (!state.view) state.view = partnerOf(state.me);
  let html = "";
  if (state.view === "her" || state.view === "him") html = renderList(state.view);
  else if (state.view === "notes") html = renderNotes();
  else html = renderSettings();
  app.innerHTML = html + renderNav();
}

function renderSignIn() {
  if (store.mode === "local") {
    app.innerHTML = `<div class="hero"><div class="big">💝</div><h1>Wishes</h1>
      <p>Local mode: everything stays on this device. To sync between your phones, set up Firebase (see README).</p>
      <p><b>Who are you?</b></p>
      <div class="stack">
        ${PEOPLE.map((p) => `<button class="btn primary" data-act="signin" data-role="${p.key}">${p.emoji} ${esc(p.name)}</button>`).join("")}
      </div></div>`;
  } else {
    app.innerHTML = `<div class="hero"><div class="big">💝</div><h1>Wishes</h1>
      <p>A private wish list for the two of you.</p>
      <div class="stack"><button class="btn primary" data-act="signin">Sign in with Google</button></div></div>`;
  }
}

function renderNav() {
  const me = state.me, other = partnerOf(me);
  const tabs = [
    { v: other, ico: person(other).emoji, label: `${person(other).name}'s list` },
    { v: me, ico: person(me).emoji, label: "My list" },
    { v: "notes", ico: "🗒️", label: "Secret notes" },
    { v: "settings", ico: "⚙️", label: "More" },
  ];
  return `<nav class="nav"><div class="inner">${tabs.map((t) => `<button data-act="view" data-view="${t.v}" class="${state.view === t.v ? "on" : ""}"><span class="ico">${t.ico}</span>${esc(t.label)}</button>`).join("")}</div></nav>`;
}

function visibleWishes(owner) {
  const q = state.q.trim().toLowerCase();
  const isMine = owner === state.me;
  let list = state.wishes.filter((w) => w.owner === owner);
  if (!state.showArchived) list = list.filter((w) => !w.archived);
  if (state.cat !== "all") list = list.filter((w) => w.category === state.cat);
  if (q) list = list.filter((w) => [w.title, w.notes, w.details, w.url].some((s) => (s || "").toLowerCase().includes(q)));
  if (!isMine && state.status !== "all") {
    list = list.filter((w) => { const c = state.claims[w.id]; return state.status === "open" ? !c : c && c.status === state.status; });
  }
  list.sort((a, b) => (a.archived - b.archived) || (a.priority - b.priority) || (b.createdAt - a.createdAt));
  return list;
}

function renderList(owner) {
  const isMine = owner === state.me;
  const p = person(owner);
  const days = daysUntil(p.birthday);
  const list = visibleWishes(owner);
  const total = state.wishes.filter((w) => w.owner === owner && !w.archived).length;
  const claimed = isMine ? null : Object.values(state.claims).filter((c) => state.wishes.some((w) => w.id === c.wishId && !w.archived));
  const spent = isMine ? 0 : claimed.reduce((s, c) => { const w = state.wishes.find((x) => x.id === c.wishId); return s + (w && Number(w.price) ? Number(w.price) : 0); }, 0);

  const cats = ["all", ...new Set(state.wishes.filter((w) => w.owner === owner).map((w) => w.category))];
  const chips = cats.map((c) => `<button class="chip ${state.cat === c ? "on" : ""}" data-act="cat" data-cat="${c}">${c === "all" ? "All" : catOf(c).emoji + " " + catOf(c).label}</button>`).join("");
  const statusChips = isMine ? "" : `<div class="chips">${[["all", "Everything"], ["open", "⭕ Open"], ["idea", "💡 Planning"], ["got", "✅ Got it"], ["done", "🎉 Given"]]
    .map(([k, l]) => `<button class="chip ${state.status === k ? "on" : ""}" data-act="status" data-status="${k}">${l}</button>`).join("")}</div>`;

  let empty = "";
  if (!list.length) {
    empty = isMine
      ? `<div class="empty"><div class="big">🎈</div><b>Nothing here yet.</b><br>Tap <b>+</b> to add anything you'd love: a thing, a place, a day out.</div>`
      : `<div class="empty"><div class="big">🕵️</div><b>${esc(p.name)} hasn't added anything (that matches) yet.</b><br>Nudge them to open the app.</div>`;
  }

  return `
    <header class="top">
      <div>
        <h1>${p.emoji} ${isMine ? "My list" : esc(p.name) + "'s list"}</h1>
        <div class="sub">${days === null ? "" : `<span class="countdown">🎂 ${days === 0 ? "Birthday is today!" : days + " days to birthday"}</span>`}</div>
      </div>
      <div class="avatar" title="${esc(person(state.me).name)}">${person(state.me).emoji}</div>
    </header>
    ${store.mode === "local" ? `<div class="banner">Local mode: this list lives only on this device. Set up sync in README to share it.</div>` : ""}
    <div class="toolbar">
      <div class="search">🔍<input type="search" placeholder="Search…" value="${esc(state.q)}" data-act="q" aria-label="Search"></div>
      <div class="chips">${chips}</div>
      ${statusChips}
      <div class="row-between">
        <span class="stat">${total} wish${total === 1 ? "" : "es"}${isMine ? "" : ` · ${claimed.length} claimed${spent ? " · " + fmtPrice(spent) + " spent" : ""}`}</span>
        <button class="btn sm ghost" data-act="toggle-archived">${state.showArchived ? "Hide" : "Show"} archived</button>
      </div>
    </div>
    <div class="list">${list.map((w) => renderCard(w, isMine)).join("")}${empty}</div>
    ${isMine ? `<button class="fab" data-act="add" aria-label="Add wish">+</button>` : ""}
  `;
}

function renderCard(w, isMine) {
  const c = catOf(w.category);
  const claim = isMine ? null : state.claims[w.id];
  const meta = [];
  if (w.price !== null && w.price !== undefined && w.price !== "") meta.push(`<span>${fmtPrice(w.price)}</span>`);
  if (w.details) meta.push(`<span>${esc(w.details)}</span>`);
  if (w.url) meta.push(`<a href="${esc(w.url)}" target="_blank" rel="noopener">🔗 ${esc(hostOf(w.url) || "link")}</a>`);
  meta.push(`<span class="prio prio-${w.priority}">${PRIO[w.priority] || ""}</span>`);
  if (w.archived) meta.push(`<span>archived</span>`);
  if (claim) meta.push(`<span class="pill pill-${claim.status}">${CLAIM[claim.status]}</span>`);

  let actions = "";
  if (isMine) {
    actions = `
      <button class="btn sm" data-act="edit" data-id="${w.id}">✏️ Edit</button>
      <button class="btn sm ghost" data-act="archive" data-id="${w.id}">${w.archived ? "↩️ Restore" : "📦 Archive"}</button>
      <button class="btn sm ghost danger" data-act="delete" data-id="${w.id}">🗑️</button>`;
  } else {
    const s = claim?.status;
    actions = `
      <button class="btn sm ${s === "idea" ? "warn on" : ""}" data-act="claim" data-id="${w.id}" data-status="idea">💡 Planning</button>
      <button class="btn sm ${s === "got" ? "ok on" : ""}" data-act="claim" data-id="${w.id}" data-status="got">✅ Got it</button>
      <button class="btn sm ${s === "done" ? "ok on" : ""}" data-act="claim" data-id="${w.id}" data-status="done">🎉 Given</button>
      <button class="btn sm ghost" data-act="claim-note" data-id="${w.id}">${claim?.note ? "📝 Edit note" : "📝 Note"}</button>`;
  }
  return `<article class="card ${w.archived ? "archived" : ""} ${claim?.status === "done" ? "done" : ""}" data-id="${w.id}">
    <div class="head">
      <div class="cat" title="${c.label}">${c.emoji}</div>
      <div class="grow">
        <div class="title">${esc(w.title)}</div>
        <div class="meta">${meta.join("")}</div>
        ${w.notes ? `<div class="notes">${esc(w.notes)}</div>` : ""}
        ${claim?.note ? `<div class="secret-note">🤫 ${esc(claim.note)}</div>` : ""}
      </div>
    </div>
    <div class="actions">${actions}</div>
  </article>`;
}

function renderNotes() {
  const other = person(partnerOf(state.me));
  return `
    <header class="top"><div><h1>🗒️ Secret notes</h1><div class="sub">Only you can see this. ${esc(other.name)} never will.</div></div>
      <div class="avatar">${person(state.me).emoji}</div></header>
    <p class="stat">Hints you overheard, day plans, restaurant ideas, sizes, budget… Saves automatically.</p>
    <textarea class="notes-area" data-act="notes" placeholder="e.g.
• She mentioned that pottery class in Jaffa
• Shoe size 38, ring size 6
• Day plan: breakfast at ___, then ___">${esc(state.notes)}</textarea>
  `;
}

function renderSettings() {
  const me = person(state.me), other = person(partnerOf(state.me));
  const rows = PEOPLE.map((p) => `<div class="kv"><span class="k">${p.emoji} ${esc(p.name)}</span><span>🎂 ${esc(p.birthday)}${store.mode === "cloud" ? ` · ${esc(p.email)}` : ""}</span></div>`).join("");
  return `
    <header class="top"><div><h1>⚙️ More</h1><div class="sub">Signed in as ${me.emoji} ${esc(me.name)}</div></div><div class="avatar">${me.emoji}</div></header>
    <div class="section-title">How it works</div>
    <div class="card">
      <p style="margin:0 0 8px"><b>My list</b> — add anything you'd love. ${esc(other.name)} sees it, but never sees what you've marked.</p>
      <p style="margin:0 0 8px"><b>${esc(other.name)}'s list</b> — mark 💡 Planning / ✅ Got it / 🎉 Given. ${esc(other.name)} can't see those marks or your notes.</p>
      <p style="margin:0"><b>Tip:</b> on Android, install the app (browser menu → “Add to Home screen”) and then share any product page straight into it.</p>
    </div>
    <div class="section-title">People</div>
    <div class="card">${rows}<div class="kv"><span class="k">Sync</span><span>${store.mode === "cloud" ? "☁️ Cloud (Firebase)" : "📴 Local only"}</span></div></div>
    <div class="section-title">Data</div>
    <div class="card">
      <div class="actions" style="margin-top:0">
        <button class="btn sm" data-act="export">⬇️ Export my list (JSON)</button>
        <button class="btn sm ghost" data-act="signout">Sign out</button>
      </div>
    </div>
  `;
}

/* ============================================================
   Sheets (add / edit / claim note)
   ============================================================ */
function openSheet(html) {
  closeSheet();
  const d = document.createElement("dialog");
  d.className = "sheet";
  d.innerHTML = `<div class="sheet-inner"><div class="handle"></div>${html}</div>`;
  $("#sheet-root").appendChild(d);
  d.addEventListener("click", (e) => { if (e.target === d) closeSheet(); });
  d.addEventListener("cancel", (e) => { e.preventDefault(); closeSheet(); });
  d.showModal();
  const first = d.querySelector("input, textarea"); if (first) setTimeout(() => first.focus(), 50);
  return d;
}
function closeSheet() { const d = $("#sheet-root dialog"); if (d) { try { d.close(); } catch {} d.remove(); } }

function wishForm(w = {}) {
  const v = { title: "", url: "", price: "", category: "gift", priority: 2, details: "", notes: "", ...w };
  return `
    <h2>${w.id ? "Edit wish" : "New wish"}</h2>
    <form id="wish-form" data-id="${w.id || ""}">
      <div class="field"><label>What</label><input name="title" required placeholder="e.g. Noise-cancelling headphones, or: a day at the hot springs" value="${esc(v.title)}"></div>
      <div class="field"><label>Link (optional)</label><input name="url" type="url" inputmode="url" placeholder="Paste a product page" value="${esc(v.url)}"></div>
      <div class="field"><label>Category</label><div class="segs" data-seg="category">${CATS.map((c) => `<button type="button" class="seg ${v.category === c.key ? "on" : ""}" data-val="${c.key}">${c.emoji} ${c.label}</button>`).join("")}</div><input type="hidden" name="category" value="${esc(v.category)}"></div>
      <div class="field"><label>How much do you want it?</label><div class="segs" data-seg="priority">${[1, 2, 3].map((n) => `<button type="button" class="seg ${Number(v.priority) === n ? "on" : ""}" data-val="${n}">${PRIO[n]}</button>`).join("")}</div><input type="hidden" name="priority" value="${v.priority}"></div>
      <div class="grid2">
        <div class="field"><label>Price (${CURRENCY}, optional)</label><input name="price" type="number" inputmode="decimal" min="0" step="any" placeholder="0" value="${esc(v.price)}"></div>
        <div class="field"><label>Size / color / details</label><input name="details" placeholder="M, black, 38…" value="${esc(v.details)}"></div>
      </div>
      <div class="field"><label>Notes</label><textarea name="notes" placeholder="Why, which one, when…">${esc(v.notes)}</textarea></div>
      <div class="foot"><button type="button" class="btn ghost" data-act="close-sheet">Cancel</button><span class="spacer"></span><button class="btn primary" type="submit">${w.id ? "Save" : "Add"}</button></div>
    </form>`;
}

function openAdd(prefill = {}) { openSheet(wishForm(prefill)); }
function openEdit(id) { const w = state.wishes.find((x) => x.id === id); if (w) openSheet(wishForm(w)); }
function openClaimNote(id) {
  const w = state.wishes.find((x) => x.id === id); if (!w) return;
  const c = state.claims[id] || {};
  openSheet(`<h2>🤫 Secret note</h2><p class="stat" style="margin-top:-6px">For “${esc(w.title)}”. ${esc(person(w.owner).name)} can't see this.</p>
    <form id="claim-form" data-id="${id}">
      <div class="field"><textarea name="note" placeholder="Where you ordered it, price you paid, plan for the day…">${esc(c.note || "")}</textarea></div>
      <div class="foot"><button type="button" class="btn ghost" data-act="close-sheet">Cancel</button><span class="spacer"></span><button class="btn primary" type="submit">Save</button></div>
    </form>`);
}

/* ============================================================
   Events
   ============================================================ */
document.addEventListener("click", async (e) => {
  const seg = e.target.closest(".seg");
  if (seg) { const box = seg.closest("[data-seg]"); box.querySelectorAll(".seg").forEach((b) => b.classList.toggle("on", b === seg)); box.parentElement.querySelector("input[type=hidden]").value = seg.dataset.val; return; }
  const el = e.target.closest("[data-act]"); if (!el) return;
  const act = el.dataset.act, id = el.dataset.id;
  switch (act) {
    case "signin": await store.signIn(el.dataset.role); break;
    case "signout": await store.signOut(); break;
    case "view": state.view = el.dataset.view; state.q = ""; state.cat = "all"; state.status = "all"; render(); break;
    case "cat": state.cat = el.dataset.cat; render(); break;
    case "status": state.status = el.dataset.status; render(); break;
    case "toggle-archived": state.showArchived = !state.showArchived; render(); break;
    case "add": openAdd(); break;
    case "edit": openEdit(id); break;
    case "close-sheet": closeSheet(); break;
    case "archive": { const w = state.wishes.find((x) => x.id === id); await store.updateWish(id, { archived: !w.archived, updatedAt: Date.now() }); toast(w.archived ? "Restored" : "Archived"); break; }
    case "delete": if (confirm("Delete this wish for good?")) { await store.deleteWish(id); toast("Deleted"); } break;
    case "claim": {
      const w = state.wishes.find((x) => x.id === id); const cur = state.claims[id];
      const status = el.dataset.status;
      if (cur && cur.status === status) { await store.setClaim(id, w.owner, cur.note ? { ...cur, status: null } : null); if (cur.note) await store.setClaim(id, w.owner, { note: cur.note, status: "idea" }); toast("Unmarked"); }
      else { await store.setClaim(id, w.owner, { ...(cur || {}), status, at: Date.now() }); toast(CLAIM[status]); }
      break;
    }
    case "claim-note": openClaimNote(id); break;
    case "export": {
      const mine = state.wishes.filter((w) => w.owner === state.me);
      const blob = new Blob([JSON.stringify(mine, null, 2)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "my-wishes.json"; a.click();
      break;
    }
  }
});

document.addEventListener("input", (e) => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  if (el.dataset.act === "q") { state.q = el.value; const list = $("#app .list"); if (list) list.outerHTML = `<div class="list">${visibleWishes(state.view).map((w) => renderCard(w, state.view === state.me)).join("") || `<div class="empty">No match.</div>`}</div>`; }
  if (el.dataset.act === "notes") { clearTimeout(saveNotes._t); saveNotes._t = setTimeout(() => saveNotes(el.value), 500); }
});
async function saveNotes(text) { state.notes = text; await store.setNotes(state.me, text); }

document.addEventListener("submit", async (e) => {
  const f = e.target; e.preventDefault();
  const fd = new FormData(f);
  if (f.id === "wish-form") {
    const id = f.dataset.id;
    const price = fd.get("price") === "" ? null : Number(fd.get("price"));
    const patch = {
      title: fd.get("title").trim(), url: fd.get("url").trim(), price,
      category: fd.get("category"), priority: Number(fd.get("priority")) || 2,
      details: fd.get("details").trim(), notes: fd.get("notes").trim(), updatedAt: Date.now(),
    };
    if (!patch.title) return;
    if (id) { await store.updateWish(id, patch); toast("Saved"); }
    else { await store.addWish({ id: uid(), owner: state.me, archived: false, createdAt: Date.now(), ...patch }); toast("Added ✨"); }
    closeSheet();
  } else if (f.id === "claim-form") {
    const id = f.dataset.id; const w = state.wishes.find((x) => x.id === id); const cur = state.claims[id] || {};
    const note = fd.get("note").trim();
    if (!note && !cur.status) await store.setClaim(id, w.owner, null);
    else await store.setClaim(id, w.owner, { ...cur, status: cur.status || "idea", note, at: cur.at || Date.now() });
    toast("Saved"); closeSheet();
  }
});

/* ============================================================
   Boot
   ============================================================ */
function subscribe() {
  state.unsub.forEach((u) => u && u()); state.unsub = [];
  if (!state.me || state.me === "denied") return;
  state.unsub.push(store.onWishes((w) => { state.wishes = w; render(); }));
  state.unsub.push(store.onClaims(partnerOf(state.me), (c) => { state.claims = c; render(); }));
  state.unsub.push(store.onNotes(state.me, (t) => { if (document.activeElement?.dataset?.act !== "notes") { state.notes = t; if (state.view === "notes") render(); } }));
}

function handleShareTarget() {
  const sp = new URLSearchParams(location.search);
  if (!sp.has("url") && !sp.has("title") && !sp.has("text")) return;
  const text = sp.get("text") || "";
  const url = sp.get("url") || (text.match(/https?:\/\/\S+/) || [""])[0];
  const title = sp.get("title") || text.replace(url, "").trim();
  history.replaceState(null, "", location.pathname);
  state.view = state.me;
  render();
  openAdd({ title, url });
}

render();
Promise.resolve().then(() => store.start((role) => {
  state.me = role;
  state.view = role && role !== "denied" ? partnerOf(role) : null;
  subscribe();
  render();
  if (role && role !== "denied") handleShareTarget();
})).catch((e) => { app.innerHTML = `<div class="hero"><div class="big">⚠️</div><h1>Couldn't start</h1><p>${esc(e.message)}</p></div>`; });

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
