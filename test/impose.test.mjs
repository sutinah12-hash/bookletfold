import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, PDFName, degrees } from 'pdf-lib';
import { sheetPlan, geometry, loadSource, impose, samplePdf, papers } from '../src/impose.mjs';

test('eight pages nest into two duplex sheets and right binding mirrors both sides', () => {
  const left = sheetPlan(8);
  assert.deepEqual(
    left.map((s) => [s.front, s.back]),
    [
      [
        [8, 1],
        [2, 7],
      ],
      [
        [6, 3],
        [4, 5],
      ],
    ]
  );
  assert.deepEqual(
    sheetPlan(8, { binding: 'right' }).map((s) => [s.front, s.back]),
    [
      [
        [1, 8],
        [7, 2],
      ],
      [
        [3, 6],
        [5, 4],
      ],
    ]
  );
});
test('each source page occurs once for uneven signatures; blank panels only pad the tail', () => {
  for (let n = 1; n <= 57; n++)
    for (const maxSheets of [0, 1, 2, 4]) {
      const sheets = sheetPlan(n, { maxSheets }),
        all = sheets.flatMap((s) => [...s.front, ...s.back]);
      assert.deepEqual(
        all.filter((x) => x !== null).sort((a, b) => a - b),
        Array.from({ length: n }, (_, i) => i + 1)
      );
      assert.equal(all.length, Math.ceil(n / 4) * 4);
    }
  assert.deepEqual(sheetPlan(9, { maxSheets: 2 }).at(-1), {
    signature: 2,
    depth: 1,
    front: [null, 9],
    back: [null, null],
  });
});
test('crop origins and all four inherited page orientations map inside the visible panel', async () => {
  const doc = await PDFDocument.create(),
    page = doc.addPage([300, 400]);
  page.setCropBox(25, 30, 190, 320);
  for (const angle of [0, 90, 180, 270]) {
    page.setRotation(degrees(angle));
    const g = geometry(page),
      [a, b, c, d, e, f] = g.matrix;
    const points = [
      [25, 30],
      [215, 30],
      [25, 350],
      [215, 350],
    ].map(([x, y]) => [a * x + c * y + e, b * x + d * y + f]);
    assert.equal(Math.min(...points.map((p) => p[0])), 0);
    assert.equal(Math.max(...points.map((p) => p[0])), g.width);
    assert.equal(Math.min(...points.map((p) => p[1])), 0);
    assert.equal(Math.max(...points.map((p) => p[1])), g.height);
  }
});
test('generated PDFs reopen at the chosen physical size, including empty source pages', async () => {
  const input = await loadSource(await samplePdf());
  input.addPage([300, 400]);
  for (const paper of ['A4', 'Letter']) {
    const result = await PDFDocument.load(await impose(input, { paper, maxSheets: 2 }));
    assert.equal(result.getPageCount(), 6);
    for (const page of result.getPages())
      assert.ok(Math.abs(page.getWidth() - papers[paper][0]) < 0.001);
  }
});
test('visible annotations and invalid files fail explicitly', async () => {
  const doc = await PDFDocument.create(),
    page = doc.addPage();
  const annotation = doc.context.register(
    doc.context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [0, 0, 10, 10] })
  );
  page.node.set(PDFName.of('Annots'), doc.context.obj([annotation]));
  await assert.rejects(() => loadSource(new Uint8Array([1])), /read that PDF/);
  const bytes = await doc.save();
  await assert.rejects(() => loadSource(bytes), /Flatten/);
  assert.throws(() => sheetPlan(0));
  assert.throws(() => sheetPlan(8, { margin: 50 }));
});
