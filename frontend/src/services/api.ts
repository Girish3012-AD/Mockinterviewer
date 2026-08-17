/**
 * api.ts — REST API client for non-WebSocket endpoints
 */
import type {
  CodeSubmitResponse,
  EvaluateAnswerResponse,
  EvaluationResponse,
  InterviewPlan,
  JobFitAnalysis,
  ResumeClaim,
  SessionDetail,
  SessionListItem,
} from '@/types';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error ${response.status}: ${error}`);
  }
  return response.json() as Promise<T>;
}

// --- Session ---

export async function createSession(
  jobDescription: string,
  resume: string,
): Promise<{ session_id: string; status: string }> {
  return fetchJson('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ job_description: jobDescription, resume }),
  });
}

export async function startSession(sessionId: string): Promise<{ status: string }> {
  return fetchJson(`/api/sessions/${sessionId}/start`, { method: 'POST' });
}

export async function endSession(sessionId: string): Promise<EvaluationResponse> {
  return fetchJson(`/api/sessions/${sessionId}/end`, { method: 'POST' });
}

export async function listSessions(): Promise<SessionListItem[]> {
  return fetchJson('/api/sessions');
}

export async function getSession(sessionId: string): Promise<SessionDetail> {
  return fetchJson(`/api/sessions/${sessionId}`);
}

export async function deleteSession(sessionId: string): Promise<void> {
  await fetchJson(`/api/sessions/${sessionId}`, { method: 'DELETE' });
}

// --- Interview ---

export async function generateQuestions(
  sessionId: string,
  jobDescription: string,
  resume: string,
): Promise<InterviewPlan> {
  return fetchJson('/api/generate-questions', {
    method: 'POST',
    body: JSON.stringify({
      session_id: sessionId,
      job_description: jobDescription,
      resume,
    }),
  });
}

// --- Analysis ---

export async function extractClaims(
  sessionId: string,
  resume: string,
): Promise<{ session_id: string; claims: ResumeClaim[] }> {
  return fetchJson('/api/extract-claims', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, resume }),
  });
}

export async function analyzeJobFit(
  sessionId: string,
  jobDescription: string,
  resumeClaims: ResumeClaim[],
): Promise<JobFitAnalysis> {
  return fetchJson('/api/analyze-job-fit', {
    method: 'POST',
    body: JSON.stringify({
      session_id: sessionId,
      job_description: jobDescription,
      resume_claims: resumeClaims,
    }),
  });
}

export async function evaluateAnswer(
  claim: string,
  question: string,
  answer: string,
): Promise<EvaluateAnswerResponse> {
  return fetchJson('/api/evaluate-answer', {
    method: 'POST',
    body: JSON.stringify({ claim, question, answer }),
  });
}

// --- Code ---

export async function submitCode(
  sessionId: string,
  sourceCode: string,
  question: string,
): Promise<CodeSubmitResponse> {
  return fetchJson('/api/code/submit', {
    method: 'POST',
    body: JSON.stringify({
      session_id: sessionId,
      source_code: sourceCode,
      question,
    }),
  });
}
