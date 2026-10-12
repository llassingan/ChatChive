/**
 * Export instructions for both phone platforms (E3-1, PRD §13 risk table:
 * "Users don't know how to export"). These are the real menu paths in WhatsApp
 * for Android and iPhone; nothing here describes a screen that does not exist.
 */
import './ExportHelp.css';

export function ExportHelp() {
  return (
    <div className="export-help">
      <p className="export-help__intro">
        WhatsApp can export one chat at a time. Choose whether to include media before you start:
      </p>
      <ul className="export-help__types">
        <li>
          <strong>Without media</strong> gives a <code>.txt</code> file, which is small and fast to
          open.
        </li>
        <li>
          <strong>With media</strong> gives a <code>.zip</code> file holding the text plus the
          photos, videos and voice notes.
        </li>
      </ul>

      <section className="export-help__section">
        <h3 className="export-help__heading">Android</h3>
        <ol className="export-help__steps">
          <li>Open the chat you want to export.</li>
          <li>Tap the three-dot menu at the top right.</li>
          <li>Tap More, then Export chat.</li>
          <li>Choose Include media or Without media.</li>
          <li>Save the file to your phone. It lands in your Downloads or Files app.</li>
        </ol>
      </section>

      <section className="export-help__section">
        <h3 className="export-help__heading">iPhone</h3>
        <ol className="export-help__steps">
          <li>Open the chat you want to export.</li>
          <li>Tap the contact or group name at the top of the chat.</li>
          <li>Scroll to the bottom of that screen and tap Export Chat.</li>
          <li>Choose Attach Media or Without Media.</li>
          <li>Save the file to the Files app or send it to yourself.</li>
        </ol>
      </section>

      <p className="export-help__note">
        If the chat is long, WhatsApp may split the export into more than one file. Open the first
        one; it holds the start of the conversation.
      </p>
    </div>
  );
}
