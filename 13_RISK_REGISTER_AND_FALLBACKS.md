# Risk Register and Fallbacks

## Risk hierarchy

### 1. GitHub Actions latency

**Probability:** high.  
**Impact:** high.  
**Mitigation:** keep test suite tiny, trigger validation early, maintain a completed backup run from the same deployed flow, and never wait silently.

### 2. GitHub authentication/permissions failure

**Probability:** medium.  
**Impact:** critical.  
**Mitigation:** verify installation access immediately, create a backend permission diagnostic, and keep a narrow server-side fallback credential only if event/security rules allow it.

### 3. Patch changes wrong text

**Probability:** medium.  
**Impact:** critical.  
**Mitigation:** AST transform or exact guarded matches, false-positive fixtures, diff assertion, and no auto-merge.

### 4. Realtime instability

**Probability:** medium.  
**Impact:** medium.  
**Mitigation:** persist all important collaboration data; presence is an enhancement. Refetch on reconnect.

### 5. Deployment outage or broken latest build

**Probability:** medium.  
**Impact:** critical.  
**Mitigation:** pin the last known-good deployment after integration freeze and stop speculative commits.

### 6. Overbuilding

**Probability:** very high.  
**Impact:** critical.  
**Mitigation:** P0 board, 25-minute task rule, explicit cut order, and no generalized provider/language support.

### 7. Demo confusion

**Probability:** medium.  
**Impact:** high.  
**Mitigation:** one story, one provider, one repo, one change, one presenter, no architecture monologue.

## Fallback levels

### Level A - Fully live

- Live change analysis.
- Live scan.
- Live patch and PR.
- Live or already-completed real CI.
- Live presence and approval.

### Level B - Real external output, cached orchestration

- Use a persisted completed run created by the deployed product.
- Open the real PR and real CI evidence.
- Demonstrate live comments/presence.

### Level C - Patch preview plus verified prior PR

- Show live analysis and impact.
- Show generated patch preview.
- Open a previous real PR/check from the same fixture.
- State exactly which write failed.

### Level D - Screen recording

Only when the production path is unavailable. Play a concise recording of the same deployed product and then answer questions using the live codebase. This is the weakest option and must not be presented as live.

## Kill switches

- Disable optional AI explanation if it slows or destabilizes the run.
- Disable comments before disabling presence.
- Disable custom check-run creation and rely on GitHub Actions status if permissions become complex.
- Use a preconfigured repository instead of live installation onboarding.
- Use one combined room page instead of separate provider/customer dashboards.

## Honest demo language

Never say “Bridge completed this live” when showing a prior run. Say “This is the completed run from the same deployed workflow.” Credibility is more valuable than pretending a network queue behaved perfectly.
