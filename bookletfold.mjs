#!/usr/bin/env node
import { open, readFile, unlink } from 'node:fs/promises';
import { loadSource, impose, defaultOptions } from './src/impose.mjs';

const help =
  'node bookletfold.mjs INPUT.pdf OUTPUT.pdf [--paper A4|Letter] [--binding left|right] [--sheets 0-32] [--margin 0-30]';
async function main(args) {
  if (args.length === 1 && args[0] === '--help') {
    console.log(help);
    return;
  }
  if (args.length < 2 || args.length % 2) throw new Error(help);
  const [input, output, ...flags] = args,
    options = { ...defaultOptions };
  for (let i = 0; i < flags.length; i += 2) {
    const flag = flags[i],
      v = flags[i + 1];
    if (flag === '--paper') options.paper = v;
    else if (flag === '--binding') options.binding = v;
    else if (flag === '--sheets') options.maxSheets = Number(v);
    else if (flag === '--margin') options.margin = Number(v);
    else throw new Error(help);
  }
  const doc = await loadSource(await readFile(input));
  const bytes = await impose(doc, options);
  const file = await open(output, 'wx');
  try {
    await file.writeFile(bytes);
  } catch (error) {
    await file.close();
    await unlink(output);
    throw error;
  }
  await file.close();
  console.log('Saved ' + output + ' from ' + doc.getPageCount() + ' source pages.');
}
try {
  await main(process.argv.slice(2));
} catch (error) {
  console.error(
    error.code === 'EEXIST' ? 'Output already exists. Choose a new file name.' : error.message
  );
  process.exitCode = 1;
}
