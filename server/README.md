# Dr. Tax backup server

A small NestJS + MongoDB server that stores nightly backups from the Dr. Tax app: payments, your categories and notes, rules, settings and the original bank SMS.

- The app backs up **once a night** (between midnight and 6 AM, from its hourly background job). If a night is missed, for example because the phone was off, it catches up as soon as it can. You can also tap **Settings → Back up now**.
- Each backup is a full snapshot. Payments are updated in place (keyed by phone + local id). Payments deleted on the phone are marked `removedAt`, never hard-deleted.
- An empty phone can't wipe an existing backup: the server answers `409` unless `allowEmpty: true` is sent.
- **Settings → Restore…** rebuilds a phone from the server, e.g. after you change phones.

## Run it

You need a MongoDB: a local install, Docker, or a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster.

```bash
cd server
cp .env.example .env        # set API_KEY (long random secret) and MONGODB_URI
npm install
npm run build
node --env-file=.env dist/main.js
```

Or with Docker (server + MongoDB together):

```bash
API_KEY=your-long-secret docker compose up -d
```

Just trying it out, with no MongoDB installed? This starts the server with a throwaway in-memory database (data is lost when it stops):

```bash
API_KEY=dev-key-change-me-0123456789 npm run start:memory
```

### Deploy on Vercel

The server deploys to Vercel as-is: Vercel detects NestJS (`src/main.ts`) and runs it as one Vercel Function. [vercel.json](vercel.json) sets the install and build commands, and [.vercelignore](.vercelignore) keeps your local `.env` from being uploaded.

1. In Vercel, choose **Add New → Project** and import this GitHub repo.
2. Set **Root Directory** to `server`.
3. Under **Environment Variables**, add `API_KEY` and `MONGODB_URI`, the same values as your `.env`.
4. Deploy, then open `https://<your-project>.vercel.app/api/health`. It should show `"db":"up"`.
5. In MongoDB Atlas → **Network Access**, allow `0.0.0.0/0`. Vercel has no fixed IP addresses; the API key still protects the server.

Vercel caps each request at 4.5 MB, so the app uploads large backups in parts under about 3 MB each. The server only marks payments as removed after the last part arrives. Vercel addresses already use HTTPS.

Then in the app: **Settings → Backup server**. Enter the server address and API key, then tap **Test connection** and **Back up now**.

| Where the server runs | Address to enter in the app |
| --- | --- |
| Your PC, app on the Android emulator | `http://10.0.2.2:3000` |
| Your PC, app on your phone, same Wi-Fi | `http://<PC's LAN IP>:3000` (e.g. `http://192.168.1.20:3000`) |
| A cloud server / VPS | `https://your-domain` (put it behind HTTPS) |

Use **HTTPS** for anything reachable from the internet. Over plain `http://` your financial data and API key travel unencrypted. The app warns you when that happens.

## API

All routes are under `/api` and need the header `x-api-key: <API_KEY>`, except `/api/health`.

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/api/health` | `{ ok, db }`. Public, for uptime checks. |
| POST | `/api/backups` | Snapshot from a phone: `{ deviceId, deviceName, trigger, txns[], sms[], rules[], settings }`. Large backups add `sessionId`, `part` and `final` and are sent in several requests. |
| GET | `/api/backups?deviceId=&limit=` | Log of backup runs, newest first |
| GET | `/api/devices` | Phones that have backed up, with payment counts |
| GET | `/api/devices/:deviceId/snapshot` | Everything needed to restore that phone |

MongoDB collections: `transactions`, `sms`, `devices` (settings + rules), `backups` (run log).

## Tests

```bash
npm test            # unit
npm run test:e2e    # full API against a real in-memory MongoDB
npm run lint
```
