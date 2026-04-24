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
