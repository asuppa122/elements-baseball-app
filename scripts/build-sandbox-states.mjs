#!/usr/bin/env node
/**
 * Build the sandbox's frozen game states from real exported ones.
 *
 * The sandbox (/sandbox) lets someone outside the league play the real
 * gameplay screen with no account and no database. It needs real GameStates to
 * be worth reviewing -- real cards, real stats, real positions -- but nothing
 * in it should carry a league member's identity or anything that points back
 * at live records.
 *
 * This script is the only way those fixtures are produced, so what was removed
 * is reviewable rather than a one-off command someone ran once.
 *
 * WHAT IS REMOVED
 *   managers.<side>.managerName          real manager -> "Visitor" / "Home"
 *   managers.<side>.userId               real auth uid -> a fixed placeholder
 *   pregame.<side>.manager.managerName   same
 *   pregame.<side>.manager.userId        same
 *   pregame.<side>.roster.sourceLineupId points at a live Team Builder row
 *   pregame.<side>.roster.sourceLineupName  a member's private lineup name
 *   gameId                               points at a live games row
 *   pendingDecision.id                   a real id from a real game
 *
 * WHAT IS KEPT
 *   Every card, stat, rating and image key; bases, score, outs, innings,
 *   fatigue and rest state; the full plate appearance and pending decision.
 *   Card playerNames are baseball players on the cards, not league members.
 *
 * USAGE
 *   node scripts/build-sandbox-states.mjs <input-dir> <output-dir>
 *
 * Input files are GameState JSON as exported from the raw-state block on
 * /games/lab/:gameId/state. Output is written as <name>.json.
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { join, basename } from 'node:path'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const MANAGER = { away: 'Visitor', home: 'Home' }
const PLACEHOLDER_UID = { away: 'sandbox-away', home: 'sandbox-home' }
/** Valid UUID shape, obviously synthetic, points at nothing. */
const SYNTHETIC_UUID = '00000000-0000-4000-8000-000000000001'

function anonymise(state, label) {
  const s = structuredClone(state)

  // the game no longer refers to a real row
  s.gameId = `sandbox-${label}`

  for (const side of ['away', 'home']) {
    if (s.managers?.[side]) {
      s.managers[side].managerName = MANAGER[side]
      if ('userId' in s.managers[side]) s.managers[side].userId = PLACEHOLDER_UID[side]
    }
    const pre = s.pregame?.[side]
    if (pre?.manager) {
      pre.manager.managerName = MANAGER[side]
      if ('userId' in pre.manager) pre.manager.userId = PLACEHOLDER_UID[side]
    }
    if (pre?.roster) {
      if ('sourceLineupId' in pre.roster) pre.roster.sourceLineupId = `sandbox-${side}-lineup`
      if ('sourceLineupName' in pre.roster) pre.roster.sourceLineupName = 'Sandbox Roster'
    }
  }

  // pendingDecision.id is engine-generated rather than a row reference, but it
  // is still a real UUID from a real game. Keep the shape, drop the value.
  if (s.pendingDecision?.id) s.pendingDecision.id = SYNTHETIC_UUID

  return s
}

/** Nothing that looks like an account id or a live row may survive. */
function audit(state) {
  const problems = []
  const walk = (node, path) => {
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        const p = path ? `${path}.${k}` : k
        if (typeof v === 'string') {
          if (UUID.test(v) && v !== SYNTHETIC_UUID) problems.push(`${p} is still a UUID`)
          if (/userId$/i.test(k) && !String(v).startsWith('sandbox-')) problems.push(`${p} is not a placeholder`)
          if (/managerName$/i.test(k) && !Object.values(MANAGER).includes(v)) problems.push(`${p} = ${v}`)
        } else walk(v, p)
      }
    } else if (Array.isArray(node)) node.forEach((v, i) => walk(v, `${path}[${i}]`))
  }
  walk(state, '')
  return problems
}

const [, , inDir, outDir] = process.argv
if (!inDir || !outDir) {
  console.error('usage: node scripts/build-sandbox-states.mjs <input-dir> <output-dir>')
  process.exit(1)
}
mkdirSync(outDir, { recursive: true })

let failed = false
for (const file of readdirSync(inDir).filter((f) => f.endsWith('.json'))) {
  const label = basename(file, '.json')
  const clean = anonymise(JSON.parse(readFileSync(join(inDir, file), 'utf8')), label)
  const problems = audit(clean)
  if (problems.length) {
    failed = true
    console.error(`FAIL ${file}`)
    for (const p of problems.slice(0, 10)) console.error(`       ${p}`)
    continue
  }
  const dest = join(outDir, `${label}.json`)
  writeFileSync(dest, JSON.stringify(clean))
  console.log(
    `ok   ${label.padEnd(10)} ${String(Math.round(JSON.stringify(clean).length / 1024)).padStart(3)}KB  ` +
    `${clean.status.padEnd(18)} ${clean.half === 'top' ? 'T' : 'B'}${clean.inning} ` +
    `outs=${clean.outs} score=${clean.score.away}-${clean.score.home} v=${clean.stateVersion}`,
  )
}
process.exit(failed ? 1 : 0)
