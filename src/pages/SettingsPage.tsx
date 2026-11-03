import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, HealthInfo } from '../api';
import {
  User,
  Mail,
  Shield,
  Server,
  Database,
  HardDrive,
  LogOut,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { user, refreshUser, logout } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthInfo | null>(null);

  useEffect(() => {
    if (user?.name) setName(user.name);
    api.getHealth().then(setHealth).catch(() => {});
  }, [user]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await api.updateSettings(name.trim());
      await refreshUser();
      setMessage('Profile updated successfully.');
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Account Settings</h1>
        <p className="text-xs text-slate-500 mt-1">
          Manage your account profile and inspect deployed cloud infrastructure
        </p>
      </div>

      {message && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Profile Form */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-4">
        <h2 className="text-base font-bold text-slate-900">Profile Information</h2>
        <form onSubmit={handleSaveProfile} className="space-y-4 max-w-md">
          <div>
            <label htmlFor="settings_name" className="block text-xs font-semibold text-slate-700 mb-1">
              Full Name
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <User className="w-4 h-4" />
              </div>
              <input
                id="settings_name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 bg-white"
              />
            </div>
          </div>

          <div>
            <label htmlFor="settings_email" className="block text-xs font-semibold text-slate-700 mb-1">
              Email Address (Account Identifier)
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Mail className="w-4 h-4" />
              </div>
              <input
                id="settings_email"
                type="email"
                disabled
                value={user?.email || ''}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 text-slate-500 cursor-not-allowed"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Primary email is locked for account security and record isolation.
            </p>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Profile Changes'}
          </button>
        </form>
      </div>

      {/* Cloud & Runtime Infrastructure */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Server className="w-4 h-4 text-indigo-600" />
            <span>Cloud & Deployment Environment</span>
          </h2>
          <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
            Healthy & Serving
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 space-y-1">
            <div className="font-semibold text-slate-700 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-indigo-600" />
              <span>Database Engine</span>
            </div>
            <p className="text-slate-900 font-bold">{health?.database || 'PostgreSQL'}</p>
            <p className="text-[11px] text-slate-500">AntiDeploy DATABASE_URL</p>
          </div>

          <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 space-y-1">
            <div className="font-semibold text-slate-700 flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-indigo-600" />
              <span>Invoice Object Storage</span>
            </div>
            <p className="text-slate-900 font-bold">{health?.storage || 'Private S3 Bucket'}</p>
            <p className="text-[11px] text-slate-500">Path-style private S3 signed URLs</p>
          </div>

          <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 space-y-1">
            <div className="font-semibold text-slate-700 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-indigo-600" />
              <span>Authentication</span>
            </div>
            <p className="text-slate-900 font-bold">Clerk Authentication</p>
            <p className="text-[11px] text-slate-500">Verified server-side JWT session</p>
          </div>

          <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 space-y-1">
            <div className="font-semibold text-slate-700 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-indigo-600" />
              <span>OCR Invoice Engine</span>
            </div>
            <p className="text-slate-900 font-bold">Tesseract.js + PDF</p>
            <p className="text-[11px] text-slate-500">Printed text recognition</p>
          </div>
        </div>
      </div>

      {/* Session Actions */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Sign Out</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Clear your current authenticated session token and cookies
          </p>
        </div>
        <button
          onClick={logout}
          className="px-4 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors flex items-center gap-1.5"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
};
