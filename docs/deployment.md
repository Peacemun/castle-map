# Deployment

The production build is a folder of static files (`dist/`). It needs no server-side code, database or API keys, and works from any path because Vite's `base` is `./` and deep links use query parameters only.

## GitHub Pages (recommended, free)

1. Create a **public** repository on GitHub (e.g. `castle-map`) and push this project:
   ```bash
   git remote add origin https://github.com/<your-account>/castle-map.git
   git push -u origin main
   ```
2. In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The workflow `.github/workflows/deploy.yml` runs on every push to `main` (or manually from the Actions tab). It:
   - installs exact dependencies (`npm ci`), lints, type-checks, runs unit/integration tests and validates the data;
   - runs the Playwright browser tests (desktop project, software WebGL);
   - builds `dist/` and publishes it with `actions/deploy-pages`.
4. The site appears at `https://<your-account>.github.io/castle-map/`.

No secrets are required. GitHub Pages and Actions are free for public repositories.

## Other static hosts

Run `npm run build` and upload `dist/` to any static host (Netlify, Cloudflare Pages, an S3 bucket, a university web space). No rewrites or redirects are required.

## Running from a local folder

`npm run build && npm run preview` serves the build at http://localhost:4173. (Opening `dist/index.html` directly from disk is not supported by browsers' module security rules; use any static server, e.g. `npx serve dist`.)

## External dependency

The online basemap (vector tiles, label fonts, shaded relief) is loaded from **OpenFreeMap** (`tiles.openfreemap.org`), a free service with no keys or usage charges. If it is unavailable the app shows a notice and falls back to the bundled simplified coastline; all historical layers continue to work. To self-host tiles, change the URLs in `src/map/style.ts`.

## Updating data before deploying

```bash
npm run data:fetch      # optional: refresh open datasets (network)
npm run data:build      # rebuild public/data and review reports
npm run data:validate
npm test
git add data public/data && git commit -m "Update data"
```

## Cost controls

- No paid APIs, custom domains, analytics or trackers are used.
- Map tiles come from a free public service; there is no API key that could incur charges.
- The deployed site is entirely static.
