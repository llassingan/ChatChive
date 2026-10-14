/**
 * App shell and view switch (E3, E4). One screen at a time: the landing drop
 * zone, the processing bar, the ambiguous-date prompt, the chat, or an error.
 */
import { ChatShell } from './shell/ChatShell.tsx';
import { DateOrderPrompt } from './components/DateOrderPrompt.tsx';
import { ErrorView } from './components/ErrorView.tsx';
import { Landing } from './components/Landing.tsx';
import { ProgressView } from './components/ProgressView.tsx';
import { useImportFlow } from './import/useImportFlow.ts';
import { useTheme } from './theme.ts';
import './base.css';
import './components/controls.css';

export function App() {
  const flow = useImportFlow();
  const { state } = flow;

  // The theme is applied here, at the root, and NOT inside `ChatView`: the
  // landing screen is the first screen a returning reader sees, and it must
  // already be in their chosen theme (a Light reader must not get a dark first
  // frame before a chat exists). `useTheme` is subscribed exactly once, so the
  // chat's control reads the same state through its own call; both mount at
  // most once at a time because `App` renders one view.
  useTheme();

  return (
    <div className="app">
      {state.status === 'landing' ? <Landing onFile={flow.pick} /> : null}

      {state.status === 'working' ? (
        <ProgressView
          phase={state.phase}
          fraction={state.fraction}
          fileName={state.file.name}
          onCancel={flow.cancel}
        />
      ) : null}

      {state.status === 'choice' ? (
        <DateOrderPrompt
          samples={state.samples}
          onChoose={flow.chooseDateOrder}
          onCancel={flow.cancel}
        />
      ) : null}

      {/* The session travels with the parsed chat: media rows extract bytes from
          it on demand while the chat is open (E5-1, plan §2.4). */}
      {state.status === 'chat' ? (
        <ChatShell chat={state.chat} session={state.session} onClose={flow.cancel} />
      ) : null}

      {state.status === 'error' ? <ErrorView error={state.error} onBack={flow.cancel} /> : null}
    </div>
  );
}
