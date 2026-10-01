import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePanels } from '../hooks/usePanels.js';
import { ConfirmDialog } from './ConfirmDialog.jsx';

/** A trigger that opens the dialog, inside a focusable list like the real message list. */
function Harness({ onConfirm = () => {}, removeOnConfirm = false }) {
  const [open, setOpen] = useState(false);
  const [removed, setRemoved] = useState(false);
  const confirm = async () => {
    await onConfirm();
    if (removeOnConfirm) setRemoved(true);
  };
  return (
    <section tabIndex={0} aria-label="Messages">
      <button type="button">Before</button>
      {!removed && (
        <div>
          <button type="button" onClick={() => setOpen(true)}>
            Delete message
          </button>
          {open && (
            <ConfirmDialog
              title="Delete message"
              onConfirm={confirm}
              onClose={() => setOpen(false)}
            >
              Are you sure?
            </ConfirmDialog>
          )}
        </div>
      )}
    </section>
  );
}

/** Renders into a real `#root`, as main.jsx does, so the inert handling has something to act on. */
function renderInRoot(ui) {
  const root = document.createElement('div');
  root.id = 'root';
  document.body.append(root);
  return { root, ...render(ui, { container: root }) };
}

async function openDialog(user) {
  await user.click(screen.getByRole('button', { name: 'Delete message' }));
  return screen.getByRole('alertdialog', { name: 'Delete message' });
}

describe('ConfirmDialog', () => {
  let user;
  beforeEach(() => {
    user = userEvent.setup();
  });
  afterEach(() => {
    document.getElementById('root')?.remove();
  });

  it('moves focus in on open, makes #root inert, and restores both on Cancel', async () => {
    const { root } = renderInRoot(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Delete message' });

    const dialog = await openDialog(user);
    expect(dialog).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(root).toHaveAttribute('inert');
    // The dialog is portalled outside #root, so it is not inside the inert subtree.
    expect(root).not.toContainElement(dialog);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(root).not.toHaveAttribute('inert');
    expect(trigger).toHaveFocus();
  });

  it('survives StrictMode double effects (as in main.jsx)', async () => {
    const { root } = renderInRoot(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );
    await openDialog(user);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(root).toHaveAttribute('inert');

    await user.keyboard('{Escape}');
    await act(() => Promise.resolve());
    expect(root).not.toHaveAttribute('inert');
    expect(screen.getByRole('button', { name: 'Delete message' })).toHaveFocus();
  });

  it('closes on Escape and restores focus to the trigger', async () => {
    const { root } = renderInRoot(<Harness />);
    await openDialog(user);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(root).not.toHaveAttribute('inert');
    expect(screen.getByRole('button', { name: 'Delete message' })).toHaveFocus();
  });

  it('restores focus to the trigger after a successful confirm', async () => {
    const onConfirm = vi.fn();
    renderInRoot(<Harness onConfirm={onConfirm} />);
    await openDialog(user);

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete message' })).toHaveFocus();
  });

  it('falls back to the nearest focusable ancestor when confirming removed the trigger', async () => {
    renderInRoot(<Harness removeOnConfirm />);
    await openDialog(user);

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.queryByRole('button', { name: 'Delete message' })).not.toBeInTheDocument();
    await act(() => Promise.resolve()); // the fallback runs once the commit has finished
    expect(screen.getByRole('region', { name: 'Messages' })).toHaveFocus();
  });

  it('still closes on Escape after a click on the dialog text dropped focus to <body>', async () => {
    renderInRoot(<Harness />);
    await openDialog(user);

    await user.click(screen.getByText('Are you sure?'));
    act(() => document.activeElement.blur());
    expect(document.body).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete message' })).toHaveFocus();
  });

  it('keeps Escape from reaching document-level listeners', async () => {
    const onDocumentKeyDown = vi.fn();
    document.addEventListener('keydown', onDocumentKeyDown);
    try {
      renderInRoot(<Harness />);
      await openDialog(user);
      act(() => document.activeElement.blur());

      await user.keyboard('{Escape}');
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(onDocumentKeyDown).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', onDocumentKeyDown);
    }
  });

  it('does not close the mobile drawer (usePanels) behind it on Escape', async () => {
    function Shell() {
      const panels = usePanels();
      return (
        <>
          <button type="button" onClick={panels.toggleSidebar}>
            Menu
          </button>
          <p>{panels.sidebarOpen ? 'drawer open' : 'drawer closed'}</p>
          <Harness />
        </>
      );
    }
    renderInRoot(<Shell />);
    await user.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.getByText('drawer open')).toBeInTheDocument();

    await openDialog(user);
    await user.click(screen.getByText('Are you sure?'));
    act(() => document.activeElement.blur());
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByText('drawer open')).toBeInTheDocument();

    // With no dialog open, Escape reaches the drawer as before.
    await user.keyboard('{Escape}');
    expect(screen.getByText('drawer closed')).toBeInTheDocument();
  });

  it('traps Tab and Shift+Tab inside the dialog', async () => {
    renderInRoot(<Harness />);
    await openDialog(user);
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const confirm = screen.getByRole('button', { name: 'Delete' });

    await user.tab();
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();

    // Focus that escaped to <body> is pulled back in on the next Tab.
    act(() => document.activeElement.blur());
    await user.tab();
    expect(cancel).toHaveFocus();
  });
});
