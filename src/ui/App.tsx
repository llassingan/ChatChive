/**
 * App shell and view switch (E3). One screen at a time: the landing drop zone,
 * the processing bar, the ambiguous-date prompt, the ready summary, or an
 * error. The chat view (E4/E5) is a later sprint and is not faked here.
 */
import { DateOrderPrompt } from './components/DateOrderPrompt.tsx';
import { ErrorView } from './components/ErrorView.tsx';
import { Landing } from './components/Landing.tsx';
import { ProgressView } from './components/ProgressView.tsx';
import { ReadyPanel } from './components/ReadyPanel.tsx';
import { useImportFlow } from './import/useImportFlow.ts';
import './base.css';
import './components/controls.css';

export function App() {
  const flow = useImportFlow();
  const { state } = flow;

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

      {state.status === 'ready' ? (
        <ReadyPanel chat={state.chat} fileName={state.file.name} onClose={flow.cancel} />
      ) : null}

      {state.status === 'error' ? <ErrorView error={state.error} onBack={flow.cancel} /> : null}
    </div>
  );
}
