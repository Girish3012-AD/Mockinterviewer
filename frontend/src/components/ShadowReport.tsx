import React, { useEffect, useState } from 'react';
import styles from './ShadowReport.module.css';
import type { ShadowCompilerReport } from '@/types';

interface ShadowReportProps {
  report: ShadowCompilerReport | null;
  isLoading: boolean;
}

export function ShadowReport({ report, isLoading }: ShadowReportProps) {
  const [displayedScore, setDisplayedScore] = useState(0);

  useEffect(() => {
    if (report) {
      let current = 0;
      const target = report.correctness_score * 100;
      const step = target / 20;
      const interval = setInterval(() => {
        current += step;
        if (current >= target) {
          setDisplayedScore(Math.round(target));
          clearInterval(interval);
        } else {
          setDisplayedScore(Math.round(current));
        }
      }, 30);
      return () => clearInterval(interval);
    } else {
      setDisplayedScore(0);
    }
  }, [report]);

  if (isLoading) {
    return <div className={styles.container}><div className={styles.loading}>Analyzing code...</div></div>;
  }

  if (!report) {
    return null;
  }

  const scoreDeg = (displayedScore / 100) * 360;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>Shadow Compiler Report</h3>
        <div 
          className={styles.gaugeContainer} 
          style={{ '--score-deg': `${scoreDeg}deg` } as React.CSSProperties}
        >
          <div className={styles.gaugeInner}>{displayedScore}%</div>
        </div>
      </div>

      <div className={styles.badges}>
        <div className={styles.badge}>⏱ {report.time_complexity}</div>
        <div className={styles.badge}>💾 {report.space_complexity}</div>
      </div>

      {report.issues && report.issues.length > 0 && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Issues</h4>
          <ul className={styles.issueList}>
            {report.issues.map((issue, idx) => (
              <li key={idx} className={styles.issueItem}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Feedback</h4>
        <div className={styles.feedback}>{report.feedback}</div>
      </div>
    </div>
  );
}
