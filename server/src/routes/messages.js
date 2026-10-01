import { Router } from 'express';
import { parseId, validateContent } from '../validation.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/** Mounted at /api/channels/:id/messages. */
export function channelMessagesRouter({ store, broadcast }) {
  const router = Router({ mergeParams: true });

  router.use((req, res, next) => {
    const id = parseId(req.params.id);
    req.channel = id && store.findChannel(id);
    if (!req.channel) return res.status(404).json({ error: 'Channel not found' });
    next();
  });

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

/** Mounted at /api/messages. Edits and deletes are author-only. */
export function messagesRouter({ store, broadcast }) {
  const router = Router();

  router.param('id', (req, res, next, rawId) => {
    const id = parseId(rawId);
    const message = id && store.findMessage(id);
    if (!message) return res.status(404).json({ error: 'Message not found' });
    if (message.author.id !== req.user.id) {
      return res.status(403).json({ error: 'You can only change your own messages' });
    }
    req.message = message;
    next();
  });

  router.patch('/:id', (req, res) => {
    const content = validateContent(req.body?.content);
    if (content.error) return res.status(400).json({ error: content.error });

    const message = store.updateMessage(req.message.id, content.value);
    broadcast('message:updated', { message });
    res.json({ message });
  });

  router.delete('/:id', (req, res) => {
    const { id, channelId } = req.message;
    store.deleteMessage(id);
    broadcast('message:deleted', { id, channelId });
    res.status(204).end();
  });

  return router;
}
