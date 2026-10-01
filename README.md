# Huddle

A small, self-hosted, Discord-style group chat for up to **10 people**: text channels, realtime messages, presence, typing indicators, and username/password login.

| Layer    | Tech                                                                 |
| -------- | -------------------------------------------------------------------- |
| Frontend | React 19 + Vite, custom hooks, `socket.io-client`, plain CSS         |
| Backend  | Node.js, Express 5, Socket.IO 4                                      |
| Database | SQLite via Node's built-in `node:sqlite` (no native build step)      |
| Auth     | bcrypt password hashes, JWT in an httpOnly `SameSite=Lax` cookie     |
| Tooling  | Prettier, `node:test` + Supertest, Vitest + Testing Library, Actions |

## Features

- Register / log in / log out; sessions survive reloads (7-day cookie)
- Hard cap of 10 members (`MAX_USERS`), optional invite code (`INVITE_CODE`)
- Channels: create, delete your own (`#general` is permanent), unread indicators
- Realtime messages over WebSockets, edit/delete your own messages, infinite scroll history
- Online/offline member list and "is typing…" indicators
- Login rate limiting, server-side ownership checks, parameterized SQL, no HTML rendering of messages

## Getting started

Requires **Node.js 22.13+** (for `node:sqlite`).

```bash
npm install          # installs all workspaces and enables the git pre-commit hook
npm run dev          # API on http://localhost:3001, app on http://localhost:5173
```

Open http://localhost:5173, register the first account, and share the URL with your group.

### Production

```bash
cp .env.example server/.env   # set a strong JWT_SECRET
npm run build                 # builds client/dist
NODE_ENV=production npm start # serves API, websockets and the built app on PORT
```

Put it behind HTTPS (e.g. Caddy or nginx) so the `Secure` cookie works, and set:

- `CLIENT_ORIGIN=https://chat.example.com` — the public URL (websocket connections from any other origin are refused)
- `TRUST_PROXY=1` — one proxy in front, so login rate limiting sees real client IPs

The SQLite file lives at `server/data/huddle.db` by default — back it up.

### Configuration

See [`.env.example`](.env.example) and the table in [`docs/API.md`](docs/API.md#environment).

## Project layout

```
client/            React app (hooks in client/src/hooks)
server/            Express + Socket.IO + SQLite API
shared/            @huddle/shared: validation rules and limits imported by both sides
docs/API.md        REST + realtime contract shared by both sides
.claude/           Claude Code project settings and hooks
.githooks/         git pre-commit hook (Prettier check)
.github/workflows/ CI, @claude assistant, Claude Code Review
```

## Tests

```bash
npm test             # shared + server (node:test), then client (Vitest)
npm run format:check
```

## Claude Code integration

- **Hooks** (`.claude/settings.json`):
  - `PreToolUse` → `protect-files.mjs` blocks edits to `.env`, lockfiles and `.db` files
  - `PreToolUse` → `guard-commands.mjs` blocks force-pushes, `--no-verify` and `rm -rf /`
  - `PostToolUse` → `format.mjs` runs Prettier on every file Claude edits
- **Worktrees**: the backend and frontend were built in parallel in separate git worktrees against the shared contract in `docs/API.md`, then merged.
- **GitHub Actions**:
  - `ci.yml` — format check, tests and build on every push/PR
  - `claude.yml` — mention `@claude` in an issue or PR to get help
  - `claude-code-review.yml` — automatic Claude review on every pull request

  Both Claude workflows need an `ANTHROPIC_API_KEY` **or** `CLAUDE_CODE_OAUTH_TOKEN` repository secret
  (the easiest way is running `/install-github-app` inside Claude Code), plus the
  [Claude GitHub App](https://github.com/apps/claude) installed on the repo.
