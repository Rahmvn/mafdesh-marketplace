import { useEffect, useState } from 'react';

function getRemainingTime(endTime) {
  const endDate = endTime ? new Date(endTime) : null;

  if (!endDate || Number.isNaN(endDate.getTime())) {
    return {
      hours: 0,
      minutes: 0,
      seconds: 0,
      expired: true,
    };
  }

  const difference = endDate.getTime() - Date.now();

  if (difference <= 0) {
    return {
      hours: 0,
      minutes: 0,
      seconds: 0,
      expired: true,
    };
  }

  const totalSeconds = Math.floor(difference / 1000);

  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    expired: false,
  };
}

export default function useCountdown(endTime) {
  const [remainingTime, setRemainingTime] = useState(() => getRemainingTime(endTime));

  useEffect(() => {
    setRemainingTime(getRemainingTime(endTime));

    const intervalId = window.setInterval(() => {
      setRemainingTime(getRemainingTime(endTime));
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [endTime]);

  return remainingTime;
}
