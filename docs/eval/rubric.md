# Directive quality rubric (baseline → after)

Use this to score rows like those in [baseline-sample.md](./baseline-sample.md) **before** and **after** prompt or pipeline changes. For each dimension, assign **0**, **1**, or **2**.

| Dim | 0 | 1 | 2 |
|-----|---|---|---|
| **A. Non-obvious** | Obvious reminder or generic task anyone could infer from subject | Some connection to user context but shallow | Clear cross-thread or cross-goal insight the user likely had not synthesized |
| **B. Grounding** | Invents facts, wrong dates, or bracket placeholders | Mostly grounded; minor soft claims | Names, dates, amounts trace to stated evidence; honest when data missing |
| **C. Finished work** | Outline, checklist, or “you should…” | Partially send-ready; user still has real drafting | Approve-and-send (or approve-and-file) with minimal edits |
| **D. Tone / product fit** | Hedging, guilt, system-speak, banned openers | Direct but stiff or template-shaped | Direct, specific, human; matches Foldera voice rules |
| **E. Fit to situation** | Wrong action type or ignores blocks/constraints | Acceptable type; misses nuance | Right artifact type and respects locks, duplicates, conversation state |

## Scoring notes

- Score **`do_nothing` / skipped** rows on **A–E** only if there is user-visible text worth judging (e.g. `directive_text` as explanation); otherwise mark **N/A** and note reason.
- **Target:** After changes, distribution shifts **up** on C and A for `pending_approval` / executable types without rising **false sends** (grounding regressions).

## Blank template (copy per row)

```
row id:
A:
B:
C:
D:
E:
notes:
```
