import { parseId } from './validation.js';

/**
 * Parses `req.params.id`, loads the row with `find(id)` and stores it on `req[as]`;
 * a malformed or unknown id → `404 { error: notFound }`. Lookup only — no access checks.
 */
export function loadById({ find, as, notFound }) {
  return (req, res, next) => {
    const id = parseId(req.params.id);
    const row = id && find(id);
    if (!row) return res.status(404).json({ error: notFound });
    req[as] = row;
    next();
  };
}

/** Lets the request through only when `ownerId(req)` is the logged-in user; otherwise `403`. */
export function requireOwner(ownerId, error) {
  return (req, res, next) => {
    if (ownerId(req) !== req.user.id) return res.status(403).json({ error });
    next();
  };
}
