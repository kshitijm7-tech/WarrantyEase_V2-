import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, NotificationItem } from '../api';
import { formatDateDisplay } from '../utils/warranty';
import {
  Bell,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Clock,
  ShieldAlert,
} from 'lucide-react';

export const NotificationsPage: React.FC = () => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const res = await api.getNotifications();
      setNotifications(res.notifications);
      setUnreadCount(res.unread_count);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleMarkRead = async (id: string) => {
    try {
      await api.markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error(err);
    }
  };

  const handleEvaluateDue = async () => {
    setEvaluating(true);
    setStatusMessage(null);
    try {
      const res = await api.generateDueNotifications();
      setStatusMessage(res.message);
      setNotifications(res.notifications);
      setUnreadCount(res.total_unread);
      setTimeout(() => setStatusMessage(null), 5000);
    } catch (err: any) {
      setStatusMessage('Failed to evaluate reminders.');
    } finally {
      setEvaluating(false);
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'today':
      case '1_day':
        return <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />;
      case '7_days':
        return <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />;
      case '30_days':
      default:
        return <Clock className="w-5 h-5 text-indigo-600 shrink-0" />;
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Warranty Notifications
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Automated alerts triggered at 30 days, 7 days, 1 day, and on expiry day
          </p>
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto">
          <button
            onClick={handleEvaluateDue}
            disabled={evaluating}
            className="flex-1 sm:flex-initial px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
            title="Scan active warranties and generate new due alerts"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${evaluating ? 'animate-spin text-indigo-600' : ''}`} />
            <span>{evaluating ? 'Scanning...' : 'Check Expiries Now'}</span>
          </button>

          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="px-3.5 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors shadow-2xs"
            >
              Mark All Read
            </button>
          )}
        </div>
      </div>

      {statusMessage && (
        <div className="p-3 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-lg text-xs flex items-center justify-between">
          <span>{statusMessage}</span>
          <button onClick={() => setStatusMessage(null)} className="text-indigo-600 font-bold ml-2">
            ×
          </button>
        </div>
      )}

      {/* Notifications List */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Recent Alerts</h2>
          <span className="text-xs text-slate-500 tabular-nums">
            {unreadCount} unread · {notifications.length} total
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500 animate-pulse">
            Loading notifications from database...
          </div>
        ) : notifications.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4 transition-colors ${
                  n.is_read ? 'bg-white hover:bg-slate-50/60' : 'bg-indigo-50/30 hover:bg-indigo-50/50'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="mt-0.5">{getAlertIcon(n.reminder_type)}</div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs text-slate-900 leading-relaxed ${n.is_read ? 'font-normal' : 'font-semibold'}`}>
                      {n.message}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-1.5 text-[11px] text-slate-400">
                      <span>{formatDateDisplay(n.created_at.split('T')[0])}</span>
                      <span>·</span>
                      <span className="font-mono text-slate-500">Interval: {n.reminder_type}</span>
                      {n.product_name && (
                        <>
                          <span>·</span>
                          <Link
                            to={`/warranties/${n.warranty_id}`}
                            className="text-indigo-600 font-medium hover:underline inline-flex items-center gap-0.5"
                          >
                            <span>View {n.product_name}</span>
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {!n.is_read && (
                  <button
                    onClick={() => handleMarkRead(n.id)}
                    className="self-end sm:self-start text-xs font-semibold text-slate-500 hover:text-indigo-600 transition-colors shrink-0 whitespace-nowrap bg-white sm:bg-transparent px-2.5 py-1 sm:p-0 rounded border sm:border-0 border-slate-200"
                  >
                    Mark as read
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center">
            <Bell className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-slate-800">No notifications</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Automated reminders appear here when warranties approach 30-day, 7-day, or 1-day expiry windows.
            </p>
            <button
              onClick={handleEvaluateDue}
              disabled={evaluating}
              className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs inline-flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${evaluating ? 'animate-spin' : ''}`} />
              <span>Evaluate & Check Now</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
