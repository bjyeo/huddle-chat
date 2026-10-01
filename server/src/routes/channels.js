import { MAX_CHANNELS, isProtectedChannel } from '@huddle/shared';
import { Router } from 'express';
import { loadById, requireOwner } from '../middleware.js';
import { isUniqueViolation } from '../store.js';
import { validateChannelName, validateTopic } from '../validation.js';

export function channelsRouter({ store, broadcast }) {
  const router = Router();

  const loadChannel = loadById({
    find: (id) => store.findChannel(id),
    as: 'channel',
    notFound: 'Channel not found',
  });
  // Seeded channels (#general) have no creator and can never be deleted.
  const rejectProtected = (req, res, next) => {
    if (isProtectedChannel(req.channel)) {
      return res.status(403).json({ error: `#${req.channel.name} can't be deleted` });
    }
    next();
  };
  const requireCreator = requireOwner(
    (req) => req.channel.createdBy,
    'Only the channel creator can delete it',
  );

  router.get('/', (req, res) => {
    res.json({ channels: store.listChannels() });
  });

  router.post('/', (req, res) => {
    const { name, topic } = req.body ?? {};
    const normalized = validateChannelName(name);
    if (normalized.error) return res.status(400).json({ error: normalized.error });
    const cleanTopic = validateTopic(topic);
    if (cleanTopic.error) return res.status(400).json({ error: cleanTopic.error });

    const duplicate = { error: `Channel #${normalized.value} already exists` };
    if (store.channelNameExists(normalized.value)) return res.status(409).json(duplicate);
    if (store.countChannels() >= MAX_CHANNELS) {
      return res.status(403).json({ error: `Channel limit reached (max ${MAX_CHANNELS})` });
    }

    let channel;
    try {
      channel = store.createChannel({
        name: normalized.value,
        topic: cleanTopic.value,
        createdBy: req.user.id,
      });
    } catch (err) {
      if (isUniqueViolation(err)) return res.status(409).json(duplicate);
      throw err;
    }

    broadcast('channel:created', { channel });
    res.status(201).json({ channel });
  });

  router.delete('/:id', loadChannel, rejectProtected, requireCreator, (req, res) => {
    const { id } = req.channel;
    store.deleteChannel(id); // messages go with it via ON DELETE CASCADE
    broadcast('channel:deleted', { id });
    res.status(204).end();
  });

  return router;
}
