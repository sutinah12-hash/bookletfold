import { loadSource, impose, samplePdf, sheetPlan, papers } from './impose.mjs';
const $ = (id) => document.getElementById(id);
let source = null,
  name = '',
  sheets = [],
  position = 0,
  busy = false;
function message(text) {
  $('notice').hidden = !text;
  $('notice').textContent = text;
}
function options() {
  return {
    paper: $('paper').value,
    binding: $('binding').value,
    maxSheets: Number($('maxSheets').value),
    margin: $('margin').valueAsNumber,
  };
}
function busyState(value) {
  busy = value;
  for (const id of ['choose', 'load-example', 'options']) $(id).disabled = value;
  $('export').disabled = value || !source || !sheets.length;
}
function panels(id, pages) {
  $(id).replaceChildren(
    ...pages.map((n) => {
      const panel = document.createElement('div'),
        number = document.createElement('strong'),
        label = document.createElement('span');
      panel.className = 'panel' + (n === null ? ' blank' : '');
      number.textContent = n ?? 'Blank';
      label.textContent = n === null ? 'Padding' : 'Source page';
      panel.append(number, label);
      return panel;
    })
  );
}
function draw() {
  $('file-name').textContent = name || 'Open a print-ready PDF';
  $('map-body').hidden = !sheets.length;
  $('export').disabled = busy || !sheets.length;
  if (!sheets.length) {
    $('stats').textContent = '';
    $('physical').textContent = '';
    return;
  }
  const sheet = sheets[position];
  const [width, height] = papers[options().paper];
  $('map-body').style.setProperty('--sheet-ratio', String(width / height));
  panels('front', sheet.front);
  panels('back', sheet.back);
  const padding = sheets.length * 4 - source.getPageCount();
  $('stats').textContent =
    source.getPageCount() +
    ' source pages · ' +
    sheets.length +
    ' physical sheet' +
    (sheets.length === 1 ? '' : 's') +
    ' · ' +
    padding +
    ' blank panel' +
    (padding === 1 ? '' : 's');
  $('position').textContent =
    'Sheet ' + (position + 1) + ' / ' + sheets.length + ' · Signature ' + sheet.signature;
  $('prev').disabled = position === 0;
  $('next').disabled = position === sheets.length - 1;
  $('physical').textContent = sheets.length * 2 + ' landscape PDF sides · ' + options().paper;
}
function refresh() {
  position = 0;
  try {
    sheets = source ? sheetPlan(source.getPageCount(), options()) : [];
    message('');
  } catch (error) {
    sheets = [];
    message(error.message);
  }
  draw();
}
async function load(getBytes, label) {
  if (busy) return;
  busyState(true);
  message('Reading PDF…');
  try {
    source = await loadSource(await getBytes());
    name = label;
    refresh();
  } catch (error) {
    source = null;
    name = '';
    sheets = [];
    draw();
    message(error.message);
  } finally {
    busyState(false);
  }
}
$('choose').onclick = () => $('file').click();
$('file').onchange = () => {
  const f = $('file').files[0];
  $('file').value = '';
  if (f) load(() => f.arrayBuffer(), f.name);
};
$('load-example').onclick = () => load(samplePdf, 'Studio notes · example');
$('options').addEventListener('input', refresh);
$('prev').onclick = () => {
  position--;
  draw();
};
$('next').onclick = () => {
  position++;
  draw();
};
$('export').onclick = async () => {
  if (busy || !source || !sheets.length) return;
  busyState(true);
  message('Preparing print PDF…');
  try {
    const bytes = await impose(source, options()),
      url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download =
      (name === 'Studio notes · example' ? 'studio-notes' : name.replace(/\.pdf$/i, '')) +
      '-booklet.pdf';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    message('Booklet prepared. The print settings are below the sheet map.');
  } catch (error) {
    message(error.message);
  } finally {
    busyState(false);
  }
};
window.addEventListener('dragover', (e) => {
  if (e.dataTransfer.types.includes('Files')) e.preventDefault();
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  if (busy) return;
  const files = e.dataTransfer.files;
  if (files.length === 1) load(() => files[0].arrayBuffer(), files[0].name);
  else message('Drop one PDF at a time.');
});
load(samplePdf, 'Studio notes · example');
