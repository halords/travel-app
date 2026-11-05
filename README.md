# Roam

A mobile travel PWA. Plan a trip, add places to each day, and open directions with one tap.

## What it does

- Create and edit trips with destinations, dates, and notes.
- Search for places, enter an address, or adjust an exact destination pin in the place editor.
- Schedule stops by day and time, reorder them, save places for later, and mark visits complete.
- Tap a place name or **Directions** to open Google Maps or Apple Maps with the destination filled in. Choose walking, driving, or transit. The operating system opens the installed maps app when supported, with a web fallback.
- Open **Day overview** to see every destination for the chosen day on a numbered map and in a complete list. The map fits all saved pins; address-only stops remain in the list with a **Set map pin** action. Google Maps directions are available in overlapping sections of up to five places, plus individual place links for Maps products that ignore waypoints. Multiple transit stops use a driving overview; individual transit directions remain available.
- Get an automatic photo banner and a live preview when entering a supported destination: Japan, the Philippines, France, Italy, South Korea, Singapore, or Thailand, including major cities and regions. Photos are representative country inspiration. Other destinations keep the chosen color cover.
- Browse every trip in the scrolling desktop sidebar. Open **Sign out** there, or use the account button and the account section at the top of Settings.
- Sign up and sign in with email and password. Personal trips sync through Turso.
- Keep reading and editing your saved itinerary offline. Sync resumes after reconnecting.
- Install on a phone or desktop and export/restore JSON backups.

The in-app maps select destination pins and show daily destinations. Turn-by-turn navigation opens Google Maps or Apple Maps. Google Maps links do not require a Google API key. Place search uses Photon; destination and day-overview maps use OpenStreetMap tiles. Missing map tiles never remove itinerary records or prevent individual directions.

## Run locally

Use Node.js 22 (22.12 or newer) and npm. The Vercel runtime is pinned to Node 22.

```sh
npm install
npm run dev
```

Open the URL printed by Vite, normally `http://127.0.0.1:5173`.

The app works with browser-local storage when no database is configured. A labelled Kyoto sample trip is created for a new guest device. Unchanged sample trips are not uploaded when signing in.

### Connect Turso

Copy `.env.example` to `.env.local` if that file does not already exist, then set:

```dotenv
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-database-auth-token
```

Both are **server-only**. Do not use a `VITE_` prefix. `.env.local` is ignored by Git.

Use a dedicated database. Initialize the tables with:

```sh
npm run db:setup
```

The API also initializes missing tables safely on first use. Restart the development server after changing credentials if Vite has not already restarted.

For development without cloud credentials, use `TURSO_DATABASE_URL=file:./.local/roam.db` and an empty token. Local database files are ignored by Git and are rejected as configuration on Vercel. The browser never connects directly to Turso.

## Deploy on Vercel

The repository includes `vercel.json`, two serverless API entry points, and the PWA configuration.

1. Push the project to your GitHub repository.
2. Import the repository into Vercel. The framework is **Vite**.
3. Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in the Vercel project’s environment variables. Set them for each environment that should support accounts.
4. Deploy. Vercel runs `npm run build` and serves `dist`; `/api/auth` and `/api/sync` run as Node serverless functions.

Alternatively, after signing in to the Vercel CLI:

```sh
vercel login
vercel link
vercel env add TURSO_DATABASE_URL production
vercel env add TURSO_AUTH_TOKEN production
vercel --prod
```

Use the final HTTPS deployment URL when installing the PWA. Accounts and cookies belong to the deployment’s domain, so use a stable production URL across devices. A preview deployment can use a separate Turso database.

## Validation

```sh
npm test
npm run build
npm run check:pwa
npm run preview
```

Tests cover calendar validation, trip changes, navigation links, the daily route limit, merging and deletions, password hashing, sessions, account isolation, optimistic sync revisions, CSRF protection, request validation, and browser-local/offline workspace behavior.

`npm run preview` serves the production PWA shell for offline/install checks. It does **not** run the Vercel API functions; use `npm run dev` for local account and API development. The production build precaches the app shell, code, bundled photo, icons, and fonts. Authenticated API responses, search responses, and map tiles are not cached by the service worker.

## Data and authentication

- Passwords use salted scrypt hashes. Random session secrets are stored only in HttpOnly cookies; the database stores their SHA-256 hashes. Production cookies also use `Secure` and `SameSite=Lax`.
- Every sync request resolves its account from the session. A client-supplied account ID is never used to read or write another account’s plans.
- Session lifetime is 30 days. Signup/login attempts are rate-limited in the database. Mutations require same-origin JSON requests with an application header.
- Account and guest caches use separate browser storage keys. Signing out first syncs changes, revokes the session, and removes that account’s downloaded plans from the device. An expired session can still read its existing offline cache; sign in again to sync or finish signing out.
- Sync merges individual trip/place records with monotonic edit timestamps. Edits to different records are preserved. If two devices edit the same record, the later timestamp wins. Deletion tombstones prevent an older device from restoring a removed record. Server revisions prevent whole-document overwrites during concurrent requests.
- Backups merge into current data. Explicitly restored records take precedence. Malformed imports are rejected and malformed local data is preserved for recovery.
- Email verification, password-reset emails, and social login are not part of this version. Choose and save a strong password. No email provider is required.

The sync payload limit is 2 MB. Backups contain itinerary data, not passwords, database tokens, or session cookies.

## Project structure

```text
api/                   Vercel function entry points
server/                Turso schema, authentication, HTTP checks, sync
src/components/        Itinerary UI, forms, destination picker, settings
src/hooks/             Offline workspace, sync, installation
src/lib/               Data model, storage, map links, place search
public/                PWA icons and bundled imagery
tests/                 Data, API, and workspace tests
scripts/               Database setup and icon generation
```

Built with React, TypeScript, Vite, Leaflet, vite-plugin-pwa, and the Turso/libSQL client. Destination photography is from Unsplash and is bundled for offline use. Each banner links to its source; source URLs and destination matches are in `src/lib/destination-photos.ts`. The interface uses DM Sans and Lucide icons. OpenStreetMap attribution is visible on each map.
