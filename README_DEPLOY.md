## Deploy (public server)

### Requirements
- A VPS with Docker + Docker Compose
- A domain pointing to the VPS (`A` / `AAAA`)

### Steps
1. Copy env template:
   - `cp .env.example .env`
2. Edit `.env`:
   - **DOMAIN**: your domain, e.g. `game.example.com`
   - **JWT_SECRET**: long random string
   - **DB_NAME**: e.g. `dungeon`
   - **COOKIE_DOMAIN**: same as your domain
   - **COOKIE_SECURE**: `true`
   - **COOKIE_SAMESITE**: `lax`
   - **CORS_ORIGINS**: `https://<DOMAIN>`
3. Start:
   - `docker compose up -d --build`
4. Open:
   - `https://<DOMAIN>`

### Security notes (what’s enabled)
- Auth is **HttpOnly cookies** (access + refresh)
- **CSRF protection** on all cookie-auth write endpoints via `csrf_token` cookie + `X-CSRF-Token` header
- CORS should be locked to your domain via `CORS_ORIGINS`

