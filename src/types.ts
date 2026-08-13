export interface Message {
  role: 'user' | 'model';
  text: string;
}

export interface InterviewQuestion {
  id: number;
  question: string;
  type: 'Behavioral' | 'Technical';
  focus_area: string;
}

export interface InterviewPlan {
  interview_plan: InterviewQuestion[];
}

export interface ResumeClaim {
  claim_text: string;
  category: string;
  skill_tags: string[];
  importance: number;
}

export interface SkillGap {
  skill: string;
  gap_type: 'Missing' | 'Weak' | 'Unverified' | 'Strong';
  explanation: string;
}

export interface JobFitAnalysis {
  required_skills: string[];
  readiness_score_percentage: number;
  skill_gaps: SkillGap[];
}

export interface AnswerEvaluation {
  evaluation_scores: {
    technical_correctness: number;
    ownership: number;
  };
  claim_credibility: string;
  evidence_rationale: string;
  next_question_strategy: string;
}

