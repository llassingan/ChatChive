/**
 * Landing screen: brand, the drop zone as the single focal point, the privacy
 * note with its "How we know" affordance, and the export help (E3-1, F-IMP-1, S-8).
 *
 * The zone is a `<label>` bound to the file input, so the whole area is
 * clickable and keyboard activation is the input's own behaviour.
 */
import { useState, type DragEvent } from 'react';
import { Mark } from '../brand/Mark.tsx';
import { Icon } from '../icons/index.ts';
import { Dialog } from './Dialog.tsx';
import { ExportHelp } from './ExportHelp.tsx';
import { PrivacyNote } from './PrivacyNote.tsx';
import './Landing.css';

export interface LandingProps {
  /** Receives a picked or dropped file, or null when a drop carried no readable
   *  file (a folder, or dragged text). Non-export files arrive here too, so the
   *  import flow can show the unrecognized-format error instead of failing
   *  silently at the picker. */
  onFile: (file: File | null) => void;
}

export function Landing({ onFile }: LandingProps) {
  const [dragging, setDragging] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    // A dropped folder carries no readable file, and neither does a drag that
    // only moved text. Either way the user aimed at the zone, so report the
    // rejection instead of appearing to ignore it.
    onFile(event.dataTransfer.files[0] ?? null);
  }

  return (
    <main className="landing">
      <h1 className="landing__brand">
        <span className="landing__mark" aria-hidden="true">
          <Mark size={20} />
        </span>
        <span className="landing__wordmark">ChatChive</span>
      </h1>

      <p className="landing__headline">Read a WhatsApp chat export</p>
      <p className="landing__lede">
        Open the <code>.zip</code> or <code>.txt</code> file WhatsApp gave you and read it as a
        chat, on this device.
      </p>

      <label
        className={dragging ? 'dropzone dropzone--active' : 'dropzone'}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <input
          type="file"
          className="visually-hidden"
          accept=".zip,.txt"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
            // Clear so picking the same file again after an error still fires.
            event.target.value = '';
          }}
        />
        <span className="dropzone__glyph" aria-hidden="true">
          <Icon name="file" size={32} />
        </span>
        <span className="dropzone__action">Open chat export</span>
        <span className="dropzone__hint">Drag a file here, or choose one. .zip or .txt</span>
      </label>

      <button type="button" className="text-button" onClick={() => setHelpOpen(true)}>
        How to export a chat from WhatsApp
      </button>

      <PrivacyNote />

      <p className="landing__disclaimer">
        Not affiliated with WhatsApp or Meta. "WhatsApp" is a trademark of Meta Platforms, Inc.
      </p>

      <Dialog
        open={helpOpen}
        title="How to export a chat from WhatsApp"
        onClose={() => setHelpOpen(false)}
      >
        <ExportHelp />
      </Dialog>
    </main>
  );
}
