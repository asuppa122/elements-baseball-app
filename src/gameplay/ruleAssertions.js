export function extraBaseEffectiveBaserunning(baseBsr, from, to, outs) {
    let effective = baseBsr;
    // Rulebook hit-advancement bonus: every qualifying extra-base attempt except 1B→3B.
    if (!(from === '1B' && to === '3B'))
        effective += 3;
    // Separate two-out hit-advancement bonus. This NEVER applies to tag ups.
    if (outs === 2)
        effective += 3;
    return effective;
}
export function tagUpEffectiveBaserunning(baseBsr) { return baseBsr; }
export function tagUpOutfieldBonus(from, to) { return from === '1B' && to === '2B' ? 10 : 0; }
export function tagUpRtsThreshold(attempts) {
    if (attempts.some(a => a.to === 'HOME'))
        return 11;
    return 16;
}
/** Fielding checks resolve natural 1/20 before the ordinary total-vs-target comparison. */
export function fieldingCheckIsOut(roll, defenseTotal, target) {
    if (roll === 1)
        return false;
    if (roll === 20)
        return true;
    return defenseTotal > target;
}
export function catcherStealCheckIsOut(roll, catcherFielding, sb, stealingHome = false) {
    const total = roll + catcherFielding + (stealingHome ? 15 : 0);
    return fieldingCheckIsOut(roll, total, sb);
}
export function extraBaseRtsPasses(roll) { return roll >= 11; }
export function tagUpRtsPasses(roll, attempts) { return roll >= tagUpRtsThreshold(attempts); }
