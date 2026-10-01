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
- Hard cap of 10 members (`MAX_USERS`), invite code (`INVITE_CODE`, required in production), `remove-user` admin script
- Channels: create, delete your own (`#general` is permanent), unread indicators
- Realtime messages over WebSockets, edit/delete your own messages, infinite scroll history
- Online/offline member list and "is typing…" indicators
- Revocable server-side sessions, login/registration rate limiting, server-side ownership checks, parameterized SQL, no HTML rendering of messages

## Getting started

Requires **Node.js 22.13+** (for `node:sqlite`).

```bash
npm install          # installs all workspaces and enables the git pre-commit hook
npm run dev          # API on http://localhost:3001, app on http://localhost:5173
```

Open http://localhost:5173, register the first account, and share the URL with your group.

### Production

```bash
cp .env.example server/.env   # then set JWT_SECRET and INVITE_CODE (see Security)
npm run build                 # builds client/dist
NODE_ENV=production npm start # serves API, websockets and the built app on PORT
```

Put it behind HTTPS (e.g. Caddy or nginx) so the `Secure` cookie works, and set:

- `CLIENT_ORIGIN=https://chat.example.com` — the public URL (websocket connections from any other origin are refused)
- `TRUST_PROXY=1` — one proxy in front, so rate limiting sees real client IPs

The SQLite file lives at `server/data/huddle.db` by default — back it up.

### Security

In production the server refuses to start unless:

- `JWT_SECRET` is a unique random value of at least 32 characters. Placeholders such as `change-me` or
  `secret` are rejected, since anyone who knows the secret can forge a login for any member. Generate one with
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
- `INVITE_CODE` is set, so strangers can't register and take the member slots. To run open registration on
  purpose, set `ALLOW_OPEN_REGISTRATION=true` instead.

Sessions are stored server-side: logging out revokes that session everywhere, including copies of the
cookie. With open registration (`ALLOW_OPEN_REGISTRATION=true`) sign-ups are limited to 5 attempts per
IP per hour; with an invite code there is no such cap, so a whole group can join from one office IP.
Failed logins and wrong invite codes are limited to 10 per IP per 15 minutes. All limits key on the client
IP, so behind a reverse proxy set `TRUST_PROXY` (usually `1`) — otherwise every visitor shares the proxy's IP
and one person can exhaust a limit for everyone. Each user keeps at most 20 sessions; older ones are evicted.
Upgrading from a version without server-side sessions logs everyone out once.

### Administration

There is no in-app admin. To remove a member (for example to free a slot on a full server), run on the
server host:

```bash
npm run remove-user -w server -- <username>
```

It reads `DATABASE_PATH` from `server/.env` like the server, works while the server is running, and prints
what it did. The member's messages and sessions are deleted (their open tabs are disconnected within a
minute); channels they created stay, with no owner, so like `#general` they can no longer be deleted.
Other members' open tabs keep showing the removed member and their messages until they reload.

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
