/**
 * Processing screen (E3-2, F-IMP-3): the current phase, a determinate bar when
 * the pipeline reports a fraction and an indeterminate one otherwise, and a
 * Cancel that closes the session and returns to the landing screen.
 */
import type { ParsePhase } from '../../types/chat.ts';
import { overallFraction } from '../import/useImportFlow.ts';
import './ProgressView.css';

export interface ProgressViewProps {
  phase: ParsePhase;
  fraction: number | undefined;
  fileName: string;
  onCancel: () => void;
}

const PHASE_LABEL: Record<ParsePhase, string> = {
  reading: 'Reading the file',
  unzipping: 'Unzipping the archive',
  parsing: 'Parsing the messages',
  ready: 'Finishing up',
};

export function ProgressView({ phase, fraction, fileName, onCancel }: ProgressViewProps) {
  const value = overallFraction(phase, fraction);
  const determinate = value !== undefined;

  return (
    <main className="progress-view">
      <h1 className="progress-view__title">Opening your chat</h1>
      <p className="progress-view__file" title={fileName}>
        {fileName}
      </p>

      {determinate ? (
        <progress className="progress" value={value} max={1} aria-label="Opening progress" />
      ) : (
        <div
          className="progress progress--indeterminate"
          role="progressbar"
          aria-label="Opening progress"
        />
      )}

      <p className="progress-view__phase" role="status" aria-live="polite">
        {PHASE_LABEL[phase]}
        {determinate ? `, ${Math.round(value * 100)}%` : ''}
      </p>

      <button type="button" className="button button--quiet" onClick={onCancel}>
        Cancel
      </button>
    </main>
  );
}
