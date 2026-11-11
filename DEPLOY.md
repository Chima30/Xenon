# Deploy checklist

Checked before writing this: `npm ci` and `npm run build` succeed from a clean copy of the tracked files; no secrets or personal data in the source; `.env` and `.claude` are git-ignored.

## 1. GitHub

```bash
git add -A
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

## 2. Mux (optional, +1 bonus point)

1. In the Mux dashboard, upload a short video you have the rights to and create a **public** playback policy.
2. Copy the **playback ID** (not an access token, not an API secret).
3. Open `https://stream.mux.com/<PLAYBACK_ID>.m3u8` to confirm it plays.
4. Keep the asset active through judging.

## 3. Vercel

1. New Project, import the GitHub repo. Framework preset **Vite** (also set in `vercel.json`).
2. No environment variables are required: the public Mux playback ID for Sintel is built in. Optionally set `VITE_SINTEL_MUX_PLAYBACK_ID` to use a different asset.
3. Deploy. Hash routing needs no rewrites.

## 4. After deploy, check on the live URL

- Home loads; the player plays Sintel; Explore wheel, Atlas, Settings and Subtitles open.
- Sintel plays from Mux by default; Settings → Server shows Mux, Wikimedia Commons and Internet Archive.
- Test fullscreen, a phone, and keyboard-only use in a normal browser window.
- Then fill in the URL and Mux ID in `COMPETITION_SUBMISSION.md`.

## Notes

- Demo films stream from Wikimedia Commons and the Internet Archive. They are CC BY 3.0 and credited on the home page. Commons may rate-limit still-frame thumbnails; the UI falls back gracefully.
- `LICENSE` (MIT) covers the code only. Edit the copyright holder line if you want your own name on it.
