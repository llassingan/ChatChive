/**
 * The privacy note and its "How we know" affordance (E3-1; PRD S-8, R-36).
 *
 * The claim is deliberately small and checkable: no backend exists, nothing is
 * uploaded, and the Network panel stays empty after load. The steps tell the
 * reader how to confirm that themselves rather than asking them to trust a
 * badge. There is no link to a privacy page because none exists yet (R-24).
 */
import { useState } from 'react';
import { Dialog } from './Dialog.tsx';
import './PrivacyNote.css';

export function PrivacyNote() {
  const [open, setOpen] = useState(false);

  return (
    <div className="privacy">
      <p className="privacy__claim">
        Your chat is opened in this browser and never uploaded. It stays in memory only, so
        reloading the tab clears it.
      </p>
      <button type="button" className="text-button" onClick={() => setOpen(true)}>
        How we know
      </button>

      <Dialog open={open} title="How we know" onClose={() => setOpen(false)}>
        <div className="privacy__body">
          <p>
            This app has no backend and no server to send a chat to. It is a folder of static files:
            HTML, CSS, JavaScript and the icons, all served from the same place you loaded this page
            from.
          </p>
          <ol className="privacy__steps">
            <li>
              Open your browser's developer tools (F12, or Ctrl+Shift+I, or Cmd+Option+I on macOS).
            </li>
            <li>Select the Network tab and clear it.</li>
            <li>
              Pick a chat export here and watch the list. Unzipping and parsing happen in the tab,
              so no new row appears while the file is read.
            </li>
          </ol>
          <p>
            The page's Content-Security-Policy is the machine-readable version of the same promise.
            It sets <code>connect-src 'self'</code>, which blocks a script from posting your file
            anywhere else, and it names no third-party script, font, CDN or analytics host. The
            source is open under the MIT license, so you can read every line rather than take our
            word for it.
          </p>
        </div>
      </Dialog>
    </div>
  );
}
