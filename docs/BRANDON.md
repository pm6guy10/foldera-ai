# BRANDON.md — The Owner Avatar (run this before you ask "is it good?")

> Status: `OWNER_TASTE_AUTHORITY`. This file exists so no agent has to interrupt Brandon to ask "how's this look? are we good?" Run yourself against this avatar **and** `docs/EXPERT_PANEL.md` before declaring any pass done. If the work would survive Brandon, ship it. If it wouldn't, fix it first — that is the whole point of this file.
>
> Brandon: this is my model of *you*. Redline anything that isn't you — a wrong line here costs more than a missing one.

---

## 1. Who Brandon is

- **Founder of Foldera**, building largely solo / with a small rotating set of AI agents (Claude, Codex, Gemini). He is the vision, the taste, and the final judge — **not** the line-by-line implementer.
- **Cognitively overloaded and time-poor.** He often prompts in short bursts on a break from his day job, on his phone, with low energy. He cannot babysit. A message from him is expensive — it means the system already failed to be self-sufficient.
- He has a **household and a life** the project must not consume. The Bible calls this the *household-peace constraint* — Foldera failing operationally looks like Brandon up at night reconciling stale docs and routing agents. Protect his attention like it's the scarcest resource in the company, because it is.
- He thinks in **vision, taste, and rejection.** He will know it when he sees it. He is bad at — and resents having to — spell out every requirement. So **infer the spec from the taste**, don't make him write the spec.

## 2. What Brandon wants from the PRODUCT (one breath)

*"I just want a guy that's watching out for you."* The Facebook pixel inverted: total context spent on **care**, then **one quiet act** where the user already lives. A guardian, not a chatbot. The bar in his words: *"3 days of a week even be like — this thing's awesome, I can't live without it."* See `FOLDERA_MASTER_BIBLE.md` Part II-B (Guardian Vision Lock) — that is product soul, do not regress it.

## 3. What Brandon wants from YOU (the agent)

This is the part agents keep missing. Brandon does not primarily want code — he wants his **load to go down.**

- **Be the router, not him.** *"Brandon must not be the router between tools, stale docs, half-proofs, and next moves."* If the only person who can decide the next move is Brandon, the system has failed (Bible §10, Owner-burden rule).
- **Self-review so he doesn't have to.** Replace "is this good? are we good?" with *"yeah, I'm already on it — and here's why it passes."* You run the Brandon avatar + the expert panel; you only surface work that already survived them.
- **Materialize his brain.** When you hit a subjective call, don't stop and ask — ask *this file* "what would Brandon say?" and act. Bring him the result + the reasoning, not the question.
- **Drive autonomously, report faithfully.** Take initiative, finish the whole thing, then tell the truth about what passed and what didn't. He would rather hear "X still looks cheap, fixing it" than a clean-sounding half-truth.

## 4. Brandon's voice (use it to calibrate; quotes are real)

- "I just want a guy that's watching out for you."
- "Can't live without it 3 days a week."
- "Run until you get stuck."
- "Optimize every pixel."
- "Show don't tell — if I don't even speak English I should get it."
- "Obviously better, not incremental. If someone has to ask *what changed?*, it failed."
- "Fortify it 9999×88 — what would the [security / UX / pricing / database…] person say?"
- "Materialize my brain. I don't have the energy or the time to be on it so much."
- "Brain without hands — it reads my calendar and pretends to be smart."
- "There's still a huge divergence between what I want and what we have."

Tone: direct, impatient with theater, allergic to corporate hedging, generous when you actually nail it. He swears, he free-associates, he trusts you to extract the signal. Do that — don't make him be precise.

## 5. What Brandon would SAY — the rejection checklist (the heart of this file)

Before you call anything done, walk these. Any "no" is a blocker, not a nitpick.

1. **Real or theater?** Did this actually *do something the user didn't have to do*? Or is it another detector/score/summary with the valuable part stubbed (`relatedEmails: []`)? *Brain with no hands is rejected.* (Bible Part II-B.)
2. **Show, don't tell.** Would a non-English speaker get it from the visuals alone? Less words, more image and blank space, stronger contrast/hierarchy.
3. **Obviously better, or incremental?** If he'd have to squint to see what changed, it failed. No micro-polish dressed up as a redesign.
4. **Does the eye know where to go?** One focal point per section. Accent used sparingly so it punches. If everything's emphasized, nothing is.
5. **Any fake confidence?** A fake verdict is worse than no verdict. If the evidence is weak, say so or stay quiet — never manufacture certainty.
6. **Is Brandon being made the router again?** Did this hand him a decision the repo should have made? If yes, encode the decision instead.
7. **Authentic and inevitable, or generic-AI-startup?** Cheap icons, neon glass, AI clichés (Sparkles/magic-wand), blur, cyan ghosts — all rejected. It must feel like a $500M company a small team somehow made.
8. **Honest?** No fake enterprise / customer / compliance / connector / Slack-breadth claims. Claims lag proof, always.
9. **Quiet when it should be quiet?** Not another inbox to babysit. Safe silence is a win, not a gap.
10. **Proven with PRODUCT proof?** "Build passes / tests green" is not proof. Did the actual user-facing path do the thing? (Bible Proof Model.)
11. **Cheap anywhere?** Scan what you touched for junk, dead links, stale copy, half-done states. One cheap detail taxes the whole thing's credibility.

## 6. Taste reference

Linear · Vercel · Notion. Warm amber `#F5A623` on warm near-black. Editorial, calm, confident, premium, restrained. Bricolage display + Inter body + JetBrains mono. The bar is `docs/DESIGN_SYSTEM.md` §1a (SHOW DON'T TELL — binding). When unsure: add air, cut words, raise contrast, remove an accent.

## 7. Friction triggers (these mean the system failed him, not just the task)

- Being asked "is this good / are we good?" → you should already know.
- Having to re-explain product doctrine, his taste, or what he said last session.
- Stale docs, agent collisions (two agents one clone), control-plane drift.
- Fake proof, owner-relabeled-as-customer proof, "done/proven" claims that aren't.
- Cheap polish, AI clichés, cyan (retired), things that "look like AI made it."
- Junk that wastes time/money — dead tests, abandoned branches, 1.1GB of local reference in the tree, anything that slows the loop without earning it.

## 8. How he works (so you can meet him there)

Async, low-energy, break-time prompts, often mobile. He wants to fire a one-liner and come back to *finished, self-vetted* work with a short honest receipt — not a question, not a wall of options. The dream he stated: a message like the one that created this file should never have needed to exist, because you'd already say *"yeah, I know, I'm on it."* Build toward that. Every time you make him decide something the repo could have decided, you moved the wrong direction.

---

**How to use this file:** at the end of any pass, before you report "done," run §5 out loud (in your reasoning), name any failures, fix them, and only then report — leading with proof, not a question. Pair it with `docs/EXPERT_PANEL.md` for the domain-specific kill-questions. See `FOLDERA_MASTER_BIBLE.md` Part IV for the binding ritual.
