import { splitLinks } from '../lib/linkify.js';

/** Plain-text message body; URLs become links. Never parsed as HTML. */
export function MessageContent({ content }) {
  return splitLinks(content).map((part, index) =>
    part.type === 'link' ? (
      <a key={index} href={part.value} target="_blank" rel="noopener noreferrer">
        {part.value}
      </a>
    ) : (
      part.value
    ),
  );
}
