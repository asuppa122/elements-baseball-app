/**
 * A deliberately tiny evaluator for the handful of SQL expressions the
 * rest-tracking migration uses, plus the extraction that pulls them out of the
 * migration file itself.
 *
 * Why this exists: `restTracking.ts` and the SQL body of
 * `save_gameplay_lab_state` implement the same three-step rest sequence
 * independently. The SQL decides what persists; the TypeScript decides what the
 * manager is shown afterwards. Nothing compared them, so either could move
 * alone and they would diverge silently.
 *
 * A parity test can only be worth anything if the SQL side is derived from the
 * actual migration text. Re-implementing the SQL in the test would just be a
 * third copy that agrees with whichever one it was written from. So this reads
 * the file, extracts the real expressions, and evaluates them.
 *
 * The grammar covered is only what those expressions use. Anything else throws,
 * which is the correct failure: if the migration starts using a construct this
 * does not understand, the test fails and a human looks at both sides.
 */

export type SqlValue = number | boolean

type Token = { kind: 'num' | 'ident' | 'op'; text: string }

const KEYWORDS = new Set(['greatest', 'coalesce', 'case', 'when', 'then', 'else', 'end', 'and', 'or', 'not'])

export function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < input.length) {
    const c = input[i]
    if (/\s/.test(c)) { i += 1; continue }
    if (/\d/.test(c)) {
      let j = i
      while (j < input.length && /\d/.test(input[j])) j += 1
      tokens.push({ kind: 'num', text: input.slice(i, j) })
      i = j
      continue
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i
      while (j < input.length && /[A-Za-z0-9_]/.test(input[j])) j += 1
      tokens.push({ kind: 'ident', text: input.slice(i, j).toLowerCase() })
      i = j
      continue
    }
    if ('()+-*%,=<>'.includes(c)) {
      // '<>' is SQL's not-equal and must not tokenize as two comparisons.
      if (c === '<' && input[i + 1] === '>') { tokens.push({ kind: 'op', text: '<>' }); i += 2; continue }
      tokens.push({ kind: 'op', text: c })
      i += 1
      continue
    }
    throw new Error(`Unsupported character in SQL expression: ${JSON.stringify(c)}`)
  }
  return tokens
}

/**
 * Recursive descent over: or > and > not > comparison > additive > unary >
 * primary. Deliberately no operator set beyond what the migration uses.
 */
