# Post-Hackathon Roadmap

## First 72 hours

- Preserve the winning demo deployment.
- Write a public technical walkthrough and short demo video.
- Contact 15-20 engineers who own Stripe, Shopify, Slack, Twilio, or GitHub integrations.
- Ask for the last API migration that consumed meaningful engineering time.
- Recruit three design partners around one ecosystem.
- Instrument migration completion, false positives, manual edits, and time saved.

## First 30 days

### Product

- Real GitHub App installation flow.
- Repository selection and monitoring.
- One real provider ecosystem.
- Robust spec/changelog ingestion.
- Deterministic recipe registry.
- Better TypeScript structural analysis.
- Policy controls and audit log.
- Private execution model for customer code.

### Validation goals

- Ten real migration histories collected.
- Three design partners connect repos.
- At least one migration PR is merged.
- Customer reports measurable time saved.
- False-positive rate is understood, not hand-waved.

## Days 31-90

- Add provider-specific migration packs.
- Handle multi-step changes, not only field renames.
- Add a review queue across repositories.
- Add model-assisted residue behind confidence thresholds.
- Add self-hosted or customer-controlled execution path.
- Pilot provider console with one API company.

## Metrics

### Product quality

- impact precision,
- impact recall on known migrations,
- patch acceptance rate,
- CI pass rate,
- median manual edits after Bridge,
- time from provider change to draft PR,
- time from PR to merge.

### Business

- installed organizations,
- monitored integrations,
- migration events per org,
- active design partners,
- willingness to pay,
- expansion from customer-side to provider-side.

## Strategic sequencing

1. Win one provider-language pair.
2. Prove safe, merged migrations.
3. Build repeatable recipe and evidence data.
4. Expand to adjacent providers or languages.
5. Sell ecosystem visibility and coordination to providers.

Do not expand simply because a demo works. Expand when accuracy and adoption justify it.
