# Dungeon of Echoes

Przeglądarkowy roguelike (React + Canvas + silnik turowy). Szczegóły produktu, funkcji i backlogu: [memory/PRD.md](memory/PRD.md).

## Repozytorium

| Ścieżka | Rola |
|--------|------|
| `frontend/` | React 19, gra na Canvas, UI |
| `backend/` | FastAPI + MongoDB — pełne API, **WebSocket coop** (`/api/ws/coop/{room}`), ciasteczka HttpOnly + CSRF |
| `cf-worker/` | Cloudflare Worker + D1 + **Durable Object** — REST (Bearer JWT) i **co-op WebSocket** `/api/ws/coop/...` |
| `docker-compose.yml` | Mongo + backend + frontend + Caddy |

## Uruchomienie lokalne (pełny stack)

1. Skopiuj zmienne: `cp .env.example .env` i uzupełnij (patrz [README_DEPLOY.md](README_DEPLOY.md)).
2. `docker compose up -d --build`
3. Aplikacja pod domeną z `.env` (`DOMAIN`).

## Frontend (tylko dev)

```bash
cd frontend && npm start
```

Domyślnie API w developmentie: `http://127.0.0.1:8000` (patrz `frontend/src/services/api.js`). Dla buildu wskazującego na zewnętrzny backend ustaw `REACT_APP_BACKEND_URL`.

## Cloudflare (Pages + Worker)

Pełna instrukcja (D1, Durable Objects, coop WS, sekrety, `REACT_APP_BACKEND_URL`, SPA `_redirects`): [README_CLOUDFLARE.md](README_CLOUDFLARE.md).

## Testy backendu

```bash
cd backend && pytest
```
