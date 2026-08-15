import React from 'react';
import styles from './CodeOutput.module.css';

interface CodeOutputProps {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  isRunning: boolean;
}

export function CodeOutput({ stdout, stderr, exitCode, isRunning }: CodeOutputProps) {
  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Output</h3>
        {exitCode !== null && !isRunning && (
          <span className={`${styles.exitCode} ${exitCode === 0 ? styles['exitCode--ok'] : styles['exitCode--err']}`}>
            Exit code: {exitCode}
          </span>
        )}
      </div>
      <div className={styles.content}>
        {isRunning ? (
          <div className={styles.empty}>Running...</div>
        ) : stdout || stderr ? (
          <>
            {stdout && <pre className={styles.stdout}>{stdout}</pre>}
            {stderr && <pre className={styles.stderr}>{stderr}</pre>}
          </>
        ) : (
          <div className={styles.empty}>Run your code to see output here</div>
        )}
      </div>
    </div>
  );
}
