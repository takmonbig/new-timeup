# PAZER — Product Requirements & Build Log

## Original Problem Statement
PAZER: a skill-based stopwatch timing game platform. Players stop a stopwatch as close as possible to a target time. Fixed-Time challenges + Multiplayer rooms, PAZER Coins wallet, deposits/bonuses, withdrawals+KYC, config-driven admin control, auto room creation, real-time updates, anti-cheat. Dark premium gaming UI (neon red / black). "Master Your Timing".

## User Choices
- Scope: Phase 1 + 2 + 3 (everything feasible)
- Auth: JWT email/password (custom)
- Payments: simulated/demo gateway (no real money)
- Theme: dark premium gaming, neon red + black, heavy animation

## Architecture
- Backend: FastAPI (`/app/backend/server.py`), MongoDB (motor), JWT auth (httpOnly cookies + Bearer), bcrypt, WebSockets, asyncio room-manager background loop. All routes under `/api`.
- Frontend: React 19 + react-router 7 + framer-motion + Tailwind + shadcn/ui + sonner. Fonts: Unbounded / IBM Plex Sans / JetBrains Mono.
- Config-driven: single `config` doc (`id:global`) controls wallet, fixed challenges, room settings, toggles. Nothing hardcoded.
- Wallet ledger authoritative: every txn stores txn_id, type, amount, balance_before/after, status.

## Implemented (2026-06)
- Auth: register/login/logout/me/refresh/forgot/reset, admin RBAC, brute-force lockout, admin seeding.
- Wallet: main+bonus balances, deposit (configurable % bonus + cap), withdrawal (KYC-gated, admin review), full transaction history.
- Fixed-Time Challenge: configurable slots (5–31s), start/stop with server-side validation, accuracy tolerance, prize payout, anti-cheat (nonce replay block, concurrent-session block, latency-bound flagging), game history + stats.
- Multiplayer Rooms: auto-creation (~6 targets), join/double-join protection, prize pool + platform fee, min/max players, auto-refund under minimum, LIVE gameplay + rankings + tie-breaking, WebSocket live updates.
- Admin Panel: overview stats, full game/wallet config editor, fixed-challenge CRUD, room config, user management (search/suspend/reactivate/verify KYC), withdrawal approve/reject, audit logs.
- Pages: Home (marketing), Login, Register, Dashboard, PlayFixed, Rooms, RoomGame, Wallet, Profile, Support (rules/FAQ/responsible gaming), Admin.

## Testing
- iteration_1: 21/21 backend pytest pass; frontend E2E 100% of tested flows. No critical/minor bugs. Fixed benign 401 console noise on public pages.

## Backlog / Remaining (P1/P2)
- P1: Real payment gateway integration (currently DEMO/simulated), email/SMS verification (currently logged to console), full multiplayer LIVE test with 5+ concurrent players.
- P2: Referrals, promotions/campaigns scheduling, notifications, analytics dashboards, advanced fraud/device fingerprinting, self-exclusion limits, legal T&C/Privacy content by counsel.

## Credentials
- Admin (mobile login): `9999999999` / `Admin@123`
- Users: register via UI/API with Full name + Mobile + Password.

## Iteration 2 — TIMEUP Rebrand & Game Overhaul (2026-06)
- Rebranded PAZER → **TIMEUP** (logo in header, splash, auth, landing, footer).
- **Mobile-number auth**: Signup = Full name + Mobile + Password; Login = Mobile + Password; password eye toggle. Random username auto-generated (TU-prefixed).
- **Animated stopwatch splash** after login/signup → lands on game Home.
- Wallet balance moved to **header pill** (live-refreshes on game/deposit/join); no dashboard.
- **Bottom navigation**: Home · 1v1 · Multiplayer · Profile (mobile-first).
- **Home = Fixed Challenge** with user-chosen bet (min 20) + target; WIN = stop EXACTLY at target (2-decimal match) → 5× payout.
- **NEW 1v1 mode**: 2-player rooms, 50 coins, ~10 rooms (5–30s), closest wins 1.5× (75).
- **Multiplayer**: existing many-player pool rooms.
- **Profile**: username, win/loss ratio bars, wallet balance, games played/won/lost, prizes, bonus, motivational banner.
- **Auto-generated promotional win ticker** near footer (rotates every 5s).
- Admin config updated: `fixed_config` (min_bet/max_bet/win_multiplier/targets), `room_1v1_config`, `room_config`.
- Verified: iteration_2 24/24 backend pass, 100% frontend flows. DB reset to new schema; admin re-seeded via mobile.
