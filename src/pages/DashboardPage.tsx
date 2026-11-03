import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, DashboardSummary } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { WarrantyModal } from '../components/WarrantyModal';
import { formatDateDisplay, formatCurrency } from '../utils/warranty';
import {
  ShieldCheck,
  AlertTriangle,
  Clock,
  Archive,
  Plus,
  Upload,
  ArrowRight,
  FileText,
  RefreshCw,
  Server,
  Calendar,
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isWarrantyModalOpen, setIsWarrantyModalOpen] = useState(false);
  const [evaluatingAlerts, setEvaluatingAlerts] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  const fetchDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getDashboardSummary();
      setSummary(res.summary);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const handleEvaluateReminders = async () => {
    setEvaluatingAlerts(true);
    setAlertMessage(null);
    try {
      const res = await api.generateDueNotifications();
      setAlertMessage(res.message);
      // Refresh metrics
      fetchDashboard();
      setTimeout(() => setAlertMessage(null), 5000);
    } catch (err: any) {
      setAlertMessage('Failed to evaluate reminders.');
    } finally {
      setEvaluatingAlerts(false);
    }
  };

  if (loading && !summary) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-slate-200 rounded-md w-1/4"></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-slate-200 rounded-xl"></div>
          ))}
        </div>
        <div className="h-64 bg-slate-200 rounded-xl"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Top Banner / Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Warranty Dashboard</h1>
          <p className="text-xs text-slate-500 mt-1">
            Real-time status derived from PostgreSQL records
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <button
            onClick={handleEvaluateReminders}
            disabled={evaluatingAlerts}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
            title="Scan warranties and trigger 30d/7d/1d reminders"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${evaluatingAlerts ? 'animate-spin text-indigo-600' : ''}`} />
            <span>{evaluatingAlerts ? 'Scanning...' : 'Check Expiries'}</span>
          </button>

          <Link
            to="/documents"
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Invoice</span>
          </Link>

          <button
            onClick={() => setIsWarrantyModalOpen(true)}
            className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-2xs flex items-center justify-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Warranty (or OCR)</span>
          </button>
        </div>
      </div>

      {alertMessage && (
        <div className="p-3 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-lg text-xs flex items-center justify-between">
          <span>{alertMessage}</span>
          <button onClick={() => setAlertMessage(null)} className="text-indigo-600 font-bold ml-2">
            ×
          </button>
        </div>
      )}

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Warranties */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Warranties
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Archive className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 tabular-nums">
              {summary?.total_warranties ?? 0}
            </span>
            <span className="text-xs text-slate-500">registered items</span>
          </div>
        </div>

        {/* Active Warranties */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Active Coverage
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-emerald-600 tabular-nums">
              {summary?.active_warranties ?? 0}
            </span>
            <span className="text-xs text-slate-500">
              {summary?.total_warranties
                ? `${Math.round(((summary.active_warranties || 0) / summary.total_warranties) * 100)}% of total`
                : 'in effect'}
            </span>
          </div>
        </div>

        {/* Expiring Soon */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Expiring Soon
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-amber-600 tabular-nums">
              {summary?.expiring_soon ?? 0}
            </span>
            <span className="text-xs text-amber-600 font-medium">within 30 days</span>
          </div>
        </div>

        {/* Expired Warranties */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Expired
            </span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-600 tabular-nums">
              {summary?.expired_warranties ?? 0}
            </span>
            <span className="text-xs text-slate-500">coverage ended</span>
          </div>
        </div>
      </div>

      {/* Upcoming Expiries Alert Section */}
      {summary?.upcoming_expiries && summary.upcoming_expiries.length > 0 && (
        <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              <h2 className="text-sm font-bold text-amber-900">
                Action Required: Warranties Expiring Within 30 Days
              </h2>
            </div>
            <Link
              to="/warranties?status=expiring_soon"
              className="text-xs font-semibold text-amber-700 hover:text-amber-800 flex items-center gap-1"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {summary.upcoming_expiries.map((w) => (
              <div
                key={w.id}
                onClick={() => navigate(`/warranties/${w.id}`)}
                className="bg-white border border-amber-200/80 p-3.5 rounded-lg hover:border-amber-300 transition-colors cursor-pointer flex items-center justify-between"
              >
                <div className="min-w-0 pr-3">
                  <div className="font-semibold text-sm text-slate-900 truncate">
                    {w.product_name}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {w.brand || 'No brand'} · Expires {formatDateDisplay(w.expiry_date)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs font-bold text-amber-700 tabular-nums">
                    {w.remaining_days} days left
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Warranties Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Registered Warranties</h2>
            <p className="text-xs text-slate-500">Sorted by expiry date</p>
          </div>
          <Link
            to="/warranties"
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
          >
            <span>View All ({summary?.total_warranties || 0})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {summary?.recent_warranties && summary.recent_warranties.length > 0 ? (
          <div>
            {/* Mobile Card List (< md) */}
            <div className="md:hidden divide-y divide-slate-100">
              {summary.recent_warranties.map((w) => (
                <div
                  key={w.id}
                  onClick={() => navigate(`/warranties/${w.id}`)}
                  className="p-4 hover:bg-slate-50/80 transition-colors cursor-pointer space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900 text-sm">{w.product_name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {w.brand ? `${w.brand} · ` : ''}{w.category || 'General'}
                      </p>
                    </div>
                    <StatusBadge status={w.status} remainingDays={w.remaining_days} />
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-600 pt-1 border-t border-slate-50">
                    <div>
                      <span className="text-slate-400">Expires: </span>
                      <span className="font-medium text-slate-800 tabular-nums">{formatDateDisplay(w.expiry_date)}</span>
                    </div>
                    <span className="font-semibold text-indigo-600 text-xs flex items-center gap-0.5">
                      <span>View details</span>
                      <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table (>= md) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="px-6 py-3">Product</th>
                    <th className="px-6 py-3">Category</th>
                    <th className="px-6 py-3">Purchase Date</th>
                    <th className="px-6 py-3">Expiry Date</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {summary.recent_warranties.map((w) => (
                    <tr key={w.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-3.5 font-medium text-slate-900">
                        <div className="flex flex-col">
                          <span className="font-semibold">{w.product_name}</span>
                          {w.brand && <span className="text-[11px] text-slate-500">{w.brand}</span>}
                        </div>
                      </td>
                      <td className="px-6 py-3.5 text-slate-600">{w.category || '—'}</td>
                      <td className="px-6 py-3.5 text-slate-600 tabular-nums">
                        {formatDateDisplay(w.purchase_date)}
                      </td>
                      <td className="px-6 py-3.5 font-medium text-slate-900 tabular-nums">
                        {formatDateDisplay(w.expiry_date)}
                      </td>
                      <td className="px-6 py-3.5">
                        <StatusBadge status={w.status} remainingDays={w.remaining_days} />
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <Link
                          to={`/warranties/${w.id}`}
                          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="p-12 text-center">
            <Archive className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-slate-800">No warranties registered yet</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Add your first purchase warranty to track expiration countdowns and invoice documents.
            </p>
            <button
              onClick={() => setIsWarrantyModalOpen(true)}
              className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Your First Warranty</span>
            </button>
          </div>
        )}
      </div>

      {/* Recent Invoices Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Recent Invoice Documents</h2>
            <p className="text-xs text-slate-500">Stored in private AntiDeploy object storage</p>
          </div>
          <Link
            to="/documents"
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
          >
            <span>View All Documents</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {summary?.recent_documents && summary.recent_documents.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {summary.recent_documents.map((doc) => (
              <div
                key={doc.id}
                className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 flex items-center justify-between"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 truncate">
                      {doc.original_filename}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {(doc.file_size / 1024).toFixed(1)} KB · {doc.product_name || 'Unlinked'}
                    </p>
                  </div>
                </div>
                <Link
                  to="/documents"
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-800 shrink-0 ml-2"
                >
                  Manage
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-slate-500 text-xs">
            <span>No invoices uploaded yet. Upload purchase receipts to store them securely.</span>
          </div>
        )}
      </div>

      {/* Warranty Modal */}
      <WarrantyModal
        isOpen={isWarrantyModalOpen}
        onClose={() => setIsWarrantyModalOpen(false)}
        onSuccess={fetchDashboard}
      />
    </div>
  );
};
