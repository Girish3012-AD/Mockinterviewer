'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './page.module.css';
import { useToast } from '@/components/Toast';
import { listSessions } from '@/services/api';
import type { SessionListItem } from '@/types';

export default function HistoryPage() {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const data = await listSessions();
        // Assuming data is an array of sessions
        setSessions(Array.isArray(data) ? data : []);
      } catch (error) {
        showToast('error', 'Failed to load history.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchSessions();
  }, [showToast]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unknown Date';
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (isLoading) {
    return <div className={styles.loading}>Loading history...</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Interview History</h1>
        <Link href="/" className={styles.btnPrimary}>
          New Interview
        </Link>
      </div>

      {sessions.length === 0 ? (
        <div className={styles.empty}>No past interviews found.</div>
      ) : (
        <div className={styles.grid}>
          {sessions.map((session) => (
            <Link 
              key={session.id} 
              href={`/scorecard?session=${session.id}`}
              className={styles.card}
            >
              <div className={styles.cardHeader}>
                <span className={styles.date}>{formatDate(session.created_at)}</span>
                <span className={`${styles.status} ${session.status === 'completed' ? styles.statusComplete : styles.statusPending}`}>
                  {session.status}
                </span>
              </div>
              <div className={styles.cardBody}>
                {session.readiness_score !== null && session.readiness_score !== undefined ? (
                  <>
                    <div className={styles.score}>{session.readiness_score}</div>
                    <div className={styles.scoreLabel}>Readiness Score</div>
                  </>
                ) : (
                  <div className={styles.scoreLabel}>Pending Evaluation</div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
