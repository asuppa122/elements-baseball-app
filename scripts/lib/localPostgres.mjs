// A throwaway local PostgreSQL server for checks that need a real Postgres:
// a new cluster in a temp folder, a private Unix socket, TCP off, deleted on
// stop. Never connects to Supabase. Needs Homebrew postgresql@17 (or PG_BIN).

import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const BIN = process.env.PG_BIN ?? "/opt/homebrew/opt/postgresql@17/bin";
// Postgres on macOS refuses to start without a valid locale (Homebrew says so too).
const env = { ...process.env, LC_ALL: "en_US.UTF-8" };

/** The gameplay migrations, in the order they were applied to the live project. */
export const GAMEPLAY_MIGRATIONS = [
  "20260818_gameplay_phase1_foundation.sql", "20260818_gameplay_phase1a_private_lab.sql",
  "20260818_gameplay_phase1b_pregame_state.sql", "20260818_gameplay_phase1d_start_state.sql",
  "20260818_gameplay_phase2a_pitch_roll.sql", "20260818_gameplay_build1_core_game.sql",
  "20260826_gameplay_player_rest_state.sql", "20260826_gameplay_rest_tracking_on_completion.sql",
  "20260827_gameplay_away_side_access.sql", "20261029_gameplay_two_player.sql",
  "20261030_gameplay_rest_appearance_fix.sql", "20261031_gameplay_one_active_game.sql",
].map((f) => path.join(import.meta.dirname, "..", "..", "supabase", "migrations", f));

export function startLocalPostgres(port = "54329") {
  // Short on purpose: a Unix socket path must stay under ~100 characters on macOS.
  const dir = fs.mkdtempSync(path.join(os.platform() === "darwin" ? "/tmp" : os.tmpdir(), "epg-"));
  const data = path.join(dir, "data");
  const run = (args, opts = {}) => execFileSync(path.join(BIN, args[0]), args.slice(1), { stdio: "pipe", env, maxBuffer: 64 * 1024 * 1024, ...opts }).toString();
  const psqlArgs = ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-h", dir, "-p", port, "-U", "postgres", "-d", "postgres"];

  const db = {
    dir,
    /** One statement batch on its own connection; returns trimmed output. */
    sql: (text) => run(["psql", ...psqlArgs, "-c", text]).trim(),
    /** A file, with column headers and aligned output (for reading results). */
    file: (f, { pretty = false } = {}) => run(["psql", ...(pretty ? psqlArgs.filter((a) => a !== "-At") : psqlArgs), "-f", f]),
    /** Asynchronously, on its own connection: resolves { ok } or { ok: false, error }. */
    request: (text) => new Promise((resolve) => {
      const p = spawn(path.join(BIN, "psql"), [...psqlArgs, "-c", text], { env });
      let err = "";
      p.stderr.on("data", (d) => { err += d; });
      p.on("close", (code) => resolve(code === 0 ? { ok: true } : { ok: false, error: err.trim() }));
    }),
    log: () => { try { return fs.readFileSync(path.join(dir, "log"), "utf8"); } catch { return ""; } },
    stop: () => {
      try { run(["pg_ctl", "-D", data, "-m", "fast", "-w", "stop"]); } catch { /* not started */ }
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };

  run(["initdb", "-D", data, "-U", "postgres", "-A", "trust", "--no-sync"]);
  run(["pg_ctl", "-D", data, "-l", path.join(dir, "log"), "-w", "-o", `-p ${port} -k ${dir} -c listen_addresses='' -c max_connections=200`, "start"]);
  return db;
}

/** Supabase stand-ins the migrations rely on: roles, auth.uid() from a session setting, profiles. */
export function installSupabaseStandIns(db) {
  db.sql(`create role authenticated nologin; create role anon nologin; create role service_role nologin;
    create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table public.profiles (user_id uuid primary key references auth.users(id), manager_name text not null unique, avatar_url text);
    grant usage on schema public, auth to authenticated; grant execute on function auth.uid() to authenticated;`);
}
