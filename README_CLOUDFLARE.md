## Cloudflare Pages + Workers + D1 (free-ish)

This setup gives you:
- Public website (Pages)
- Backend API (Worker) with registration/login (cookies) + CSRF
- Database (D1) for users + runs + leaderboard

### 1) Create the D1 database
From `cf-worker/`:
- `wrangler d1 create dungeon_of_echoes`
Copy the `database_id` into `cf-worker/wrangler.toml`.

Apply schema:
- `wrangler d1 execute dungeon_of_echoes --file=./schema.sql`

### 2) Set secrets / vars
From `cf-worker/`:
- `wrangler secret put JWT_SECRET`

Optional vars (prod):
- `wrangler secret put COOKIE_DOMAIN` (or set in `wrangler.toml`)
- `COOKIE_SECURE=true`
- `COOKIE_SAMESITE=Lax`

### 3) Deploy the Worker
From `cf-worker/`:
- `npm i -g wrangler`
- `wrangler deploy`

### 4) Deploy the frontend (Pages)
In Cloudflare Pages:
- Build command: `npm run build`
- Build output: `build`
- Root directory: `frontend`

Important:
- Add a Pages Function/Route to proxy `/api/*` to your Worker, OR
- Use "Workers & Pages integration" to mount the Worker on the same domain at `/api`.

Frontend already uses `/api` by default in production.

### 5) Local dev
- Frontend: `cd frontend && npm start`
- Worker: `cd cf-worker && wrangler dev`

