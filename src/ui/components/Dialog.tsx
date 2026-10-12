/**
 * Dialog shell (E3-1). A native `<dialog>` gives the accessibility plumbing for
 * free: the page becomes inert, focus moves inside, Escape closes it.
 *
 * Opening focus goes to the heading, not the close button, so a screen reader
 * reads the title first.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon } from '../icons/index.ts';
import './Dialog.css';

export interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Dialog({ open, title, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="dialog__panel">
        <div className="dialog__head">
          <h2 id={titleId} className="dialog__title" tabIndex={-1} data-autofocus>
            {title}
          </h2>
          <button type="button" className="icon-button" onClick={onClose}>
            <Icon name="close" size={20} />
            <span className="visually-hidden">Close</span>
          </button>
        </div>
        <div className="dialog__body">{children}</div>
      </div>
    </dialog>
  );
}
