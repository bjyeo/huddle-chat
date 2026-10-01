import { Router } from 'express';
import { isUniqueViolation } from '../store.js';
import { normalizeChannelName, parseId, validateTopic } from '../validation.js';

export const MAX_CHANNELS = 50;

export function channelsRouter({ store, broadcast }) {
  const router = Router();

  router.get('/', (req, res) => {
    res.json({ channels: store.listChannels() });
  });

  router.post('/', (req, res) => {
    const { name, topic } = req.body ?? {};
    const normalized = normalizeChannelName(name);
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

  router.delete('/:id', (req, res) => {
    const id = parseId(req.params.id);
    const channel = id && store.findChannel(id);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    // Seeded channels (#general) have no creator and can never be deleted.
    if (channel.createdBy === null) {
      return res.status(403).json({ error: `#${channel.name} can't be deleted` });
    }
    if (channel.createdBy !== req.user.id) {
      return res.status(403).json({ error: 'Only the channel creator can delete it' });
    }

    store.deleteChannel(id); // messages go with it via ON DELETE CASCADE
    broadcast('channel:deleted', { id });
    res.status(204).end();
  });

  return router;
}
