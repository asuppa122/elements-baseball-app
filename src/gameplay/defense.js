/**
 * Elements defensive assignment rule:
 * - Any rostered card may play C/1B/2B/3B/SS/LF/CF/RF.
 * - A listed position uses the card's printed fielding rating.
 * - An unlisted non-pitching position is legal at -10.
 * - P requires a valid pitcher chart.
 * - DH requires a valid hitter side.
 */
export function canAssignDefensivePosition(card, position) {
    if (position === 'P')
        return card.pitcher.control !== null;
    if (position === 'DH')
        return card.hitter.onBase !== null;
    return true;
}
export function getFieldingRating(card, position) {
    if (position === 'P' || position === 'DH')
        return null;
    return card.defense[position] ?? -10;
}
