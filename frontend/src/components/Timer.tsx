import React, { useEffect, useState } from 'react';
import styles from './Timer.module.css';

interface TimerProps {
  startTime: Date | null;
  isActive: boolean;
}

export function Timer({ startTime, isActive }: TimerProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isActive && startTime) {
      interval = setInterval(() => {
        const now = new Date();
        setElapsed(Math.floor((now.getTime() - startTime.getTime()) / 1000));
      }, 1000);
    } else if (!isActive && startTime) {
      const now = new Date();
      setElapsed(Math.floor((now.getTime() - startTime.getTime()) / 1000));
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive, startTime]);

  const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
  const secs = (elapsed % 60).toString().padStart(2, '0');

  return (
    <div className={`${styles.timer} ${isActive ? styles.active : ''}`}>
      {mins}:{secs}
    </div>
  );
}
