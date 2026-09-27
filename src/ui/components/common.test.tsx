import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CharCount, Field, Lock, Modal, ToneMark } from './common';

describe('common components', () => {
  it('ToneMark conveys tone by shape and label, not color alone', () => {
    render(
      <>
        <ToneMark tone="light" />
        <ToneMark tone="dark" />
      </>,
    );
    expect(screen.getByRole('img', { name: 'Light' })).toHaveClass('tone', 'light');
    expect(screen.getByRole('img', { name: 'Dark' })).toHaveClass('tone', 'dark');
  });

  it('Lock is labelled', () => {
    render(<Lock />);
    expect(screen.getByRole('img', { name: 'Locked' })).toBeInTheDocument();
  });

  it('CharCount warns past the limit', () => {
    const { rerender } = render(<CharCount value="abc" max={3} />);
    expect(screen.getByText('3/3')).toHaveClass('hint');
    rerender(<CharCount value="abcd" max={3} />);
    expect(screen.getByText('4/3')).toHaveClass('warn');
  });

  it('Field renders label and hint', () => {
    render(
      <Field label="Name" hint="Who is it?">
        <input />
      </Field>,
    );
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByText('Who is it?')).toBeInTheDocument();
  });

  it('Modal focuses its first control, closes on Esc, ✕ and backdrop, and restores focus', () => {
    const onClose = vi.fn();
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const { unmount } = render(
      <Modal title="Dialog" onClose={onClose}>
        <input aria-label="inside" />
      </Modal>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Dialog' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.mouseDown(dialog.parentElement!);
    fireEvent.mouseDown(dialog);
    expect(onClose).toHaveBeenCalledTimes(3);
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
