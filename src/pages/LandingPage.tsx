import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  ShieldCheck,
  FileText,
  Bell,
  Lock,
  ArrowRight,
  Database,
  Cloud,
  CheckCircle2,
  Clock,
  Sparkles,
  Menu,
  X,
} from 'lucide-react';

export const LandingPage: React.FC = () => {
  const { user, loginDemo, demoMode } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleDemoClick = async () => {
    try {
      await loginDemo();
      navigate('/dashboard');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* 3-Zone Top Navigation Bar (Constitution Section 2) */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4 md:gap-8">
          {/* Zone 1: Wordmark */}
          <Link to="/" className="flex items-center gap-2.5 text-slate-900 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-xs">
              WE
            </div>
            <span className="font-bold text-lg tracking-tight whitespace-nowrap">WarrantyEase</span>
          </Link>

          {/* Zone 2: Navigation Links (Desktop) */}
          <nav className="hidden lg:flex items-center gap-7 text-sm font-medium text-slate-600">
            <a href="#features" className="hover:text-slate-900 transition-colors whitespace-nowrap">
              Features
            </a>
            <a href="#how-it-works" className="hover:text-slate-900 transition-colors whitespace-nowrap">
              How It Works
            </a>
            <a href="#architecture" className="hover:text-slate-900 transition-colors whitespace-nowrap">
              Cloud Architecture
            </a>
            <a href="#security" className="hover:text-slate-900 transition-colors whitespace-nowrap">
              Security & Storage
            </a>
          </nav>

          {/* Zone 3: Primary Action & Mobile Toggle */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {user ? (
              <Link
                to="/dashboard"
                className="px-3 sm:px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs whitespace-nowrap"
              >
                Go to Dashboard
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="px-2.5 sm:px-3.5 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 transition-colors whitespace-nowrap"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="px-3 sm:px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs whitespace-nowrap"
                >
                  Get Started
                </Link>
              </>
            )}

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 text-slate-600 hover:text-slate-900 rounded-md"
              aria-label="Toggle navigation menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-white border-b border-slate-200 px-6 py-4 space-y-3">
            <a
              href="#features"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-sm font-medium text-slate-700 hover:text-indigo-600"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-sm font-medium text-slate-700 hover:text-indigo-600"
            >
              How It Works
            </a>
            <a
              href="#architecture"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-sm font-medium text-slate-700 hover:text-indigo-600"
            >
              Cloud Architecture
            </a>
            <a
              href="#security"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-sm font-medium text-slate-700 hover:text-indigo-600"
            >
              Security & Storage
            </a>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="pt-12 sm:pt-20 pb-12 sm:pb-16 px-4 sm:px-6 max-w-5xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-semibold mb-6">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Smart Digital Warranty & Invoice Manager</span>
        </div>

        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 max-w-4xl mx-auto leading-tight text-balance">
          Every Warranty. One Place. Never Miss an Expiry.
        </h1>

        <p className="mt-4 sm:mt-6 text-sm sm:text-base lg:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
          WarrantyEase centralizes your electronics, appliances, and gadget purchase invoices in private object storage, automatically calculates expiration dates, and alerts you before coverage lapses.
        </p>

        {/* CTA Strip */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 max-w-md mx-auto sm:max-w-none">
          <Link
            to="/register"
            className="w-full sm:w-auto px-6 py-3 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2"
          >
            <span>Start Free</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          {demoMode && (
            <button
              onClick={handleDemoClick}
              type="button"
              className="w-full sm:w-auto px-6 py-3 text-sm font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <span>Try Interactive Demo</span>
            </button>
          )}
        </div>

        {/* Adjacency Trust Markers */}
        <div className="mt-10 sm:mt-12 pt-6 sm:pt-8 border-t border-slate-200/80 grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 text-left">
          <div className="p-2 sm:p-0">
            <div className="text-lg sm:text-xl font-bold text-slate-900 tabular-nums">100% Private</div>
            <div className="text-xs text-slate-500 mt-0.5">S3 Object Storage</div>
          </div>
          <div className="p-2 sm:p-0">
            <div className="text-lg sm:text-xl font-bold text-slate-900 tabular-nums">Auto Expiry</div>
            <div className="text-xs text-slate-500 mt-0.5">Leap-year & month-end math</div>
          </div>
          <div className="p-2 sm:p-0">
            <div className="text-lg sm:text-xl font-bold text-slate-900 tabular-nums">30d / 7d / 1d</div>
            <div className="text-xs text-slate-500 mt-0.5">Proactive Reminders</div>
          </div>
          <div className="p-2 sm:p-0">
            <div className="text-lg sm:text-xl font-bold text-slate-900 tabular-nums">PostgreSQL</div>
            <div className="text-xs text-slate-500 mt-0.5">Cloud-Managed Database</div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-12 sm:py-16 bg-white border-y border-slate-200 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">How WarrantyEase Works</h2>
            <p className="mt-2 sm:mt-3 text-slate-600 text-xs sm:text-sm">
              Three streamlined steps to eliminate misplaced paper bills and surprise repair costs.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
            <div className="bg-slate-50 border border-slate-200 p-6 rounded-xl">
              <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center mb-4">
                01
              </div>
              <h3 className="text-base font-semibold text-slate-900 mb-2">Register Purchase</h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Enter product name, brand, purchase date, and duration. The system automatically calculates the accurate expiry date.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-6 rounded-xl">
              <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center mb-4">
                02
              </div>
              <h3 className="text-base font-semibold text-slate-900 mb-2">Store Invoices Securely</h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Upload invoice PDFs or images straight to private S3 object storage. Download anytime with short-lived signed URLs.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-6 rounded-xl">
              <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center mb-4">
                03
              </div>
              <h3 className="text-base font-semibold text-slate-900 mb-2">Receive Timely Alerts</h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Get proactive in-app notifications at 30 days, 7 days, and 1 day before expiration so you can claim warranty repairs in time.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-12 sm:py-16 px-4 sm:px-6 max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Enterprise-Grade Features</h2>
          <p className="mt-2 sm:mt-3 text-slate-600 text-xs sm:text-sm">
            Engineered for high reliability, strict user data isolation, and enterprise-grade cloud security.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          <div className="p-6 bg-white border border-slate-200 rounded-xl">
            <ShieldCheck className="w-7 h-7 text-indigo-600 mb-3" />
            <h3 className="text-base font-semibold text-slate-900 mb-1.5">Warranty Lifecycle Tracking</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Categorize by electronics, computing, appliances, and audio. Filter by status: Active, Expiring Soon, Expiring Today, and Expired.
            </p>
          </div>

          <div className="p-6 bg-white border border-slate-200 rounded-xl">
            <Lock className="w-7 h-7 text-indigo-600 mb-3" />
            <h3 className="text-base font-semibold text-slate-900 mb-1.5">Clerk Session Authentication</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Clerk authentication with server-side JWT verification. Strict record ownership enforcement prevents unauthorized cross-user access.
            </p>
          </div>

          <div id="security" className="p-6 bg-white border border-slate-200 rounded-xl">
            <FileText className="w-7 h-7 text-indigo-600 mb-3" />
            <h3 className="text-base font-semibold text-slate-900 mb-1.5">Private Object Storage</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Invoices are stored in AntiDeploy private S3 object buckets. Access is restricted to short-lived signed URLs with 15-minute expirations.
            </p>
          </div>

          <div className="p-6 bg-white border border-slate-200 rounded-xl">
            <Clock className="w-7 h-7 text-indigo-600 mb-3" />
            <h3 className="text-base font-semibold text-slate-900 mb-1.5">Tesseract OCR & PDF Parsing</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Automated invoice text recognition via Tesseract.js. Extracts field suggestions with an interactive review screen before confirmation.
            </p>
          </div>

          <div className="p-6 bg-white border border-slate-200 rounded-xl">
            <Bell className="w-7 h-7 text-indigo-600 mb-3" />
            <h3 className="text-base font-semibold text-slate-900 mb-1.5">Deduplicated Reminders</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Unique deduplication keys prevent spamming. Alerts trigger at 30 days, 7 days, 1 day, and expiry day.
            </p>
          </div>

          <div className="p-6 bg-white border border-slate-200 rounded-xl">
            <Database className="w-7 h-7 text-indigo-600 mb-3" />
            <h3 className="text-base font-semibold text-slate-900 mb-1.5">Production Relational DB</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              PostgreSQL schema with indexes on user IDs and expiry dates. Automatic local fallback during initial setup.
            </p>
          </div>
        </div>
      </section>

      {/* Cloud Architecture Section */}
      <section id="architecture" className="py-12 sm:py-16 bg-slate-900 text-white px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold">Cloud Computing Architecture</h2>
            <p className="mt-2 sm:mt-3 text-slate-400 text-xs sm:text-sm">
              Enterprise-grade full-stack architecture built for high availability and zero document loss.
            </p>
          </div>

          <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-5 sm:p-8 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-center">
              <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-700/60">
                <div className="text-xs text-indigo-400 font-semibold mb-1">FRONTEND</div>
                <div className="font-bold text-white text-sm">React 19 + Vite + TS</div>
                <div className="text-[11px] text-slate-400 mt-1">Tailwind CSS & Lucide</div>
              </div>
              <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-700/60">
                <div className="text-xs text-indigo-400 font-semibold mb-1">COMPUTE API</div>
                <div className="font-bold text-white text-sm">Express REST Engine</div>
                <div className="text-[11px] text-slate-400 mt-1">/api/v1 REST Endpoints</div>
              </div>
              <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-700/60">
                <div className="text-xs text-indigo-400 font-semibold mb-1">DATABASE</div>
                <div className="font-bold text-white text-sm">PostgreSQL</div>
                <div className="text-[11px] text-slate-400 mt-1">Managed Relational DB</div>
              </div>
              <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-700/60">
                <div className="text-xs text-indigo-400 font-semibold mb-1">OBJECT STORAGE</div>
                <div className="font-bold text-white text-sm">Private S3 Bucket</div>
                <div className="text-[11px] text-slate-400 mt-1">15-min Presigned URLs</div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-700 text-xs text-slate-300 leading-relaxed space-y-2">
              <p>
                <strong className="text-white">Security Architecture:</strong> No public bucket permissions. File binaries never land in the database; only metadata and randomized object keys are persisted in PostgreSQL.
              </p>
              <p>
                <strong className="text-white">Scheduled Automation:</strong> Integrates with scheduled cron triggers to evaluate expiry intervals and produce in-app notifications.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto py-8 bg-white border-t border-slate-200 text-xs text-slate-500 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900">WarrantyEase</span>
            <span>·</span>
            <span>Every Warranty. One Place. Never Miss an Expiry.</span>
          </div>
          <div>
            <span>Cloud-Native Warranty & Invoice Management</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
