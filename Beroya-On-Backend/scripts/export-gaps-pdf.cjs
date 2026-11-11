/**
 * Build a readable RTL PDF for BACKEND-GAPS.md
 * Usage: node backend/scripts/export-gaps-pdf.cjs
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const MD = path.join(ROOT, 'docs', 'BACKEND-GAPS.md');
const HTML = path.join(ROOT, 'docs', 'BACKEND-GAPS.html');
const PDF = path.join(ROOT, 'docs', 'BACKEND-GAPS.pdf');

function esc(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function mdToHtml(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  let html = '';
  let i = 0;
  let inUl = false;
  let inOl = false;
  let inTable = false;
  let tableRows = [];

  const closeLists = () => {
    if (inUl) {
      html += '</ul>';
      inUl = false;
    }
    if (inOl) {
      html += '</ol>';
      inOl = false;
    }
  };

  const flushTable = () => {
    if (!inTable) return;
    closeLists();
    html += '<table>';
    tableRows.forEach((row, idx) => {
      const cells = row
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim());
      if (cells.every((c) => /^:?-{3,}:?$/.test(c))) return;
      const tag = idx === 0 ? 'th' : 'td';
      html +=
        '<tr>' +
        cells.map((c) => `<${tag}>${inline(c)}</${tag}>`).join('') +
        '</tr>';
    });
    html += '</table>';
    tableRows = [];
    inTable = false;
  };

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('|')) {
      closeLists();
      inTable = true;
      tableRows.push(line);
      i++;
      continue;
    }
    if (inTable) flushTable();

    if (line.trim() === '---') {
      closeLists();
      html += '<hr/>';
      i++;
      continue;
    }

    if (line.startsWith('> ')) {
      closeLists();
      html += `<blockquote>${inline(line.slice(2))}</blockquote>`;
      i++;
      continue;
    }

    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      closeLists();
      const level = h[1].length;
      const cls = level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3';
      html += `<h${level} class="${cls}">${inline(h[2])}</h${level}>`;
      i++;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      if (inOl) {
        html += '</ol>';
        inOl = false;
      }
      if (!inUl) {
        html += '<ul>';
        inUl = true;
      }
      html += `<li>${inline(line.replace(/^[-*]\s+/, ''))}</li>`;
      i++;
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      if (inUl) {
        html += '</ul>';
        inUl = false;
      }
      if (!inOl) {
        html += '<ol>';
        inOl = true;
      }
      html += `<li>${inline(line.replace(/^\d+\.\s+/, ''))}</li>`;
      i++;
      continue;
    }

    if (line.trim() === '') {
      closeLists();
      i++;
      continue;
    }

    closeLists();
    html += `<p>${inline(line)}</p>`;
    i++;
  }
  flushTable();
  closeLists();
  return html;
}

const body = mdToHtml(fs.readFileSync(MD, 'utf8'));

const doc = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<title>نواقص الباك المتبقية — Beroya Go</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", "Tahoma", "Arial", sans-serif;
    font-size: 11.5pt;
    line-height: 1.65;
    color: #1a1a1a;
    background: #fff;
    direction: rtl;
    text-align: right;
    margin: 0;
    padding: 0;
  }
  .cover {
    border: 2px solid #1F4E79;
    padding: 28px 24px;
    margin-bottom: 28px;
    background: linear-gradient(135deg, #f7fafc 0%, #eef4f9 100%);
  }
  .cover .brand {
    color: #1F4E79;
    font-size: 13pt;
    font-weight: 700;
    letter-spacing: 0.02em;
    margin-bottom: 8px;
  }
  .cover h1 {
    margin: 0 0 8px;
    font-size: 22pt;
    color: #0f2d4a;
    border: none;
    page-break-after: avoid;
  }
  .cover .sub { color: #445; font-size: 11pt; margin: 0; }
  h1.h1 {
    font-size: 18pt;
    color: #0f2d4a;
    border-bottom: 3px solid #1F4E79;
    padding-bottom: 6px;
    margin-top: 28px;
    page-break-after: avoid;
  }
  h2.h2 {
    font-size: 14.5pt;
    color: #1F4E79;
    border-bottom: 1px solid #c5d4e3;
    padding-bottom: 4px;
    margin-top: 22px;
    page-break-after: avoid;
  }
  h3.h3 {
    font-size: 12.5pt;
    color: #163d5c;
    background: #e8f0f7;
    padding: 8px 12px;
    border-right: 4px solid #1F4E79;
    margin-top: 18px;
    page-break-after: avoid;
  }
  p { margin: 8px 0; }
  ul, ol { margin: 6px 0 10px; padding-right: 22px; padding-left: 0; }
  li { margin: 3px 0; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 10px 0 16px;
    font-size: 10.5pt;
    page-break-inside: avoid;
  }
  th, td {
    border: 1px solid #c5d4e3;
    padding: 7px 10px;
    vertical-align: top;
    text-align: right;
  }
  th {
    background: #1F4E79;
    color: #fff;
    font-weight: 600;
  }
  tr:nth-child(even) td { background: #f5f8fb; }
  /* meta tables (2-col key/value): first column as label */
  blockquote {
    margin: 12px 0;
    padding: 10px 14px;
    background: #fff8e8;
    border-right: 4px solid #d4a017;
    color: #333;
  }
  code {
    font-family: Consolas, "Courier New", monospace;
    font-size: 0.92em;
    background: #eef2f6;
    padding: 1px 5px;
    border-radius: 3px;
  }
  strong { color: #0f2d4a; }
  hr {
    border: none;
    border-top: 1px dashed #c5d4e3;
    margin: 20px 0;
  }
  .footer-note {
    margin-top: 32px;
    padding-top: 12px;
    border-top: 2px solid #1F4E79;
    font-size: 9.5pt;
    color: #555;
  }
</style>
</head>
<body>
  <div class="cover">
    <div class="brand">Beroya Go · Backend</div>
    <h1>نواقص الباك المتبقية</h1>
    <p class="sub">السبب · الوضع الحالي · طريقة الحل — وثيقة للإدارة والفريق التقني</p>
    <p class="sub">آخر تحديث: 2026-10-05 · Core V1 مكتمل — البنود أدناه مؤجّلة أو قرارات مفتوحة</p>
  </div>
  ${body}
  <div class="footer-note">
    المصدر: docs/BACKEND-GAPS.md · لا يمنع هذا المستند بدء الفرونت أو الموبايل على العقود الحالية.
  </div>
</body>
</html>`;

fs.writeFileSync(HTML, doc, 'utf8');
console.log('Wrote', HTML);

const edge =
  process.env.EDGE_PATH ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = fs.existsSync(edge) ? edge : chrome;

if (!fs.existsSync(browser)) {
  console.error('No Chrome/Edge found; HTML ready at', HTML);
  process.exit(1);
}

const fileUrl = 'file:///' + HTML.replace(/\\/g, '/');
try {
  if (fs.existsSync(PDF)) fs.unlinkSync(PDF);
} catch (_) {}

execFileSync(
  browser,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-pdf-header-footer',
    `--print-to-pdf=${PDF}`,
    fileUrl,
  ],
  { stdio: 'inherit', timeout: 60000 },
);

if (!fs.existsSync(PDF) || fs.statSync(PDF).size < 1000) {
  console.error('PDF generation failed or too small');
  process.exit(1);
}
console.log('Wrote', PDF, `(${fs.statSync(PDF).size} bytes)`);
