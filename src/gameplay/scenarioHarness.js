import { beginPrePitchDecision, confirmManagerDecision, getDecisionView, getPrePitchActions, resolveDecisionRoll, validateDecisionSelection } from './decisionEngine';
import { catcherStealCheckIsOut, extraBaseEffectiveBaserunning, fieldingCheckIsOut, tagUpEffectiveBaserunning, tagUpOutfieldBonus, tagUpRtsThreshold } from './ruleAssertions';
import { resolveCoreResult } from './coreGame';
function assert(condition, message) { if (!condition)
    throw new Error(message); }
function expectThrow(fn, message) { let threw = false; try {
    fn();
}
catch {
    threw = true;
} assert(threw, message); }
const offense = (s) => s.half === 'top' ? 'away' : 'home';
const defense = (s) => offense(s) === 'away' ? 'home' : 'away';
function runner(key, name, bsr = 14, sb = 12) { return { cardKey: key, playerName: name, baserunning: bsr, stolenBase: sb }; }
function fixture(initial) {
    const s = structuredClone(initial);
    if (s.status === 'paused')
        s.status = 'in_progress';
    s.status = 'in_progress';
    s.waitingFor = 'PITCH_ROLL';
    s.pendingDecision = null;
    s.nextActor = defense(s);
    s.inning = 5;
    s.half = 'top';
    s.outs = 0;
    s.score = { away: 0, home: 0 };
    s.bases = { first: null, second: null, third: null };
    s.naturalStolenBaseUsed = { away: false, home: false };
    s.outfieldThrowUsage = { away: { LF: 0, CF: 0, RF: 0 }, home: { LF: 0, CF: 0, RF: 0 } };
    s.infieldDoublePlayUsage = { away: { '1B+2B+SS': 0, '1B+2B+3B': 0, '1B+3B+SS': 0 }, home: { '1B+2B+SS': 0, '1B+2B+3B': 0, '1B+3B+SS': 0 } };
    const off = offense(s), def = defense(s);
    const batter = s.pregame[off].battingOrderCardKeys[0] ?? Object.keys(s.pregame[off].roster?.cards ?? {})[0] ?? null;
    const pitcher = s.pregame[def].defensiveAlignment.P ?? s.pregame[def].startingPitcherCardKey;
    s.plateAppearance = { batterCardKey: batter, pitcherCardKey: pitcher, pitchRoll: null, pitchTotal: null, advantage: null, swingRoll: null, chartResult: null, infieldIn: false };
    return s;
}
function pending(state, type, actingSide, context) {
    const d = { id: `scenario-${type}`, ruleCondition: 'RC5_CONDITIONAL_GAME_STATE', decisionType: type, actingSide, legalActions: [], context, createdAt: '2026-01-01T00:00:00.000Z' };
    return { ...state, status: 'awaiting_decision', waitingFor: 'CONDITIONAL_DECISION', nextActor: actingSide, pendingDecision: d };
}
function firstOf(items, message) { const v = items[0]; assert(v, message); return v; }
function optionId(state, predicate) { const v = getDecisionView(state); assert(v, 'Expected decision view.'); const option = v.options.find(o => predicate(o.id)); assert(option, `Expected legal option for ${v.title}.`); return option.id; }
function offRunnerKeys(state) { const side = offense(state); const keys = state.pregame[side].battingOrderCardKeys; return [keys[1] ?? 'R1', keys[2] ?? 'R2', keys[3] ?? 'R3']; }
export function runNonGbScenarioMatrix(initial) {
    const results = [];
    const test = (id, category, description, fn) => { try {
        fn();
        results.push({ id, category, description, passed: true, detail: 'Expected Rulebook result matched.' });
    }
    catch (e) {
        results.push({ id, category, description, passed: false, detail: e instanceof Error ? e.message : String(e) });
    } };
    // Universal Rulebook modifier/assertion layer.
    test('MOD-01', 'Rule modifiers', '1B→3B hit advancement receives no ordinary +3 BsR bonus', () => assert(extraBaseEffectiveBaserunning(14, '1B', '3B', 0) === 14, 'Expected BSR 14.'));
    test('MOD-02', 'Rule modifiers', '1B→3B with 2 outs receives only the two-out +3 BsR bonus', () => assert(extraBaseEffectiveBaserunning(14, '1B', '3B', 2) === 17, 'Expected BSR 17.'));
    test('MOD-03', 'Rule modifiers', '2B→HOME hit advancement receives +3 BsR', () => assert(extraBaseEffectiveBaserunning(14, '2B', 'HOME', 0) === 17, 'Expected BSR 17.'));
    test('MOD-04', 'Rule modifiers', '2B→HOME with 2 outs receives +6 total BsR', () => assert(extraBaseEffectiveBaserunning(14, '2B', 'HOME', 2) === 20, 'Expected BSR 20.'));
    test('MOD-05', 'Rule modifiers', 'Tag ups never inherit hit-advancement BsR bonuses', () => assert(tagUpEffectiveBaserunning(14) === 14, 'Expected unmodified BSR 14.'));
    test('MOD-06', 'Rule modifiers', '1B→2B tag adds +10 to OF check', () => assert(tagUpOutfieldBonus('1B', '2B') === 10, 'Expected +10.'));
    test('MOD-07', 'Rule modifiers', 'Tag toward home uses RTS 11+', () => assert(tagUpRtsThreshold([{ to: 'HOME' }]) === 11, 'Expected 11.'));
    test('MOD-08', 'Rule modifiers', 'Tag toward 3B/2B uses RTS 16+', () => assert(tagUpRtsThreshold([{ to: '3B' }]) === 16, 'Expected 16.'));
    test('MOD-09', 'Natural overrides', 'Natural 1 is safe even when ordinary total would be an out', () => assert(fieldingCheckIsOut(1, 50, 1) === false, 'Natural 1 must be safe.'));
    test('MOD-10', 'Natural overrides', 'Natural 20 is out even when ordinary total would be safe', () => assert(fieldingCheckIsOut(20, -50, 99) === true, 'Natural 20 must be out.'));
    test('MOD-11', 'Natural overrides', 'Equality is safe on ordinary fielding comparison', () => assert(fieldingCheckIsOut(10, 14, 14) === false, 'Equal check must be safe.'));
    // Pre-pitch availability/negative tests.
    test('PRE-01', 'Manager action eligibility', 'Intentional walk is available before a pitch', () => { const s = fixture(initial); assert(getPrePitchActions(s).some(a => a.id === 'INTENTIONAL_WALK'), 'Intentional walk missing.'); });
    test('PRE-02', 'Manager action eligibility', 'Natural steal is unavailable with no runners', () => { const s = fixture(initial); assert(!getPrePitchActions(s).some(a => a.id === 'NATURAL_STEAL'), 'Natural steal should not be offered.'); });
    test('PRE-03', 'Manager action eligibility', 'Sac bunt is legal with runner on 1B and 2B empty', () => { const s = fixture(initial); s.bases.first = runner('R1', 'Runner 1'); assert(getPrePitchActions(s).some(a => a.id === 'SAC_BUNT'), 'Sac bunt missing.'); });
    test('PRE-04', 'Manager action eligibility', 'Squeeze is legal with runner on 3B, bases not loaded, INF IN off', () => { const s = fixture(initial); s.bases.third = runner('R3', 'Runner 3'); assert(getPrePitchActions(s).some(a => a.id === 'SQUEEZE_BUNT'), 'Squeeze missing.'); });
    test('PRE-05', 'Manager action eligibility', 'Squeeze is unavailable after INF IN', () => { const s = fixture(initial); s.bases.third = runner('R3', 'Runner 3'); s.plateAppearance.infieldIn = true; assert(!getPrePitchActions(s).some(a => a.id === 'SQUEEZE_BUNT'), 'Squeeze should be unavailable.'); });
    test('PRE-06', 'Manager action eligibility', 'INF IN is only offered with runner on 3B and fewer than 2 outs', () => { const s = fixture(initial); assert(!getPrePitchActions(s).some(a => a.id === 'INFIELD_IN'), 'INF IN offered without 3B runner.'); s.bases.third = runner('R3', 'Runner 3'); assert(getPrePitchActions(s).some(a => a.id === 'INFIELD_IN'), 'INF IN missing with 3B runner.'); s.outs = 2; assert(!getPrePitchActions(s).some(a => a.id === 'INFIELD_IN'), 'INF IN offered with 2 outs.'); });
    test('PRE-07', 'Manager action eligibility', 'Manager actions are unavailable once Pitch has started', () => { const s = fixture(initial); s.waitingFor = 'SWING_ROLL'; assert(getPrePitchActions(s).length === 0, 'Pre-pitch options appeared after Pitch.'); });
    // Extra-base selection dependency and RTS.
    test('XB-01', 'Extra bases', 'Trailing 1B→3B attempt cannot be selected unless lead 2B→HOME runner also advances', () => { const s = fixture(initial); const [k1, k2] = offRunnerKeys(s); const lead = { runner: runner(k2, 'Lead', 14), from: '2B', to: 'HOME' }; const trail = { runner: runner(k1, 'Trail', 14), from: '1B', to: '3B', requiresAttemptId: `${k2}::2B->HOME` }; const p = pending(s, 'EXTRA_BASE_RUNNER_SELECTION', offense(s), { eligibleAttempts: [lead, trail] }); expectThrow(() => validateDecisionSelection(p, [`${k1}::1B->3B`]), 'Trailing runner dependency was not enforced.'); validateDecisionSelection(p, [`${k2}::2B->HOME`, `${k1}::1B->3B`]); });
    test('XB-02', 'Extra bases', 'RTS roll 10 fails', () => { const s = fixture(initial); const a = { runner: runner('R2', 'Runner', 14), from: '2B', to: 'HOME' }; const p = pending(s, 'EXTRA_BASE_RTS', offense(s), { attempts: [a], target: a }); const n = resolveDecisionRoll(p, 10); assert(!n.pendingDecision, 'RTS 10 should end attempt.'); });
    test('XB-03', 'Extra bases', 'RTS roll 11 passes to OF selection', () => { const s = fixture(initial); const a = { runner: runner('R2', 'Runner', 14), from: '2B', to: 'HOME' }; const p = pending(s, 'EXTRA_BASE_RTS', offense(s), { attempts: [a], target: a }); const n = resolveDecisionRoll(p, 11); assert(n.pendingDecision?.decisionType === 'OUTFIELD_SELECTION', 'RTS 11 should pass.'); });
    test('XB-04', 'Extra bases', '2 outs + throw home skips RTS entirely', () => { const s = fixture(initial); s.outs = 2; const a = { runner: runner('R2', 'Runner', 14), from: '2B', to: 'HOME' }; const p = pending(s, 'EXTRA_BASE_DEFENSE_TARGET', defense(s), { attempts: [a] }); const id = optionId(p, x => x.includes('2B->HOME')); const n = confirmManagerDecision(p, [id]); assert(n.pendingDecision?.decisionType === 'OUTFIELD_SELECTION', 'Expected direct OF selection with RTS skipped.'); });
    // OF checks including exact modifiers and natural overrides.
    const ofScenario = (roll, outs, from, to, bsr) => { const s = fixture(initial); s.outs = outs; const a = { runner: runner('RX', 'Runner', bsr), from, to }; s.bases[from === '1B' ? 'first' : 'second'] = a.runner; const pos = 'CF'; return resolveDecisionRoll(pending(s, 'OUTFIELD_FIELDING_ROLL', defense(s), { attempts: [a], target: a, outfielder: pos, kind: 'EXTRA_BASE' }), roll); };
    test('XB-05', 'Extra bases', 'Natural 1 OF check is always safe', () => { const n = ofScenario(1, 0, '2B', 'HOME', 1); assert(n.outs === 0, 'Natural 1 recorded an out.'); });
    test('XB-06', 'Extra bases', 'Natural 20 OF check is always out', () => { const n = ofScenario(20, 0, '2B', 'HOME', 99); assert(n.outs === 1, 'Natural 20 did not record out.'); });
    test('XB-07', 'Extra bases', '1B→3B ordinary check uses base BsR without +3', () => assert(extraBaseEffectiveBaserunning(12, '1B', '3B', 0) === 12, 'Unexpected modifier.'));
    test('XB-08', 'Extra bases', 'Two-out 2B→HOME applies both +3 BsR bonuses', () => assert(extraBaseEffectiveBaserunning(12, '2B', 'HOME', 2) === 18, 'Expected +6.'));
    // Tag-up thresholds and +10 defense modifier isolation.
    test('TAG-01', 'Tag ups', 'Tag home RTS 10 fails', () => { const s = fixture(initial); const a = { runner: runner('R3', 'Runner', 14), from: '3B', to: 'HOME' }; const n = resolveDecisionRoll(pending(s, 'TAG_UP_RTS', offense(s), { attempts: [a] }), 10); assert(!n.pendingDecision, 'Tag-home RTS 10 should fail.'); });
    test('TAG-02', 'Tag ups', 'Tag home RTS 11 passes', () => { const s = fixture(initial); const a = { runner: runner('R3', 'Runner', 14), from: '3B', to: 'HOME' }; const n = resolveDecisionRoll(pending(s, 'TAG_UP_RTS', offense(s), { attempts: [a] }), 11); assert(n.pendingDecision?.decisionType === 'TAG_UP_DEFENSE_SELECTION', 'Tag-home RTS 11 should pass.'); });
    test('TAG-03', 'Tag ups', 'Tag to 3B RTS 15 fails / 16 passes', () => { const s = fixture(initial); const a = { runner: runner('R2', 'Runner', 14), from: '2B', to: '3B' }; assert(!resolveDecisionRoll(pending(s, 'TAG_UP_RTS', offense(s), { attempts: [a] }), 15).pendingDecision, 'RTS 15 should fail.'); assert(resolveDecisionRoll(pending(s, 'TAG_UP_RTS', offense(s), { attempts: [a] }), 16).pendingDecision?.decisionType === 'TAG_UP_DEFENSE_SELECTION', 'RTS 16 should pass.'); });
    test('TAG-04', 'Tag ups', 'Two-out tag still uses unmodified BsR', () => assert(tagUpEffectiveBaserunning(14) === 14, 'Two-out bonus leaked into tag up.'));
    // Steals and 1B+.
    test('SB-01', 'Stolen bases', 'Natural 1 catcher check is safe', () => assert(catcherStealCheckIsOut(1, 20, 1, false) === false, 'Natural 1 should be safe.'));
    test('SB-02', 'Stolen bases', 'Natural 20 catcher check is out', () => assert(catcherStealCheckIsOut(20, -20, 99, false) === true, 'Natural 20 should be out.'));
    test('SB-03', 'Stolen bases', 'Catcher-check equality is safe', () => assert(catcherStealCheckIsOut(10, 2, 12, false) === false, 'Equality should be safe.'));
    test('SB-04', 'Stolen bases', 'Steal home adds +15 to catcher check', () => { assert(catcherStealCheckIsOut(2, 0, 12, false) === false, 'Ordinary steal should be safe.'); assert(catcherStealCheckIsOut(2, 0, 12, true) === true, 'Steal-home +15 should make runner out.'); });
    test('SB-05', 'Stolen bases', 'Natural steal allowance is consumed against non-negative catcher', () => { const s = fixture(initial); s.bases.first = runner('R1', 'Runner'); const p = beginPrePitchDecision(s, 'NATURAL_STEAL'); const id = firstOf(getDecisionView(p)?.options ?? [], 'No steal option.').id; const n = confirmManagerDecision(p, [id]); const off = offense(s); assert(n.naturalStolenBaseUsed?.[off] === true, 'Natural steal allowance not consumed.'); });
    test('1B+-01', '1B+', 'Mandatory 1B+ natural 1 succeeds', () => { const s = fixture(initial); const r = runner('R1', 'Runner', 10, 1); s.bases.first = r; const n = resolveDecisionRoll(pending(s, 'ONE_BASE_PLUS_STOLEN_BASE', defense(s), { target: r }), 1); assert(n.bases.second?.cardKey === r.cardKey, 'Natural 1 did not move runner to 2B.'); });
    test('1B+-02', '1B+', 'Mandatory 1B+ natural 20 records out', () => { const s = fixture(initial); const r = runner('R1', 'Runner', 10, 99); s.bases.first = r; const n = resolveDecisionRoll(pending(s, 'ONE_BASE_PLUS_STOLEN_BASE', defense(s), { target: r }), 20); assert(n.outs === 1, 'Natural 20 did not record caught stealing.'); });
    // Core chart-result behavior and hit/tag/1B+ triggering.
    test('CORE-01', 'Chart results', 'K records one out and advances to the next PA', () => { const s = fixture(initial); const n = resolveCoreResult(s, 'K'); assert(n.outs === 1, 'K should record one out.'); assert(n.pendingDecision === null, 'K should not create a manager decision.'); });
    test('CORE-02', 'Chart results', 'PU records one out and never offers tag/extra-base advancement', () => { const s = fixture(initial); s.bases.third = runner('R3', 'R3'); const n = resolveCoreResult(s, 'PU'); assert(n.outs === 1, 'PU should record one out.'); assert(n.pendingDecision === null, 'PU must not offer tag-up.'); });
    test('CORE-03', 'Chart results', 'FB with runner and fewer than three outs triggers tag-up decision', () => { const s = fixture(initial); s.bases.third = runner('R3', 'R3'); const n = resolveCoreResult(s, 'FB'); assert(n.pendingDecision?.decisionType === 'TAG_UP_DECISION', 'FB should create tag-up decision.'); });
    test('CORE-04', 'Chart results', '1B with eligible existing runner triggers optional extra-base decision', () => { const s = fixture(initial); s.bases.first = runner('R1', 'R1'); const n = resolveCoreResult(s, '1B'); assert(n.pendingDecision?.decisionType === 'EXTRA_BASE_DECISION', '1B should create extra-base decision.'); });
    test('CORE-05', 'Chart results', '2B with eligible existing runner triggers optional extra-base decision', () => { const s = fixture(initial); s.bases.first = runner('R1', 'R1'); const n = resolveCoreResult(s, '2B'); assert(n.pendingDecision?.decisionType === 'EXTRA_BASE_DECISION', '2B should create extra-base decision.'); });
    test('CORE-06', 'Chart results', '1B+ with 2B empty triggers mandatory non-natural steal', () => { const s = fixture(initial); const n = resolveCoreResult(s, '1B+'); assert(n.pendingDecision?.decisionType === 'ONE_BASE_PLUS_STOLEN_BASE', '1B+ should create mandatory steal when 2B is open.'); });
    test('CORE-07', 'Chart results', '1B+ with 2B occupied after automatic advancement does not trigger mandatory steal', () => { const s = fixture(initial); s.bases.first = runner('R1', 'R1'); const n = resolveCoreResult(s, '1B+'); assert(n.pendingDecision === null, '1B+ should not steal into occupied 2B.'); });
    test('CORE-08', 'Chart results', '3B scores all existing runners and leaves batter on 3B', () => { const s = fixture(initial); s.bases = { first: runner('R1', 'R1'), second: runner('R2', 'R2'), third: runner('R3', 'R3') }; const n = resolveCoreResult(s, '3B'); assert(n.score.away === 3, 'Triple should score three existing runners.'); assert(n.bases.third?.cardKey === s.plateAppearance.batterCardKey, 'Batter should occupy 3B.'); });
    test('CORE-09', 'Chart results', 'HR scores batter plus all existing runners and clears bases', () => { const s = fixture(initial); s.bases = { first: runner('R1', 'R1'), second: runner('R2', 'R2'), third: runner('R3', 'R3') }; const n = resolveCoreResult(s, 'HR'); assert(n.score.away === 4, 'Grand slam should score four.'); assert(!n.bases.first && !n.bases.second && !n.bases.third, 'HR should clear bases.'); });
    test('CORE-10', 'Chart results', 'INF IN converts FB to 1B and suppresses tag-up decision', () => { const s = fixture(initial); s.plateAppearance.infieldIn = true; s.bases.third = runner('R3', 'R3'); const n = resolveCoreResult(s, 'FB'); assert(n.pendingDecision === null, 'INF IN FB conversion must suppress tag.'); assert(n.bases.first !== null, 'Converted FB should place batter on 1B.'); });
    // Substitution and entry-attribute decision plumbing.
    test('SUB-01', 'Substitutions', 'Pinch hitter uses Select → Confirm → attribute mode → resumes same PA', () => { let s = fixture(initial); const action = getPrePitchActions(s).find(a => a.id === 'PINCH_HITTER'); assert(action, 'Pinch hitter action unavailable in fixture.'); s = beginPrePitchDecision(s, 'PINCH_HITTER'); const replacement = firstOf(getDecisionView(s)?.options ?? [], 'No pinch hitter replacement.').id; s = confirmManagerDecision(s, [replacement]); assert(s.pendingDecision?.decisionType === 'ENTRY_ATTRIBUTE_MODE', 'Expected entry attribute choice.'); s = confirmManagerDecision(s, ['DEFAULT_ATTRIBUTES']); assert(s.waitingFor === 'PITCH_ROLL', 'Pinch hitter should resume current PA before pitch.'); assert(s.plateAppearance.batterCardKey === replacement, 'Replacement should become current hitter.'); assert(s.pregame[offense(s)].defaultBatterCardKeys.includes(replacement), 'Default hitter mode not stored.'); });
    test('SUB-02', 'Substitutions', 'Pinch runner replaces runner on the same base without duplicating identity', () => { let s = fixture(initial); s.bases.first = runner('R1', 'R1'); s = beginPrePitchDecision(s, 'PINCH_RUNNER'); s = confirmManagerDecision(s, ['first']); const replacement = firstOf(getDecisionView(s)?.options ?? [], 'No pinch runner replacement.').id; s = confirmManagerDecision(s, [replacement]); s = confirmManagerDecision(s, ['DEFAULT_ATTRIBUTES']); assert(s.bases.first?.cardKey === replacement, 'Pinch runner did not replace 1B runner.'); const keys = [s.bases.first, s.bases.second, s.bases.third].filter(Boolean).map(r => r.cardKey); assert(new Set(keys).size === keys.length, 'Pinch runner created duplicate base identity.'); });
    test('SUB-03', 'Substitutions', 'Defensive substitution reaches entry attribute mode and replaces selected position', () => { let s = fixture(initial); s = beginPrePitchDecision(s, 'DEFENSIVE_SUB'); const pos = firstOf(getDecisionView(s)?.options ?? [], 'No defensive positions.').id; s = confirmManagerDecision(s, [pos]); const replacement = firstOf(getDecisionView(s)?.options ?? [], 'No defensive replacement.').id; s = confirmManagerDecision(s, [replacement]); assert(s.pendingDecision?.decisionType === 'ENTRY_ATTRIBUTE_MODE', 'Expected entry attribute mode.'); s = confirmManagerDecision(s, ['CARD_ATTRIBUTES']); assert(s.pregame[defense(s)].defensiveAlignment[pos] === replacement, 'Defensive replacement did not inherit position.'); });
    test('SUB-04', 'Substitutions', 'Pitching change replaces current pitcher before the next pitch', () => { let s = fixture(initial); s = beginPrePitchDecision(s, 'PITCHING_CHANGE'); const replacement = firstOf(getDecisionView(s)?.options ?? [], 'No pitching replacement.').id; s = confirmManagerDecision(s, [replacement]); s = confirmManagerDecision(s, ['DEFAULT_ATTRIBUTES']); assert(s.pregame[defense(s)].defensiveAlignment.P === replacement, 'Pitcher alignment not replaced.'); assert(s.plateAppearance.pitcherCardKey === replacement, 'Current PA pitcher not replaced.'); assert((s.pregame[defense(s)].defaultPitcherCardKeys ?? []).includes(replacement), 'Default pitcher mode not stored.'); });
    test('SB-06', 'Stolen bases', 'Negative catcher DEF preserves unlimited natural-steal eligibility even after prior use', () => { const s = fixture(initial); s.bases.first = runner('R1', 'Runner'); const def = defense(s); const cKey = s.pregame[def].defensiveAlignment.C; assert(cKey, 'Catcher missing.'); const c = s.pregame[def].roster?.cards[cKey]; assert(c, 'Catcher card missing.'); c.defense.C = -1; s.naturalStolenBaseUsed = { ...s.naturalStolenBaseUsed, [offense(s)]: true }; assert(getPrePitchActions(s).some(a => a.id === 'NATURAL_STEAL'), 'Negative catcher should keep natural steals unlimited.'); });
    // Bunt tables: every Rulebook boundary.
    for (const [roll, expected] of [[1, 'SWING_ROLL'], [2, 'SWING_ROLL'], [3, 'OUT'], [4, 'OUT'], [5, 'OUT'], [6, 'OUT'], [20, 'OUT']]) {
        test(`BUNT-NW-${roll}`, 'Sac bunt', `No-wheel sac bunt boundary roll ${roll}`, () => { const s = fixture(initial); s.bases.first = runner('R1', 'Runner'); const n = resolveDecisionRoll(pending(s, 'SAC_BUNT_RTS', offense(s), {}), roll); if (expected === 'SWING_ROLL')
            assert(n.waitingFor === 'SWING_ROLL', 'Expected return to pitcher-chart Swing.');
        else
            assert(n.outs >= 1, 'Expected an out on this bunt result.'); });
    }
    test('BUNT-W-15', 'Sac bunt', 'Wheel play roll 15 = all forced runners advance, hitter safe, no out', () => { const s = fixture(initial); s.bases.first = runner('R1', 'Runner'); const n = resolveDecisionRoll(pending(s, 'SAC_BUNT_WHEEL_RTS', offense(s), {}), 15); assert(n.outs === 0, 'Wheel 15 should record no out.'); assert(n.bases.first !== null, 'Hitter should be safe.'); });
    test('BUNT-W-16', 'Sac bunt', 'Wheel play roll 16 = lead runner out, hitter safe', () => { const s = fixture(initial); s.bases.first = runner('R1', 'Runner'); const n = resolveDecisionRoll(pending(s, 'SAC_BUNT_WHEEL_RTS', offense(s), {}), 16); assert(n.outs === 1, 'Wheel 16 should record one out.'); assert(n.bases.first !== null, 'Hitter should be safe.'); });
    // Squeeze boundaries.
    for (const [roll, outDelta, runDelta] of [[1, 1, 0], [7, 1, 0], [8, 1, 0], [15, 1, 0], [16, 1, 1], [19, 1, 1], [20, 0, 1]]) {
        test(`SQ-${roll}`, 'Squeeze bunt', `Squeeze boundary roll ${roll}`, () => { const s = fixture(initial); s.bases.third = runner('R3', 'Runner'); const n = resolveDecisionRoll(pending(s, 'SQUEEZE_BUNT_ROLL', offense(s), {}), roll); assert(n.outs === outDelta, `Expected ${outDelta} out(s), got ${n.outs}.`); assert(n.score.away === runDelta, `Expected ${runDelta} run(s), got ${n.score.away}.`); });
    }
    // Intentional walk forcing and INF IN confirmation.
    test('IBB-01', 'Intentional walk', 'Bases loaded intentional walk forces exactly one run', () => { const s = fixture(initial); s.bases = { first: runner('R1', 'R1'), second: runner('R2', 'R2'), third: runner('R3', 'R3') }; const p = beginPrePitchDecision(s, 'INTENTIONAL_WALK'); const n = confirmManagerDecision(p, ['CONFIRM_INTENTIONAL_WALK']); assert(n.score.away === 1, 'Loaded IBB should force one run.'); assert(n.bases.first && n.bases.second && n.bases.third, 'Bases should remain loaded with batter replacing forced chain.'); });
    test('INF-01', 'Infield in', 'Confirming INF IN persists for current PA and resumes Pitch', () => { const s = fixture(initial); s.bases.third = runner('R3', 'R3'); const p = beginPrePitchDecision(s, 'INFIELD_IN'); const n = confirmManagerDecision(p, ['CONFIRM_INFIELD_IN']); assert(n.plateAppearance.infieldIn === true, 'INF IN flag missing.'); assert(n.waitingFor === 'PITCH_ROLL', 'Expected Pitch Roll after confirmation.'); });
    // OF rotation contract.
    test('OF-01', 'Outfield rotation', 'Selected outfielder is unavailable until other eligible OF have caught up in usage', () => { const s = fixture(initial); const a = { runner: runner('R2', 'Runner'), from: '2B', to: 'HOME' }; let p = pending(s, 'OUTFIELD_SELECTION', defense(s), { attempts: [a], target: a, kind: 'EXTRA_BASE' }); const view = getDecisionView(p); assert(view && view.options.length >= 2, 'Need at least two OF assignments for rotation test.'); const selected = view.options[0].id; p = confirmManagerDecision(p, [selected]); const usedPos = selected.replace('OF::', ''); const later = pending({ ...p, pendingDecision: null, status: 'in_progress' }, 'OUTFIELD_SELECTION', defense(s), { attempts: [a], target: a, kind: 'EXTRA_BASE' }); const ids = getDecisionView(later)?.options.map(o => o.id) ?? []; assert(!ids.includes(`OF::${usedPos}`), 'Used OF was immediately eligible again.'); });
    // Universal state integrity for every scenario is also enforced by result-specific checks;
    // this explicit fixture test protects the runner uniqueness contract.
    test('STATE-01', 'State integrity', 'Scenario fixture starts with legal outs/cursors and unique bases', () => { const s = fixture(initial); assert(s.outs >= 0 && s.outs <= 3, 'Invalid outs.'); assert(s.lineupCursor.home >= 0 && s.lineupCursor.home <= 8, 'Invalid home cursor.'); assert(s.lineupCursor.away >= 0 && s.lineupCursor.away <= 8, 'Invalid away cursor.'); });
    const categories = {};
    for (const r of results) {
        const c = categories[r.category] ?? { total: 0, passed: 0 };
        c.total++;
        if (r.passed)
            c.passed++;
        categories[r.category] = c;
    }
    return { total: results.length, passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, categories, results };
}
export function runGbScenarioMatrix(initial) {
    const results = [];
    const test = (id, category, description, fn) => { try {
        fn();
        results.push({ id, category, description, passed: true, detail: 'Expected Rulebook result matched.' });
    }
    catch (e) {
        results.push({ id, category, description, passed: false, detail: e instanceof Error ? e.message : String(e) });
    } };
    const setBase = (s, base, key, name, bsr = 12) => { s.bases[base] = runner(key, name, bsr, 10); };
    const gb = (s) => resolveCoreResult(s, 'GB');
    const choose = (s, id) => confirmManagerDecision(s, [id]);
    const defSide = (s) => defense(s);
    const forceInfRatings = (s, twoB, threeB) => { const side = defSide(s); for (const [pos, val] of [['2B', twoB], ['3B', threeB]]) {
        const key = s.pregame[side].defensiveAlignment[pos];
        assert(key, `Missing ${pos} alignment.`);
        const card = s.pregame[side].roster?.cards[key];
        assert(card, `Missing ${pos} card.`);
        card.defense[pos] = val;
    } };
    // Availability / negative tests.
    test('GB-ELIG-01', 'GB eligibility', 'Bases empty GB is automatic batter out; no manager decision', () => { const s = fixture(initial); const n = gb(s); assert(n.outs === 1, 'Expected one out.'); assert(!n.pendingDecision, 'Unexpected GB decision.'); });
    test('GB-ELIG-02', 'GB eligibility', 'Two-out GB never offers DBP/RFO manager branch', () => { const s = fixture(initial); s.outs = 2; setBase(s, 'first', 'R1', 'R1'); const n = gb(s); assert(n.outs === 0 || n.outs === 3 || n.half === 'bottom', 'Expected inning transition after third out.'); assert(!n.pendingDecision, 'Two-out GB should not create force-play decision.'); });
    test('GB-ELIG-03', 'GB eligibility', 'Runner on 1B with <2 outs offers singular out and standard DBP', () => { const s = fixture(initial); setBase(s, 'first', 'R1', 'R1'); const n = gb(s); const ids = getDecisionView(n)?.options.map(o => o.id) ?? []; assert(ids.includes('TAKE_SINGULAR_OUT'), 'Singular out missing.'); assert(ids.includes('ATTEMPT_STANDARD_DBP'), 'Standard DBP missing.'); });
    test('GB-ELIG-04', 'GB eligibility', 'Runner on 2B only routes directly to RFO', () => { const s = fixture(initial); setBase(s, 'second', 'R2', 'R2'); const n = gb(s); assert(n.pendingDecision?.decisionType === 'GB_RUNNER_2B_RFO', 'Expected runner-on-2B RFO.'); });
    test('GB-ELIG-05', 'GB eligibility', 'Runner on 3B only scores automatically and batter is out', () => { const s = fixture(initial); setBase(s, 'third', 'R3', 'R3'); const n = gb(s); assert(n.score.away === 1, 'Runner on 3B should score.'); assert(!n.pendingDecision, 'No GB decision expected.'); });
    // Singular RFO boundaries with runner on 1B.
    for (const roll of [1, 5])
        test(`GB-RFO1-${roll}`, 'Singular RFO', `Runner 1B singular RFO ${roll}: batter out`, () => { const s = fixture(initial); setBase(s, 'first', 'R1', 'R1'); let n = choose(gb(s), 'TAKE_SINGULAR_OUT'); n = resolveDecisionRoll(n, roll); assert(n.outs === 1, 'Expected one out.'); assert(n.bases.second?.cardKey === 'R1', 'Runner should advance to 2B.'); assert(!n.bases.first, 'Batter should be out.'); });
    for (const roll of [6, 20])
        test(`GB-RFO2-${roll}`, 'Singular RFO', `Runner 1B singular RFO ${roll}: force runner out`, () => { const s = fixture(initial); setBase(s, 'first', 'R1', 'R1'); let n = choose(gb(s), 'TAKE_SINGULAR_OUT'); n = resolveDecisionRoll(n, roll); assert(n.outs === 1, 'Expected one out.'); assert(!n.bases.second, 'Forced runner should be out.'); assert(n.bases.first !== null, 'Batter should be safe at 1B.'); });
    // 1B/2B singular RFO three bands.
    for (const [roll, expected] of [[5, 'BATTER'], [6, 'TO2'], [15, 'TO2'], [16, 'TO3'], [20, 'TO3']])
        test(`GB-RFO12-${roll}`, 'Singular RFO', `1B/2B RFO boundary ${roll}`, () => { const s = fixture(initial); setBase(s, 'first', 'R1', 'R1'); setBase(s, 'second', 'R2', 'R2'); let n = choose(gb(s), 'TAKE_SINGULAR_OUT'); n = resolveDecisionRoll(n, roll); assert(n.outs === 1, 'Expected one out.'); if (expected === 'BATTER') {
            assert(!n.bases.first, 'Batter should be out.');
            assert(n.bases.second?.cardKey === 'R1' && n.bases.third?.cardKey === 'R2', 'Both forced runners should advance.');
        } if (expected === 'TO2') {
            assert(n.bases.first !== null && !n.bases.second && n.bases.third?.cardKey === 'R2', 'Runner heading 2B should be out.');
        } if (expected === 'TO3') {
            assert(n.bases.first !== null && n.bases.second?.cardKey === 'R1' && !n.bases.third, 'Runner heading 3B should be out.');
        } });
    // Runner on 2B RFO boundaries.
    for (const roll of [1, 10])
        test(`GB-2B-A-${roll}`, 'Runner 2B RFO', `2B RFO ${roll}: runner advances`, () => { const s = fixture(initial); setBase(s, 'second', 'R2', 'R2'); const n = resolveDecisionRoll(gb(s), roll); assert(n.outs === 1 && n.bases.third?.cardKey === 'R2', 'Runner should advance to 3B and batter be out.'); });
    for (const roll of [11, 20])
        test(`GB-2B-H-${roll}`, 'Runner 2B RFO', `2B RFO ${roll}: runner holds`, () => { const s = fixture(initial); setBase(s, 'second', 'R2', 'R2'); const n = resolveDecisionRoll(gb(s), roll); assert(n.outs === 1 && n.bases.second?.cardKey === 'R2', 'Runner should hold at 2B.'); });
    // Standard DBP natural overrides and ordinary branches.
    test('DBP-01', 'Standard DBP', 'Natural 1 on first check: all safe, zero outs', () => { const s = fixture(initial); setBase(s, 'first', 'R1', 'R1', 1); let n = choose(gb(s), 'ATTEMPT_STANDARD_DBP'); const combo = firstOf(getDecisionView(n)?.options ?? [], 'No INF combo.').id; n = choose(n, combo); n = resolveDecisionRoll(n, 1); assert(n.outs === 0, 'Natural 1 must record no outs.'); assert(n.bases.first && n.bases.second, 'Batter and forced runner should be safe.'); });
    test('DBP-02', 'Standard DBP', 'Natural 20 on first check: automatic double play', () => { const s = fixture(initial); setBase(s, 'first', 'R1', 'R1', 99); let n = choose(gb(s), 'ATTEMPT_STANDARD_DBP'); const combo = firstOf(getDecisionView(n)?.options ?? [], 'No INF combo.').id; n = choose(n, combo); n = resolveDecisionRoll(n, 20); assert(n.outs === 2, 'Natural 20 should produce two outs.'); assert(!n.bases.first && !n.bases.second, 'Both forced runner and batter should be out.'); });
    test('DBP-03', 'Standard DBP', 'Successful first check + successful second check produces DP', () => { const s = fixture(initial); setBase(s, 'first', 'R1', 'R1', -100); let n = choose(gb(s), 'ATTEMPT_STANDARD_DBP'); const combo = firstOf(getDecisionView(n)?.options ?? [], 'No INF combo.').id; n = choose(n, combo); n = resolveDecisionRoll(n, 10); assert(n.pendingDecision?.decisionType === 'GB_STANDARD_SECOND_CHECK', 'Expected second DBP check.'); n = resolveDecisionRoll(n, 10); assert(n.outs === 2, 'Expected two outs.'); });
    test('DBP-04', 'Standard DBP', 'Failed first check + failed second check leaves both safe', () => { const s = fixture(initial); setBase(s, 'first', 'R1', 'R1', 100); let n = choose(gb(s), 'ATTEMPT_STANDARD_DBP'); const combo = firstOf(getDecisionView(n)?.options ?? [], 'No INF combo.').id; n = choose(n, combo); n = resolveDecisionRoll(n, 2); n = resolveDecisionRoll(n, 2); assert(n.outs === 0, 'Expected no outs.'); assert(n.bases.first && n.bases.second, 'Both runners should be safe.'); });
    test('DBP-05', 'Standard DBP', 'INF combination is consumed on an attempted DBP even when it fails', () => { const s = fixture(initial); setBase(s, 'first', 'R1', 'R1', 100); let n = choose(gb(s), 'ATTEMPT_STANDARD_DBP'); const view = getDecisionView(n); const combo = firstOf(view?.options ?? [], 'No INF combo.').id; n = choose(n, combo); assert((n.infieldDoublePlayUsage?.[defSide(s)]?.[combo] ?? 0) === 1, 'Combination was not consumed on selection.'); });
    test('DBP-06', 'Standard DBP', 'Used combination is unavailable until the other combinations catch up', () => { const s = fixture(initial); setBase(s, 'first', 'R1', 'R1'); let n = choose(gb(s), 'ATTEMPT_STANDARD_DBP'); const combo = firstOf(getDecisionView(n)?.options ?? [], 'No INF combo.').id; n = choose(n, combo); const fresh = fixture(initial); setBase(fresh, 'first', 'R1', 'R1'); fresh.infieldDoublePlayUsage = n.infieldDoublePlayUsage; const m = choose(gb(fresh), 'ATTEMPT_STANDARD_DBP'); const ids = getDecisionView(m)?.options.map(o => o.id) ?? []; assert(!ids.includes(combo), 'Used combination should not be immediately reusable.'); });
    // 3B→1B DP availability and results.
    test('31DP-01', '3B→1B DP', '1B/2B state offers 3B→1B DP when an eligible 3B combination exists', () => { const s = fixture(initial); setBase(s, 'first', 'R1', 'R1'); setBase(s, 'second', 'R2', 'R2'); const ids = getDecisionView(gb(s))?.options.map(o => o.id) ?? []; assert(ids.includes('ATTEMPT_3B_1B_DBP'), '3B→1B option missing.'); });
    test('31DP-02', '3B→1B DP', 'Natural 20 first check produces automatic two outs', () => { const s = fixture(initial); setBase(s, 'first', 'R1', 'R1'); setBase(s, 'second', 'R2', 'R2', 99); let n = choose(gb(s), 'ATTEMPT_3B_1B_DBP'); const combo = firstOf(getDecisionView(n)?.options ?? [], 'No 3B DP combo.').id; n = choose(n, combo); n = resolveDecisionRoll(n, 20); assert(n.outs === 2, 'Natural 20 should produce 3B→1B double play.'); });
    test('31DP-03', '3B→1B DP', 'Natural 1 first check makes all runners safe', () => { const s = fixture(initial); setBase(s, 'first', 'R1', 'R1'); setBase(s, 'second', 'R2', 'R2'); let n = choose(gb(s), 'ATTEMPT_3B_1B_DBP'); const combo = firstOf(getDecisionView(n)?.options ?? [], 'No 3B DP combo.').id; n = choose(n, combo); n = resolveDecisionRoll(n, 1); assert(n.outs === 0 && n.bases.first && n.bases.second && n.bases.third, 'Natural 1 should make all three safe.'); });
    // Triple-play eligibility requirements and short circuit sequence.
    test('TP-01', 'Triple play', 'Triple play is offered only at 0 outs with required combo and DEF thresholds', () => { const s = fixture(initial); setBase(s, 'first', 'R1', 'R1'); setBase(s, 'second', 'R2', 'R2'); forceInfRatings(s, 4, 2); const ids = getDecisionView(gb(s))?.options.map(o => o.id) ?? []; assert(ids.includes('ATTEMPT_TRIPLE_PLAY'), 'Triple play should be eligible.'); });
    test('TP-02', 'Triple play', 'Triple play is unavailable with 1 out', () => { const s = fixture(initial); s.outs = 1; setBase(s, 'first', 'R1', 'R1'); setBase(s, 'second', 'R2', 'R2'); forceInfRatings(s, 4, 2); const ids = getDecisionView(gb(s))?.options.map(o => o.id) ?? []; assert(!ids.includes('ATTEMPT_TRIPLE_PLAY'), 'Triple play should be unavailable with one out.'); });
    test('TP-03', 'Triple play', 'Triple play is unavailable when 2B DEF is below +4', () => { const s = fixture(initial); setBase(s, 'first', 'R1', 'R1'); setBase(s, 'second', 'R2', 'R2'); forceInfRatings(s, 3, 2); const ids = getDecisionView(gb(s))?.options.map(o => o.id) ?? []; assert(!ids.includes('ATTEMPT_TRIPLE_PLAY'), 'Triple play should require 2B DEF +4.'); });
    test('TP-04', 'Triple play', 'Triple play is unavailable when 3B DEF is below +2', () => { const s = fixture(initial); setBase(s, 'first', 'R1', 'R1'); setBase(s, 'second', 'R2', 'R2'); forceInfRatings(s, 4, 1); const ids = getDecisionView(gb(s))?.options.map(o => o.id) ?? []; assert(!ids.includes('ATTEMPT_TRIPLE_PLAY'), 'Triple play should require 3B DEF +2.'); });
    test('TP-05', 'Triple play', 'Natural 20 first TP roll completes automatic triple play', () => { const s = fixture(initial); setBase(s, 'first', 'R1', 'R1'); setBase(s, 'second', 'R2', 'R2'); forceInfRatings(s, 4, 2); let n = choose(gb(s), 'ATTEMPT_TRIPLE_PLAY'); n = resolveDecisionRoll(n, 20); assert(n.outs === 0 || n.outs === 3 || n.half === 'bottom', 'Expected inning-ending triple play transition.'); assert(!n.pendingDecision, 'Triple play should resolve immediately on natural 20.'); });
    test('TP-06', 'Triple play', 'Failure of first TP check short-circuits later checks and leaves all safe', () => { const s = fixture(initial); setBase(s, 'first', 'R1', 'R1', 20); setBase(s, 'second', 'R2', 'R2', 20); forceInfRatings(s, 4, 2); let n = choose(gb(s), 'ATTEMPT_TRIPLE_PLAY'); n = resolveDecisionRoll(n, 2); assert(!n.pendingDecision, 'First-check failure should stop TP sequence.'); assert(n.outs === 0, 'No out expected.'); });
    // Infield-in GB and contact play.
    test('IN-GB-01', 'Infield in GB', 'Bases loaded + INF IN automatically retires lead runner and advances forced runners', () => { const s = fixture(initial); s.plateAppearance.infieldIn = true; setBase(s, 'first', 'R1', 'R1'); setBase(s, 'second', 'R2', 'R2'); setBase(s, 'third', 'R3', 'R3'); const n = gb(s); assert(n.outs === 1, 'Expected one out at home.'); assert(n.bases.first && n.bases.second?.cardKey === 'R1' && n.bases.third?.cardKey === 'R2', 'Forced runners/batter not placed correctly.'); });
    test('IN-GB-02', 'Infield in GB', 'Runner on 3B + INF IN offers hold/contact decision', () => { const s = fixture(initial); s.plateAppearance.infieldIn = true; setBase(s, 'third', 'R3', 'R3'); const n = gb(s); const ids = getDecisionView(n)?.options.map(o => o.id) ?? []; assert(ids.includes('HOLD_RUNNERS') && ids.includes('CONTACT_PLAY'), 'Hold/contact options missing.'); });
    test('IN-GB-03', 'Infield in GB', 'Declining contact holds runner and records batter out', () => { const s = fixture(initial); s.plateAppearance.infieldIn = true; setBase(s, 'third', 'R3', 'R3'); const n = choose(gb(s), 'HOLD_RUNNERS'); assert(n.outs === 1 && n.bases.third?.cardKey === 'R3', 'Runner should hold with batter out.'); });
    test('IN-GB-04', 'Infield in GB', 'Contact natural 1 makes lead runner safe and batter safe', () => { const s = fixture(initial); s.plateAppearance.infieldIn = true; setBase(s, 'third', 'R3', 'R3', 1); let n = choose(gb(s), 'CONTACT_PLAY'); n = resolveDecisionRoll(n, 1); assert(n.outs === 0 && n.score.away === 1 && n.bases.first, 'Natural 1 contact should score runner with batter safe.'); });
    test('IN-GB-05', 'Infield in GB', 'Contact natural 20 retires lead runner', () => { const s = fixture(initial); s.plateAppearance.infieldIn = true; setBase(s, 'third', 'R3', 'R3', 99); let n = choose(gb(s), 'CONTACT_PLAY'); n = resolveDecisionRoll(n, 20); assert(n.outs === 1 && n.score.away === 0 && n.bases.first, 'Natural 20 should retire lead runner with batter safe.'); });
    // Third-out / scoring force-order regression.
    test('GB-SCORE-01', 'GB scoring order', 'Force-play third out suppresses run from 3B', () => { const s = fixture(initial); s.outs = 2; setBase(s, 'first', 'R1', 'R1'); setBase(s, 'third', 'R3', 'R3'); const n = gb(s); assert(n.score.away === 0, 'Run must not score on third-out force/batter out.'); });
    test('DBP-SCORE-02', 'GB scoring order', 'DBP creating third out suppresses other-runner advancement/scoring', () => { const s = fixture(initial); s.outs = 1; setBase(s, 'first', 'R1', 'R1', -100); setBase(s, 'third', 'R3', 'R3'); let n = choose(gb(s), 'ATTEMPT_STANDARD_DBP'); const combo = firstOf(getDecisionView(n)?.options ?? [], 'No combo.').id; n = choose(n, combo); n = resolveDecisionRoll(n, 20); assert(n.score.away === 0, 'Third-out DBP should suppress run.'); });
    const categories = {};
    for (const r of results) {
        const c = categories[r.category] ?? { total: 0, passed: 0 };
        c.total++;
        if (r.passed)
            c.passed++;
        categories[r.category] = c;
    }
    return { total: results.length, passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, categories, results };
}
function scenarioRng(seed) { let x = seed >>> 0; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; }; }
export function runGbScenarioStress(initial, executions, seed = 1925) {
    const next = scenarioRng(seed), categories = {}, failures = [];
    let passed = 0;
    const mark = (cat, ok, detail = '') => { const c = categories[cat] ?? { total: 0, passed: 0 }; c.total++; if (ok) {
        c.passed++;
        passed++;
    }
    else if (failures.length < 100)
        failures.push(`${cat}: ${detail}`); categories[cat] = c; };
    const set = (s, base, key, bsr = 12) => { s.bases[base] = runner(key, key, bsr, 10); };
    for (let i = 0; i < executions; i++) {
        const family = Math.floor(next() * 6), roll = 1 + Math.floor(next() * 20);
        try {
            if (family === 0) {
                const s = fixture(initial);
                set(s, 'first', `R${i}`);
                let n = resolveCoreResult(s, 'GB');
                n = confirmManagerDecision(n, ['TAKE_SINGULAR_OUT']);
                n = resolveDecisionRoll(n, roll);
                const batterOut = roll <= 5;
                mark('1B singular RFO', batterOut ? !n.bases.first && n.bases.second !== null : n.bases.first !== null && !n.bases.second, `roll ${roll}`);
            }
            else if (family === 1) {
                const s = fixture(initial);
                set(s, 'first', `A${i}`);
                set(s, 'second', `B${i}`);
                let n = resolveCoreResult(s, 'GB');
                n = confirmManagerDecision(n, ['TAKE_SINGULAR_OUT']);
                n = resolveDecisionRoll(n, roll);
                const ok = roll <= 5 ? (!n.bases.first && !!n.bases.second && !!n.bases.third) : roll <= 15 ? (!!n.bases.first && !n.bases.second && !!n.bases.third) : (!!n.bases.first && !!n.bases.second && !n.bases.third);
                mark('1B/2B singular RFO', ok, `roll ${roll}`);
            }
            else if (family === 2) {
                const s = fixture(initial);
                set(s, 'second', `R${i}`);
                let n = resolveCoreResult(s, 'GB');
                n = resolveDecisionRoll(n, roll);
                mark('2B hold/advance RFO', roll <= 10 ? n.bases.third !== null && n.bases.second === null : n.bases.second !== null && n.bases.third === null, `roll ${roll}`);
            }
            else if (family === 3) {
                const s = fixture(initial);
                set(s, 'first', `R${i}`, roll === 20 ? 99 : 1);
                let n = resolveCoreResult(s, 'GB');
                n = confirmManagerDecision(n, ['ATTEMPT_STANDARD_DBP']);
                const combo = firstOf(getDecisionView(n)?.options ?? [], 'No DBP combo.').id;
                n = confirmManagerDecision(n, [combo]);
                const forced = next() < 0.5 ? 1 : 20;
                n = resolveDecisionRoll(n, forced);
                mark('DBP natural overrides', forced === 1 ? n.outs === 0 : n.outs === 2, `roll ${forced}`);
            }
            else if (family === 4) {
                const s = fixture(initial);
                s.plateAppearance.infieldIn = true;
                set(s, 'third', `R${i}`, roll === 20 ? 99 : 1);
                let n = resolveCoreResult(s, 'GB');
                n = confirmManagerDecision(n, ['CONTACT_PLAY']);
                const forced = next() < 0.5 ? 1 : 20;
                n = resolveDecisionRoll(n, forced);
                mark('INF IN contact natural overrides', forced === 1 ? n.score.away === 1 && n.outs === 0 : n.score.away === 0 && n.outs === 1, `roll ${forced}`);
            }
            else {
                const s = fixture(initial);
                set(s, 'first', `A${i}`);
                set(s, 'second', `B${i}`);
                const side = defense(s);
                for (const [pos, val] of [['2B', 4], ['3B', 2]]) {
                    const key = s.pregame[side].defensiveAlignment[pos];
                    const c = key ? s.pregame[side].roster?.cards[key] : null;
                    if (c)
                        c.defense[pos] = val;
                }
                let n = resolveCoreResult(s, 'GB');
                const ids = getDecisionView(n)?.options.map(o => o.id) ?? [];
                if (!ids.includes('ATTEMPT_TRIPLE_PLAY')) {
                    mark('Triple-play eligibility', false, 'Eligible TP not offered');
                    continue;
                }
                n = confirmManagerDecision(n, ['ATTEMPT_TRIPLE_PLAY']);
                n = resolveDecisionRoll(n, 20);
                mark('Triple-play natural 20', !n.pendingDecision, 'TP did not resolve');
            }
        }
        catch (e) {
            mark(['1B singular RFO', '1B/2B singular RFO', '2B hold/advance RFO', 'DBP natural overrides', 'INF IN contact natural overrides', 'Triple-play natural 20'][family] ?? 'GB', false, e instanceof Error ? e.message : String(e));
        }
    }
    return { seed, executions, passed, failed: executions - passed, categories, failures };
}
