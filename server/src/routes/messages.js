import { Router } from 'express';
import { loadById, requireOwner } from '../middleware.js';
import { parseId, validateContent } from '../validation.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/** Mounted at /api/channels/:id/messages; every route needs the channel to exist. */
export function channelMessagesRouter({ store, broadcast }) {
  const router = Router({ mergeParams: true });

  router.use(
    loadById({ find: (id) => store.findChannel(id), as: 'channel', notFound: 'Channel not found' }),
  );

  router.get('/', (req, res) => {
    const { before, limit } = req.query;
    const beforeId = before === undefined ? undefined : parseId(before);
    if (beforeId === null) return res.status(400).json({ error: 'Invalid "before" message id' });
    const pageSize = limit === undefined ? DEFAULT_LIMIT : parseId(limit);
    if (pageSize === null) return res.status(400).json({ error: 'Invalid "limit"' });

    const messages = store.listMessages(req.channel.id, {
      before: beforeId,
      limit: Math.min(pageSize, MAX_LIMIT),
    });
    res.json({ messages });
  });

  router.post('/', (req, res) => {
    const content = validateContent(req.body?.content);
    if (content.error) return res.status(400).json({ error: content.error });

    const message = store.createMessage({
      channelId: req.channel.id,
      authorId: req.user.id,
      content: content.value,
    });
    broadcast('message:created', { message });
    res.status(201).json({ message });
  });

  return router;
}

/** Mounted at /api/messages. Access rules are declared per route. */
export function messagesRouter({ store, broadcast }) {
  const router = Router();

  const loadMessage = loadById({
    find: (id) => store.findMessage(id),
    as: 'message',
    notFound: 'Message not found',
  });
  const requireAuthor = requireOwner(
    (req) => req.message.author.id,
    'You can only change your own messages',
  );

  router.patch('/:id', loadMessage, requireAuthor, (req, res) => {
    const content = validateContent(req.body?.content);
    if (content.error) return res.status(400).json({ error: content.error });

    const message = store.updateMessage(req.message.id, content.value);
    broadcast('message:updated', { message });
    res.json({ message });
  });

  router.delete('/:id', loadMessage, requireAuthor, (req, res) => {
    const { id, channelId } = req.message;
    store.deleteMessage(id);
    broadcast('message:deleted', { id, channelId });
    res.status(204).end();
  });

  return router;
}
