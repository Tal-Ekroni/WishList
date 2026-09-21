# 💝 Wishes

A private wish list for two people. She adds things she'd love during the year
(gifts, places, experiences). You see her list, mark what you've planned or bought,
and she never sees those marks. Works the other way round too.

- Phone-first, installable (Add to Home Screen), works offline.
- Categories, priority (Must have / Would love / Someday), price, link, size/details, notes.
- Search, filter by category, archive old wishes.
- Birthday countdown.
- On the partner's list: **💡 Planning / ✅ Got it / 🎉 Given** + a secret note per item, and a "spent so far" total.
- **Secret notes** tab: private scratchpad for hints you overheard, day plans, sizes.
- Android: after installing, share any product page from the browser/Amazon/AliExpress straight into the app.
- Privacy is enforced by the database rules, not just the UI.

No server to run. Static files + Firebase (free tier, plenty for two people).

---

## Try it in 10 seconds (local mode)

Open `index.html` through any static server (e.g. `npx serve .`) or just push to GitHub Pages
(step 2 below). Without Firebase config it runs in **local mode**: pick "Her" or "Him", data stays
on that device only. Good for a feel of it, not for real use.

---

## Setup (about 10 minutes)

### 1. Edit `config.js`

- Names, emojis, birthdays (`"MM-DD"`), and the **Google email** each of you will sign in with.
- Currency symbol.

### 2. Put it online with GitHub Pages (free)

1. GitHub repo → **Settings → Pages**.
2. Source: **Deploy from a branch**, branch `main`, folder `/ (root)`. Save.
3. Your app URL will be `https://tal-ekroni.github.io/WishList/`.

### 3. Create the Firebase project (free)

1. Go to <https://console.firebase.google.com> → **Add project** (any name, e.g. `wishes`). Analytics off.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable**. Save.
3. Still in Authentication → **Settings → Authorized domains → Add domain**: `tal-ekroni.github.io`.
4. **Build → Firestore Database → Create database** → production mode → pick a region near you.
5. Firestore → **Rules** tab → paste the contents of `firestore.rules`, edit the two email lines at the top
   to your emails, **Publish**.
6. Project **Settings (gear) → General → Your apps → Web (`</>`)** → register app (no hosting needed)
   → copy the `firebaseConfig` object.
7. Paste it into `config.js` replacing `export const firebaseConfig = null;`.
8. Commit + push. Wait a minute for Pages to update.

### 4. Install on phones

- **Android (Chrome):** open the URL → menu ⋮ → **Add to Home screen**. Sign in with Google.
- **iPhone (Safari):** open the URL → Share → **Add to Home Screen**. Sign in with Google.

Both of you sign in with the emails from `config.js`. Anyone else who finds the URL gets "Not on the list"
and the database refuses them too.

---

## How the "surprise" stays a surprise

- Wishes live in `wishes/`. Both can read; only the owner can edit.
- Marks and secret notes live in `claims/`. The rules say: *only the person who is NOT the owner of that wish
  can read or write it.* So even if she opens the Firebase console... well, she'd need your Google login for that.
  Within the app, it's impossible.
- The "Secret notes" tab lives in `notes/<role>`, readable only by its author.

## Files

| File | What |
|---|---|
| `index.html`, `app.js`, `style.css` | The app (no build step, no framework). |
| `config.js` | People, birthdays, currency, Firebase config. |
| `firestore.rules` | Database security rules. Paste into Firebase. |
| `manifest.json`, `sw.js`, `icons/` | Installable app + offline shell. |
