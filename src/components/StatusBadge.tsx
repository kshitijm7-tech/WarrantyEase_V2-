import React from 'react';
import { WarrantyStatus } from '../utils/warranty';

interface StatusBadgeProps {
  status: WarrantyStatus;
  remainingDays?: number;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, remainingDays, className = '' }) => {
  switch (status) {
    case 'active':
      return (
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 ${className}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" aria-hidden="true" />
          <span>Active</span>
          {remainingDays !== undefined && (
            <span className="text-slate-400 font-normal tabular-nums">({remainingDays}d left)</span>
          )}
        </span>
      );
    case 'expiring_soon':
      return (
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 ${className}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden="true" />
          <span>Expiring Soon</span>
          {remainingDays !== undefined && (
            <span className="text-amber-600 font-normal tabular-nums">({remainingDays}d)</span>
          )}
        </span>
      );
    case 'expiring_today':
      return (
        <span className={`inline-flex items-center gap-1.5 text-xs font-bold text-rose-700 dark:text-rose-400 animate-pulse ${className}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-rose-600" aria-hidden="true" />
          <span>Expires Today</span>
        </span>
      );
    case 'expired':
    default:
      return (
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 ${className}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" aria-hidden="true" />
          <span>Expired</span>
          {remainingDays !== undefined && remainingDays < 0 && (
            <span className="text-slate-400 font-normal tabular-nums">({Math.abs(remainingDays)}d ago)</span>
          )}
        </span>
      );
  }
};
