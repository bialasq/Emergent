# Dungeon of Echoes — PRD

## Original Problem Statement (PL)
"bazując na dokumentacji technicznej stwórz grę przeglądarkową bazując na najlepszych rozwiązaniach optymalizujących płynność i pracę przeglądarki podczas rozgrywki"

(Build a browser-based roguelike game based on the provided technical documentation, optimized for smooth browser gameplay.)

## User Choices (initial)
- a) Solo roguelike MVP (no multiplayer co-op yet)
- b) Warrior + Mage classes
- a) Pixel-art / retro 2D tile-based style
- a) Guest local + optional JWT registration
- a) HTML5 Canvas + custom game loop

## Architecture
- Frontend: React 19 + react-router 7 + framer-motion + Tailwind + HTML5 Canvas game engine
- Backend: FastAPI + Motor (MongoDB) + bcrypt + PyJWT (httpOnly cookies, SameSite=None; Secure)
- DB: test_database, collections: users, runs, login_attempts, password_reset_tokens

## Implemented (Feb 2026)
### Backend (100% test pass — 24/24)
- POST /api/auth/register (duplicate email/username check, password >= 6, bcrypt)
- POST /api/auth/login (brute-force lockout: 5 fails → 429 for 15 min)
- POST /api/auth/logout
- POST /api/auth/refresh (rotates access token)
- GET  /api/auth/me
- POST /api/runs (guest or authenticated)
- GET  /api/leaderboard (filters: character_class, limit ≤ 100; sorted by score desc, depth desc)
- GET  /api/runs/me (authenticated player history)
- MongoDB unique indexes on users.email + users.username_lower; compound index on runs(score, depth)

### Frontend
- Landing page (hero, features, controls panel)
- Login / Register (JWT cookie flow with error mapping)
- Character Select (Warrior vs Mage with stat previews, seed input)
- Game page with Canvas renderer + HUD + minimap + pause + abandon
- Leaderboard with All / Warrior / Mage filters, victory crown, class icons
- Death / Victory modal with run summary + CTA buttons (play again, leaderboard)

### Game engine
- BSP procedural dungeon generation (deterministic per seed), 6 floors + Echo Lich boss
- FOV via recursive shadowcasting (8 octants)
- Turn-based combat (enemies act only when player acts — zero idle CPU)
- 8 enemy kinds in 5 difficulty tiers, scaling spawn table by depth
- Level-up modal: 3 random upgrades from pool of 8 (vitality, arcane well, forged edge, stone skin, keen eye, reach, regeneration, swiftness)
- 4 item types (potion, mana phial, gold, scroll of echoes)
- Procedurally-drawn pixel-art sprites on canvas (no image assets needed)
- Damage numbers pool, movement interpolation, torchlight vignette

### Performance optimizations ("płynność")
- `requestAnimationFrame` loop with dirty-flag rendering (no render on idle)
- Offscreen canvas pre-renders the whole tile layer once per floor
- Separate canvas for minimap, updated only when state changes
- Turn-based logic → AI/physics run only on player input (0 work on animation frames)
- DPR-aware canvas sizing capped at 2x, `image-rendering: pixelated`
- Object pooling for damage numbers (capped at 30)
- Seeded mulberry32 RNG for deterministic generation and replay
- Input via event listeners, not per-frame polling

## Not Implemented (backlog)
- P1: Multiplayer co-op (WebSocket)
- P1: Meta-progression (Hero Soul currency, permanent unlocks)
- P1: More classes (Rogue, Ranger) + skill trees
- P2: Audio (SFX + ambient music)
- P2: Daily Challenge (fixed-seed leaderboard)
- P2: Full bestiary / codex lore system
- P2: Shop rooms, cursed rooms
- P3: Touch/mobile controls
- P3: Animated sprite sheets

## Test credentials
See /app/memory/test_credentials.md (no seed user; register fresh accounts).

---

## Iteration 2 — Feb 2026

### New P1 features (all implemented)
- **Hero Soul meta-progression** with persistent storage:
  - Authenticated → MongoDB `users.souls` + `users.meta`; atomic compare-and-swap on /api/meta/spend
  - Guests → `localStorage` (`dungeon_echoes_meta`)
  - Sanctum panel on `/play` with 8 upgrades (HP/MP/ATK/DEF/Potions + 3 spell unlocks)
- **Multiplayer co-op via WebSocket** at `/api/ws/coop/{room_code}`:
  - 2–4 player rooms, deterministic seed via crc32(code), parallel descent (own enemies, shared seed)
  - Other players appear as spectral echoes on canvas + minimap when in FOV
  - Page: `/coop` (Create / Join with random code generator)
- **Map 5× per dimension** → 300×180 tiles. Switched from offscreen pre-render to on-the-fly viewport tile rendering (~425 draws/frame) to keep memory bounded.
- **Auto-descend on stairs** — stepping on STAIRS_DOWN immediately advances the floor
- **HP/MP bars float above the player sprite** on canvas
- **Characters 2× larger** — TILE 24 → 48 px, sprites refactored to `ctx.scale()` for any tileSize
- **Speed = level**: extra actions per turn (level 4: +1, 8: +2, 12: +3); Quickstep spell adds +1 more for 10 turns
- **Spell system** (unlocked or via Hero Souls):
  - H — Mend (8 MP, +18 HP)  [baseline]
  - L — Candleflame (5 MP, +4 FOV for 15 turns)  [baseline]
  - G — Quickstep (10 MP, +1 action/turn for 10 turns)  [unlock 25 souls]
  - F — Ember Burst (12 MP, AoE around nearest visible foe)  [unlock 35 souls]
  - T — Binding Rope (15 MP, teleport to known stairs down)  [unlock 50 souls]

### Backend (39/39 tests passing)
- `GET /api/meta`, `POST /api/meta/spend` (atomic), `POST /api/meta/award`
- `WebSocket /api/ws/coop/{room}` (4-player cap, auto-cleanup, deterministic seed via crc32)
- `POST /api/runs` now increments `users.souls` for authenticated users and returns `souls_total`
- `souls_earned = floor(score/100) + kills + (50 if victory else 0)`

### Backlog (next priorities)
- P1: Authoritative server combat for true shared-enemy multiplayer
- P2: Audio (SFX + ambient music), Daily Challenge (fixed seed leaderboard)
- P2: Touch controls, Rogue + Ranger classes, animated sprites
