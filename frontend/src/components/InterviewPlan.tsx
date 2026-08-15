import React from 'react';
import styles from './InterviewPlan.module.css';
import type { InterviewQuestion } from '@/types';

interface InterviewPlanProps {
  questions: InterviewQuestion[];
  onStart: () => void;
  isLoading: boolean;
}

export function InterviewPlan({ questions, onStart, isLoading }: InterviewPlanProps) {
  if (isLoading) {
    return <div className={styles.container}><div className={styles.loading}>Generating your customized interview plan...</div></div>;
  }

  if (!questions || questions.length === 0) {
    return null;
  }

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Interview Plan</h3>
      <ul className={styles.list}>
        {questions.map((q, idx) => (
          <li key={idx} className={styles.item}>
            <div className={styles.itemHeader}>
              <span className={styles.topic}>{idx + 1}. {q.question}</span>
              <span className={`${styles.badge} ${q.type === 'Technical' ? styles.badgeTechnical : styles.badgeBehavioral}`}>
                {q.type}
              </span>
            </div>
            <div className={styles.focus}>{q.focus_area}</div>
          </li>
        ))}
      </ul>
      <button className={styles.button} onClick={onStart}>
        Start Interview
      </button>
    </div>
  );
}
