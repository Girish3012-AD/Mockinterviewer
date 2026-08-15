import React from 'react';
import styles from './ProgressBar.module.css';

interface ProgressBarProps {
  current: number;
  total: number;
  label?: string;
}

export function ProgressBar({ current, total, label }: ProgressBarProps) {
  const percentage = total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)) : 0;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        {label && <span className={styles.label}>{label}</span>}
        <span>Question {current} of {total}</span>
      </div>
      <div className={styles.track}>
        <div 
          className={styles.fill} 
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
