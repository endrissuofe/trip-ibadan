# Deployment

## Development build

```bash
npm install
```

```bash
npm run dev
```

Vite serves on port 5173 with `--host`, so phones on the same network can open the `Network:` URL. In dev, `window.game` is exposed for debugging (for example `game.debugTeleport(10)` jumps to km 10).

## Production build

```bash
npm run build
```

This type-checks, then outputs a static site in `dist/`. `vite.config.ts` sets `base: './'`, so it works from any sub-path.

Preview locally:

```bash
npm run preview
```

Host `dist/` on any static host:
- **Vercel:** import the repo (framework preset "Vite", output `dist`), or deploy the folder with the Vercel CLI.
- **Netlify / Cloudflare Pages:** build command `npm run build`, publish directory `dist`.
- **GitHub Pages:** push `dist/` to a `gh-pages` branch.

Enable gzip or brotli on the host. The route JSON compresses from 384 KB to about 120 KB.

## Android build (not yet done: recommended path)

The game is a static web app, so the lowest-effort Android package is a **Capacitor** wrapper around `dist/`. This has **not been built or tested yet**. The steps are:

```bash
npm i @capacitor/core @capacitor/cli @capacitor/android
```

```bash
npx cap init Trip_Ibadan ng.tripibadan.app --web-dir dist
```

```bash
npm run build
```

```bash
npx cap add android
```

```bash
npx cap sync android
```

```bash
npx cap open android
```

The last command opens Android Studio. Build a signed APK/AAB from there, lock the activity to landscape, and keep the screen on (for example with `@capacitor-community/keep-awake`).

An alternative is a Trusted Web Activity (Bubblewrap) once the game is hosted on HTTPS.
