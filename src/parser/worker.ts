/**
 * Worker entry (backlog E2-6). Plumbing only: it binds the pipeline from
 * `pipeline.ts` to the messages in `protocol.ts`.
 *
 * `client.ts` starts this as a module worker. Vite compiles it to its own
 * chunk, and the privacy CSP allows it through `worker-src 'self'` (PRD S-2).
 *
 * Requirement traceability: PRD §8 S-6 (huge files must not freeze the tab).
 */

import { createParserSession } from './pipeline.ts';
import type { WorkerRequest, WorkerResponse } from './protocol.ts';

const session = createParserSession();
const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  if (request.type === 'parse') {
    void session
      .parse(request.file, request.dateOrder, (progress) => {
        const message: WorkerResponse = { type: 'progress', progress };
        scope.postMessage(message);
      })
      .then((result) => {
        const message: WorkerResponse = { type: 'result', result };
        scope.postMessage(message);
      })
      .catch((error: unknown) => {
        // The pipeline is written not to throw, so this is a defect guard: report
        // an unknown error rather than leaving the UI waiting for a result.
        const detail = error instanceof Error ? error.message : String(error);
        const message: WorkerResponse = {
          type: 'result',
          result: { ok: false, error: { code: 'unknown', detail } },
        };
        scope.postMessage(message);
      });
    return;
  }

  void session
    .extract(request.entryName)
    .then((blob) => {
      const message: WorkerResponse = { type: 'media', id: request.id, blob };
      scope.postMessage(message);
    })
    .catch(() => {
      const message: WorkerResponse = { type: 'media', id: request.id, blob: null };
      scope.postMessage(message);
    });
});
