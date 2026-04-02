export const formatRemaining = (deadline, now) => {
  if (!deadline) return null;
  const diff = new Date(deadline) - now;
  if (diff <= 0) return "Expired";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

export const getUrgencyClass = (deadline, now) => {
  if (!deadline) return '';
  const diff = new Date(deadline) - now;
  if (diff <= 0) return 'text-red-600 font-bold';
  const hours = diff / (1000 * 60 * 60);
  if (hours < 6) return 'text-red-600 font-bold animate-pulse';
  if (hours < 24) return 'text-orange-600 font-semibold';
  return 'text-gray-600';
};