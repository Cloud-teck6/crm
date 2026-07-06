/**
 * Dev launcher: ensures a local Postgres is running (embedded, in ../.localdb),
 * applies the schema + seed, then starts the API. When this process is stopped,
 * the DB and API children are torn down too. This ties the DB lifecycle to the
 * server so the app always has a database in the sandbox (no manual PG restarts).
 *
 * Skipped automatically if Postgres is already listening on :5432, or if you
 * point DATABASE_URL at an external DB (then just run `npm run start:dev`).
 */
import { spawn } from 'node:child_process';
import net from 'node:net';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = dirname(fileURLToPath(import.meta.url));
const pgLauncher = join(serverDir, '..', '.localdb', 'pg.cjs');

process.env.DATABASE_URL ??= 'postgresql://crm:crm_dev_password@localhost:5432/crm?schema=public';

const children = [];
function spawnChild(cmd, args, opts = {}) {
  const c = spawn(cmd, args, { stdio: 'inherit', cwd: serverDir, ...opts });
  children.push(c);
  return c;
}
function runAwait(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const c = spawn(cmd, args, { stdio: 'inherit', cwd: serverDir, ...opts });
    c.on('exit', (code) => resolve(code ?? 1));
    c.on('error', () => resolve(1));
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function portOpen(port) {
  return new Promise((res) => {
    const s = net.connect({ port, host: '127.0.0.1' }, () => { s.destroy(); res(true); });
    s.on('error', () => res(false));
    s.setTimeout(800, () => { s.destroy(); res(false); });
  });
}
function cleanup() { for (const c of children) { try { c.kill('SIGTERM'); } catch {} } }
process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });
process.on('exit', cleanup);

(async () => {
  if (await portOpen(5432)) {
    console.log('[dev] Postgres already running on :5432');
  } else if (existsSync(pgLauncher)) {
    console.log('[dev] starting embedded Postgres…');
    spawnChild('node', [pgLauncher]);
    let up = false;
    for (let i = 0; i < 80; i++) { if (await portOpen(5432)) { up = true; break; } await sleep(500); }
    console.log(up ? '[dev] Postgres is up' : '[dev] WARNING: Postgres did not start in time');
  } else {
    console.warn('[dev] no local Postgres launcher found; expecting an external DATABASE_URL');
  }

  // Idempotent schema + seed so login always works (upserts; safe to re-run).
  await runAwait('npx', ['prisma', 'db', 'push', '--skip-generate']);
  await runAwait('npx', ['ts-node', 'prisma/seed.ts']).catch(() => {});

  console.log('[dev] starting API…');
  const api = spawnChild('npx', ['nest', 'start', '--watch']);
  api.on('exit', (code) => { cleanup(); process.exit(code ?? 0); });
})();
