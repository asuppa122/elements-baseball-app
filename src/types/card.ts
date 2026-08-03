export type CardRow = {
  card_key: string
  all_number: number | null
  card_number: number | null
  icon: string | null
  player_name: string
  league: string | null
  team_name: string | null
  ownership: string | null

  hitter_bats: string | null
  hitter_fatigue: number | null
  hitter_year: number | null
  hitter_team_code: string | null
  hitter_on_base: number | null
  hitter_outs: number | null
  hitter_baserunning: number | null
  hitter_stolen_base: number | null

  defense_c: number | null
  defense_1b: number | null
  defense_2b: number | null
  defense_3b: number | null
  defense_ss: number | null
  defense_lf: number | null
  defense_cf: number | null
  defense_rf: number | null

  hitter_pu: string | null
  hitter_k: string | null
  hitter_gb: string | null
  hitter_fb: string | null
  hitter_bb: string | null
  hitter_1b: string | null
  hitter_1b_plus: string | null
  hitter_2b: string | null
  hitter_3b: string | null
  hitter_hr: string | null
  hitter_points: number | null

  pitcher_arm: string | null
  pitcher_fatigue: number | null
  pitcher_year: number | null
  pitcher_team_code: string | null
  pitcher_control: number | null
  pitcher_outs: number | null
  pitcher_ip: number | null

  pitcher_pu: string | null
  pitcher_k: string | null
  pitcher_gb: string | null
  pitcher_fb: string | null
  pitcher_bb: string | null
  pitcher_1b: string | null
  pitcher_2b: string | null
  pitcher_3b: string | null
  pitcher_hr: string | null

  source_yes_field: string | number | null
  source_row: number | null
  source_hash: string | null
  first_synced_at: string | null
  last_synced_at: string | null
}

export type CardImageRow = {
  card_key: string
  image_url: string | null
}

export type CardRecord = CardRow & {
  image_url: string | null
}

export const CARD_COLUMNS = `
  card_key,
  all_number,
  card_number,
  icon,
  player_name,
  league,
  team_name,
  ownership,
  hitter_bats,
  hitter_fatigue,
  hitter_year,
  hitter_team_code,
  hitter_on_base,
  hitter_outs,
  hitter_baserunning,
  hitter_stolen_base,
  defense_c,
  defense_1b,
  defense_2b,
  defense_3b,
  defense_ss,
  defense_lf,
  defense_cf,
  defense_rf,
  hitter_pu,
  hitter_k,
  hitter_gb,
  hitter_fb,
  hitter_bb,
  hitter_1b,
  hitter_1b_plus,
  hitter_2b,
  hitter_3b,
  hitter_hr,
  hitter_points,
  pitcher_arm,
  pitcher_fatigue,
  pitcher_year,
  pitcher_team_code,
  pitcher_control,
  pitcher_outs,
  pitcher_ip,
  pitcher_pu,
  pitcher_k,
  pitcher_gb,
  pitcher_fb,
  pitcher_bb,
  pitcher_1b,
  pitcher_2b,
  pitcher_3b,
  pitcher_hr,
  source_yes_field,
  source_row,
  source_hash,
  first_synced_at,
  last_synced_at
`