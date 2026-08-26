// Extracted from RosterPage.tsx (health-audit findings 8.1/8.2: the point
// totals were computed inconsistently between pages, and going over the
// cap used to clamp to "0 remaining" instead of showing the real overage).
// Pure display of a roster's point usage against the active season's cap --
// same markup/classNames as before, just given its own testable component.
type RosterPointsStatusProps = {
  totalPoints: number
  pointCap: number
}

function RosterPointsStatus({
  totalPoints,
  pointCap,
}: RosterPointsStatusProps) {
  const over = totalPoints > pointCap

  return (
    <div className="roster-points-status">
      <strong>
        {totalPoints.toLocaleString()} / {pointCap.toLocaleString()}
      </strong>
      {over ? (
        <span className="roster-points-over">
          {(totalPoints - pointCap).toLocaleString()} over cap
        </span>
      ) : (
        <span>{(pointCap - totalPoints).toLocaleString()} remaining</span>
      )}
    </div>
  )
}

export default RosterPointsStatus
