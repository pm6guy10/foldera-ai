# Foldera Operating Doctrine

Foldera is making real progress through small seams. Do not lose the current direction.

Brandon's current reality: progress is real but painfully slow because he does not yet know how to operate the product build correctly end-to-end. The assistant/Codex/Cursor role must act like a high-level owner/operator: keep the system on the right seam, prevent drift, and require proof before claiming success.

The path to elite production is:

1. Source truth
   Connector freshness and reauth status must be visible before generation.

2. Cost truth
   cost_events and /api/dev/cost-summary must prove cost per run.

3. Run truth
   Controller and health must explain whether Foldera can run today.

4. Artifact truth
   One finished artifact must be grounded, useful, and strict PASS.

5. Payment truth
   Stripe comes after artifact value proof.

6. Scale/security truth
   Security, Sentry, and enterprise hardening come after the loop is trustworthy.

Current priority:
Connector freshness proof and reauth surfacing. Foldera must classify sources as fresh, stale, disconnected, reauth_required, or never_synced. The product should warn or stop generation when required sources are stale.

Current stop condition:
Foldera can say in health/product output: "Google stale, Microsoft fresh; generation blocked/warned until Google refreshes or reconnects."

Owner principle:
Keep the build on the right seam. Prevent drift. Require proof. Do not claim success until the production proof chain is closed.
