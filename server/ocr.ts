import { createWorker } from 'tesseract.js';
import {
  extractPdfText,
  rasterizePdf,
  withTimeout,
  OCR_TIMEOUT_MS,
  PDF_MAX_PAGES,
} from './pdf.js';

export interface OcrSuggestion {
  product_name?: string;
  brand?: string;
  invoice_number?: string;
  seller?: string;
  purchase_date?: string;
  purchase_price?: number;
  currency?: string;
  warranty_duration_months?: number;
  raw_text: string;
  confidence: number;
  extracted_fields_count: number;
}

export interface OcrResult {
  success: boolean;
  message?: string;
  suggestions?: OcrSuggestion;
  error?: string;
}

/**
 * Parses raw text extracted from an invoice to suggest warranty & purchase fields.
 * Strictly adheres to rule: Treat extracted fields as suggestions, not guaranteed facts.
 * Never infers an unknown warranty duration.
 */
export function extractInvoiceFields(rawText: string, confidence: number = 80): OcrSuggestion {
  const cleanText = rawText.replace(/\r\n/g, '\n');
  const lines = cleanText.split('\n').map((l) => l.trim()).filter(Boolean);

  let productName: string | undefined;
  let brand: string | undefined;
  let invoiceNumber: string | undefined;
  let seller: string | undefined;
  let purchaseDate: string | undefined;
  let purchasePrice: number | undefined;
  let currency: string = 'INR';
  let warrantyMonths: number | undefined;

  // 1. Identify Seller / Retailer
  const sellerMatch = cleanText.match(
    /(?:Sold By|Merchant|Vendor|Retailer|Store|Billed By|Seller|From)[:\s]+([^\n,]+)/i
  );
  if (sellerMatch && sellerMatch[1]) {
    seller = sellerMatch[1].trim();
  } else {
    // Check for well-known retailer names in the first 10 lines
    const topLines = lines.slice(0, 10).join(' ');
    if (/amazon/i.test(topLines)) seller = 'Amazon';
    else if (/croma/i.test(topLines)) seller = 'Croma Electronics';
    else if (/reliance\s*digital/i.test(topLines)) seller = 'Reliance Digital';
    else if (/apple\s*store|apple\s*india/i.test(topLines)) seller = 'Apple Store';
    else if (/flipkart/i.test(topLines)) seller = 'Flipkart';
    else if (/best\s*buy/i.test(topLines)) seller = 'Best Buy';
    else if (/samsung\s*smart\s*cafe|samsung\s*india/i.test(topLines)) seller = 'Samsung Store';
    else if (lines.length > 0 && lines[0].length < 40 && !/invoice|bill|tax/i.test(lines[0])) {
      seller = lines[0];
    }
  }

  // 2. Identify Invoice / Order Number
  const invMatch = cleanText.match(
    /(?:Invoice\s*No\.?|Invoice\s*Number|Inv\s*#|Order\s*ID|Order\s*No\.?|Bill\s*No\.?|Receipt\s*#)[:\s]*([A-Z0-9\-_/]{4,35})/i
  );
  if (invMatch && invMatch[1]) {
    invoiceNumber = invMatch[1].trim();
  }

  // 3. Identify Purchase Date
  // Formats: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD Month YYYY, Month DD, YYYY
  const dateLabelMatch = cleanText.match(
    /(?:Invoice\s*Date|Order\s*Date|Date\s*of\s*Purchase|Purchase\s*Date|Bill\s*Date|Dated)[:\s]*([0-9]{1,2}[\s\-]+[A-Za-z]{3,9}[\s\-]+[0-9]{4}|[0-9]{1,4}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{1,4}|[A-Za-z]{3,9}[\s\-]+[0-9]{1,2},?[\s\-]+[0-9]{4})/i
  );

  const rawDateString = dateLabelMatch ? dateLabelMatch[1] : null;
  if (rawDateString) {
    purchaseDate = normalizeDate(rawDateString);
  } else {
    // Search general text for a standard date pattern
    const generalDateMatch = cleanText.match(
      /\b([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4}|[0-9]{4}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{1,2})\b/
    );
    if (generalDateMatch) {
      purchaseDate = normalizeDate(generalDateMatch[1]);
    }
  }

  // 4. Identify Purchase Price and Currency
  const totalMatch = cleanText.match(
    /(?:Grand\s*Total|Invoice\s*Total|Total\s*Amount|Net\s*Amount|Amount\s*Payable|Total)[:\s]*([₹$€£]|INR|USD|EUR|GBP)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i
  );
  if (totalMatch) {
    const rawSymbol = totalMatch[1] || '';
    const rawNum = totalMatch[2].replace(/[,\s]/g, '');
    const parsedPrice = parseFloat(rawNum);
    if (!isNaN(parsedPrice) && parsedPrice > 0) {
      purchasePrice = parsedPrice;
      if (rawSymbol.includes('$') || /USD/i.test(rawSymbol)) currency = 'USD';
      else if (rawSymbol.includes('€') || /EUR/i.test(rawSymbol)) currency = 'EUR';
      else if (rawSymbol.includes('£') || /GBP/i.test(rawSymbol)) currency = 'GBP';
      else currency = 'INR';
    }
  }

  // 5. Identify Brand
  const knownBrands = [
    'Apple',
    'Samsung',
    'Sony',
    'Dell',
    'HP',
    'Lenovo',
    'Asus',
    'LG',
    'Dyson',
    'Bose',
    'OnePlus',
    'Xiaomi',
    'Logitech',
    'Boat',
    'JBL',
    'Whirlpool',
    'Bosch',
  ];
  for (const b of knownBrands) {
    const brandRegex = new RegExp(`\\b${b}\\b`, 'i');
    if (brandRegex.test(cleanText)) {
      brand = b;
      break;
    }
  }

  // 6. Identify Product Name
  const productMatch = cleanText.match(
    /(?:Description|Item\s*Description|Product|Model\s*Name|Item)[:\s]+([^\n]{4,80})/i
  );
  if (productMatch && productMatch[1]) {
    productName = productMatch[1].trim();
  } else if (brand) {
    // Find line mentioning the brand
    for (const l of lines) {
      if (
        l.toLowerCase().includes(brand.toLowerCase()) &&
        l.length > 5 &&
        l.length < 90 &&
        !/invoice|tax|authorized|dealer|signature/i.test(l)
      ) {
        productName = l;
        break;
      }
    }
  }

  // 7. Identify Explicitly Printed Warranty Duration ONLY
  // Do NOT infer or guess warranty duration if not explicitly stated
  const warrantyRegex =
    /(?:Warranty|Guarantee)\s*(?:Period|Coverage|Term)?[:\s]*([0-9]+)\s*(month|months|year|years|yr|yrs|mo)/i;
  const warrantyMatch = cleanText.match(warrantyRegex);
  if (warrantyMatch) {
    const num = parseInt(warrantyMatch[1], 10);
    const unit = warrantyMatch[2].toLowerCase();
    if (!isNaN(num) && num > 0) {
      if (unit.startsWith('y')) {
        warrantyMonths = num * 12;
      } else {
        warrantyMonths = num;
      }
    }
  }

  let fieldCount = 0;
  if (productName) fieldCount++;
  if (brand) fieldCount++;
  if (invoiceNumber) fieldCount++;
  if (seller) fieldCount++;
  if (purchaseDate) fieldCount++;
  if (purchasePrice) fieldCount++;
  if (warrantyMonths) fieldCount++;

  return {
    product_name: productName,
    brand,
    invoice_number: invoiceNumber,
    seller,
    purchase_date: purchaseDate,
    purchase_price: purchasePrice,
    currency,
    warranty_duration_months: warrantyMonths,
    raw_text: rawText.slice(0, 4000), // capped
    confidence: Math.round(confidence),
    extracted_fields_count: fieldCount,
  };
}

/**
 * Normalizes varied date strings (e.g., "15/09/2024", "15-Sep-2024", "2024-09-15") into standard ISO YYYY-MM-DD.
 */
function normalizeDate(dateStr: string): string | undefined {
  try {
    const cleaned = dateStr.trim();

    // Case 1: YYYY-MM-DD
    if (/^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}$/.test(cleaned)) {
      const [y, m, d] = cleaned.split('-');
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    // Case 2: DD/MM/YYYY or DD-MM-YYYY (all numeric)
    if (/^[0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{4}$/.test(cleaned)) {
      const parts = cleaned.split(/[\/\-\.]/);
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }

    // Case 3: DD-Mon-YYYY or DD Month YYYY (e.g. 10-Jan-2024, 15 September 2024)
    const monthNames: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };
    const namedMatch = cleaned.match(/^([0-9]{1,2})[\s\-]+([A-Za-z]{3,9})[\s\-]+([0-9]{4})$/);
    if (namedMatch) {
      const day = namedMatch[1].padStart(2, '0');
      const monPrefix = namedMatch[2].slice(0, 3).toLowerCase();
      const month = monthNames[monPrefix];
      const year = namedMatch[3];
      if (month) return `${year}-${month}-${day}`;
    }

    // Case 4: General Date parse
    const parsed = new Date(cleaned.replace(/-/g, ' '));
    if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 2000 && parsed.getFullYear() < 2050) {
      return parsed.toISOString().split('T')[0];
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * Processes an invoice file buffer (PDF or Image) and extracts text + field suggestions.
 */
export async function processInvoiceOcr(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<OcrResult> {
  // Safety checks: File size limit 10MB
  if (buffer.length > 10 * 1024 * 1024) {
    return {
      success: false,
      error: 'File size exceeds 10MB limit. Please upload a smaller invoice document.',
    };
  }

  let rawText = '';
  let confidence = 85;

  try {
    if (mimeType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')) {
      // 1. Digital PDF extraction: read the embedded text layer when there is one
      try {
        rawText = await withTimeout(extractPdfText(buffer, PDF_MAX_PAGES), 30_000, 'PDF text extraction');
      } catch (pdfErr: any) {
        console.warn('[OCR] PDF text stream extraction failed:', pdfErr?.message);
      }

      // If PDF has readable text stream, parse it
      if (rawText.trim().length > 30) {
        const suggestions = extractInvoiceFields(rawText, 95);
        return {
          success: true,
          suggestions,
        };
      } else {
        // 2. Scanned/image-only PDF: render the pages and read them with Tesseract
        try {
          const pages = await withTimeout(rasterizePdf(buffer, PDF_MAX_PAGES), 45_000, 'PDF page rendering');
          if (pages.length > 0) {
            const worker = await createWorker('eng');
            try {
              const pageTexts: string[] = [];
              let confidenceSum = 0;
              for (const pageImage of pages) {
                const result = await withTimeout(worker.recognize(pageImage), OCR_TIMEOUT_MS, 'OCR');
                pageTexts.push(result.data.text || '');
                confidenceSum += result.data.confidence || 0;
              }
              rawText = pageTexts.join('\n');
              confidence = Math.round(confidenceSum / pages.length);
            } finally {
              await worker.terminate();
            }

            if (rawText.trim().length > 0) {
              const suggestions = extractInvoiceFields(rawText, confidence);
              return { success: true, suggestions };
            }
          }
        } catch (rasterErr: any) {
          console.warn('[OCR] Scanned-PDF rasterization/OCR failed:', rasterErr?.message);
        }

        return {
          success: false,
          error:
            'Could not read any text from this PDF. It has no text layer, and rendering its pages produced no readable text. Upload a clearer scan (PNG/JPEG) of the invoice.',
        };
      }
    } else if (
      mimeType.startsWith('image/') ||
      /\.(png|jpe?g|webp|bmp|tiff)$/i.test(filename)
    ) {
      // 2. Image OCR via Tesseract.js
      const worker = await createWorker('eng');
      try {
        const ret = await worker.recognize(buffer);
        rawText = ret.data.text || '';
        confidence = ret.data.confidence || 75;
      } finally {
        await worker.terminate();
      }

      if (!rawText.trim()) {
        return {
          success: false,
          error:
            'OCR could not detect any readable printed text on this invoice image. Please verify image clarity and contrast.',
        };
      }

      const suggestions = extractInvoiceFields(rawText, confidence);
      return {
        success: true,
        suggestions,
      };
    } else {
      return {
        success: false,
        error: `Unsupported file type "${mimeType}". Please upload a PDF, JPEG, or PNG invoice.`,
      };
    }
  } catch (err: any) {
    console.error('[OCR] Processing error:', err);
    return {
      success: false,
      error: err.message || 'Failed to process document with OCR engine.',
    };
  }
}
