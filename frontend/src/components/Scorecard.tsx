import React from 'react';
import styles from './Scorecard.module.css';
import type { EvaluationResponse } from '@/types';

interface ScorecardProps {
  evaluation: EvaluationResponse | null;
}

export function Scorecard({ evaluation }: ScorecardProps) {
  if (!evaluation) {
    return <div className={styles.empty}>No evaluation available.</div>;
  }

  const {
    overall_score,
    recommendation,
    star_breakdown,
    strengths,
    weaknesses,
    ideal_rewrite,
  } = evaluation;

  const getRecommendationClass = (rec: string) => {
    switch (rec.toLowerCase()) {
      case 'hire': return styles.hire;
      case 'no_hire': return styles.no_hire;
      case 'lean_hire': return styles.lean_hire;
      default: return '';
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Interview Scorecard</h2>
        <div className={styles.scoreCircle}>{overall_score}</div>
        <div className={`${styles.recommendation} ${getRecommendationClass(recommendation)}`}>
          {recommendation.replace('_', ' ')}
        </div>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>STAR Breakdown</h3>
        <div className={styles.starGrid}>
          {Object.entries(star_breakdown).map(([key, score]) => (
            <div key={key} className={styles.starItem}>
              <span className={styles.starLabel}>{key}</span>
              <div className={styles.starScore}>{score}/10</div>
              <div className={styles.starBarContainer}>
                <div 
                  className={styles.starBarFill} 
                  style={{ width: `${(score / 10) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Strengths</h3>
        <ul className={styles.list}>
          {strengths.map((s, i) => <li key={i} className={styles.listItem}>{s}</li>)}
        </ul>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Areas for Improvement</h3>
        <ul className={styles.list}>
          {weaknesses.map((w, i) => <li key={i} className={styles.listItem}>{w}</li>)}
        </ul>
      </div>

      {ideal_rewrite && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Ideal Response</h3>
          <div className={styles.markdownBody}>
            {ideal_rewrite}
          </div>
        </div>
      )}
    </div>
  );
}
