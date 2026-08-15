'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import styles from './page.module.css';
import { Scorecard } from '@/components/Scorecard';
import { useToast } from '@/components/Toast';
import { getSession } from '@/services/api';
import type { SessionDetail } from '@/types';

function ScorecardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session');
  const { showToast } = useToast();

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) {
      router.push('/');
      return;
    }

    const fetchSession = async () => {
      try {
        const data = await getSession(sessionId);
        setSession(data);
      } catch (error) {
        showToast('error', 'Failed to load scorecard.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSession();
  }, [sessionId, router, showToast]);

  if (isLoading) {
    return <div className={styles.loading}>Generating scorecard...</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Interview Results</h1>
        <div className={styles.actions}>
          <Link href="/history" className={`${styles.btn} ${styles.btnSecondary}`}>
            View History
          </Link>
          <Link href="/" className={`${styles.btn} ${styles.btnPrimary}`}>
            New Interview
          </Link>
        </div>
      </div>
      
      <Scorecard evaluation={session?.evaluation || null} />
    </div>
  );
}

export default function ScorecardPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading scorecard...</div>}>
      <ScorecardContent />
    </Suspense>
  );
}
