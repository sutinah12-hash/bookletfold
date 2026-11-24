import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PDFDocument } from 'pdf-lib';
import { samplePdf } from '../src/impose.mjs';

const run = promisify(execFile);
const cli = fileURLToPath(new URL('../bookletfold.mjs', import.meta.url));

test('CLI exports a Letter booklet and protects existing outputs', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'bookletfold-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const input = join(directory, 'source.pdf');
  const output = join(directory, 'print.pdf');
  await writeFile(input, await samplePdf());
  const args = [cli, input, output, '--paper', 'Letter', '--binding', 'right', '--sheets', '1'];
  await run(process.execPath, args);
  const original = await readFile(output);
  const result = await PDFDocument.load(original);
  assert.equal(result.getPageCount(), 4);
  assert.deepEqual(result.getPage(0).getSize(), { width: 792, height: 612 });
  await assert.rejects(run(process.execPath, args), (error) => /already exists/i.test(error.stderr));
  assert.deepEqual(await readFile(output), original);
});
