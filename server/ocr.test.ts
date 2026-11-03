import test from 'node:test';
import assert from 'node:assert/strict';
import { extractInvoiceFields } from './ocr.js';

test('extractInvoiceFields correctly extracts seller, invoice number, date, and price from standard retail bill', () => {
  const sampleInvoiceText = `
    TAX INVOICE / CASH MEMO
    Sold By: Croma Electronics Retail Ltd.
    Invoice No: CR-2024-889102
    Invoice Date: 15/09/2024
    
    Description: Apple MacBook Pro 14" M3 Pro 18GB 512GB Space Black
    Quantity: 1
    Total Amount: INR 1,99,900.00
    
    Terms:
    Warranty Period: 12 months comprehensive warranty from date of purchase.
    Authorized Signature
  `;

  const suggestions = extractInvoiceFields(sampleInvoiceText, 92);

  assert.equal(suggestions.seller, 'Croma Electronics Retail Ltd.');
  assert.equal(suggestions.invoice_number, 'CR-2024-889102');
  assert.equal(suggestions.purchase_date, '2024-09-15');
  assert.equal(suggestions.purchase_price, 199900);
  assert.equal(suggestions.currency, 'INR');
  assert.equal(suggestions.brand, 'Apple');
  assert.equal(suggestions.warranty_duration_months, 12);
  assert.equal(suggestions.extracted_fields_count >= 5, true);
});

test('extractInvoiceFields does NOT infer unknown warranty duration if not explicitly printed', () => {
  const invoiceWithoutWarranty = `
    AMAZON RETAIL INDIA PVT LTD
    Order ID: 402-8819201-99210
    Dated: 2024-11-20
    
    Item: Sony WH-1000XM5 Noise Cancelling Headphones
    Grand Total: ₹ 29,990.00
    Payment Method: UPI
  `;

  const suggestions = extractInvoiceFields(invoiceWithoutWarranty, 88);

  assert.equal(suggestions.seller, 'Amazon');
  assert.equal(suggestions.invoice_number, '402-8819201-99210');
  assert.equal(suggestions.purchase_date, '2024-11-20');
  assert.equal(suggestions.purchase_price, 29990);
  assert.equal(suggestions.currency, 'INR');
  assert.equal(suggestions.brand, 'Sony');
  // CRITICAL RULE: Must be undefined when not explicitly stated
  assert.equal(suggestions.warranty_duration_months, undefined);
});

test('extractInvoiceFields handles multi-year warranty format', () => {
  const invoiceWithYears = `
    Dyson Technology India
    Bill No: DYS-INV-7731
    Date of Purchase: 10-Jan-2024
    Product: Dyson V12 Detect Slim Vacuum
    Amount Payable: ₹ 55,900.00
    Warranty Term: 2 years manufacturer coverage
  `;

  const suggestions = extractInvoiceFields(invoiceWithYears, 95);

  assert.equal(suggestions.brand, 'Dyson');
  assert.equal(suggestions.warranty_duration_months, 24); // 2 years = 24 months
  assert.equal(suggestions.purchase_date, '2024-01-10');
  assert.equal(suggestions.purchase_price, 55900);
});
