import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Composer } from './Composer.jsx';
import { MessageEditor } from './MessageEditor.jsx';

const INVISIBLE = '\u200b\u200d\u2060';

function renderComposer() {
  const send = vi.fn().mockResolvedValue(undefined);
  const notifyTyping = vi.fn();
  render(<Composer channelName="general" send={send} notifyTyping={notifyTyping} />);
  return { send, notifyTyping, input: screen.getByRole('textbox', { name: 'Message #general' }) };
}

describe('Composer', () => {
  it('treats an invisible-only draft as empty: no Send, no typing events', () => {
    const { send, notifyTyping, input } = renderComposer();

    fireEvent.change(input, { target: { value: INVISIBLE } });
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    expect(notifyTyping).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(send).not.toHaveBeenCalled();
  });

  it('sends visible text', () => {
    const { send, notifyTyping, input } = renderComposer();

    fireEvent.change(input, { target: { value: '  hi  ' } });
    expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled();
    expect(notifyTyping).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(send).toHaveBeenCalledWith('hi');
  });
});

describe('MessageEditor', () => {
  it('does not save an invisible-only edit', () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<MessageEditor initial="hello" onSave={onSave} onCancel={vi.fn()} />);
    const input = screen.getByRole('textbox', { name: 'Edit message' });

    fireEvent.change(input, { target: { value: INVISIBLE } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'hello again' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSave).toHaveBeenCalledWith('hello again');
  });
});
