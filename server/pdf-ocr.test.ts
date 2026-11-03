import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPdfText, rasterizePdf } from './pdf.js';
import { processInvoiceOcr } from './ocr.js';

function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/**
 * Builds a minimal but structurally valid one-page PDF (Helvetica text layer)
 * so the PDF path is tested against a real document rather than a mock.
 */
function buildInvoicePdf(lines: string[]): Buffer {
  const content = [
    'BT',
    '/F1 20 Tf',
    '72 720 Td',
    '28 TL',
    ...lines.map((line, index) => (index === 0 ? `(${escapePdfText(line)}) Tj` : `T* (${escapePdfText(line)}) Tj`)),
    'ET',
  ].join('\n');

  const bodies = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  bodies.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

const INVOICE_LINES = [
  'Croma Electronics',
  'TAX INVOICE',
  'Sold By: Croma Electronics',
  'Invoice No: INV-2026-0042',
  'Invoice Date: 12/08/2026',
  'Product: Sony WH-1000XM5 Headphones',
  'Warranty: 12 months',
  'Total: INR 29990.00',
];

const invoicePdf = buildInvoicePdf(INVOICE_LINES);

test('extractPdfText reads the embedded text layer of a real PDF', async () => {
  const text = await extractPdfText(invoicePdf);
  assert.match(text, /Croma Electronics/);
  assert.match(text, /INV-2026-0042/);
  assert.match(text, /Sony WH-1000XM5/);
});

test('rasterizePdf renders PDF pages to PNG images', async () => {
  const pages = await rasterizePdf(invoicePdf, 1);
  assert.equal(pages.length, 1);
  const png = pages[0];
  assert.ok(png.length > 1000, 'rendered page should have real image data');
  // PNG magic number
  assert.equal(png[0], 0x89);
  assert.equal(png.subarray(1, 4).toString('latin1'), 'PNG');
});

test('processInvoiceOcr reads a PDF text layer and suggests fields without invention', async () => {
  const result = await processInvoiceOcr(invoicePdf, 'application/pdf', 'invoice.pdf');
  assert.equal(result.success, true, result.error);
  const s = result.suggestions!;
  assert.match(s.raw_text, /Croma Electronics/);
  assert.equal(s.purchase_price, 29990);
  assert.equal(s.purchase_date, '2026-08-12');
  assert.equal(s.warranty_duration_months, 12);
  assert.ok((s.extracted_fields_count || 0) >= 4);
});

test('processInvoiceOcr runs Tesseract over a rendered invoice page image', async () => {
  const [pageImage] = await rasterizePdf(invoicePdf, 1);
  const result = await processInvoiceOcr(pageImage, 'image/png', 'invoice.png');
  assert.equal(result.success, true, result.error);
  const suggestions = result.suggestions!;
  assert.ok(suggestions.raw_text.trim().length > 20, 'OCR should return readable text');
  assert.ok((suggestions.extracted_fields_count || 0) >= 2, 'OCR should suggest at least two fields');
});

test('processInvoiceOcr rejects unsupported file types', async () => {
  const result = await processInvoiceOcr(Buffer.from('not an invoice'), 'text/plain', 'notes.txt');
  assert.equal(result.success, false);
  assert.ok(result.error);
});
