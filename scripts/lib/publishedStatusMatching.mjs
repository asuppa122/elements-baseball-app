// Pure matching logic for the card-published-status import
// (CARD_PUBLISHED_STATUS_PLAN.md, Option 2). Deliberately separate from the
// actual Google Sheets API call (scripts/import-published-status.mjs) so
// this half -- the part that decides which sheet row maps to which
// card_key -- is fully testable without a live credential or network access.
//
// Implements the plan's defensive matching requirement verbatim: normalize
// whitespace/case when comparing a manager-tab Player value against
// card_key, and never silently drop a row that fails to resolve -- the
// caller (resolvePublishedRows) always returns the unresolved rows
// separately so they can be logged loudly and reported, not dropped.

/**
 * Collapse internal whitespace, trim, and lowercase -- the exact
 * normalization CARD_PUBLISHED_STATUS_PLAN.md requires before comparing a
 * sheet-derived string against a stored card_key.
 */
export function normalizeForMatch(text) {
  return String(text ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/**
 * Build a normalized-card_key -> real-card_key lookup, the same shape
 * proven this week for the fatigue-import card_key validation. Real
 * card_keys are already known to be plain ASCII with straight apostrophes
 * (confirmed against public.cards), so normalization here only needs to
 * handle whitespace/case, not accents/quote-style translation.
 */
export function buildCardKeyLookup(cardKeys) {
  const lookup = new Map()
  for (const cardKey of cardKeys) {
    lookup.set(normalizeForMatch(cardKey), cardKey)
  }
  return lookup
}

/**
 * Reconstructs the same "{Player} {Year} {Team}" card_key shape used for
 * this week's real fatigue-state seed, then resolves it against the
 * lookup. Returns null (never throws) when there's no match -- the caller
 * decides how to report that, this function only ever answers "match or
 * not."
 */
export function resolveCardKey(playerText, year, teamCode, cardKeyLookup) {
  const candidate = `${playerText} ${year} ${teamCode}`
  return cardKeyLookup.get(normalizeForMatch(candidate)) ?? null
}

/**
 * Resolves a full batch of sheet rows against the real card_key set.
 * `rows` is [{ player, year, team, published, sourceTab }, ...] --
 * `sourceTab` is carried through purely for readable unresolved-row
 * reporting (e.g. "Anthony" tab, row N), it plays no role in matching.
 *
 * Never silently drops a row: every input row ends up in exactly one of
 * `resolved` or `unresolved`. `resolved` rows are ready to upsert into
 * cards.is_published; `unresolved` rows are the caller's signal to log
 * loudly and include in the run's summary output, per
 * CARD_PUBLISHED_STATUS_PLAN.md.
 */
export function resolvePublishedRows(rows, cardKeyLookup) {
  const resolved = []
  const unresolved = []

  for (const row of rows) {
    const cardKey = resolveCardKey(row.player, row.year, row.team, cardKeyLookup)

    if (cardKey) {
      resolved.push({
        cardKey,
        isPublished: normalizeForMatch(row.published) === 'yes',
      })
    } else {
      unresolved.push(row)
    }
  }

  return { resolved, unresolved }
}
