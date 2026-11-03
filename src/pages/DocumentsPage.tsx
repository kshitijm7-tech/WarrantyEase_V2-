import React, { useState, useEffect, useRef } from 'react';
import { api, DocumentItem, Warranty } from '../api';
import { formatDateDisplay } from '../utils/warranty';
import { WarrantyModal } from '../components/WarrantyModal';
import {
  UploadCloud,
  FileText,
  Download,
  Trash2,
  Plus,
  Link as LinkIcon,
  CheckCircle2,
  AlertCircle,
  FileCheck,
  Shield,
} from 'lucide-react';

export const DocumentsPage: React.FC = () => {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Download state
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Create warranty from invoice modal
  const [isWarrantyModalOpen, setIsWarrantyModalOpen] = useState(false);
  const [activeDocForWarranty, setActiveDocForWarranty] = useState<DocumentItem | null>(null);

  // Link modal
  const [linkingDoc, setLinkingDoc] = useState<DocumentItem | null>(null);
  const [selectedWarrantyId, setSelectedWarrantyId] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [docsRes, warsRes] = await Promise.all([
        api.getDocuments(),
        api.getWarranties(),
      ]);
      setDocuments(docsRes.documents);
      setWarranties(warsRes.warranties);
    } catch (err: any) {
      setError(err.message || 'Failed to load documents.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side quick check
    if (file.size > 10 * 1024 * 1024) {
      setError('File exceeds 10MB limit. Please select a smaller document.');
      return;
    }

    setUploading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await api.uploadDocument(file);
      setSuccessMessage(`Invoice "${file.name}" uploaded and encrypted in private object storage.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchData();
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      setError(err.message || 'Failed to upload document.');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: DocumentItem) => {
    setDownloadingId(doc.id);
    try {
      const res = await api.getDownloadUrl(doc.id);
      window.open(res.url, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      alert(err.message || 'Failed to generate download URL.');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (doc: DocumentItem) => {
    if (window.confirm(`Delete invoice file "${doc.original_filename}"? This cannot be undone.`)) {
      try {
        await api.deleteDocument(doc.id);
        fetchData();
      } catch (err: any) {
        alert(err.message || 'Failed to delete document.');
      }
    }
  };

  const handleSaveLink = async () => {
    if (!linkingDoc) return;
    try {
      await api.linkDocument(linkingDoc.id, selectedWarrantyId || null);
      setLinkingDoc(null);
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to update warranty link.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Invoice Documents</h1>
          <p className="text-xs text-slate-500 mt-1">
            Store purchase receipts securely in AntiDeploy private S3 storage
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setIsWarrantyModalOpen(true);
            }}
            className="px-3.5 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Scan Invoice with OCR</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <UploadCloud className="w-4 h-4" />
            <span>{uploading ? 'Encrypting & Uploading...' : 'Upload Document'}</span>
          </button>
        </div>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="hidden"
        />
      </div>

      {/* Notifications / Alerts */}
      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Upload Drop Area */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className="bg-white border-2 border-dashed border-slate-300 hover:border-indigo-500 p-8 rounded-xl text-center cursor-pointer transition-colors"
      >
        <UploadCloud className="w-10 h-10 text-indigo-500 mx-auto mb-2" />
        <h3 className="text-sm font-bold text-slate-900">
          Click to upload invoice or receipt
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Supports PDF, JPEG, PNG, and WebP (up to 10MB per file)
        </p>
        <div className="mt-3 inline-flex items-center gap-2 text-[11px] text-slate-600 bg-slate-100 px-3 py-1 rounded-md">
          <Shield className="w-3.5 h-3.5 text-indigo-600" />
          <span>Stored in AntiDeploy private S3 bucket with signed access URLs</span>
        </div>
      </div>

      {/* Documents Grid / Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Stored Documents</h2>
          <span className="text-xs text-slate-500 tabular-nums">
            {documents.length} document{documents.length !== 1 ? 's' : ''} stored
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500 animate-pulse">
            Loading documents from object storage...
          </div>
        ) : documents.length > 0 ? (
          <div>
            {/* Mobile Touch-Friendly Card View (< md) */}
            <div className="md:hidden divide-y divide-slate-100">
              {documents.map((doc) => (
                <div key={doc.id} className="p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900 text-sm break-all">
                        {doc.original_filename}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
                        <span className="tabular-nums">{(doc.file_size / 1024).toFixed(1)} KB</span>
                        <span>·</span>
                        <span className="tabular-nums">{formatDateDisplay(doc.created_at.split('T')[0])}</span>
                      </div>
                      <div className="mt-1.5 text-xs">
                        {doc.product_name ? (
                          <span className="font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded text-[11px]">
                            Linked: {doc.product_name}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">No warranty linked</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions for Mobile */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                    <button
                      onClick={() => handleDownload(doc)}
                      disabled={downloadingId === doc.id}
                      className="flex-1 py-2 px-3 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5 text-indigo-600" />
                      <span>{downloadingId === doc.id ? 'Loading...' : 'Download'}</span>
                    </button>

                    {!doc.warranty_id && (
                      <button
                        onClick={() => {
                          setActiveDocForWarranty(doc);
                          setIsWarrantyModalOpen(true);
                        }}
                        className="py-2 px-3 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Warranty</span>
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setLinkingDoc(doc);
                        setSelectedWarrantyId(doc.warranty_id || '');
                      }}
                      className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                      title="Link or change warranty"
                      aria-label={`Link warranty for ${doc.original_filename}`}
                    >
                      <LinkIcon className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => handleDelete(doc)}
                      className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Delete Document"
                      aria-label={`Delete ${doc.original_filename}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Data Grid (>= md) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="px-6 py-3">Document</th>
                    <th className="px-6 py-3">File Size</th>
                    <th className="px-6 py-3">Upload Date</th>
                    <th className="px-6 py-3">Linked Warranty</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {documents.map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 truncate">
                              {doc.original_filename}
                            </p>
                            <p className="text-[11px] text-slate-400 truncate">
                              {doc.mime_type}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-3.5 text-slate-600 tabular-nums">
                        {(doc.file_size / 1024).toFixed(1)} KB
                      </td>

                      <td className="px-6 py-3.5 text-slate-600 tabular-nums">
                        {formatDateDisplay(doc.created_at.split('T')[0])}
                      </td>

                      <td className="px-6 py-3.5">
                        {doc.product_name ? (
                          <span className="font-medium text-slate-900">
                            {doc.product_name}
                          </span>
                        ) : (
                          <span className="text-slate-400">Unlinked</span>
                        )}
                      </td>

                      <td className="px-6 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleDownload(doc)}
                            disabled={downloadingId === doc.id}
                            className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors flex items-center gap-1"
                            title="Download Invoice"
                          >
                            <Download className="w-3.5 h-3.5 text-indigo-600" />
                            <span>{downloadingId === doc.id ? 'Loading...' : 'Download'}</span>
                          </button>

                          {!doc.warranty_id && (
                            <button
                              onClick={() => {
                                setActiveDocForWarranty(doc);
                                setIsWarrantyModalOpen(true);
                              }}
                              className="px-2.5 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors flex items-center gap-1"
                              title="Register a warranty linked to this invoice"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Create Warranty</span>
                            </button>
                          )}

                          <button
                            onClick={() => {
                              setLinkingDoc(doc);
                              setSelectedWarrantyId(doc.warranty_id || '');
                            }}
                            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md transition-colors"
                            title="Link or change warranty"
                            aria-label={`Link warranty for ${doc.original_filename}`}
                          >
                            <LinkIcon className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleDelete(doc)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md transition-colors"
                            title="Delete Document"
                            aria-label={`Delete ${doc.original_filename}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="p-12 text-center">
            <FileCheck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-slate-800">No documents stored</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Upload your electronics or appliance purchase bills to safeguard proof of warranty claims.
            </p>
          </div>
        )}
      </div>

      {/* Link Warranty Modal */}
      {linkingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Link Invoice to Warranty
            </h3>
            <p className="text-xs text-slate-500">
              Select which registered product matches "{linkingDoc.original_filename}":
            </p>

            <select
              value={selectedWarrantyId}
              onChange={(e) => setSelectedWarrantyId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="">-- No warranty linked --</option>
              {warranties.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.product_name} ({w.brand || 'No brand'}) - Exp: {formatDateDisplay(w.expiry_date)}
                </option>
              ))}
            </select>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setLinkingDoc(null)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveLink}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
              >
                Save Link
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Warranty Modal for "Create Warranty from This Invoice" */}
      <WarrantyModal
        isOpen={isWarrantyModalOpen}
        onClose={() => {
          setIsWarrantyModalOpen(false);
          setActiveDocForWarranty(null);
        }}
        onSuccess={fetchData}
        prefillDocumentId={activeDocForWarranty?.id}
        prefillFilename={activeDocForWarranty?.original_filename}
      />
    </div>
  );
};
