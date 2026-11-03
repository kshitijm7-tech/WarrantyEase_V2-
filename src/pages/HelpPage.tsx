import React from 'react';
import {
  ShieldCheck,
  Server,
  Database,
  HardDrive,
  Clock,
  Lock,
  CheckCircle2,
  FileText,
  Bell,
  HelpCircle,
  FileCheck,
  Calendar,
} from 'lucide-react';

export const HelpPage: React.FC = () => {
  const faqs = [
    {
      q: 'How does Clerk authentication protect user data?',
      a: 'WarrantyEase utilizes Clerk for identity management and session token issuance. On every API request, the server verifies the Clerk JWT bearer token using @clerk/backend. All database queries enforce strict user record isolation (WHERE user_id = clerk_user_id) so that no user can ever access or modify another user\'s warranties or documents.',
    },
    {
      q: 'How does Tesseract.js invoice OCR work?',
      a: 'When you upload an invoice (image or PDF), our OCR engine uses Tesseract.js and digital PDF stream parsing to read the printed text. It extracts potential values for product name, retailer, invoice number, purchase date, and price. These are presented as suggestions on an interactive review screen where you can inspect, verify, and correct them. Unknown warranty durations are never guessed.',
    },
    {
      q: 'How does automatic warranty expiry calculation work?',
      a: 'When you register a product, you provide the purchase date and warranty duration in months (e.g. 12, 24, 36 months). WarrantyEase calculates the exact expiry date handling leap years and month-end dates (for example, a 1-month warranty on Jan 31 clamps to Feb 28 or Feb 29 in a leap year). The system then computes live remaining days relative to the current date.',
    },
    {
      q: 'What file formats and sizes are supported for invoice uploads?',
      a: 'WarrantyEase accepts PDF documents, JPEG, PNG, and WebP image receipts up to 10MB per file. Each file is verified for MIME type on both the client and server before storage.',
    },
    {
      q: 'How are invoice documents kept private and secure?',
      a: 'Invoices are stored in private cloud object storage (AntiDeploy S3-compatible bucket) with unguessable random keys. The bucket has zero public read access. When you request to view or download an invoice, the backend verifies your authenticated session and generates a temporary, short-lived signed URL valid for 15 minutes only.',
    },
    {
      q: 'When are warranty expiration reminders triggered?',
      a: 'WarrantyEase automatically generates proactive alerts at four key intervals: 30 days before expiry (advance notice), 7 days before expiry (urgent reminder), 1 day before expiry (critical alert), and on the day of expiry. Deterministic deduplication keys guarantee that you will never receive repeated notifications for the same interval.',
    },
  ];

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Help Center & Documentation
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Product user guide, system architecture specifications, and security policies
        </p>
      </div>

      {/* Quick Start Guide */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-5">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-indigo-600" />
          <span>Quick Start User Guide</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-indigo-600 text-white font-bold text-[11px] flex items-center justify-center shrink-0">
                1
              </div>
              <h3 className="text-xs font-bold text-slate-900">Register Product</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed pl-7">
              Click <strong>Add Warranty</strong> from the Dashboard or My Warranties. Provide the product name, brand, purchase date, and coverage duration.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-indigo-600 text-white font-bold text-[11px] flex items-center justify-center shrink-0">
                2
              </div>
              <h3 className="text-xs font-bold text-slate-900">Store Invoices</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed pl-7">
              Navigate to <strong>Documents</strong> to upload receipts (PDF, PNG, JPG). Or use <strong>Create Warranty from This Invoice</strong> to register and link simultaneously.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-indigo-600 text-white font-bold text-[11px] flex items-center justify-center shrink-0">
                3
              </div>
              <h3 className="text-xs font-bold text-slate-900">Monitor Expirations</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed pl-7">
              The Dashboard displays your total coverage breakdown: Active, Expiring Soon (≤30 days), and Expired. Upcoming deadlines are highlighted.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-indigo-600 text-white font-bold text-[11px] flex items-center justify-center shrink-0">
                4
              </div>
              <h3 className="text-xs font-bold text-slate-900">Receive Proactive Alerts</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed pl-7">
              Notifications trigger before your coverage lapses, giving you ample time to request service, claim replacements, or purchase extensions.
            </p>
          </div>
        </div>
      </div>

      {/* Cloud Architecture Diagram & Flow */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-5">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Server className="w-4 h-4 text-indigo-600" />
          <span>System Architecture & Infrastructure</span>
        </h2>

        {/* Visual Flow Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-center">
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider block mb-1">
              Client Layer
            </span>
            <p className="font-bold text-slate-900 text-sm">React 19 + Vite</p>
            <p className="text-[11px] text-slate-500 mt-1">
              TypeScript, Tailwind CSS, Lucide Icons, SPA Router
            </p>
          </div>

          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider block mb-1">
              Compute Layer
            </span>
            <p className="font-bold text-slate-900 text-sm">Express REST API</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Port 3000, JWT Sessions, Bcrypt, Multer, S3 SDK
            </p>
          </div>

          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider block mb-1">
              Data Layer
            </span>
            <p className="font-bold text-slate-900 text-sm">PostgreSQL</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Relational DB, foreign keys, indexes, migrations
            </p>
          </div>

          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider block mb-1">
              Storage Layer
            </span>
            <p className="font-bold text-slate-900 text-sm">Private S3 Bucket</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Signed URLs, zero public bucket exposure
            </p>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4 text-xs text-slate-600 space-y-2">
          <p className="font-semibold text-slate-900">Data Separation Principle:</p>
          <p>
            Binary invoice documents are <strong>never</strong> stored directly in the database. Instead, files are streamed to private S3-compatible object storage with unguessable random keys. PostgreSQL stores only document metadata, user ownership IDs, and storage keys.
          </p>
        </div>
      </div>

      {/* Security & Engineering Standards Met */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-4">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Lock className="w-4 h-4 text-indigo-600" />
          <span>Security & Engineering Standards</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span><strong>Bcrypt Password Hashing:</strong> Passwords hashed with 10 salt rounds; no plain text.</span>
          </div>

          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span><strong>Strict User Isolation:</strong> Every SQL query verifies `WHERE user_id = $auth_user_id`.</span>
          </div>

          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span><strong>Private S3 Security:</strong> Zero public buckets. Access through presigned URLs only.</span>
          </div>

          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span><strong>HttpOnly Cookies:</strong> JWT session tokens protected from client-side XSS theft.</span>
          </div>

          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span><strong>Automated Unit Tests:</strong> Node.js test runner covering month-end & leap-year rules.</span>
          </div>

          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span><strong>Zero-Downtime Migration:</strong> PostgreSQL tables initialized idempotently on startup.</span>
          </div>
        </div>
      </div>

      {/* Frequently Asked Questions */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-4">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-indigo-600" />
          <span>Frequently Asked Questions</span>
        </h2>

        <div className="divide-y divide-slate-100 space-y-4">
          {faqs.map((faq, idx) => (
            <div key={idx} className={idx > 0 ? 'pt-4' : ''}>
              <h3 className="text-xs font-bold text-slate-900 mb-1">
                {faq.q}
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                {faq.a}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
