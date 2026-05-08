import React from 'react';
import { BadgeCheck } from 'lucide-react';

export default function VerificationBadge({
  className = '',
  label = 'Verified University Seller',
}) {
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-600 ${className}`}>
      <BadgeCheck size={14} className="fill-orange-500" />
      <span>{label}</span>
    </div>
  );
}
