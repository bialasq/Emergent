## Cloudflare Pages + Workers + D1 + Co-op (WebSocket)

- **Pages** — statyczny build Reacta z `frontend/`
- **Worker** (`cf-worker/`) — REST API (`/api/...`), baza **D1**, auth **Bearer JWT**, CORS wg `ALLOWED_ORIGINS`
- **Co-op** — `wss://…/api/ws/coop/{kod}` obsługiwane w tym samym Workerze przez **Durable Object** `CoopRoomDO` (autorytatywna logika zgodna z `backend/game_state.py`). Front łączy się przez ten sam `REACT_APP_BACKEND_URL` co REST (ścieżka WS jest na tym samym hoście).
- **`ALLOWED_ORIGINS`** — obowiązuje zarówno CORS (REST), jak i nagłówek `Origin` przy podnoszeniu WebSocketu. Dla dev lokalnie dodaj np. `http://localhost:3000` (jest w przykładowym `wrangler.toml`).

### Kolejność pierwszego wdrożenia

1. **D1 + schema** (w katalogu `cf-worker/` po `npm install`):

   ```bash
   wrangler d1 create dungeon_of_echoes
   ```

   Wklej `database_id` do `wrangler.toml` w sekcji `[[d1_databases]]`.

   Zastosuj schemat na **produkcji**:

   ```bash
   npm run d1:remote
   ```

   Lokalnie (pod `wrangler dev`):

   ```bash
   npm run d1:local
   ```

2. **Sekrety Workera**

   ```bash
   wrangler secret put JWT_SECRET
   ```

   Lokalnie: skopiuj `cf-worker/.dev.vars.example` → `cf-worker/.dev.vars` i uzupełnij `JWT_SECRET`.

3. **CORS — `ALLOWED_ORIGINS`**

   W `cf-worker/wrangler.toml` ustaw `[vars] ALLOWED_ORIGINS` na **dokładny** origin frontu (np. `https://twoja-strona.pages.dev`). Wiele originów: lista po przecinku **bez spacji** lub ze spacjami — kod Worker trimuje wpisy.

   Po deployu Pages **zaktualizuj** ten var i zrób ponownie `wrangler deploy`, jeśli zmieni się domena.

4. **Pierwszy deploy z Durable Objects**

   W `wrangler.toml` jest migracja `coop-room-v1` dla klasy `CoopRoomDO`. Przy pierwszym `wrangler deploy` Cloudflare utworzy klasę DO; kolejne deploye tylko aktualizują kod.

5. **Deploy API**

   ```bash
   npm run deploy
   ```

   Zapisz URL Worker (np. `https://dungeon-of-echoes-api.….workers.dev`) — ten sam host dla **HTTPS** (`/api/...`) i **WSS** (`/api/ws/coop/...`).

6. **Build frontu i Pages**

   W Cloudflare Dashboard → **Workers & Pages** → **Create application** → **Pages** → podłącz repo lub wrzuć build ręcznie.

   - **Root directory:** `frontend`
   - **Build command:** `npm ci && npm run build` (albo `yarn install && yarn build` zgodnie z projektem)
   - **Build output directory:** `build`

   **Zmienne środowiska (Production / Preview) — wymagane przy buildzie z podłączonego repo Git:**

   | Nazwa | Wartość (aktualny Worker) |
   |--------|---------------------------|
   | `REACT_APP_BACKEND_URL` | `https://dungeon-of-echoes-api.dungeoneofechoes.workers.dev` |

   Bez tego kolejny automatyczny build z Git-a wstawi pusty URL i front nie trafi w API. Deploy z CLI z lokalnym `$env:REACT_APP_BACKEND_URL=...` działa tylko dla tej jednej kompilacji.

   Dzięki temu axios trafia w Worker; ścieżka `/api` na domenie Pages **nie** jest wtedy wymagana.

   **SPA:** w repozytorium jest `frontend/public/_redirects` — po buildzie Pages serwuje `index.html` dla tras react-router (`/play`, `/daily`, itd.).

7. **Deploy CLI (opcjonalnie)**

   Z katalogu `frontend` po buildzie:

   ```bash
   npm run build
   npx wrangler pages deploy build --project-name=NAZWA_PROJEKTU_W_DASHBOARD
   ```

### Lokalny podgląd

- API: `cd cf-worker && npm run dev` (port z konsoli Wranglera, zwykle `8787`)
- Front: w `frontend/.env` ustaw np. `REACT_APP_BACKEND_URL=http://127.0.0.1:8787`, potem `npm start`

### Parity z FastAPI

Endpointy Daily, meta, runy i leaderboard oraz **coop WebSocket** są w Workerze. Stack **docker/FastAPI** nadal możesz używać lokalnie lub gdy potrzebujesz MongoDB / innych usług spoza Cloudflare.

### Szablon zmiennych

- Front (Pages): `frontend/.env.cloudflare.example`
- Worker (lokalnie): `cf-worker/.dev.vars.example`
