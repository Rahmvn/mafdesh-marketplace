import { BadgeCheck } from 'lucide-react';

export default function VerificationBadge({ className = '' }) {
  return (
    <div className={`inline-flex items-center gap-1 bg-orange-100 text-orange-600 px-2 py-1 rounded-full text-xs font-semibold ${className}`}>
      <BadgeCheck size={14} className="fill-orange-500" />
      <span>Verified</span>
    </div>
  );
}
