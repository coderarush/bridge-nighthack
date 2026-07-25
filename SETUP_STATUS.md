# Setup Status - archival snapshot

> **Do not use this file as the current operating runbook.** It originally
> described the pre-deployment handoff and is retained only for chronology.
> Use `SUBMISSION.md`, `09_DEMO_SCRIPT_AND_RUNBOOK.md`, and
> `12_DEPLOYMENT_SECURITY_AND_ENV.md` as the current sources of truth.

## Preserved `3407bf9` state

- Product: `https://bridge-nighthack.vercel.app`
- Marketing: `https://usebridge.vercel.app`
- Verified run: `f1386415-3de2-41ad-b499-36261d2eec91`
- Verified draft PR: `https://github.com/coderarush/atlas-store-demo/pull/1`
- Bridge source: `https://github.com/coderarush/bridge-nighthack`

This snapshot records the verified July 24, 2026 demo state. The later
application release is `21fa19c` at `https://bridge-nighthack.vercel.app`.
Do not attribute the preserved run to that later release.

The NightHack demo uses a server-side, repository-scoped GitHub credential for
one controlled fixture repository. That is a demo boundary, not the intended
team installation model. A public GitHub App, `bridge-api-control-plane`, is
registered and its server variables are encrypted in Vercel Production. Later
source contains workspace and installation/callback paths using transient
installation tokens. Migrations `0006` through `0010` are applied, the routes
are deployed, and the human workspace plus pre-install handshake passed.
External GitHub consent/callback E2E, lifecycle reconciliation, and worker
wiring are not claimed complete. Bridge itself remains a normal web application.

Supabase email auth is enabled and the canonical `/team` return path is
allowlisted. Anonymous auth remains enabled because the preserved capability
demo requires it. Workspace and GitHub routes rejected anonymous users in the
final live probes; that fail-closed boundary must remain true.

No judge needs a GitHub token, Supabase key, Vercel account, or source checkout.
The operator supplies the separate customer and provider room capabilities
through the submission platform's private testing-instructions field or a direct
organizer channel. The outstanding submission steps are the verified unlisted
demo video URL and that private two-link handoff. External GitHub callback and
worker verification remain product follow-up, not claims attached to the
preserved demo.
