# Milestone Reward / Prize Pack Groundwork

Status: **scaffolded, intentionally inaccessible**.

## Intended lifecycle

Milestone achieved → reward becomes available → manager claims → server reserves a unique claim → Prize Pack contents are generated and persisted once → reveal animation reads those persisted results → items are granted once → claim becomes `granted`.

## Why the groundwork is locked

The current Season 10.1 milestone progress is workbook-backed in the frontend. That is sufficient for display, but not sufficient for a secure claim endpoint. Before claims are enabled, milestone eligibility must be available to a trusted server-side function or synced authoritative table so a client cannot submit an arbitrary completed milestone.

## Double-claim / reroll protection

`milestone_reward_claims.idempotency_key` and the milestone identity unique constraint allow only one claim record for a manager + season + category + phase + milestone. Prize Pack results belong in `milestone_reward_items` before the reveal is shown, so refresh/back/reopen displays the same reward rather than generating a new one.

## Not implemented yet

- no clickable Claim Reward control
- no public/authenticated write policy
- no claim RPC or Edge Function
- no random-card selection algorithm
- no foil/team/player-choice selection workflow
- no collection mutation
- no Prize Pack route/modal/animation

## Next approval decisions

1. Where authoritative milestone completion lives server-side.
2. Exact reward parser/definitions for random, foil, team-choice and player-choice rewards.
3. Whether Prize Pack is a modal or dedicated route.
4. How card ownership/grants should be normalized instead of directly mutating the legacy ownership text field.
5. Commissioner/admin correction/reversal workflow.
