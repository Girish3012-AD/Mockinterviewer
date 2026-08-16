// InterviewOS — TypeScript type definitions
// Mirrors backend/schemas.py Pydantic models

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface InterviewQuestion {
  id: number;
  question: string;
  type: 'Behavioral' | 'Technical';
  focus_area: string;
}

export interface InterviewPlan {
  session_id: string;
  interview_plan: InterviewQuestion[];
}

export interface ResumeClaim {
  claim_text: string;
  category: string;
  skill_tags: string[];
  importance: number;
  interview_risk: 'High' | 'Medium' | 'Low';
  risk_rationale: string;
}

export interface SkillGap {
  skill: string;
  gap_type: 'Missing' | 'Weak' | 'Unverified' | 'Strong';
  explanation: string;
}

export interface JobFitAnalysis {
  session_id: string;
  required_skills: string[];
  readiness_score_percentage: number;
  skill_gaps: SkillGap[];
}

export interface EvaluationScores {
  technical_correctness: number;
  ownership: number;
}

export interface EvaluateAnswerResponse {
  evaluation_scores: EvaluationScores;
  claim_credibility: 'High' | 'Medium' | 'Low' | 'Fabricated';
  evidence_rationale: string;
  next_question_strategy: string;
}

export interface ShadowCompilerReport {
  correct: boolean;
  correctness_score: number;
  time_complexity: string | null;
  space_complexity: string | null;
  issues: string[] | null;
  feedback: string | null;
}

export interface CodeSubmitResponse {
  stdout: string;
  stderr: string;
  exit_code: number;
  shadow_report: ShadowCompilerReport | null;
}

export interface StarBreakdown {
  situation: number;
  task: number;
  action: number;
  result: number;
}

export interface EvaluationResponse {
  session_id: string;
  overall_score: number;
  recommendation: string;
  star_breakdown: StarBreakdown;
  strengths: string[];
  weaknesses: string[];
  ideal_rewrite: string;
  raw_markdown: string;
}

export interface SessionListItem {
  id: string;
  status: string;
  created_at: string;
  readiness_score: number | null;
  recovery_score?: number | null;
}

export interface SessionDetail {
  id: string;
  status: string;
  job_desc: string;
  resume: string;
  created_at: string;
  updated_at: string;
  readiness_score: number | null;
  recovery_score?: number | null;
  questions: InterviewQuestion[];
  evaluation: EvaluationResponse | null;
}

// WebSocket message types
export type WsMessageType =
  | 'chat'
  | 'interview_plan'
  | 'interview_complete'
  | 'error'
  | 'typing';

export interface WsMessage {
  type: WsMessageType;
  content: string;
  metadata?: Record<string, unknown>;
}
