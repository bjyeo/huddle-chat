const URL_RE = /https?:\/\/[^\s<>"]+/g;
const TRAILING_PUNCTUATION = /[.,!?;:'")\]]+$/;

/** Splits text into `{ type: 'text' | 'link', value }` parts. Only http(s) URLs become links. */
export function splitLinks(text) {
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const url = match[0].replace(TRAILING_PUNCTUATION, '');
    if (match.index > last) parts.push({ type: 'text', value: text.slice(last, match.index) });
    parts.push({ type: 'link', value: url });
    last = match.index + url.length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
  return parts;
}
