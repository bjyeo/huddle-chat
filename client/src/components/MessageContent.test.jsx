import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { splitLinks } from '../lib/linkify.js';
import { MessageContent } from './MessageContent.jsx';

describe('MessageContent', () => {
  it('renders HTML-looking content as plain text', () => {
    const payload = '<img src=x onerror=alert(1)><script>alert(2)</script>';
    const { container } = render(<MessageContent content={payload} />);

    expect(container).toHaveTextContent(payload);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });

  it('turns http(s) URLs into safe external links', () => {
    render(<MessageContent content="see https://example.com/a?b=1, or javascript:alert(1)" />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://example.com/a?b=1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });
});

describe('splitLinks', () => {
  it('splits text around links and strips trailing punctuation', () => {
    expect(splitLinks('go to http://a.io/x). now')).toEqual([
      { type: 'text', value: 'go to ' },
      { type: 'link', value: 'http://a.io/x' },
      { type: 'text', value: '). now' },
    ]);
    expect(splitLinks('no links')).toEqual([{ type: 'text', value: 'no links' }]);
  });
});
