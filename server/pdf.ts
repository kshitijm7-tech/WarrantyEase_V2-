import { PDFParse } from 'pdf-parse';

/** Bounded OCR work: page count and pixel size are capped to protect memory/time. */
export const PDF_MAX_PAGES = 3;
export const OCR_TIMEOUT_MS = 90_000;
const MAX_RENDER_DIMENSION = 2000;

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<T>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s.`)), ms);
    if (typeof timer.unref === 'function') timer.unref();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Reads the embedded text layer of a PDF. Returns '' for scanned/image-only PDFs,
 * which is the signal to fall back to rasterizing the pages and running Tesseract.
 */
export async function extractPdfText(buffer: Buffer, maxPages: number = PDF_MAX_PAGES): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = (await parser.getText()) as { text?: string };
    const text = typeof result?.text === 'string' ? result.text : '';
    if (!text.trim()) return '';
    // Cap the text so a pathological PDF cannot flood the parser or the response.
    return text.slice(0, 20_000);
  } finally {
    try {
      await parser.destroy();
    } catch {
      /* destroying a failed parser is best effort */
    }
  }
}

/**
 * Renders PDF pages to PNG buffers with pdfjs + @napi-rs/canvas (both already
 * present via pdf-parse). Tesseract can only read images, so a scanned PDF must
 * go through this step before OCR.
 */
export async function rasterizePdf(buffer: Buffer, maxPages: number = PDF_MAX_PAGES): Promise<Buffer[]> {
  const canvasModule = await import('@napi-rs/canvas');
  const globalScope = globalThis as unknown as Record<string, unknown>;
  globalScope.DOMMatrix ??= canvasModule.DOMMatrix;
  globalScope.ImageData ??= canvasModule.ImageData;
  globalScope.Path2D ??= canvasModule.Path2D;

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

  const pageCount = Math.min(doc.numPages, maxPages);
  const images: Buffer[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      try {
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(2, MAX_RENDER_DIMENSION / Math.max(base.width, base.height));
        const viewport = page.getViewport({ scale });
        const canvas = canvasModule.createCanvas(
          Math.ceil(viewport.width),
          Math.ceil(viewport.height)
        );
        const context = canvas.getContext('2d');
        await page.render({ canvasContext: context, viewport, canvas } as never).promise;
        images.push(await canvas.encode('png'));
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await doc.destroy();
  }

  return images;
}
