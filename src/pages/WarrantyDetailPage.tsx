import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api, Warranty } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { WarrantyModal } from '../components/WarrantyModal';
import { formatDateDisplay, formatCurrency } from '../utils/warranty';
import {
  ArrowLeft,
  Calendar,
  FileText,
  Download,
  Edit2,
  Trash2,
  Tag,
  Store,
  Hash,
  Clock,
  Shield,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';

export const WarrantyDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [warranty, setWarranty] = useState<Warranty | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);

  const fetchWarranty = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getWarranty(id);
      setWarranty(res.warranty);
    } catch (err: any) {
      setError(err.message || 'Failed to load warranty details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWarranty();
  }, [id]);

  const handleDelete = async () => {
    if (!warranty) return;
    if (window.confirm(`Delete warranty for "${warranty.product_name}"?`)) {
      try {
        await api.deleteWarranty(warranty.id);
        navigate('/warranties');
      } catch (err: any) {
        alert(err.message || 'Failed to delete warranty.');
      }
    }
  };

  const handleDownloadInvoice = async (docId: string) => {
    setDownloadingDocId(docId);
    try {
      const res = await api.getDownloadUrl(docId);
      // Open in new tab or trigger download
      window.open(res.url, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      alert(err.message || 'Failed to generate download URL.');
    } finally {
      setDownloadingDocId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-xs text-slate-500 animate-pulse">
        Loading warranty details from database...
      </div>
    );
  }

  if (error || !warranty) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center max-w-lg mx-auto">
        <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-3" />
        <h2 className="text-base font-bold text-slate-900">Warranty Not Found</h2>
        <p className="text-xs text-slate-500 mt-1">{error || 'This record does not exist or has been removed.'}</p>
        <Link
          to="/warranties"
          className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to Warranties</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Top Bar with Back and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <Link
          to="/warranties"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Warranties</span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsEditModalOpen(true)}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs"
          >
            <Edit2 className="w-3.5 h-3.5" />
            <span>Edit</span>
          </button>
          <button
            onClick={handleDelete}
            className="px-3.5 py-2 text-xs font-semibold text-rose-700 bg-white hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>
        </div>
      </div>

      {/* Main Detail Card */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
        {/* Header Strip */}
        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">{warranty.product_name}</h1>
              <StatusBadge status={warranty.status} remainingDays={warranty.remaining_days} />
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {warranty.brand ? `${warranty.brand} · ` : ''}
              {warranty.category || 'General Product'}
              {warranty.model_number ? ` · Model: ${warranty.model_number}` : ''}
            </p>
          </div>

          <div className="text-right">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              Purchase Price
            </span>
            <span className="text-lg font-bold text-slate-900 tabular-nums">
              {formatCurrency(warranty.purchase_price, warranty.currency)}
            </span>
          </div>
        </div>

        {/* Specs Grid */}
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 border-b border-slate-100">
          <div>
            <span className="text-xs font-medium text-slate-500 block mb-1">Purchase Date</span>
            <span className="text-sm font-semibold text-slate-900 tabular-nums flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-600" />
              {formatDateDisplay(warranty.purchase_date)}
            </span>
          </div>

          <div>
            <span className="text-xs font-medium text-slate-500 block mb-1">Warranty Term</span>
            <span className="text-sm font-semibold text-slate-900 tabular-nums flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-indigo-600" />
              {warranty.warranty_duration_months} Months
            </span>
          </div>

          <div>
            <span className="text-xs font-medium text-slate-500 block mb-1">Expiry Date</span>
            <span className="text-sm font-semibold text-slate-900 tabular-nums flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-indigo-600" />
              {formatDateDisplay(warranty.expiry_date)}
            </span>
          </div>

          <div>
            <span className="text-xs font-medium text-slate-500 block mb-1">Remaining Time</span>
            <span className="text-sm font-bold text-indigo-700 tabular-nums">
              {warranty.remaining_days >= 0 ? `${warranty.remaining_days} days` : 'Coverage Ended'}
            </span>
          </div>
        </div>

        {/* Secondary Specs: Seller, Serial Number, Notes */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 border-b border-slate-100">
          <div className="space-y-3">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                Retailer / Store
              </span>
              <p className="text-sm text-slate-800 flex items-center gap-1.5">
                <Store className="w-4 h-4 text-slate-400" />
                <span>{warranty.seller || 'Not specified'}</span>
              </p>
            </div>

            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                Serial Number
              </span>
              <p className="text-sm font-mono text-slate-800 flex items-center gap-1.5">
                <Hash className="w-4 h-4 text-slate-400" />
                <span>{warranty.serial_number || 'Not recorded'}</span>
              </p>
            </div>
          </div>

          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
              Warranty & Service Notes
            </span>
            <div className="p-3 bg-slate-50 rounded-lg text-xs text-slate-700 whitespace-pre-wrap leading-relaxed border border-slate-200/80">
              {warranty.notes || 'No specific terms or claim instructions noted for this product.'}
            </div>
          </div>
        </div>

        {/* Linked Invoices Section */}
        <div className="p-6 bg-slate-50/50">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-indigo-600" />
                <span>Linked Invoice Documents</span>
              </h2>
              <p className="text-xs text-slate-500">
                Backed by AntiDeploy private S3 storage
              </p>
            </div>
            <Link
              to="/documents"
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
            >
              Manage Documents
            </Link>
          </div>

          {warranty.linked_documents && warranty.linked_documents.length > 0 ? (
            <div className="space-y-2">
              {warranty.linked_documents.map((doc) => (
                <div
                  key={doc.id}
                  className="bg-white border border-slate-200 p-3.5 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-900 break-all sm:truncate">
                        {doc.original_filename}
                      </p>
                      <p className="text-[11px] text-slate-500 tabular-nums">
                        {(doc.file_size / 1024).toFixed(1)} KB · Uploaded {formatDateDisplay(doc.created_at.split('T')[0])}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDownloadInvoice(doc.id)}
                    disabled={downloadingDocId === doc.id}
                    className="w-full sm:w-auto px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors flex items-center justify-center gap-1.5 shadow-2xs shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{downloadingDocId === doc.id ? 'Loading...' : 'Download Invoice'}</span>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white border border-dashed border-slate-300 rounded-lg p-6 text-center">
              <FileText className="w-6 h-6 text-slate-300 mx-auto mb-2" />
              <p className="text-xs text-slate-600 font-medium">No invoice document attached</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Upload your purchase receipt under Documents to keep proof of purchase.
              </p>
              <Link
                to="/documents"
                className="mt-3 px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md inline-block transition-colors"
              >
                Upload Invoice Now
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      <WarrantyModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSuccess={fetchWarranty}
        initialWarranty={warranty}
      />
    </div>
  );
};
