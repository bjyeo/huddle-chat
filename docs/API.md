# Huddle API Contract

This is the single source of truth shared by `server/` and `client/`. Both sides must match it exactly.

## Conventions

- All REST endpoints live under `/api` and speak JSON.
- Errors always look like `{ "error": "Human readable message" }` with an appropriate status code.
- Timestamps are ISO-8601 strings (`2026-10-01T12:00:00.000Z`).
- IDs are integers.
- Authentication uses a JWT stored in an **httpOnly cookie named `token`** (`SameSite=Lax`, `Secure` in production, 7 day expiry, HS256, payload `{ sub: userId, jti, iat, exp }`).
  Every login/registration creates a server-side session (table `sessions`, keyed by `jti`). A token is
  accepted only if it is HS256-signed, has `exp` and `jti`, and its session row exists and hasn't expired.
  Logout deletes the session row, so a copy of the cookie stops working on REST and new socket handshakes
  too. Removing a user (`npm run remove-user`) revokes all their sessions; rotating `JWT_SECRET` invalidates every session at once.
  The client never touches the token directly; it sends requests with `credentials: 'include'`.
- Every endpoint except `register`, `login`, `logout` and `GET /api/health` requires auth → `401 { error: "Not authenticated" }` otherwise.

## Objects

```jsonc
// User
{ "id": 1, "username": "alice", "displayName": "Alice", "createdAt": "..." }

// Member (User + presence) — returned by GET /api/users
{ "id": 1, "username": "alice", "displayName": "Alice", "createdAt": "...", "online": true }

// Channel
{ "id": 1, "name": "general", "topic": "Say hi!", "createdBy": null, "createdAt": "..." }

// Message
{
  "id": 10,
  "channelId": 1,
  "content": "hello",
  "createdAt": "...",
  "editedAt": null,
  "author": { "id": 1, "username": "alice", "displayName": "Alice" }
}
```

## Limits & validation

| Field           | Rule                                                                               |
| --------------- | ---------------------------------------------------------------------------------- |
| username        | 3–20 chars, `^[a-zA-Z0-9_]+$`, unique case-insensitively, stored as given          |
| password        | 8–128 chars                                                                        |
| displayName     | optional, 1–32 chars after trim; defaults to username                              |
| channel name    | normalized: trim, lowercase, whitespace → `-`; must then match `^[a-z0-9-]{1,32}$` |
| channel topic   | optional, ≤ 120 chars                                                              |
| message content | trimmed, 1–2000 chars                                                              |
| users           | **max 10 registered users** (env `MAX_USERS`, default 10)                          |
| channels        | max 50                                                                             |

## REST endpoints

### Health

- `GET /api/health` → `200 { "ok": true }`

### Auth

- `POST /api/auth/register` body `{ username, password, displayName?, inviteCode? }`
  - `201 { user }` and sets the cookie (user is logged in immediately).
  - `400` validation error, `409` username taken,
    `403 { error: "Invalid invite code" }` when env `INVITE_CODE` is set and doesn't match,
    `403 { error: "This server is full (max 10 members)" }` when the user cap is reached.
  - Rate limited: max 5 registration attempts per IP per hour, successful or not → `429` with `Retry-After`
    (`{ error: "Too many registration attempts, try again later" }`).
  - When `INVITE_CODE` is set: max 10 wrong invite codes per IP per 15 minutes → `429` with `Retry-After`.
  - Broadcasts socket `user:joined { user }`.
- `POST /api/auth/login` body `{ username, password }` (username match is case-insensitive)
  - `200 { user }` and sets the cookie. `401 { error: "Invalid username or password" }`.
  - Rate limited: max 10 failed attempts per IP per 15 minutes → `429`.
- `POST /api/auth/logout` → `204`, revokes the session server-side, clears the cookie and disconnects the
  sockets opened with that session (other sessions of the same user stay connected).
- `GET /api/auth/me` → `200 { user }` or `401`.

### Users

- `GET /api/users` → `200 { users: Member[] }` ordered by displayName (case-insensitive).

### Channels

- `GET /api/channels` → `200 { channels: Channel[] }` ordered by `id` ascending.
- `POST /api/channels` body `{ name, topic? }` → `201 { channel }`; `400` invalid, `409` name exists, `403` channel cap reached.
  Broadcasts `channel:created { channel }`.
