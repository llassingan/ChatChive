# src/ui/components

One screen per file, each with its own CSS next to it. The screens are
presentational: they take the parsed data and callbacks as props and own no
session state, which lives in `../import/useImportFlow.ts`.

| File                  | Screen                                                                                   | Requirement        |
| --------------------- | ---------------------------------------------------------------------------------------- | ------------------ |
| `Landing.tsx`         | Brand, drop zone, privacy note, export help entry                                        | E3-1, F-IMP-1, S-8 |
| `PrivacyNote.tsx`     | "Never uploaded" claim plus the "How we know" dialog                                     | E3-1, S-8          |
| `ExportHelp.tsx`      | Android and iPhone export steps                                                          | E3-1               |
| `ProgressView.tsx`    | Phase label, determinate or indeterminate bar, Cancel                                    | E3-2, F-IMP-3      |
| `ErrorView.tsx`       | One friendly message per `ParseErrorCode`                                                | E3-2, F-IMP-4      |
| `DateOrderPrompt.tsx` | Day-first vs month-first choice with sample dates                                        | E3-3               |
| `ReadyPanel.tsx`      | Real metadata from the parsed chat, plus a note that the message view is a later release | E3-2               |
| `Dialog.tsx`          | Native `<dialog>` shell for the help and privacy overlays                                | E3-1               |
| `controls.css`        | Button roles (primary, quiet, text, icon)                                                | E3-1               |

`Dialog` deliberately focuses the heading rather than the close button on open,
so a screen reader reads the title first; Escape and a backdrop click both close
it. `--accent` is spent on the landing screen's primary action only, which is why
the progress fill uses `--text-primary` and the quiet controls use a neutral
border.