export function evaluateSql(expression: string, vars: Record<string, SqlValue | null>): SqlValue | null {
  const tokens = tokenize(expression)
  let pos = 0

  const peek = () => tokens[pos]
  const eat = (text: string) => {
    const t = tokens[pos]
    if (!t || t.text !== text) throw new Error(`Expected ${text} but found ${t?.text ?? 'end of expression'}`)
    pos += 1
    return t
  }
  // SQL NULL semantics, kept faithful because the migration relies on them:
  // arithmetic and comparison with NULL yield NULL, coalesce picks the first
  // non-NULL, greatest/least ignore NULLs, and a NULL condition is not true.
  const num = (v: SqlValue | null): number | null => {
    if (v === null) return null
    if (typeof v !== 'number') throw new Error(`Expected a number, got ${typeof v}`)
    return v
  }
  const arith = (a: SqlValue | null, b: SqlValue | null, f: (x: number, y: number) => number): number | null => {
    const x = num(a); const y = num(b)
    return x === null || y === null ? null : f(x, y)
  }

  function parseOr(): SqlValue | null {
    let left = parseAnd()
    while (peek()?.text === 'or') { pos += 1; const right = parseAnd(); left = Boolean(left) || Boolean(right) }
    return left
  }
  function parseAnd(): SqlValue | null {
    let left = parseNot()
    while (peek()?.text === 'and') { pos += 1; const right = parseNot(); left = Boolean(left) && Boolean(right) }
    return left
  }
  function parseNot(): SqlValue | null {
    // `not null` is null in SQL, not true.
    if (peek()?.text === 'not') { pos += 1; const v = parseNot(); return v === null ? null : !v }
    return parseComparison()
  }
  function parseComparison(): SqlValue | null {
    const left = parseAdditive()
    const op = peek()?.text
    if (op === '=' || op === '>' || op === '<' || op === '<>') {
      pos += 1
      const right = parseAdditive()
      if (left === null || right === null) return null
      if (op === '=') return left === right
      if (op === '<>') return left !== right
      const x = num(left) as number; const y = num(right) as number
      return op === '>' ? x > y : x < y
    }
    return left
  }
  function parseAdditive(): SqlValue | null {
    let left = parseMultiplicative()
    for (;;) {
      const op = peek()?.text
      if (op !== '+' && op !== '-') return left
      pos += 1
      const right = parseMultiplicative()
      left = arith(left, right, op === '+' ? (x, y) => x + y : (x, y) => x - y)
    }
  }
  function parseMultiplicative(): SqlValue | null {
    let left = parsePrimary()
    for (;;) {
      const op = peek()?.text
      if (op !== '%' && op !== '*') return left
      pos += 1
      const right = parsePrimary()
      // Postgres % on non-negative integers matches JS %; the inputs here are
      // game counts and cadences, both non-negative.
      left = arith(left, right, op === '%' ? (x, y) => x % y : (x, y) => x * y)
    }
  }
  function parsePrimary(): SqlValue | null {
    const t = peek()
    if (!t) throw new Error('Unexpected end of SQL expression')

    if (t.text === '-') { pos += 1; const v = num(parsePrimary()); return v === null ? null : -v }
    if (t.text === '(') { pos += 1; const v = parseOr(); eat(')'); return v }
    if (t.kind === 'num') { pos += 1; return Number(t.text) }

    if (t.text === 'greatest' || t.text === 'least' || t.text === 'coalesce') {
      pos += 1
      eat('(')
      const args: (SqlValue | null)[] = [parseOr()]
      while (peek()?.text === ',') { pos += 1; args.push(parseOr()) }
      eat(')')
      if (t.text === 'coalesce') {
        const first = args.find((a) => a !== null)
        return first === undefined ? null : first
      }
      const numbers = args.filter((a) => a !== null).map((a) => num(a) as number)
      if (numbers.length === 0) return null
      return t.text === 'greatest' ? Math.max(...numbers) : Math.min(...numbers)
    }

    if (t.text === 'case') {
      pos += 1
      let result: SqlValue | null = null
      let taken = false
      while (peek()?.text === 'when') {
        pos += 1
        const cond = parseOr()
        eat('then')
        const value = parseOr()
        if (!taken && Boolean(cond)) { result = value; taken = true }
      }
      if (peek()?.text === 'else') { pos += 1; const value = parseOr(); if (!taken) { result = value; taken = true } }
      eat('end')
      // No ELSE and no branch taken is SQL NULL, not an error.
      return taken ? result : null
    }

    if (t.kind === 'ident') {
      if (KEYWORDS.has(t.text)) throw new Error(`Unexpected keyword in expression position: ${t.text}`)
      pos += 1
      if (!(t.text in vars)) throw new Error(`SQL expression references unknown variable: ${t.text}`)
      return vars[t.text]
    }

    throw new Error(`Unsupported token in SQL expression: ${t.text}`)
  }

  const value = parseOr()
  if (pos !== tokens.length) throw new Error(`Trailing tokens after expression at ${tokens[pos]?.text}`)
  return value
}

/**
 * Rewrites the migration's jsonb accessors into plain identifiers so the
 * evaluator above never needs to model jsonb. Purely mechanical: if the
 * migration starts using an accessor shape not listed here, the rewrite leaves
 * it alone, the evaluator hits a character it cannot tokenize, and the test
 * fails rather than quietly evaluating something else.
 */
export function normalizeJsonbAccessors(sql: string): string {
  return sql
    .replace(/\(v_milestone->>'gamesPlayed'\)::int/g, 'milestone_gamesplayed')
    .replace(/\(v_milestone->>'bonusRestDays'\)::int/g, 'milestone_bonusrestdays')
}

/** How many times the migration assigns a variable. A variable assigned more
 * than once needs an explicit `searchFrom`, or the extraction silently picks
 * the first -- which is how this test initially read the milestone bonus as
 * its `:= 0` initializer and reported false divergences. */
export function countAssignments(sql: string, name: string): number {
  return sql.split(`${name} :=`).length - 1
}

/** Pulls `name := <expression>;` out of the migration, parens balanced. */
export function extractAssignment(sql: string, name: string, searchFrom = 0): string {
  const start = sql.indexOf(`${name} :=`, searchFrom)
  if (start < 0) throw new Error(`Migration no longer assigns ${name} -- the parity test must be revisited`)
  const from = start + `${name} :=`.length
  let depth = 0
  for (let i = from; i < sql.length; i += 1) {
    const c = sql[i]
    if (c === '(') depth += 1
    else if (c === ')') depth -= 1
    else if (c === ';' && depth === 0) return sql.slice(from, i).trim()
  }
  throw new Error(`Unterminated assignment for ${name}`)
}
