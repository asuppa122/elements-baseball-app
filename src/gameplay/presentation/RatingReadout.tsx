import type { FatigueCause, RatingAdjustment } from './inGameFatigueDisplay'

/**
 * Renders one fatigue-aware rating in the playable shell (Phase 1,
 * GAMEPLAY_PRESENTATION_PLAN.md). Reuses the `printed -> effective` convention
 * GameplayPregamePage.tsx already established rather than inventing a second
 * one, and renders exactly as the shell did before whenever there is no
 * adjustment to report.
 */

// Tag text sits inline beside the row's other stats, so these have to stay
// unambiguous in that company: DISTANCE is "PAST IP" rather than "IP" because
// the pitcher cell already prints "IP 7.33" immediately after it, and the two
// read as one string otherwise (caught rendering a real game, not in review).
const CAUSE_LABEL: Record<FatigueCause, string> = {
  REST: 'REST',
  PERFORMANCE: 'RUNS',
  DISTANCE: 'PAST IP',
}

const CAUSE_DESCRIPTION: Record<FatigueCause, string> = {
  REST: 'rest debt',
  PERFORMANCE: 'earned runs allowed',
  DISTANCE: 'work past card IP',
}

function describe(label: string, adjustment: RatingAdjustment): string {
  if (adjustment.kind === 'DEFAULT_ATTRIBUTES') {
    return adjustment.printed === null
      ? `${label} ${adjustment.effective}, default attributes (card has no printed rating)`
      : `${label} ${adjustment.printed}, reduced to ${adjustment.effective} by entering on default attributes`
  }
  const causes = adjustment.causes.map((cause) => CAUSE_DESCRIPTION[cause]).join(', ')
  if (adjustment.printed === adjustment.effective) {
    return causes
      ? `${label} ${adjustment.effective}, already at the rating floor despite ${causes}`
      : `${label} ${adjustment.effective}`
  }
  return `${label} ${adjustment.printed}, reduced to ${adjustment.effective}${causes ? ` by ${causes}` : ''}`
}

export default function RatingReadout({
  label,
  effective,
  adjustment,
}: {
  label: string
  effective: number
  adjustment: RatingAdjustment | null
}) {
  // Nothing to report -- a rested player on card attributes reads exactly as
  // it did before this piece existed.
  if (!adjustment) {
    return <span className="gp-rating">{label} {effective}</span>
  }

  const isDefault = adjustment.kind === 'DEFAULT_ATTRIBUTES'
  // At the rating floor the penalty is real but produces no visible movement,
  // so drawing "5 -> 5" would be noise. Show the value and the cause instead.
  const showArrow = adjustment.printed !== null && adjustment.printed !== adjustment.effective
  const tags = isDefault ? ['DEFAULT'] : adjustment.causes.map((cause) => CAUSE_LABEL[cause])

  return (
    <span
      className={`gp-rating ${isDefault ? 'is-default' : 'is-fatigue'}`}
      aria-label={describe(label, adjustment)}
    >
      <span aria-hidden="true">
        {label}{' '}
        {showArrow && <><span className="gp-rating-printed">{adjustment.printed}</span><span className="gp-rating-arrow">→</span></>}
        <b className="gp-rating-effective">{effective}</b>
      </span>
      {tags.length > 0 && (
        <span className="gp-rating-tags" aria-hidden="true">
          {tags.map((tag) => <span key={tag} className="gp-rating-tag">{tag}</span>)}
        </span>
      )}
    </span>
  )
}
