import React, { useState, useEffect, useRef } from 'react';
import { api, Warranty, DocumentItem, OcrSuggestions } from '../api';
import { calculateExpiryDate, getRemainingDays, formatDateDisplay } from '../utils/warranty';
import {
  X,
  Calendar,
  AlertCircle,
  FileScan,
  CheckCircle2,
  UploadCloud,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Shield,
  FileText,
} from 'lucide-react';

interface WarrantyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialWarranty?: Warranty | null;
  prefillDocumentId?: string | null;
  prefillFilename?: string | null;
  initialOcrSuggestions?: OcrSuggestions | null;
}

const CATEGORIES = [
  'Electronics',
  'Computing',
  'Mobile & Tablets',
  'Audio & Wearables',
  'Home Appliances',
  'Kitchen',
  'Gaming',
  'Fitness & Sports',
  'Other',
];

export const WarrantyModal: React.FC<WarrantyModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialWarranty,
  prefillDocumentId,
  prefillFilename,
  initialOcrSuggestions,
}) => {
  const isEditing = Boolean(initialWarranty);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [productName, setProductName] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('Electronics');
  const [modelNumber, setModelNumber] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [durationMonths, setDurationMonths] = useState(12);
  const [purchasePrice, setPurchasePrice] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [seller, setSeller] = useState('');
  const [notes, setNotes] = useState('');
  const [availableDocs, setAvailableDocs] = useState<DocumentItem[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>('');

  // OCR state
  const [isScanningOcr, setIsScanningOcr] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrSuccess, setOcrSuccess] = useState<string | null>(null);
  const [ocrRawText, setOcrRawText] = useState<string | null>(null);
  const [showRawText, setShowRawText] = useState(false);
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);
  const [detectedFields, setDetectedFields] = useState<Record<string, boolean>>({});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calculated live expiry date
  const liveExpiryDate = calculateExpiryDate(purchaseDate, durationMonths);
  const liveDays = purchaseDate ? getRemainingDays(liveExpiryDate) : 0;

  const applyOcrSuggestions = (s: OcrSuggestions, docId?: string, filename?: string) => {
    const detected: Record<string, boolean> = {};

    if (s.product_name) {
      setProductName(s.product_name);
      detected['productName'] = true;
    }
    if (s.brand) {
      setBrand(s.brand);
      detected['brand'] = true;
    }
    if (s.seller) {
      setSeller(s.seller);
      detected['seller'] = true;
    }
    if (s.invoice_number) {
      setModelNumber((prev) => prev || `Inv: ${s.invoice_number}`);
      detected['modelNumber'] = true;
    }
    if (s.purchase_date) {
      setPurchaseDate(s.purchase_date);
      detected['purchaseDate'] = true;
    }
    if (s.purchase_price) {
      setPurchasePrice(String(s.purchase_price));
      detected['purchasePrice'] = true;
    }
    if (s.currency) {
      setCurrency(s.currency);
    }
    // Explicit warranty only
    if (s.warranty_duration_months && s.warranty_duration_months > 0) {
      setDurationMonths(s.warranty_duration_months);
      detected['durationMonths'] = true;
    }

    if (docId) {
      setSelectedDocId(docId);
    }

    setOcrRawText(s.raw_text);
    setOcrConfidence(s.confidence);
    setDetectedFields(detected);
    setOcrSuccess(
      `OCR extracted text (${s.confidence}% confidence). Review suggestions below and adjust as needed.`
    );
  };

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setOcrError(null);
      setOcrSuccess(null);
      setOcrRawText(null);
      setShowRawText(false);
      setDetectedFields({});

      if (initialWarranty) {
        setProductName(initialWarranty.product_name);
        setBrand(initialWarranty.brand || '');
        setCategory(initialWarranty.category || 'Electronics');
        setModelNumber(initialWarranty.model_number || '');
        setSerialNumber(initialWarranty.serial_number || '');
        setPurchaseDate(initialWarranty.purchase_date);
        setDurationMonths(initialWarranty.warranty_duration_months);
        setPurchasePrice(initialWarranty.purchase_price ? String(initialWarranty.purchase_price) : '');
        setCurrency(initialWarranty.currency || 'INR');
        setSeller(initialWarranty.seller || '');
        setNotes(initialWarranty.notes || '');
        setSelectedDocId(initialWarranty.linked_documents?.[0]?.id || '');
      } else {
        // Reset defaults
        setProductName('');
        setBrand('');
        setCategory('Electronics');
        setModelNumber('');
        setSerialNumber('');
        setPurchaseDate(new Date().toISOString().split('T')[0]);
        setDurationMonths(12);
        setPurchasePrice('');
        setCurrency('INR');
        setSeller('');
        setNotes('');
        setSelectedDocId(prefillDocumentId || '');

        if (initialOcrSuggestions) {
          applyOcrSuggestions(initialOcrSuggestions, prefillDocumentId || undefined, prefillFilename || undefined);
        }
      }

      // Fetch user's documents for selection
      api.getDocuments().then((res) => setAvailableDocs(res.documents)).catch(() => {});
    }
  }, [isOpen, initialWarranty, prefillDocumentId, initialOcrSuggestions]);

  if (!isOpen) return null;

  const handleOcrFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setOcrError('File exceeds 10MB limit. Please upload a smaller document.');
      return;
    }

    setIsScanningOcr(true);
    setOcrError(null);
    setOcrSuccess(null);

    try {
      // Process OCR with automatic save to object storage
      const res = await api.processOcr(file, true);
      applyOcrSuggestions(res.suggestions, res.document_id, res.filename);

      // Refresh documents list to include newly uploaded invoice
      api.getDocuments().then((docsRes) => setAvailableDocs(docsRes.documents)).catch(() => {});
    } catch (err: any) {
      setOcrError(err.message || 'OCR processing failed. You can still fill in fields manually.');
    } finally {
      setIsScanningOcr(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!productName.trim()) {
      setError('Product name is required.');
      return;
    }
    if (!purchaseDate) {
      setError('Purchase date is required.');
      return;
    }
    if (durationMonths <= 0) {
      setError('Warranty duration must be at least 1 month.');
      return;
    }

    setLoading(true);
    try {
      if (isEditing && initialWarranty) {
        await api.updateWarranty(initialWarranty.id, {
          product_name: productName.trim(),
          brand: brand.trim() || null,
          category,
          model_number: modelNumber.trim() || null,
          serial_number: serialNumber.trim() || null,
          purchase_date: purchaseDate,
          purchase_price: purchasePrice ? parseFloat(purchasePrice) : null,
          currency,
          warranty_duration_months: durationMonths,
          seller: seller.trim() || null,
          notes: notes.trim() || null,
        });

        // Link document if selected
        if (selectedDocId) {
          await api.linkDocument(selectedDocId, initialWarranty.id);
        }
      } else {
        await api.createWarranty({
          product_name: productName.trim(),
          brand: brand.trim() || undefined,
          category,
          model_number: modelNumber.trim() || undefined,
          serial_number: serialNumber.trim() || undefined,
          purchase_date: purchaseDate,
          purchase_price: purchasePrice ? parseFloat(purchasePrice) : undefined,
          currency,
          warranty_duration_months: durationMonths,
          seller: seller.trim() || undefined,
          notes: notes.trim() || undefined,
          document_id: selectedDocId || undefined,
        });
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save warranty.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <div className="min-w-0 pr-2">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 truncate">
              {isEditing ? 'Edit Warranty' : 'Register New Warranty'}
            </h2>
            <p className="text-xs text-slate-500 truncate">
              Review and confirm product purchase details, invoice documents, and expiry schedule
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md transition-colors shrink-0"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* OCR Trigger Zone (Tesseract.js integration) */}
          {!isEditing && (
            <div className="p-3.5 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileScan className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-bold text-indigo-900">
                    Auto-Fill via Invoice OCR (Tesseract.js)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isScanningOcr}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>{isScanningOcr ? 'Scanning with Tesseract...' : 'Upload & Scan Invoice'}</span>
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleOcrFileSelect}
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  className="hidden"
                />
              </div>

              <p className="text-[11px] text-slate-600 leading-relaxed">
                Upload your PDF or image receipt. Tesseract reads the printed text to suggest product name, retailer, date, amount, and explicit warranty terms. Extracted fields are suggestions for you to review and correct.
              </p>

              {isScanningOcr && (
                <div className="p-2.5 bg-white/80 rounded-lg border border-indigo-100 flex items-center gap-2.5 text-xs text-indigo-700 animate-pulse">
                  <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                  <span>Running OCR engine and extracting invoice data fields...</span>
                </div>
              )}

              {ocrError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{ocrError}</span>
                </div>
              )}

              {ocrSuccess && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{ocrSuccess}</span>
                  </div>
                  {ocrRawText && (
                    <button
                      type="button"
                      onClick={() => setShowRawText(!showRawText)}
                      className="text-indigo-600 hover:text-indigo-800 font-semibold text-[11px] flex items-center gap-0.5 shrink-0"
                    >
                      <span>{showRawText ? 'Hide Raw Text' : 'View Raw OCR'}</span>
                      {showRawText ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                  )}
                </div>
              )}

              {showRawText && ocrRawText && (
                <div className="p-3 bg-slate-900 text-slate-200 rounded-lg text-[11px] font-mono max-h-40 overflow-y-auto whitespace-pre-wrap border border-slate-700">
                  <div className="text-[10px] text-slate-400 mb-1 border-b border-slate-700 pb-1">
                    Raw Extracted Text (Confidence: {ocrConfidence || 80}%)
                  </div>
                  {ocrRawText}
                </div>
              )}
            </div>
          )}

          {/* Product & Brand */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="product_name" className="text-xs font-semibold text-slate-700">
                  Product Name <span className="text-rose-500">*</span>
                </label>
                {detectedFields.productName && (
                  <span className="text-[10px] text-indigo-600 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded">
                    OCR Suggested
                  </span>
                )}
              </div>
              <input
                id="product_name"
                type="text"
                required
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="e.g. MacBook Pro, Sony ANC Headphones"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="brand" className="text-xs font-semibold text-slate-700">
                  Brand / Manufacturer
                </label>
                {detectedFields.brand && (
                  <span className="text-[10px] text-indigo-600 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded">
                    OCR Suggested
                  </span>
                )}
              </div>
              <input
                id="brand"
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="e.g. Apple, Sony, LG, Samsung"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Category & Seller */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="category" className="block text-xs font-semibold text-slate-700 mb-1">
                Category
              </label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="seller" className="text-xs font-semibold text-slate-700">
                  Seller / Retailer
                </label>
                {detectedFields.seller && (
                  <span className="text-[10px] text-indigo-600 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded">
                    OCR Suggested
                  </span>
                )}
              </div>
              <input
                id="seller"
                type="text"
                value={seller}
                onChange={(e) => setSeller(e.target.value)}
                placeholder="e.g. Amazon, Croma, Official Store"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Model & Serial Number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="model_number" className="text-xs font-semibold text-slate-700">
                  Model / Invoice Number
                </label>
                {detectedFields.modelNumber && (
                  <span className="text-[10px] text-indigo-600 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded">
                    OCR Suggested
                  </span>
                )}
              </div>
              <input
                id="model_number"
                type="text"
                value={modelNumber}
                onChange={(e) => setModelNumber(e.target.value)}
                placeholder="e.g. WH-1000XM5, A2779, Inv: #1092"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label htmlFor="serial_number" className="block text-xs font-semibold text-slate-700 mb-1">
                Serial Number
              </label>
              <input
                id="serial_number"
                type="text"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                placeholder="e.g. SN-884920184"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Dates & Warranty Calculation Box */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="purchase_date" className="text-xs font-semibold text-slate-700">
                    Purchase Date <span className="text-rose-500">*</span>
                  </label>
                  {detectedFields.purchaseDate && (
                    <span className="text-[10px] text-indigo-600 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded">
                      OCR Suggested
                    </span>
                  )}
                </div>
                <input
                  id="purchase_date"
                  type="date"
                  required
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="duration_months" className="text-xs font-semibold text-slate-700">
                    Warranty Duration (Months) <span className="text-rose-500">*</span>
                  </label>
                  {detectedFields.durationMonths ? (
                    <span className="text-[10px] text-indigo-600 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded">
                      Printed on Invoice
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400">Select coverage</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    id="duration_months"
                    type="number"
                    min="1"
                    max="120"
                    required
                    value={durationMonths}
                    onChange={(e) => setDurationMonths(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-20 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                  />
                  <div className="flex flex-wrap gap-1">
                    {[6, 12, 24, 36].map((m) => (
                      <button
                        type="button"
                        key={m}
                        onClick={() => setDurationMonths(m)}
                        className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                          durationMonths === m
                            ? 'bg-indigo-600 text-white border-indigo-600 font-medium'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {m}m
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Live Expiry Preview */}
            <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-xs">
              <span className="text-slate-600 font-medium flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                Calculated Expiry Date:
              </span>
              <div className="text-right">
                <span className="font-bold text-slate-900 text-sm">
                  {formatDateDisplay(liveExpiryDate)}
                </span>
                <span className="ml-2 font-normal text-slate-500 tabular-nums">
                  ({liveDays >= 0 ? `${liveDays} days remaining` : `${Math.abs(liveDays)} days ago`})
                </span>
              </div>
            </div>
          </div>

          {/* Price & Currency */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="purchase_price" className="text-xs font-semibold text-slate-700">
                  Purchase Price
                </label>
                {detectedFields.purchasePrice && (
                  <span className="text-[10px] text-indigo-600 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded">
                    OCR Suggested
                  </span>
                )}
              </div>
              <input
                id="purchase_price"
                type="number"
                step="0.01"
                min="0"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                placeholder="e.g. 45000"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label htmlFor="currency" className="block text-xs font-semibold text-slate-700 mb-1">
                Currency
              </label>
              <select
                id="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
              >
                <option value="INR">INR (₹)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>
          </div>

          {/* Linked Invoice Document */}
          <div>
            <label htmlFor="linked_doc" className="block text-xs font-semibold text-slate-700 mb-1">
              Link Invoice Document
            </label>
            {prefillFilename && (
              <p className="text-xs text-indigo-600 mb-1.5 font-medium">
                Attached invoice: {prefillFilename}
              </p>
            )}
            <select
              id="linked_doc"
              value={selectedDocId}
              onChange={(e) => setSelectedDocId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
            >
              <option value="">No invoice linked</option>
              {availableDocs.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.original_filename} ({(doc.file_size / 1024).toFixed(1)} KB)
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="notes" className="block text-xs font-semibold text-slate-700 mb-1">
              Service & Warranty Notes
            </label>
            <textarea
              id="notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Includes doorstep pickup. Warranty void if seal broken."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm disabled:opacity-50"
            >
              {loading ? 'Saving...' : isEditing ? 'Update Warranty' : 'Save Warranty'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
