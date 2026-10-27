import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, writeFile, readdir, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const project = fileURLToPath(new URL('../', import.meta.url));
const config = path.join(project, 'drizzle.config.ts');

test('migration configuration refuses implicit example tables', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e',
    `await import(${JSON.stringify(new URL('../drizzle.config.ts', import.meta.url).href)})`], {
    cwd: project, env: { ...process.env, DB_SCHEMA_PATH: '' }, encoding: 'utf8',
  });
  assert.notEqual(result.status, 0, 'unconfigured schema must stop migration generation');
  assert.match(result.stderr, /DB_SCHEMA_PATH/);
});

test('explicit application schema generates only its own tables', async t => {
  const work = path.join(project, 'work');
  await mkdir(work, { recursive: true });
  const temporary = await mkdtemp(path.join(work, 'db-migration-test-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const schema = path.join(temporary, 'application.ts');
  await writeFile(schema, `import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const records = sqliteTable('owned_records', { id: text('id').primaryKey() });\n`);
  const result = spawnSync(process.execPath, [path.join(project, 'node_modules/drizzle-kit/bin.cjs'),
    'generate', '--config', config], {
    cwd: temporary, env: { ...process.env, DB_SCHEMA_PATH: schema }, encoding: 'utf8', timeout: 30000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const directory = path.join(temporary, 'drizzle');
  const files = (await readdir(directory)).filter(file => file.endsWith('.sql'));
  assert.equal(files.length, 1);
  const sql = await readFile(path.join(directory, files[0]), 'utf8');
  assert.match(sql, /CREATE TABLE [`"]owned_records[`"] /);
  assert.doesNotMatch(sql, /CREATE TABLE [`"]notes[`"] /);
});
