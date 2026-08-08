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

