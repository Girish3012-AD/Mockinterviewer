'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { useToast } from '@/components/Toast';
import { InterviewPlan } from '@/components/InterviewPlan';
import { VulnerabilityMap } from '@/components/VulnerabilityMap';
import { createSession, extractClaims, analyzeJobFit, generateQuestions } from '@/services/api';
import type { ResumeClaim, JobFitAnalysis, InterviewQuestion } from '@/types';

export default function SetupPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [jobDescription, setJobDescription] = useState('');
  const [resume, setResume] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<'input' | 'results'>('input');

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [claims, setClaims] = useState<ResumeClaim[]>([]);
  const [jobFit, setJobFit] = useState<JobFitAnalysis | null>(null);
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);

  const handleAnalyze = async () => {
    if (!jobDescription.trim() || !resume.trim()) {
      showToast('error', 'Please provide both job description and resume.');
      return;
    }

    setIsLoading(true);
    try {
      const session = await createSession(jobDescription, resume);
      const sid = session.session_id;
      setSessionId(sid);

      const claimsRes = await extractClaims(sid, resume);
      setClaims(claimsRes.claims);

      const fitRes = await analyzeJobFit(sid, jobDescription, claimsRes.claims);
      setJobFit(fitRes);

      const planRes = await generateQuestions(sid, jobDescription, resume);
      setQuestions(planRes.interview_plan);

      setStep('results');
      showToast('success', 'Analysis complete!');
    } catch (error) {
      console.error(error);
      showToast('error', 'Failed to analyze inputs. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartInterview = () => {
    if (sessionId) {
      router.push(`/interview?session=${sessionId}`);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>InterviewOS</h1>
        <p className={styles.subtitle}>AI-Powered Mock Interview Platform</p>
      </div>

      {step === 'input' && (
        <div className={styles.form}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Job Description</label>
            <textarea
              className={styles.textarea}
              placeholder="Paste the job description here..."
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Resume</label>
            <textarea
              className={styles.textarea}
              placeholder="Paste your resume here..."
              value={resume}
              onChange={(e) => setResume(e.target.value)}
            />
          </div>
          <button
            className={styles.button}
            onClick={handleAnalyze}
            disabled={isLoading}
          >
            {isLoading ? 'Analyzing Profile...' : 'Analyze & Create Plan'}
          </button>
        </div>
      )}

      {step === 'results' && (
        <div className={styles.results}>
          <VulnerabilityMap claims={claims} />

          {jobFit && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Job Fit Analysis</h3>
              <div className={styles.fitScore}>
                <span className={styles.fitScoreValue}>{jobFit.readiness_score_percentage}/100</span>
                <span>Readiness Score</span>
              </div>
              {jobFit.skill_gaps.length > 0 && (
                <ul className={styles.claimsList}>
                  {jobFit.skill_gaps.map((gap, idx) => (
                    <li key={idx} className={styles.claimBadge}>
                      <strong>{gap.skill}</strong> — {gap.gap_type}: {gap.explanation}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <InterviewPlan
            questions={questions}
            onStart={handleStartInterview}
            isLoading={false}
          />
        </div>
      )}
    </div>
  );
}
