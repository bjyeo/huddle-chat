# Huddle — notes for Claude

Huddle is a small Discord-style group chat for **at most 10 people**: text channels, realtime messages, presence and typing indicators.

## Layout

- `server/` — Node.js (ESM, plain JavaScript), Express 5, Socket.IO, SQLite via the built-in `node:sqlite` (`DatabaseSync`), bcryptjs, jsonwebtoken. Tests use `node:test` + `supertest`.
- `client/` — React 19 + Vite (plain JSX), `socket.io-client`. State lives in custom hooks under `client/src/hooks/`. Tests use Vitest + Testing Library.
- `shared/` — `@huddle/shared`: the contract rules both sides import (field limits, regexes, `normalizeChannelName`, validators, `isProtectedChannel`, `TYPING_THROTTLE_MS`, `DEFAULT_MAX_USERS`). Plain ESM, no build step, `node:test` tests. Never re-declare these rules in `server/` or `client/` — import them.
- `docs/API.md` — **the REST + Socket.IO contract. Read it before changing either side and update it in the same change if the contract moves.**

## Commands

- `npm install` — installs all workspaces and enables git hooks (`core.hooksPath=.githooks`).
- `npm run dev` — server on :3001 and Vite on :5173 (Vite proxies `/api` and `/socket.io`).
- `npm test` — shared, then server, then client tests. `npm test -w shared` / `-w server` / `-w client` for one.
- `npm run build` then `npm start` — production: the server serves `client/dist`.
- `npm run format` — Prettier (CI runs `format:check`).

## Rules

- Never weaken auth: every non-auth route goes through `requireAuth`; edits/deletes check ownership server-side.
- Always use prepared statements with bound parameters — never build SQL with string interpolation.
- Never render message content as HTML (`dangerouslySetInnerHTML` is off-limits).
- Don't edit `.env`, lockfiles or `.db` files directly — a PreToolUse hook blocks it.
- Changed files are auto-formatted by a PostToolUse hook; don't hand-format.

## Hooks in this repo

- `.claude/settings.json` → `.claude/hooks/protect-files.mjs` (block secrets/lockfiles/db edits), `guard-commands.mjs` (block force-push, hook bypass, `rm -rf /`), `format.mjs` (Prettier after every edit).
- `.githooks/pre-commit` — Prettier check on staged files.
