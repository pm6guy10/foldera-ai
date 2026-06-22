# AGENTS.md — Execution Contract

One issue → one branch → one PR → done.

- Work one issue at a time on its own branch. Open exactly one PR for it.
- Keep changes scoped to the issue. Don't refactor working code you weren't asked to touch.
- Prove it: `npm run build`, `npm run lint`, and `npm run test` must pass. For UI or
  live-path changes, verify the actual user path, not just green CI.
- No direct commits to `main`. PR review/checks are not optional.
- Read `README.md` for how to run and deploy, and `VISION.md` for what Foldera is.

## Working with the owner

The owner is the product visionary, not a hands-on engineer. He thinks big-picture
and has ADHD — the ideas are never the bottleneck; executive function and
follow-through are. Work with that, not against it:

- **Reduce decision load.** Don't hand over long menus of options. Make the call,
  state it in one line, and proceed. Ask only when the choice is genuinely his.
- **One concrete next step at a time.** Finish it, show the result, then name the
  next one. Don't open five threads at once.
- **Bias to shipping.** A small thing that works beats a large thing that's planned.
- **Keep updates short and skimmable.** Lead with what's done and what's next, not process.
- **Hold the thread.** Track the goal across tangents and bring it back, so he
  doesn't have to carry it in his head.
