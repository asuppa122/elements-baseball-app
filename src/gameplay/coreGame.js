import { getFieldingRating } from './defense';
const HITTER_RESULTS = ['PU', 'K', 'GB', 'FB', 'BB', '1B', '1B+', '2B', '3B', 'HR'];
const PITCHER_RESULTS = ['PU', 'K', 'GB', 'FB', 'BB', '1B', '2B', '3B', 'HR'];
const DEFAULT_HITTER = {
    PU: '1-3', K: '4-10', GB: '11-17', FB: '18-20', BB: null, '1B': null, '1B+': null, '2B': null, '3B': null, HR: null,
};
const DEFAULT_PITCHER = {
    PU: '1', K: '2', GB: '3-7', FB: '8-11', BB: '12-14', '1B': '15-17', '1B+': null, '2B': '18', '3B': '19', HR: '20',
};
function sideAtBat(state) { return state.half === 'top' ? 'away' : 'home'; }
function sideFielding(state) { return state.half === 'top' ? 'home' : 'away'; }
function other(side) { return side === 'home' ? 'away' : 'home'; }
function parseRangeToken(token) {
    const cleaned = token
        .trim()
        .replace(/[–—−]/g, '-')
        .replace(/\b(?:to|through|thru)\b/gi, '-');
    if (!cleaned || cleaned === '-' || cleaned.toLowerCase() === 'null')
        return [];
    // Prefer an anchored decimal-safe range/single parser so values such as "10.0"
    // are treated as one roll number rather than the accidental range 0-10.
    const exactRange = cleaned.match(/^\s*(-?\d+(?:\.0+)?)\s*-\s*(-?\d+(?:\.0+)?)\s*$/);
    if (exactRange) {
        const a = Number(exactRange[1]);
        const b = Number(exactRange[2]);
        if (Number.isFinite(a) && Number.isFinite(b))
            return [[Math.min(a, b), Math.max(a, b)]];
    }
    const exactSingle = cleaned.match(/^\s*(-?\d+(?:\.0+)?)\s*$/);
    if (exactSingle) {
        const n = Number(exactSingle[1]);
        if (Number.isFinite(n))
            return [[n, n]];
    }
    // Some imported sheets include harmless labels around a range (e.g. "SO 1-4").
    // Extract only true integer range/single tokens, never infer missing chart values.
    const matches = [...cleaned.matchAll(/(-?\d+)\s*-\s*(-?\d+)|(?<![\d.])-?\d+(?![\d.])/g)];
    const ranges = [];
    for (const match of matches) {
        if (match[1] !== undefined && match[2] !== undefined) {
            const a = Number(match[1]);
            const b = Number(match[2]);
            ranges.push([Math.min(a, b), Math.max(a, b)]);
        }
        else {
            const n = Number(match[0]);
            if (Number.isFinite(n))
                ranges.push([n, n]);
        }
    }
    return ranges;
}
function rangesFor(text) {
    if (text === null || text === undefined)
        return [];
    return String(text)
        .split(/[,/;|]+/)
        .flatMap(parseRangeToken)
        .filter(([a, b]) => Number.isInteger(a) && Number.isInteger(b));
}
function rangeContains(text, roll) {
    return rangesFor(text).some(([start, end]) => roll >= start && roll <= end);
}
function chartCoverage(chart, results, label) {
    const safeChart = chart ?? {};
    const owners = new Map();
    for (let roll = 1; roll <= 20; roll++) {
        owners.set(roll, results.filter((result) => rangeContains(safeChart[result], roll)));
    }
    const missingRolls = [...owners.entries()].filter(([, v]) => v.length === 0).map(([roll]) => roll);
    const overlaps = [...owners.entries()].filter(([, v]) => v.length > 1).map(([roll]) => roll);
    return missingRolls.length || overlaps.length ? { label, missingRolls, overlaps, chart: structuredClone(safeChart) } : null;
}
function formatChart(chart, results) {
    return results.map((result) => `${result}:${chart[result] ?? '—'}`).join(' | ');
}
function printedResult(chart, results, roll, label) {
    if (!chart)
        throw new Error(`${label} frozen chart is missing entirely. Create a fresh test game from the current build.`);
    for (const result of results)
        if (rangeContains(chart[result], roll))
            return result;
    throw new Error(`${label}: swing ${roll} is not covered. Frozen chart: ${formatChart(chart, results)}`);
}
export function getCoreChartCoverageIssues(state) {
    const issues = [];
    for (const side of ['away', 'home']) {
        const pregame = state.pregame[side];
        const roster = pregame.roster;
        if (!roster)
            continue;
        for (const cardKey of pregame.battingOrderCardKeys) {
            const card = roster.cards[cardKey];
            if (!card)
                continue;
            const useDefault = pregame.defaultBatterCardKeys.includes(cardKey) || card.hitter.onBase === null;
            const issue = chartCoverage(useDefault ? DEFAULT_HITTER : card.hitter.chart, HITTER_RESULTS, `${side} hitter ${card.playerName}`);
            if (issue)
                issues.push(issue);
        }
        const pitcherKey = pregame.defensiveAlignment.P ?? pregame.startingPitcherCardKey;
        const pitcher = pitcherKey ? roster.cards[pitcherKey] : null;
        if (pitcher) {
            const useDefaultPitcher = (pregame.defaultPitcherCardKeys?.includes(pitcher.cardKey) ?? false) || pitcher.pitcher.control === null;
            const issue = chartCoverage(useDefaultPitcher ? DEFAULT_PITCHER : pitcher.pitcher.chart, PITCHER_RESULTS, `${side} pitcher ${pitcher.playerName}`);
            if (issue)
                issues.push(issue);
        }
    }
    return issues;
}
function pitcherResultWithInfieldAdjustment(state, pitcher, roll) {
    const defenseSide = sideFielding(state);
    const useDefaultPitcher = (state.pregame[defenseSide].defaultPitcherCardKeys?.includes(pitcher.cardKey) ?? false) || pitcher.pitcher.control === null;
    const chart = useDefaultPitcher ? DEFAULT_PITCHER : pitcher.pitcher.chart;
    let raw = printedResult(chart, PITCHER_RESULTS, roll, `${pitcher.playerName} pitcher chart`);
    const defense = state.pregame[sideFielding(state)];
    const roster = defense.roster;
    if (!roster)
        return raw;
    const positions = ['1B', '2B', '3B', 'SS'];
    const total = positions.reduce((sum, pos) => {
        const key = defense.defensiveAlignment[pos];
        const card = key ? roster.cards[key] : null;
        return sum + (card ? (getFieldingRating(card, pos) ?? 0) : 0);
    }, 0);
    if (total >= 0)
        return raw;
    // Rulebook: for each point below zero, convert highest GB results to 1B,
    // then K, PU, FB if the penalty exceeds the GB range.
    const penalty = Math.abs(total);
    const convertible = [];
    for (const result of ['GB', 'K', 'PU', 'FB']) {
        const rolls = Array.from({ length: 20 }, (_, i) => i + 1).filter(r => rangeContains(chart[result], r)).sort((a, b) => b - a);
        convertible.push(...rolls);
    }
    if (convertible.slice(0, penalty).includes(roll))
        raw = '1B';
    return raw;
}
export function resolveSwingChart(state, roll) {
    if (!Number.isInteger(roll) || roll < 1 || roll > 20)
        throw new Error('Swing roll must be 1-20.');
    const offense = sideAtBat(state);
    const defense = sideFielding(state);
    const batterKey = state.plateAppearance.batterCardKey;
    const pitcherKey = state.plateAppearance.pitcherCardKey;
    const batter = batterKey ? state.pregame[offense].roster?.cards[batterKey] : null;
    const pitcher = pitcherKey ? state.pregame[defense].roster?.cards[pitcherKey] : null;
    if (!batter || !pitcher || !state.plateAppearance.advantage)
        throw new Error('Current matchup is incomplete.');
    if (state.plateAppearance.advantage === 'hitter') {
        const useDefault = state.pregame[offense].defaultBatterCardKeys.includes(batter.cardKey) || batter.hitter.onBase === null;
        return printedResult(useDefault ? DEFAULT_HITTER : batter.hitter.chart, HITTER_RESULTS, roll, `${batter.playerName}${useDefault ? ' default hitter' : ' hitter chart'}`);
    }
    return pitcherResultWithInfieldAdjustment(state, pitcher, roll);
}
function runner(card, useDefault = false) {
    return {
        cardKey: card.cardKey,
        playerName: card.playerName,
        baserunning: useDefault ? 10 : (card.hitter.baserunning ?? 10),
        stolenBase: useDefault ? 10 : (card.hitter.stolenBase ?? 10),
    };
}
function decision(state, type, actingSide, legalActions, context) {
    const pending = {
        id: crypto.randomUUID(),
        ruleCondition: 'RC5_CONDITIONAL_GAME_STATE',
        decisionType: type,
        actingSide,
        legalActions,
        context,
        createdAt: new Date().toISOString(),
    };
    return {
        ...state,
        status: 'awaiting_decision',
        waitingFor: 'CONDITIONAL_DECISION',
        nextActor: actingSide,
        pendingDecision: pending,
    };
}
function scoreRunner(state, side, count = 1) {
    return { ...state, score: { ...state.score, [side]: state.score[side] + count } };
}
function clearPlateAppearance(state) {
    return { ...state, plateAppearance: { batterCardKey: null, pitcherCardKey: null, pitchRoll: null, pitchTotal: null, advantage: null, swingRoll: null, chartResult: null } };
}
function nextHalf(state) {
    const wasTop = state.half === 'top';
    const nextHalfValue = wasTop ? 'bottom' : 'top';
    const nextInning = wasTop ? state.inning : state.inning + 1;
    const offense = nextHalfValue === 'top' ? 'away' : 'home';
    const defense = other(offense);
    const lineup = state.pregame[offense].battingOrderCardKeys;
    const pitcher = state.pregame[defense].defensiveAlignment.P ?? state.pregame[defense].startingPitcherCardKey;
    return {
        ...clearPlateAppearance(state),
        inning: nextInning,
        half: nextHalfValue,
        outs: 0,
        bases: { first: null, second: null, third: null },
        status: 'in_progress',
        waitingFor: 'PITCH_ROLL',
        nextActor: defense,
        pendingDecision: null,
        plateAppearance: {
            batterCardKey: lineup[state.lineupCursor[offense] % 9] ?? null,
            pitcherCardKey: pitcher ?? null,
            pitchRoll: null, pitchTotal: null, advantage: null, swingRoll: null, chartResult: null,
        },
    };
}
function completeGame(state) {
    return {
        ...state,
        status: 'complete',
        waitingFor: 'GAME_COMPLETE',
        nextActor: null,
        pendingDecision: null,
    };
}
function walkoffReached(state) {
    return state.inning >= 9 && state.half === 'bottom' && state.score.home > state.score.away;
}
export function finishPlateAppearance(state) {
    const offense = sideAtBat(state);
    const defense = sideFielding(state);
    const nextCursor = (state.lineupCursor[offense] + 1) % 9;
    const cursors = { ...state.lineupCursor, [offense]: nextCursor };
    let next = { ...state, lineupCursor: cursors };
    // Bottom 9+ ends immediately when the home team takes the lead.
    if (walkoffReached(next))
        return completeGame(next);
    if (next.outs >= 3) {
        // After the top of inning 9+, a home lead ends the game without a bottom half.
        if (next.inning >= 9 && next.half === 'top' && next.score.home > next.score.away)
            return completeGame(next);
        // After the bottom of inning 9+, any non-tie is final; a tie advances to extras.
        if (next.inning >= 9 && next.half === 'bottom' && next.score.home !== next.score.away)
            return completeGame(next);
        return nextHalf(next);
    }
    const lineup = next.pregame[offense].battingOrderCardKeys;
    const pitcher = next.pregame[defense].defensiveAlignment.P ?? next.pregame[defense].startingPitcherCardKey;
    return {
        ...next,
        status: 'in_progress',
        waitingFor: 'PITCH_ROLL',
        nextActor: defense,
        pendingDecision: null,
        plateAppearance: {
            batterCardKey: lineup[nextCursor] ?? null,
            pitcherCardKey: pitcher ?? null,
            pitchRoll: null, pitchTotal: null, advantage: null, swingRoll: null, chartResult: null,
        },
    };
}
function automaticHit(state, result, batter) {
    const offense = sideAtBat(state);
    // Defensive safety for substitution/lineup edge cases: a single card can never
    // occupy a base and be placed again as the batter-runner. Destination wins.
    const b = structuredClone(state.bases);
    if (b.first?.cardKey === batter.cardKey)
        b.first = null;
    if (b.second?.cardKey === batter.cardKey)
        b.second = null;
    if (b.third?.cardKey === batter.cardKey)
        b.third = null;
    let next = { ...state, bases: b };
    if (result === 'BB' || result === '1B' || result === '1B+') {
        if (b.third)
            next = scoreRunner(next, offense);
        next = { ...next, bases: { first: batter, second: b.first, third: b.second } };
    }
    else if (result === '2B') {
        let runs = 0;
        if (b.second)
            runs++;
        if (b.third)
            runs++;
        if (runs)
            next = scoreRunner(next, offense, runs);
        next = { ...next, bases: { first: null, second: batter, third: b.first } };
    }
    else if (result === '3B') {
        const runs = [b.first, b.second, b.third].filter(Boolean).length;
        if (runs)
            next = scoreRunner(next, offense, runs);
        next = { ...next, bases: { first: null, second: null, third: batter } };
    }
    else {
        const runs = 1 + [b.first, b.second, b.third].filter(Boolean).length;
        next = scoreRunner(next, offense, runs);
        next = { ...next, bases: { first: null, second: null, third: null } };
    }
    return next;
}
export function resolveCoreResult(state, result) {
    const offense = sideAtBat(state);
    const defense = sideFielding(state);
    const batterKey = state.plateAppearance.batterCardKey;
    const batterCard = batterKey ? state.pregame[offense].roster?.cards[batterKey] : null;
    if (!batterCard)
        throw new Error('Batter is missing from frozen roster.');
    const useDefault = state.pregame[offense].defaultBatterCardKeys.includes(batterCard.cardKey) || batterCard.hitter.onBase === null;
    const batterRunner = runner(batterCard, useDefault);
    const preBases = structuredClone(state.bases);
    let next = { ...state, plateAppearance: { ...state.plateAppearance, chartResult: result } };
    // Rulebook infield-in: PU/FB become 1B and runners cannot attempt extra bases/tag ups.
    if (state.plateAppearance.infieldIn && (result === 'PU' || result === 'FB')) {
        next = automaticHit(next, '1B', batterRunner);
        return finishPlateAppearance(next);
    }
    if (result === 'K' || result === 'PU') {
        next = { ...next, outs: Math.min(3, next.outs + 1) };
        return finishPlateAppearance(next);
    }
    if (result === 'FB') {
        next = { ...next, outs: Math.min(3, next.outs + 1) };
        if (next.outs < 3 && (preBases.first || preBases.second || preBases.third)) {
            return decision(next, 'TAG_UP_DECISION', offense, ['HOLD_RUNNERS', 'ATTEMPT_TAG_UP'], { result, preBases });
        }
        return finishPlateAppearance(next);
    }
    if (result === 'GB') {
        if (state.outs === 2 || (!preBases.first && !preBases.second && !preBases.third)) {
            next = { ...next, outs: Math.min(3, next.outs + 1) };
            return finishPlateAppearance(next);
        }
        if (state.plateAppearance.infieldIn && preBases.first && preBases.second && preBases.third) {
            // Bases loaded + INF IN: lead runner home is automatically out; all other forced runners advance and batter is safe.
            next = { ...next, outs: Math.min(3, next.outs + 1), bases: { first: batterRunner, second: preBases.first, third: preBases.second } };
            return finishPlateAppearance(next);
        }
        if (!state.plateAppearance.infieldIn && !preBases.first && preBases.third && !preBases.second) {
            // Runner on 3B, 1B empty, <2 outs: runner scores automatically and batter is out.
            next = { ...scoreRunner(next, offense), outs: Math.min(3, next.outs + 1), bases: { first: null, second: null, third: null } };
            return finishPlateAppearance(next);
        }
        if (!state.plateAppearance.infieldIn && !preBases.first && preBases.second) {
            return decision(next, 'GB_RUNNER_2B_RFO', defense, ['ROLL_RFO'], { result, outs: state.outs, preBases, infieldIn: false });
        }
        return decision(next, 'GROUND_BALL_RESOLUTION', state.plateAppearance.infieldIn ? offense : defense, ['RESOLVE_ELEMENTS_GB'], { result, outs: state.outs, preBases, infieldIn: state.plateAppearance.infieldIn === true });
    }
    next = automaticHit(next, result, batterRunner);
    if ((result === '1B' || result === '2B') && (preBases.first || preBases.second)) {
        return decision(next, 'EXTRA_BASE_DECISION', offense, ['DECLINE_EXTRA_BASES', 'ATTEMPT_EXTRA_BASES'], { result, preBases, automaticBases: next.bases });
    }
    if (result === '1B+') {
        if (next.bases.second)
            return finishPlateAppearance(next);
        return decision(next, 'ONE_BASE_PLUS_STOLEN_BASE', defense, ['ROLL_CATCHER_FIELDING'], { result, preBases, automaticBases: next.bases, target: next.bases.first });
    }
    return finishPlateAppearance(next);
}
export function declineSimpleCoreDecision(state) {
    const d = state.pendingDecision;
    if (!d)
        throw new Error('No decision is pending.');
    if (d.decisionType === 'EXTRA_BASE_DECISION' && d.legalActions.includes('DECLINE_EXTRA_BASES')) {
        return finishPlateAppearance({ ...state, status: 'in_progress', pendingDecision: null });
    }
    if (d.decisionType === 'TAG_UP_DECISION' && d.legalActions.includes('HOLD_RUNNERS')) {
        return finishPlateAppearance({ ...state, status: 'in_progress', pendingDecision: null });
    }
    throw new Error('This Elements decision is intentionally deferred to Build 2.');
}
// Explicit developer-test policy. Never call this from production manager gameplay.
// It declines optional extra bases/tag-ups and uses a conservative one-out GB shortcut
// only so long-running state/inning stress tests can exercise the core loop.
export function resolveForDevelopmentHarness(state) {
    if (!state.pendingDecision)
        return state;
    if (state.pendingDecision.decisionType === 'EXTRA_BASE_DECISION' || state.pendingDecision.decisionType === 'TAG_UP_DECISION') {
        return declineSimpleCoreDecision(state);
    }
    if (state.pendingDecision.decisionType === 'ONE_BASE_PLUS_STOLEN_BASE') {
        return finishPlateAppearance({ ...state, status: 'in_progress', pendingDecision: null });
    }
    if (state.pendingDecision.decisionType === 'GROUND_BALL_RESOLUTION') {
        const next = { ...state, status: 'in_progress', pendingDecision: null, outs: Math.min(3, state.outs + 1) };
        return finishPlateAppearance(next);
    }
    throw new Error(`Harness has no explicit policy for ${state.pendingDecision.decisionType}.`);
}
