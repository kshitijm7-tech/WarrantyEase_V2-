import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import {
  LayoutDashboard,
  ShieldCheck,
  FileText,
  Bell,
  Settings,
  HelpCircle,
  LogOut,
  Menu,
  X,
  Server,
  CloudCheck,
} from 'lucide-react';

export const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [cloudInfo, setCloudInfo] = useState<{ database: string; storage: string } | null>(null);

  useEffect(() => {
    // Fetch unread notifications count
    const fetchNotifications = async () => {
      try {
        const res = await api.getNotifications();
        setUnreadCount(res.unread_count);
      } catch {}
    };

    const fetchHealth = async () => {
      try {
        const health = await api.getHealth();
        setCloudInfo({ database: health.database, storage: health.storage });
      } catch {}
    };

    fetchNotifications();
    fetchHealth();
    const interval = setInterval(fetchNotifications, 30000); // 30s poll
    return () => clearInterval(interval);
  }, [location.pathname]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch {}
  };

  const navItems = [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'My Warranties', path: '/warranties', icon: ShieldCheck },
    { label: 'Documents', path: '/documents', icon: FileText },
    { label: 'Notifications', path: '/notifications', icon: Bell, badge: unreadCount },
    { label: 'Settings', path: '/settings', icon: Settings },
    { label: 'Help & Documentation', path: '/help', icon: HelpCircle },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col md:flex-row">
      {/* Mobile Top Header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">
            WE
          </div>
          <span className="font-bold text-base tracking-tight text-slate-900">WarrantyEase</span>
        </div>
        <div className="flex items-center gap-2">
          <NavLink
            to="/notifications"
            className="p-2 text-slate-600 hover:text-slate-900 relative rounded-md"
            aria-label="View notifications"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-600" />
            )}
          </NavLink>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-slate-600 hover:text-slate-900 rounded-md"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* Sidebar Navigation */}
      <aside
        className={`fixed md:sticky top-0 left-0 z-30 h-screen w-64 bg-white border-r border-slate-200 flex flex-col justify-between transition-transform duration-200 ease-in-out ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="p-5 flex flex-col h-full">
          {/* Brand lockup */}
          <div className="flex items-center gap-3 pb-6 border-b border-slate-100">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-base shadow-sm shrink-0">
              WE
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-slate-900 text-base leading-tight tracking-tight truncate">
                WarrantyEase
              </span>
              <span className="text-xs text-slate-500 font-medium truncate">
                Digital Warranty Manager
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="mt-6 flex-1 space-y-1" aria-label="Main Navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-indigo-50 text-indigo-700 font-semibold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`
                  }
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && item.badge > 0 ? (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-rose-100 text-rose-700 tabular-nums">
                      {item.badge}
                    </span>
                  ) : null}
                </NavLink>
              );
            })}
          </nav>

          {/* Cloud Infrastructure Summary Box */}
          <div className="mt-auto pt-4 border-t border-slate-100">
            <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3 text-xs space-y-1.5 text-slate-600">
              <div className="flex items-center justify-between font-semibold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-indigo-600" /> Cloud Services
                </span>
                <span className="text-[11px] text-emerald-600 font-medium">Online</span>
              </div>
              <p className="text-[11px] text-slate-500 truncate">
                DB: {cloudInfo?.database || 'PostgreSQL'}
              </p>
              <p className="text-[11px] text-slate-500 truncate">
                Storage: {cloudInfo?.storage || 'S3 Bucket'}
              </p>
            </div>

            {/* User Profile Bar */}
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 font-semibold text-xs flex items-center justify-center shrink-0">
                  {user?.name ? user.name.slice(0, 2).toUpperCase() : 'WE'}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold text-slate-800 truncate">
                    {user?.name || 'User'}
                  </span>
                  <span className="text-[11px] text-slate-500 truncate">
                    {user?.email || 'signed in'}
                  </span>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>

      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-20 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}
    </div>
  );
};
