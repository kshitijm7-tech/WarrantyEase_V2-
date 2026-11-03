import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, Warranty } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { WarrantyModal } from '../components/WarrantyModal';
import { formatDateDisplay, formatCurrency } from '../utils/warranty';
import {
  Search,
  Plus,
  Filter,
  FileText,
  Edit2,
  Trash2,
  Archive,
  ArrowUpDown,
  ExternalLink,
} from 'lucide-react';

const CATEGORIES = [
  'all',
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

export const WarrantiesPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialStatus = searchParams.get('status') || 'all';

  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState(initialStatus);
  const [sortBy, setSortBy] = useState('expiry_asc');

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWarranty, setEditingWarranty] = useState<Warranty | null>(null);

  const fetchWarranties = async () => {
    setLoading(true);
    try {
      const res = await api.getWarranties({
        search: searchQuery || undefined,
        category: selectedCategory !== 'all' ? selectedCategory : undefined,
        status: selectedStatus !== 'all' ? selectedStatus : undefined,
        sortBy,
      });
      setWarranties(res.warranties);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWarranties();
  }, [searchQuery, selectedCategory, selectedStatus, sortBy]);

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete warranty for "${name}"? Attached invoices will be unlinked but kept safely.`)) {
      try {
        await api.deleteWarranty(id);
        fetchWarranties();
      } catch (err: any) {
        alert(err.message || 'Failed to delete warranty.');
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">My Warranties</h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage product warranties, track expiry countdowns, and link invoices
          </p>
        </div>

        <button
          onClick={() => {
            setEditingWarranty(null);
            setIsModalOpen(true);
          }}
          className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs flex items-center justify-center gap-1.5 self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Warranty / Scan OCR</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search product, brand, seller..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 bg-white"
            />
          </div>

          {/* Category */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="cat_select" className="text-xs font-semibold text-slate-600 shrink-0">
              Category:
            </label>
            <select
              id="cat_select"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c === 'all' ? 'All Categories' : c}
                </option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="status_select" className="text-xs font-semibold text-slate-600 shrink-0">
              Status:
            </label>
            <select
              id="status_select"
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setSearchParams(e.target.value !== 'all' ? { status: e.target.value } : {});
              }}
              className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="expiring_soon">Expiring Soon (≤30d)</option>
              <option value="expiring_today">Expires Today</option>
              <option value="expired">Expired</option>
            </select>
          </div>

          {/* Sort */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="sort_select" className="text-xs font-semibold text-slate-600 shrink-0">
              Sort By:
            </label>
            <select
              id="sort_select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="expiry_asc">Closest Expiry First</option>
              <option value="purchase_date_desc">Newest Purchase</option>
              <option value="product_name_asc">Product Name (A-Z)</option>
              <option value="created_at_desc">Recently Added</option>
            </select>
          </div>
        </div>
      </div>

      {/* Warranties List / Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500 animate-pulse">
            Loading warranties from database...
          </div>
        ) : warranties.length > 0 ? (
          <>
            {/* Mobile View: Clean, touch-friendly cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {warranties.map((w) => (
                <div key={w.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      to={`/warranties/${w.id}`}
                      className="font-bold text-sm text-slate-900 hover:text-indigo-600 transition-colors"
                    >
                      {w.product_name}
                    </Link>
                    <StatusBadge status={w.status} remainingDays={w.remaining_days} />
                  </div>

                  <div className="text-xs text-slate-500 space-y-1">
                    <div className="flex items-center justify-between">
                      <span>Brand / Category:</span>
                      <span className="font-medium text-slate-700">
                        {w.brand || '—'} · {w.category || 'General'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Purchase Date:</span>
                      <span className="tabular-nums text-slate-700">{formatDateDisplay(w.purchase_date)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Expires:</span>
                      <span className="font-semibold text-slate-900 tabular-nums">{formatDateDisplay(w.expiry_date)}</span>
                    </div>
                    {w.linked_documents && w.linked_documents.length > 0 && (
                      <div className="flex items-center gap-1 text-[11px] text-indigo-700 font-medium pt-1">
                        <FileText className="w-3.5 h-3.5" />
                        <span>{w.linked_documents.length} invoice linked</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-50">
                    <Link
                      to={`/warranties/${w.id}`}
                      className="px-2.5 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors"
                    >
                      View Details
                    </Link>
                    <button
                      onClick={() => {
                        setEditingWarranty(w);
                        setIsModalOpen(true);
                      }}
                      className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                      title="Edit Warranty"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(w.id, w.product_name)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                      title="Delete Warranty"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop View: Dense data table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="px-6 py-3">Product & Brand</th>
                    <th className="px-6 py-3">Category</th>
                    <th className="px-6 py-3">Purchase Date</th>
                    <th className="px-6 py-3">Duration</th>
                    <th className="px-6 py-3">Expiry Date</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Invoice</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {warranties.map((w) => (
                    <tr key={w.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-3.5">
                        <Link
                          to={`/warranties/${w.id}`}
                          className="font-bold text-slate-900 hover:text-indigo-600 transition-colors flex flex-col"
                        >
                          <span>{w.product_name}</span>
                          <span className="text-[11px] font-normal text-slate-500">
                            {w.brand || 'No brand specified'}
                            {w.model_number ? ` · ${w.model_number}` : ''}
                          </span>
                        </Link>
                      </td>

                      <td className="px-6 py-3.5 text-slate-600">{w.category || '—'}</td>

                      <td className="px-6 py-3.5 text-slate-600 tabular-nums">
                        {formatDateDisplay(w.purchase_date)}
                      </td>

                      <td className="px-6 py-3.5 text-slate-600 tabular-nums">
                        {w.warranty_duration_months} mo
                      </td>

                      <td className="px-6 py-3.5 font-semibold text-slate-900 tabular-nums">
                        {formatDateDisplay(w.expiry_date)}
                      </td>

                      <td className="px-6 py-3.5">
                        <StatusBadge status={w.status} remainingDays={w.remaining_days} />
                      </td>

                      <td className="px-6 py-3.5">
                        {w.linked_documents && w.linked_documents.length > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-indigo-700 font-medium">
                            <FileText className="w-3.5 h-3.5" />
                            <span>{w.linked_documents.length} linked</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">None</span>
                        )}
                      </td>

                      <td className="px-6 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            to={`/warranties/${w.id}`}
                            className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                            title="View Details"
                            aria-label={`View ${w.product_name} details`}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>
                          <button
                            onClick={() => {
                              setEditingWarranty(w);
                              setIsModalOpen(true);
                            }}
                            className="p-1 text-slate-400 hover:text-slate-700 transition-colors"
                            title="Edit Warranty"
                            aria-label={`Edit ${w.product_name}`}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(w.id, w.product_name)}
                            className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                            title="Delete Warranty"
                            aria-label={`Delete ${w.product_name}`}
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
          </>
        ) : (
          <div className="p-12 text-center">
            <Archive className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-slate-800">No warranties found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {searchQuery || selectedCategory !== 'all' || selectedStatus !== 'all'
                ? 'Try clearing your filters or search terms.'
                : 'Start by registering your first purchase.'}
            </p>
            <button
              onClick={() => {
                setEditingWarranty(null);
                setIsModalOpen(true);
              }}
              className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Warranty</span>
            </button>
          </div>
        )}
      </div>

      {/* Warranty Modal */}
      <WarrantyModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingWarranty(null);
        }}
        onSuccess={fetchWarranties}
        initialWarranty={editingWarranty}
      />
    </div>
  );
};
