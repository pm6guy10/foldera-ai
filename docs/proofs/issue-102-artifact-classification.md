# Issue #102 Artifact Classification (Root Scope)

Date: 2026-05-29 PT
Branch: codex/issue-102-artifact-hygiene

This classification was completed before any move/delete actions.

| Path | Class | Decision |
| --- | --- | --- |
| `ACTIVE_HANDOFF.md` | `KEEP_AUTHORITY` | Current control; keep unchanged. |
| `FOLDERA_BUILD_ORDER.yaml` | `KEEP_AUTHORITY` | Current control; keep unchanged. |
| `docs/SOURCE_OF_TRUTH_MAP.md` | `KEEP_AUTHORITY` | Classification authority; keep unchanged. |
| `action_check.json` | `DELETE_STALE` | Generated local artifact with no active references. |
| `brain_receipt_raw.json` | `DELETE_STALE` | Generated proof output, superseded by issue/writeback receipts. |
| `brain_receipt_v2.json` | `DELETE_STALE` | Generated proof output, no active gate dependency. |
| `brain_receipt_v3.json` | `DELETE_STALE` | Generated proof output, no active gate dependency. |
| `brain_receipt_v4.json` | `DELETE_STALE` | Generated proof output, no active gate dependency. |
| `brain_receipt_v5.json` | `DELETE_STALE` | Generated proof output, no active gate dependency. |
| `brain_receipt_v6.json` | `DELETE_STALE` | Generated proof output, no active gate dependency. |
| `brain_receipt_v7.json` | `DELETE_STALE` | Generated proof output, no active gate dependency. |
| `cookie_header.tmp` | `DELETE_STALE` | Local cookie scratch artifact; should not be tracked. |
| `cookie_string.txt` | `DELETE_STALE` | Local cookie scratch artifact; should not be tracked. |
| `run_brief_result2.json` | `DELETE_STALE` | Local generated output with no active contract role. |
| `tsconfig.tsbuildinfo` | `DELETE_STALE` | TypeScript incremental build cache; generated artifact. |
| `AUTOMATION_BACKLOG.md` | `NEEDS_HUMAN_REVIEW` | Large backlog artifact; not removed in this seam. |
| `FOLDERA_MASTER_AUDIT.md` | `KEEP_REFERENCE` | Reference-only historical audit; keep pending explicit archival seam. |
| `FOLDERA_PRODUCTION_BACKLOG.md` | `KEEP_REFERENCE` | Reference-only backlog context; keep pending explicit archival seam. |
| `FULL_AUDIT_RESULTS.md` | `NEEDS_HUMAN_REVIEW` | Large historical output; defer to explicit archive/delete decision. |
| `SESSION_HISTORY.md` | `KEEP_REFERENCE` | Append-only receipt history; keep unchanged. |
| `.screenshots/` | `NEEDS_HUMAN_REVIEW` | Out of root-file-only deletion set for this pass. |
| `tests/production/screenshots/` | `NEEDS_HUMAN_REVIEW` | Out of root-file-only deletion set for this pass. |

## Validation notes

- Root artifact candidates were scanned before deletion.
- No references were found to the deleted generated files in active code/docs paths.