- `DELETE /api/channels/:id` → `204`. Only the creator may delete (`403`). Channel `general` (seeded, `createdBy: null`) can never be deleted (`403`). `404` if missing.
  Deletes its messages too. Broadcasts `channel:deleted { id }`.

### Messages

- `GET /api/channels/:id/messages?before=<messageId>&limit=<n>` → `200 { messages: Message[] }`
  - Returns the newest `limit` messages (default 50, max 100) with `id < before` when given, **sorted oldest → newest**. `404` if channel missing.
- `POST /api/channels/:id/messages` body `{ content }` → `201 { message }`. Broadcasts `message:created { message }`.
- `PATCH /api/messages/:id` body `{ content }` → `200 { message }` (sets `editedAt`). Author only (`403`). Broadcasts `message:updated { message }`.
- `DELETE /api/messages/:id` → `204`. Author only (`403`). Broadcasts `message:deleted { id, channelId }`.

## Realtime (Socket.IO)

- Same origin, default path `/socket.io`. The server authenticates the handshake from the `token` cookie
  (falls back to `socket.handshake.auth.token`); unauthenticated connections are rejected with `Error("Not authenticated")`.
  The server disconnects a socket (`io server disconnect`) when its session is logged out or its token expires,
  and within a minute when its session is revoked out of band (e.g. the user was removed);
  clients should treat that, and a later `Not authenticated` connect error, as being logged out.
- Every authenticated socket joins one room (`"members"`); with ≤10 users every event goes to everyone and the client filters by channel.

Server → client events:

| Event             | Payload                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `message:created` | `{ message }`                                                                                 |
| `message:updated` | `{ message }`                                                                                 |
| `message:deleted` | `{ id, channelId }`                                                                           |
| `channel:created` | `{ channel }`                                                                                 |
| `channel:deleted` | `{ id }`                                                                                      |
| `user:joined`     | `{ user }`                                                                                    |
| `presence:update` | `{ userId, online }` — emitted when a user's first socket connects or last socket disconnects |
| `typing`          | `{ channelId, user: { id, displayName } }` — relayed to everyone **except** the sender        |

Client → server events:

| Event    | Payload                                                          |
| -------- | ---------------------------------------------------------------- |
| `typing` | `{ channelId }` (server ignores it if the channel doesn't exist) |

Messages are sent via REST (`POST /api/channels/:id/messages`), not via the socket.

## Environment

| Var                       | Default                                    | Notes                                                                                               |
| ------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `PORT`                    | `3001`                                     | API + socket server                                                                                 |
| `JWT_SECRET`              | random per boot in dev                     | **required** when `NODE_ENV=production`: ≥ 32 characters, not a placeholder (see below)             |
| `DATABASE_PATH`           | `./data/huddle.db` (relative to `server/`) | `:memory:` in tests                                                                                 |
| `MAX_USERS`               | `10`                                       |                                                                                                     |
| `INVITE_CODE`             | unset                                      | when set, registration requires it; **required** when `NODE_ENV=production` (see below)             |
| `ALLOW_OPEN_REGISTRATION` | `false`                                    | `true` lets a production server start without `INVITE_CODE` (anyone can register)                   |
| `CLIENT_ORIGIN`           | `http://localhost:5173`                    | CORS origin for dev; also the allowed websocket `Origin` (set it to your public URL behind a proxy) |
| `TRUST_PROXY`             | `0`                                        | number of reverse proxies in front; makes the rate limiters use the real client IP                  |

With `NODE_ENV=production` the server refuses to start (with an error saying why) when:

- `JWT_SECRET` is unset, shorter than 32 characters, has fewer than 8 distinct characters, or is a known
  placeholder (`change-me`, `changeme`, `secret`, `password`, `jwt-secret`, `your-secret…`, `replace-me…`;
  case and `-`/`_`/`.` separators are ignored). Generate one with
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
- `INVITE_CODE` is unset and `ALLOW_OPEN_REGISTRATION` isn't `true`.
- `ALLOW_OPEN_REGISTRATION` is anything other than `true`, `false` or empty (also checked in development).

In development the Vite dev server (port 5173) proxies `/api` and `/socket.io` (with `ws: true`) to port 3001, so the app is same-origin.
In production `server` also serves the built client from `client/dist` with an SPA fallback.
