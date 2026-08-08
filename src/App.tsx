import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Send, Volume2, VolumeX, User, Bot, Play, Square, FileText, ClipboardList, CheckCircle } from 'lucide-react';
import { Message, InterviewPlan } from './types';
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
                setJobDescription("Looking for a Backend Engineer with 2+ years of experience in Python, FastAPI, PostgreSQL, and AWS (Cloud Run / Lambda). Must have experience building RESTful APIs and optimizing database queries.");
                setResume("Software Developer with experience in Python, Flask, and MySQL. Built a web-based complaint system using Flask and MySQL. Knowledge of DSA, Java, and basic cloud deployment.");
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
            </div>
          </div>

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

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
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

