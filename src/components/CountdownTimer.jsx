import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

function calculateTimeLeft(endTime) {
  const difference = new Date(endTime) - new Date();

  if (difference <= 0) {
    return { expired: true };
  }

  return {
    hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((difference / 1000 / 60) % 60),
    seconds: Math.floor((difference / 1000) % 60),
    expired: false
  };
}

export default function CountdownTimer({ endTime, onExpire }) {
  const [timeLeft, setTimeLeft] = useState(() => calculateTimeLeft(endTime));

  useEffect(() => {
    const timer = setInterval(() => {
      const newTimeLeft = calculateTimeLeft(endTime);
      setTimeLeft(newTimeLeft);

      if (newTimeLeft.expired && onExpire) {
        onExpire();
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [endTime, onExpire]);

  if (timeLeft.expired) {
    return (
      <div className="flex items-center gap-1.5 text-red-600 font-bold text-sm">
        <Clock className="w-4 h-4" />
        <span>EXPIRED</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 bg-gradient-to-r from-orange-500 to-red-500 text-white px-3 py-1.5 rounded-lg font-bold text-sm shadow-lg">
      <Clock className="w-4 h-4 animate-pulse" />
      <span>
        {String(timeLeft.hours).padStart(2, '0')}:
        {String(timeLeft.minutes).padStart(2, '0')}:
        {String(timeLeft.seconds).padStart(2, '0')}
      </span>
    </div>
  );
}
