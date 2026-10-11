import { Icon } from './icons/index.ts';
import './App.css';

// Placeholder shell. The real landing page, drop zone and chat view arrive in
// later sprints (backlog E3, E4, E6). This proves the E1-2 tokens and the local
// icon set resolve, and gives the no-network e2e test something to load.
export function App() {
  return (
    <main className="app-shell">
      <div className="app-shell__brand">
        <span className="app-shell__mark" aria-hidden="true">
          <Icon name="send" size={20} />
        </span>
        <h1>ChatChive</h1>
      </div>

      <p>Open a WhatsApp chat export. It is read in your browser and never uploaded.</p>

      <div className="token-check" aria-hidden="true">
        <span className="token-check__bubble token-check__bubble--in">
          Incoming bubble<span className="token-check__time">09.59</span>
        </span>
        <span className="token-check__bubble token-check__bubble--out">
          Outgoing bubble<span className="token-check__time">10.09</span>
        </span>
      </div>

      <p className="disclaimer">Not affiliated with WhatsApp or Meta.</p>
    </main>
  );
}
