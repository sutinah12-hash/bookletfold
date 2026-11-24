import { PDFDocument, PDFName, PDFDict, StandardFonts, rgb } from 'pdf-lib';

const MM = 72 / 25.4;
export const papers = { A4: [297 * MM, 210 * MM], Letter: [792, 612] };
export const defaultOptions = { paper: 'A4', binding: 'left', maxSheets: 0, margin: 5 };

export function settings(value = {}) {
  const opt = { ...defaultOptions, ...value };
  if (!Object.hasOwn(papers, opt.paper)) throw new Error('Choose A4 or Letter paper.');
  if (!['left', 'right'].includes(opt.binding)) throw new Error('Choose left or right binding.');
  if (!Number.isInteger(opt.maxSheets) || opt.maxSheets < 0 || opt.maxSheets > 32)
    throw new Error('Use 0–32 sheets per signature (0 keeps all sheets together).');
  if (!Number.isFinite(opt.margin) || opt.margin < 0 || opt.margin > 30)
    throw new Error('Choose a panel margin between 0 and 30 mm.');
  return opt;
}

// A signature is one group of nested folded sheets. Each sheet contributes four pages.
export function sheetPlan(count, value = {}) {
  if (!Number.isSafeInteger(count) || count < 1)
    throw new Error('The PDF needs at least one page.');
  const { maxSheets, binding } = settings(value);
  const capacity = maxSheets ? 4 * maxSheets : count;
  const sheets = [];
  let signature = 0;
  for (let start = 0; start < count; start += capacity) {
    signature++;
    const used = Math.min(capacity, count - start),
      padded = Math.ceil(used / 4) * 4;
    const page = (n) => (n <= used ? start + n : null);
    for (let depth = 0; depth < padded / 4; depth++) {
      const high = padded - 2 * depth,
        low = 1 + 2 * depth;
      const front = [page(high), page(low)],
        back = [page(low + 1), page(high - 1)];
      if (binding === 'right') {
        front.reverse();
        back.reverse();
      }
      sheets.push({ signature, depth: depth + 1, front, back });
    }
  }
  return sheets;
}

export function geometry(page) {
  const media = page.getMediaBox(),
    crop = page.getCropBox();
  const left = Math.max(media.x, crop.x),
    bottom = Math.max(media.y, crop.y);
  const right = Math.min(media.x + media.width, crop.x + crop.width),
    top = Math.min(media.y + media.height, crop.y + crop.height);
  const w = right - left,
    h = top - bottom;
  if (!(w > 0 && h > 0)) throw new Error('A source page has an empty crop area.');
  const angle = ((page.getRotation().angle % 360) + 360) % 360;
  const matrices = {
    0: [1, 0, 0, 1, -left, -bottom],
    90: [0, -1, 1, 0, -bottom, right],
    180: [-1, 0, 0, -1, right, top],
    270: [0, 1, -1, 0, top, -left],
  };
  if (!matrices[angle])
    throw new Error('A source page has a rotation other than a multiple of 90 degrees.');
  return {
    box: { left, bottom, right, top },
    matrix: matrices[angle],
    width: angle % 180 ? h : w,
    height: angle % 180 ? w : h,
  };
}

export async function loadSource(bytes) {
  let doc;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (error) {
    if (/encrypt/i.test(error.message)) throw new Error('Open an unlocked copy of the PDF.');
    throw new Error('Could not read that PDF. Try exporting a fresh PDF.');
  }
  if (!doc.getPageCount()) throw new Error('The PDF contains no pages.');
  for (const [index, page] of doc.getPages().entries()) {
    const anns = page.node.Annots();
    for (let i = 0; anns && i < anns.size(); i++) {
      const a = anns.lookup(i);
      if (
        !(a instanceof PDFDict) ||
        a.lookup(PDFName.of('Subtype'))?.toString() !== '/Link' ||
        a.has(PDFName.of('AP'))
      ) {
        throw new Error(
          'Page ' +
            (index + 1) +
            ' has annotations or form fields. Flatten a copy first so their appearance is included.'
        );
      }
    }
    geometry(page);
  }
  return doc;
}

export async function impose(doc, value = {}) {
  const opt = settings(value),
    [width, height] = papers[opt.paper],
    margin = opt.margin * MM;
  const sheets = sheetPlan(doc.getPageCount(), opt),
    output = await PDFDocument.create();
  output.setTitle('Booklet print layout');
  output.setCreator('BookletFold');
  const all = doc.getPages();
  const printable = all
    .map((page, index) => ({ page, number: index + 1, geo: geometry(page) }))
    .filter((item) => item.page.node.Contents());
  const forms = await output.embedPages(
    printable.map((p) => p.page),
    printable.map((p) => p.geo.box),
    printable.map((p) => p.geo.matrix)
  );
  const pages = new Map(
    printable.map((item, i) => [item.number, { geo: item.geo, form: forms[i] }])
  );
  for (const sheet of sheets) {
    for (const side of [sheet.front, sheet.back]) {
      const dst = output.addPage([width, height]);
      side.forEach((number, column) => {
        const source = pages.get(number);
        if (!source) return;
        const { geo, form } = source;
        const scale = Math.min(
          (width / 2 - 2 * margin) / geo.width,
          (height - 2 * margin) / geo.height
        );
        dst.drawPage(form, {
          x: (column * width) / 2 + (width / 2 - geo.width * scale) / 2,
          y: (height - geo.height * scale) / 2,
          xScale: scale,
          yScale: scale,
        });
      });
    }
  }
  return output.save();
}

export async function samplePdf() {
  const pdf = await PDFDocument.create(),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold),
    text = await pdf.embedFont(StandardFonts.Helvetica);
  const entries = [
    ['Studio notes', 'A pocket guide to making a folded booklet.'],
    ['Pick a paper', 'Letter and A4 both fold into a compact page.'],
    ['Leave a margin', 'Keep small type clear of the fold.'],
    ['Mark the top', 'An upright heading makes a good duplex test.'],
    ['Print both sides', 'Choose landscape and short-edge flipping.'],
    ['Nest the sheets', 'Place the inner spread inside the cover.'],
    ['Fold the spine', 'Line up the corners before making the crease.'],
    ['Back cover', 'Your first and last pages share one sheet.'],
  ];
  for (const [i, [title, line]] of entries.entries()) {
    const p = pdf.addPage([300, 420]);
    p.drawRectangle({ x: 0, y: 0, width: 300, height: 420, color: rgb(0.97, 0.95, 0.88) });
    p.drawRectangle({ x: 24, y: 369, width: 252, height: 2, color: rgb(0.45, 0.18, 0.18) });
    p.drawText('BOOKLETFOLD  /  PRINT TEST', {
      x: 24,
      y: 381,
      size: 9,
      font: bold,
      color: rgb(0.45, 0.18, 0.18),
    });
    p.drawText(String(i + 1).padStart(2, '0'), {
      x: 23,
      y: 226,
      size: 82,
      font: bold,
      color: rgb(0.45, 0.18, 0.18),
    });
    p.drawText(title, { x: 24, y: 177, size: 23, font: bold });
    p.drawText(line, { x: 24, y: 143, size: 11, font: text, maxWidth: 250, lineHeight: 16 });
    p.drawText('TOP EDGE ABOVE    /    PAGE ' + (i + 1), { x: 24, y: 22, size: 9, font: text });
  }
  return pdf.save();
}
