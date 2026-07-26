# SlugWay — UCSC Accessible Navigation (Next.js)

Accessibility-focused campus navigation for UC Santa Cruz. Users drop pins
marking accessibility features (stairs, ramps, elevators, hazards). Gemma 4
acts as a routing agent server-side: it calls a `get_nearby_pins` function to
check conditions near the start, end, and midpoint of a trip, then reasons
about the best accessible route and explains why.

Built on a personal project concept about UCSC's difficult, hilly terrain —
this Next.js version and the Gemma 4 agent layer were built this hackathon
sprint.

## Setup (in VS Code)

1. Open this folder in VS Code.
2. Open a terminal (`` Ctrl+` ``) and run:
   ```bash
   npm install
   ```
3. Copy the env example and fill it in:
   ```bash
   cp .env.local.example .env.local
   ```
   Open `.env.local` and add two lines:
   ```
   GEMMA_API_KEY=your_key_from_aistudio.google.com/apikey
   MONGODB_URI=your_connection_string_from_mongodb_atlas
   ```
   Both stay server-side, never exposed to the browser. `.env.local` is
   already gitignored.
4. Run it:
   ```bash
   npm run dev
   ```
5. Open http://localhost:3000

## Two ways to report accessibility issues

- **📍 Manual pin** — click the pin icon in the header, then click a spot on
  the map, and pick a type (stairs, ramp, elevator, hazard).
- **📷 Photo report** — click the camera icon, then click a spot on the map.
  This opens your camera/file picker; the photo is sent to Gemma 4's vision
  capability, which decides if the spot is unsafe for someone with mobility
  limitations and automatically drops a labeled pin if so.

All pins are saved to MongoDB and shared with everyone using the app —
new pins from any user show up for everyone next time the map loads.

## Push to your own GitHub repo

```bash
git init
git add .
git commit -m "SlugWay: Gemma 4 accessible campus routing agent"
git branch -M main
# create a new EMPTY repo on github.com under your account first, then:
git remote add origin https://github.com/<your-username>/slugway.git
git push -u origin main
```

`.env.local` is already in `.gitignore` — your API key will never get
committed.

## Deploy (Vercel, free, easiest for Next.js)

1. Go to vercel.com, sign in with GitHub, "Add New Project," import this repo.
2. In the project's Environment Variables settings, add `GEMMA_API_KEY` with
   your key.
3. Deploy — you'll get a live `https://slugway-<something>.vercel.app` URL
   for your demo link.

## For the Kaggle writeup

- Track: Autonomous Agent Track
- Gemma 4 drives the actual routing decision via server-side function calling
  against live pin data — not a single prompt-response, a genuine multi-turn
  tool-use loop.
- Attach your GitHub repo link and the Vercel live demo URL.
