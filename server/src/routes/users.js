import { Router } from 'express';

export function usersRouter({ store, isOnline }) {
  const router = Router();

  router.get('/', (req, res) => {
    const users = store.listUsers().map((user) => ({ ...user, online: isOnline(user.id) }));
    res.json({ users });
  });

  return router;
}
