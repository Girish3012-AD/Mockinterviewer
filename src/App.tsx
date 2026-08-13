import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Send, Volume2, VolumeX, User, Bot, Play, Square, FileText, ClipboardList, CheckCircle, Target, Activity, Zap } from 'lucide-react';
import { Message, InterviewPlan, ResumeClaim, JobFitAnalysis, AnswerEvaluation } from './types';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';

type Step = 'setup' | 'interview' | 'feedback';

export default function App() {
  const [step, setStep] = useState<Step>('setup');
  
  const urlParams = new URLSearchParams(window.location.search);
  const isPaid = urlParams.get('paid') === 'true';
  const stripePaymentLink = "https://buy.stripe.com/plink_1U1YnV1dgaKpbfvEhgj0G2O0";

  // Setup State
  const [jobDescription, setJobDescription] = useState('');
  const [resume, setResume] = useState('');
  const [interviewPlan, setInterviewPlan] = useState<InterviewPlan | null>(null);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [resumeClaims, setResumeClaims] = useState<ResumeClaim[] | null>(null);
  const [isExtractingClaims, setIsExtractingClaims] = useState(false);
  const [jobFitAnalysis, setJobFitAnalysis] = useState<JobFitAnalysis | null>(null);
  const [isAnalyzingJobFit, setIsAnalyzingJobFit] = useState(false);
  const [trialsRemaining, setTrialsRemaining] = useState<number>(() => {
    const stored = localStorage.getItem('interview_trials');
    return stored !== null ? parseInt(stored, 10) : 3;
  });

  // Interview State
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isDictating, setIsDictating] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  
  // Evaluator State
  const [selectedClaimIndex, setSelectedClaimIndex] = useState<number>(0);
  const [latestEvaluation, setLatestEvaluation] = useState<AnswerEvaluation | null>(null);
  const [isEvaluatingAnswer, setIsEvaluatingAnswer] = useState(false);
  
  // Feedback State
  const [feedback, setFeedback] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Speech Recognition Setup
  useEffect(() => {
    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      
      recognitionRef.current.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0])
          .map((result) => result.transcript)
          .join('');
        setInput(transcript);
      };

      recognitionRef.current.onend = () => {
        setIsDictating(false);
      };
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (step === 'interview') {
      scrollToBottom();
    }
  }, [messages, isLoading, step]);

  const speak = (text: string) => {
    if (!isVoiceEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.name.includes('Google') || v.name.includes('Siri') || v.name.includes('UK English')) || voices[0];
    if (preferredVoice) utterance.voice = preferredVoice;
    
    utterance.rate = 1.05;
    utterance.pitch = 0.95;
    window.speechSynthesis.speak(utterance);
  };

  const stopAudio = () => {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  };

  const toggleDictation = () => {
    if (isDictating) {
      recognitionRef.current?.stop();
      setIsDictating(false);
    } else {
      recognitionRef.current?.start();
      setIsDictating(true);
    }
  };

  const extractClaims = async () => {
    if (!resume.trim()) return;
    setIsExtractingClaims(true);
    try {
      const res = await fetch('/api/extract-claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume })
      });
      if (!res.ok) throw new Error("Failed to extract claims");
      const data = await res.json();
      setResumeClaims(data);
    } catch (e) {
      console.error(e);
      alert("Failed to extract claims.");
    } finally {
      setIsExtractingClaims(false);
    }
  };

  const analyzeJobFit = async () => {
    if (!jobDescription.trim() || !resumeClaims) return;
    setIsAnalyzingJobFit(true);
    try {
      const res = await fetch('/api/analyze-job-fit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobDescription, resumeClaims })
      });
      if (!res.ok) throw new Error("Failed to analyze job fit");
      const data = await res.json();
      setJobFitAnalysis(data);
    } catch (e) {
      console.error(e);
      alert("Failed to analyze job fit.");
    } finally {
      setIsAnalyzingJobFit(false);
    }
  };

  // Step 1: Generate Questions
  const generateQuestions = async () => {
    if (!jobDescription.trim() || !resume.trim()) return;
    setIsGeneratingPlan(true);
    try {
      const res = await fetch('/api/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobDescription, resume })
      });
      if (!res.ok) throw new Error("Failed to generate questions");
      const data = await res.json();
      setInterviewPlan(data);
    } catch (e) {
      console.error(e);
      alert("Failed to generate interview plan.");
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const startInterview = async () => {
    if (!isPaid && trialsRemaining <= 0) {
      alert("No free trials remaining. Please purchase access to continue.");
      return;
    }

    if (!isPaid && trialsRemaining > 0) {
      const newCount = trialsRemaining - 1;
      setTrialsRemaining(newCount);
      localStorage.setItem('interview_trials', newCount.toString());
    }

    setStep('interview');
    setIsLoading(true);
    const hiddenPrompt = "Hello Alex, the candidate has joined the call. Please introduce yourself and ask the first question to kick off the interview.";
    
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: [], message: hiddenPrompt, interviewPlan })
      });
      
      if (!res.ok) throw new Error("Failed to connect");
      const data = await res.json();
      
      const botMsg: Message = { role: 'model', text: data.text };
      setMessages([botMsg]);
      speak(data.text);
    } catch (e) {
      console.error(e);
      setMessages([{ role: 'model', text: "I'm having trouble connecting to our systems. Could you refresh the page?" }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Handle Chat
  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    
    const userMsg: Message = { role: 'user', text: input };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput('');
    setIsLoading(true);
    
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: messages, message: userMsg.text, interviewPlan })
      });
      
      if (!res.ok) throw new Error("Network response was not ok");
      
      const data = await res.json();
      const botMsg: Message = { role: 'model', text: data.text };
      setMessages([...newHistory, botMsg]);
      speak(data.text);
    } catch (e) {
      console.error(e);
      setMessages([...newHistory, { role: 'model', text: "Sorry, I lost connection for a moment. Could you repeat that?" }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEvaluateAnswer = async () => {
    const userMsgs = messages.filter(m => m.role === 'user');
    if (userMsgs.length === 0) return;
    const lastUserMsg = userMsgs[userMsgs.length - 1];
    
    const lastUserIdx = messages.lastIndexOf(lastUserMsg);
    let lastModelMsg = null;
    for (let i = lastUserIdx - 1; i >= 0; i--) {
       if (messages[i].role === 'model') {
           lastModelMsg = messages[i];
           break;
       }
    }
    
    if (!lastModelMsg || !resumeClaims || resumeClaims.length === 0) return;
    const claim = resumeClaims[selectedClaimIndex].claim_text;

    setIsEvaluatingAnswer(true);
    try {
      const res = await fetch('/api/evaluate-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
           claim,
           question: lastModelMsg.text,
           answer: lastUserMsg.text
        })
      });
      if (!res.ok) throw new Error("Failed to evaluate answer");
      const data = await res.json();
      setLatestEvaluation(data);
    } catch(e) {
       console.error(e);
       alert("Failed to evaluate answer against claim.");
    } finally {
       setIsEvaluatingAnswer(false);
    }
  };

  const endInterviewAndEvaluate = async () => {
    stopAudio();
    setIsEvaluating(true);
    try {
      // Build transcript
      const transcript = messages.map(m => `${m.role === 'model' ? 'Interviewer' : 'Candidate'}: ${m.text}`).join('\n\n');
      
      const res = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript })
      });
      if (!res.ok) throw new Error("Failed to evaluate");
      const data = await res.json();
      setFeedback(data.feedback);
      setStep('feedback');
    } catch (e) {
      console.error(e);
      alert("Failed to generate feedback.");
    } finally {
      setIsEvaluating(false);
    }
  };

  // Renders
  if (step === 'setup') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center py-12 px-4 text-slate-200">
        <div className="max-w-4xl w-full space-y-8">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-blue-600/20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-500/30">
              <ClipboardList className="w-8 h-8 text-blue-500" />
            </div>
            <h1 className="text-3xl font-bold text-white">Interview Configuration</h1>
            <p className="text-slate-400">Provide the context to generate a tailored interview plan.</p>
            <button 
              onClick={() => {
                setJobDescription(`Position: Senior AI/ML Backend Engineer
Company: InnovateTech
Role Requirements:
- 5+ years building and scaling RESTful APIs and microservices in Python (FastAPI, Flask) and Node.js.
- Strong expertise in distributed systems, AWS (EKS, Lambda, S3, RDS), and CI/CD pipelines (GitHub Actions).
- Proven experience deploying and fine-tuning Large Language Models (LLMs) in production environments.
- Excellent system design skills and experience optimizing PostgreSQL for high-volume read/write workloads.
- Strong communication skills, with a track record of mentoring junior engineers and leading cross-functional projects.
- Must have experience with Vector Databases (Pinecone, Weaviate) and Retrieval-Augmented Generation (RAG) architectures.`);
                
                setResume(`ALICE ENGINEER
Senior Backend Developer | AI Specialist
alice.engineer@email.com | github.com/alice-eng

PROFESSIONAL EXPERIENCE

Senior Backend Engineer, DataCorp (2020 - Present)
- Designed and developed a scalable REST API using Node.js and Express, supporting 50,000+ daily active users.
- Migrated legacy monolithic architecture to AWS microservices (Lambda, ECS), reducing infrastructure costs by 35% and improving uptime to 99.99%.
- Spearheaded the integration of OpenAI APIs and Pinecone vector database to build an enterprise RAG-based search tool, decreasing customer support ticket volume by 20%.
- Optimized legacy PostgreSQL queries by introducing proper indexing and materialized views, reducing average latency from 800ms to 45ms.
- Mentored a team of 3 junior developers and established code review guidelines.

Software Developer, WebSolutions (2017 - 2020)
- Built internal dashboard applications using Python Flask and React.
- Managed MySQL databases, writing complex joins and stored procedures for reporting.
- Deployed applications on DigitalOcean and managed basic CI/CD with Jenkins.

EDUCATION
B.S. in Computer Science, State University (2017)`);
              }}
              className="mt-4 text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 py-1.5 px-4 rounded-full transition-colors border border-slate-700"
            >
              Load Dummy Data
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                <FileText className="w-4 h-4" /> Job Description
              </label>
              <textarea 
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Paste the target job description here..."
                className="w-full h-64 bg-slate-900 border border-slate-800 rounded-xl p-4 text-sm text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none transition-colors"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                <User className="w-4 h-4" /> Candidate Resume
              </label>
              <textarea 
                value={resume}
                onChange={(e) => setResume(e.target.value)}
                placeholder="Paste the candidate's resume here..."
                className="w-full h-64 bg-slate-900 border border-slate-800 rounded-xl p-4 text-sm text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none transition-colors"
              />
              <button
                onClick={extractClaims}
                disabled={!resume.trim() || isExtractingClaims}
                className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-medium py-2 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm border border-slate-700"
              >
                {isExtractingClaims ? (
                   <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Extracting...
                  </>
                ) : (
                  <>
                    <Target className="w-4 h-4" />
                    Extract Claims
                  </>
                )}
              </button>
            </div>
          </div>
          
          {resumeClaims && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4"
            >
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <Target className="w-5 h-5 text-purple-500" />
                Atomic Resume Claims
              </h2>
              <div className="grid gap-3">
                {resumeClaims.map((claim, idx) => (
                  <div key={idx} className="bg-slate-950/50 rounded-xl p-4 border border-slate-800/50 flex gap-4 items-start">
                     <div className="flex-1 space-y-2">
                        <p className="text-slate-200 text-sm">{claim.claim_text}</p>
                        <div className="flex flex-wrap gap-2">
                          <span className="text-xs bg-slate-800 text-slate-400 px-2 py-1 rounded-md border border-slate-700 uppercase">
                            {claim.category}
                          </span>
                          {claim.skill_tags.map(tag => (
                            <span key={tag} className="text-xs bg-blue-900/30 text-blue-400 px-2 py-1 rounded-md border border-blue-800/50">
                              {tag}
                            </span>
                          ))}
                        </div>
                     </div>
                     <div className="shrink-0 flex flex-col items-center justify-center bg-slate-900 w-12 h-12 rounded-full border border-slate-700">
                        <span className="text-lg font-bold text-white">{claim.importance}</span>
                        <span className="text-[10px] text-slate-500 uppercase font-semibold">/ 5</span>
                     </div>
                  </div>
                ))}
              </div>

              {!jobFitAnalysis && (
                <div className="pt-6 border-t border-slate-800 mt-2">
                  <button
                    onClick={analyzeJobFit}
                    disabled={isAnalyzingJobFit || !jobDescription.trim()}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/20 border border-indigo-500/50"
                  >
                    {isAnalyzingJobFit ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Analyzing Job Fit...
                      </>
                    ) : (
                      <>
                        <ClipboardList className="w-5 h-5" />
                        Analyze Job Fit
                      </>
                    )}
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {jobFitAnalysis && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6"
            >
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-indigo-500" />
                  Job Fit Analysis
                </h2>
                <div className="flex flex-col items-center justify-center bg-indigo-900/40 border border-indigo-700/50 rounded-xl px-4 py-2">
                   <span className="text-2xl font-bold text-indigo-400">{jobFitAnalysis.readiness_score_percentage}%</span>
                   <span className="text-[10px] text-indigo-300 uppercase font-semibold">Readiness Score</span>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Required Skills</h3>
                <div className="flex flex-wrap gap-2">
                  {jobFitAnalysis.required_skills.map((skill, idx) => (
                    <span key={idx} className="text-xs bg-slate-800 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Skill Gaps</h3>
                <div className="grid gap-3">
                  {jobFitAnalysis.skill_gaps.map((gap, idx) => {
                    let colorClass = "text-slate-400 bg-slate-800 border-slate-700";
                    if (gap.gap_type === 'Missing') colorClass = "text-red-400 bg-red-950/30 border-red-900/50";
                    if (gap.gap_type === 'Weak') colorClass = "text-orange-400 bg-orange-950/30 border-orange-900/50";
                    if (gap.gap_type === 'Unverified') colorClass = "text-yellow-400 bg-yellow-950/30 border-yellow-900/50";
                    if (gap.gap_type === 'Strong') colorClass = "text-emerald-400 bg-emerald-950/30 border-emerald-900/50";
                    
                    return (
                      <div key={idx} className="bg-slate-950/50 rounded-xl p-4 border border-slate-800/50 flex flex-col md:flex-row gap-4 items-start md:items-center">
                         <div className="flex-1">
                            <p className="text-slate-200 font-medium mb-1">{gap.skill}</p>
                            <p className="text-slate-400 text-sm">{gap.explanation}</p>
                         </div>
                         <span className={`shrink-0 text-xs px-3 py-1 rounded-full border ${colorClass} font-semibold uppercase tracking-wide`}>
                           {gap.gap_type}
                         </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {!interviewPlan ? (
            <div className="flex justify-center pt-4">
              <button 
                onClick={generateQuestions}
                disabled={!jobDescription.trim() || !resume.trim() || isGeneratingPlan}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 text-white font-medium py-3 px-8 rounded-xl transition-colors flex items-center gap-2 shadow-lg shadow-blue-900/20"
              >
                {isGeneratingPlan ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Generating Plan...
                  </>
                ) : (
                  'Generate Interview Plan'
                )}
              </button>
            </div>
          ) : (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6 shadow-xl"
            >
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-500" />
                Generated Interview Plan
              </h2>
              <div className="space-y-4">
                {interviewPlan.interview_plan.map((q) => (
                  <div key={q.id} className="bg-slate-950/50 rounded-xl p-4 border border-slate-800/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                        q.type === 'Behavioral' ? 'bg-purple-500/20 text-purple-400' : 'bg-orange-500/20 text-orange-400'
                      }`}>
                        {q.type}
                      </span>
                      <span className="text-xs text-slate-500 font-medium">Focus: {q.focus_area}</span>
                    </div>
                    <p className="text-slate-300 text-sm">{q.question}</p>
                  </div>
                ))}
              </div>
              <div className="flex justify-center pt-4">
                {(isPaid || trialsRemaining > 0) ? (
                  <div className="flex flex-col items-center gap-3">
                    <button 
                      onClick={startInterview}
                      className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-3 px-12 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20"
                    >
                      <Play className="w-5 h-5 fill-current" />
                      Start Live Interview 🎙️
                    </button>
                    {!isPaid && (
                      <p className="text-sm font-medium text-emerald-400">
                        {trialsRemaining} free trial{trialsRemaining !== 1 ? 's' : ''} remaining
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <a 
                      href={stripePaymentLink}
                      className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-12 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/20 inline-block text-center"
                    >
                      Pay $9.00 to Unlock Live Interview 🔒
                    </a>
                    <p className="text-sm font-medium text-red-400">
                      0 free trials remaining
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    );
  }

  if (step === 'feedback') {
    return (
      <div className="min-h-screen bg-slate-950 py-12 px-4 flex justify-center overflow-y-auto">
        <div className="max-w-3xl w-full">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-8">
            <div className="text-center space-y-2 border-b border-slate-800 pb-6">
              <h1 className="text-3xl font-bold text-white">Post-Interview Scorecard</h1>
              <p className="text-slate-400">STAR Method Evaluation</p>
            </div>
            
            <div className="text-slate-300">
               <div className="markdown-body">
                  <ReactMarkdown>{feedback}</ReactMarkdown>
               </div>
            </div>

            <div className="pt-6 border-t border-slate-800 flex justify-center">
              <button 
                onClick={() => {
                  setStep('setup');
                  setJobDescription('');
                  setResume('');
                  setInterviewPlan(null);
                  setMessages([]);
                  setFeedback('');
                }}
                className="bg-slate-800 hover:bg-slate-700 text-white font-medium py-3 px-8 rounded-xl transition-colors"
              >
                Start New Interview
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col text-slate-200 font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800 shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 bg-blue-600/20 rounded-full flex items-center justify-center border border-blue-500/30">
              <Bot className="w-5 h-5 text-blue-500" />
            </div>
            {isLoading && (
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-blue-500 rounded-full border-2 border-slate-900 animate-pulse" />
            )}
            {!isLoading && (
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-slate-900" />
            )}
          </div>
          <div>
            <h1 className="font-semibold text-white leading-tight">Alex</h1>
            <p className="text-xs text-slate-400">Senior Technical Recruiter</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 border-r border-slate-700 pr-4">
            <button 
              onClick={() => {
                if (isVoiceEnabled) stopAudio();
                setIsVoiceEnabled(!isVoiceEnabled);
              }}
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 transition-colors"
              title={isVoiceEnabled ? "Mute Alex" : "Unmute Alex"}
            >
              {isVoiceEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </button>
            {isVoiceEnabled && (
               <button onClick={stopAudio} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 transition-colors" title="Stop current audio">
                  <Square className="w-4 h-4" />
               </button>
            )}
          </div>
          <button 
            onClick={endInterviewAndEvaluate}
            disabled={isEvaluating}
            className="text-sm font-medium bg-slate-800 hover:bg-slate-700 border border-slate-700 px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
          >
            {isEvaluating ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Evaluating...
              </>
            ) : (
              'End & Evaluate'
            )}
          </button>
        </div>
      </header>

      {/* Chat Area & Adaptive Evaluator */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat Area */}
        <main className={`flex-1 overflow-y-auto p-4 md:p-6 space-y-6 ${resumeClaims && resumeClaims.length > 0 ? 'border-r border-slate-800' : ''}`}>
          <AnimatePresence initial={false}>
            {messages.map((msg, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 ${
                  msg.role === 'user' ? 'bg-slate-800' : 'bg-blue-600/20 border border-blue-500/30'
                }`}>
                  {msg.role === 'user' ? <User className="w-4 h-4 text-slate-300" /> : <Bot className="w-4 h-4 text-blue-500" />}
                </div>
                <div className={`max-w-[85%] md:max-w-[75%] rounded-2xl px-5 py-3 shadow-sm ${
                  msg.role === 'user' 
                    ? 'bg-blue-600 text-white rounded-tr-sm' 
                    : 'bg-slate-800 text-slate-100 rounded-tl-sm border border-slate-700'
                }`}>
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                </div>
              </motion.div>
            ))}
            {isLoading && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex gap-4"
              >
                 <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shrink-0 mt-1">
                  <Bot className="w-4 h-4 text-blue-500" />
                </div>
                <div className="bg-slate-800 border border-slate-700 rounded-2xl rounded-tl-sm px-5 py-4 flex gap-1 items-center shadow-sm">
                  <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </main>

        {/* Adaptive Evaluator Panel (Right Side) */}
        {resumeClaims && resumeClaims.length > 0 && (
          <aside className="w-96 shrink-0 bg-slate-900/50 flex flex-col overflow-y-auto hidden lg:flex">
            <div className="p-4 border-b border-slate-800 bg-slate-900 sticky top-0 z-10">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Activity className="w-5 h-5 text-indigo-400" />
                Adaptive Evaluator
              </h2>
              <p className="text-xs text-slate-400 mt-1">Test candidate's answer against a specific claim.</p>
            </div>
            
            <div className="p-4 space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Target Resume Claim:</label>
                <select 
                  className="w-full bg-slate-800 border border-slate-700 text-sm text-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-indigo-500 outline-none"
                  value={selectedClaimIndex}
                  onChange={(e) => setSelectedClaimIndex(Number(e.target.value))}
                >
                  {resumeClaims.map((claim, idx) => (
                    <option key={idx} value={idx}>
                      [{claim.category}] {claim.claim_text.substring(0, 50)}...
                    </option>
                  ))}
                </select>
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 text-xs text-slate-300 italic">
                  "{resumeClaims[selectedClaimIndex].claim_text}"
                </div>
              </div>

              <button
                onClick={handleEvaluateAnswer}
                disabled={isEvaluatingAnswer || messages.filter(m => m.role === 'user').length === 0}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-2 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm border border-indigo-500/50 shadow-sm"
              >
                {isEvaluatingAnswer ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Evaluating...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    Evaluate Last Answer
                  </>
                )}
              </button>

              {latestEvaluation && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 shadow-sm">
                    <div className="flex justify-between items-center mb-3 border-b border-slate-800 pb-2">
                       <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Credibility</span>
                       <span className={`text-xs font-bold px-2 py-1 rounded border ${
                         latestEvaluation.claim_credibility === 'Strongly supported' ? 'bg-emerald-900/30 text-emerald-400 border-emerald-800' :
                         latestEvaluation.claim_credibility === 'Partially supported' ? 'bg-blue-900/30 text-blue-400 border-blue-800' :
                         latestEvaluation.claim_credibility === 'Weakly supported' ? 'bg-yellow-900/30 text-yellow-400 border-yellow-800' :
                         'bg-red-900/30 text-red-400 border-red-800'
                       }`}>
                         {latestEvaluation.claim_credibility}
                       </span>
                    </div>
                    
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-400">Technical Correctness</span>
                          <span className="text-slate-300 font-medium">{latestEvaluation.evaluation_scores.technical_correctness}/5</span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-1.5">
                          <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${(latestEvaluation.evaluation_scores.technical_correctness / 5) * 100}%` }}></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-400">Ownership</span>
                          <span className="text-slate-300 font-medium">{latestEvaluation.evaluation_scores.ownership}/5</span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-1.5">
                          <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${(latestEvaluation.evaluation_scores.ownership / 5) * 100}%` }}></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 shadow-sm space-y-2">
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Rationale</h4>
                    <p className="text-sm text-slate-300 leading-relaxed">
                      {latestEvaluation.evidence_rationale}
                    </p>
                  </div>

                  <div className="bg-indigo-950/30 border border-indigo-900/50 rounded-xl p-4 shadow-sm space-y-2">
                    <h4 className="text-xs font-semibold text-indigo-400 uppercase tracking-wide flex items-center gap-1">
                      <Bot className="w-3 h-3" /> Next Strategy
                    </h4>
                    <p className="text-sm text-indigo-200 leading-relaxed">
                      {latestEvaluation.next_question_strategy}
                    </p>
                  </div>
                </motion.div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Input Area */}
      <footer className="bg-slate-900 border-t border-slate-800 p-4 shrink-0 shadow-lg z-10">
        <div className="max-w-4xl mx-auto flex items-end gap-2">
          <button
            onClick={toggleDictation}
            className={`p-3 md:p-4 rounded-xl shrink-0 transition-colors shadow-sm ${
              isDictating 
                ? 'bg-red-500/20 text-red-500 border border-red-500/30 hover:bg-red-500/30' 
                : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700 hover:text-slate-200'
            }`}
            title={isDictating ? "Stop Dictation" : "Start Voice Dictation"}
          >
            {isDictating ? <Mic className="w-5 h-5 animate-pulse" /> : <MicOff className="w-5 h-5" />}
          </button>
          
          <div className="flex-1 relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={isDictating ? "Listening..." : "Type your answer or use the microphone..."}
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl pl-4 pr-12 py-3 md:py-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none max-h-32 shadow-sm"
              rows={1}
              style={{ minHeight: '52px' }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="absolute right-2 bottom-2 md:bottom-3 p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors shadow-sm"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="max-w-4xl mx-auto mt-2 text-center">
           <p className="text-xs text-slate-500">For the best experience, allow microphone access and use headphones to avoid echo.</p>
        </div>
      </footer>
    </div>
  );
}

