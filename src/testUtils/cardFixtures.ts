import type { CardRecord } from '../types/card'

// Shared test-only card factory for the data-layer unit tests
// (demoRoster, rosterSnapshot, cardDatabase). Not a *.test.ts file itself,
// so Vitest's `src/**/*.test.ts` include glob skips it.
let counter = 0

export function makeCard(overrides: Partial<CardRecord> = {}): CardRecord {
  counter += 1
  const n = counter

  return {
    card_key: `TEST-CARD-${n}`,
    all_number: null,
    card_number: null,
    player_name: `Test Player ${n}`,
    league: null,
    team_name: null,
    ownership: null,

    hitter_bats: null,
    hitter_fatigue: null,
    hitter_year: null,
    hitter_team_code: null,
    hitter_on_base: null,
    hitter_outs: null,
    hitter_baserunning: null,
    hitter_stolen_base: null,

    defense_c: null,
    defense_1b: null,
    defense_2b: null,
    defense_3b: null,
    defense_ss: null,
    defense_lf: null,
    defense_cf: null,
    defense_rf: null,

    hitter_pu: null,
    hitter_k: null,
    hitter_gb: null,
    hitter_fb: null,
    hitter_bb: null,
    hitter_1b: null,
    hitter_1b_plus: null,
    hitter_2b: null,
    hitter_3b: null,
    hitter_hr: null,
    hitter_points: 0,

    pitcher_arm: null,
    pitcher_fatigue: null,
    pitcher_year: null,
    pitcher_team_code: null,
    pitcher_control: null,
    pitcher_outs: null,
    pitcher_ip: null,

    pitcher_pu: null,
    pitcher_k: null,
    pitcher_gb: null,
    pitcher_fb: null,
    pitcher_bb: null,
    pitcher_1b: null,
    pitcher_2b: null,
    pitcher_3b: null,
    pitcher_hr: null,

    source_yes_field: null,
    image_url: null,

    ...overrides,
  }
}
