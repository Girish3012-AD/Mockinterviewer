'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from './page.module.css';
import { ChatWindow } from '@/components/ChatWindow';
import { CodeEditor } from '@/components/CodeEditor';
import { CodeOutput } from '@/components/CodeOutput';
import { Timer } from '@/components/Timer';
import { ProgressBar } from '@/components/ProgressBar';
import { useToast } from '@/components/Toast';
import { useWebSocket } from '@/hooks/useWebSocket';
import { submitCode, startSession } from '@/services/api';
import type { Message, WsMessage } from '@/types';

function InterviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session');
  const { showToast } = useToast();

  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(5);
  const [currentQuestion, setCurrentQuestion] = useState('');
  
  const [codeValue, setCodeValue] = useState('');
  const [isCodeRunning, setIsCodeRunning] = useState(false);
  const [stdout, setStdout] = useState('');
  const [stderr, setStderr] = useState('');
  const [exitCode, setExitCode] = useState<number | null>(null);

  const handleWsMessage = useCallback((msg: WsMessage) => {
    switch (msg.type) {
      case 'chat':
        if (msg.content) {
          setMessages(prev => [...prev, { role: 'assistant', content: msg.content }]);
        }
        setIsTyping(false);
        break;
      case 'typing':
        setIsTyping(true);
        break;
      case 'interview_plan':
        if (msg.metadata?.questions) {
          const qs = msg.metadata.questions as Array<{ question: string }>;
          setTotalQuestions(qs.length);
        }
        break;
      case 'interview_complete':
        router.push(`/scorecard?session=${sessionId}`);
        break;
      case 'error':
        showToast('error', msg.content || 'An error occurred.');
        setIsTyping(false);
        break;
      default:
        console.warn('Unknown message type:', msg);
    }
  }, [router, sessionId, showToast]);

  const { connectionState, send, connect, disconnect } = useWebSocket({
    onMessage: handleWsMessage,
    onError: () => showToast('error', 'WebSocket connection error.')
  });

  useEffect(() => {
    if (!sessionId) {
      router.push('/');
      return;
    }
    
    const init = async () => {
      try {
        await startSession(sessionId);
      } catch {
        // Session may already be active
      }
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const defaultWsBase = `${wsProtocol}//${window.location.host}`;
      const envWsBase = process.env.NEXT_PUBLIC_WS_URL;
      const wsBase = envWsBase ? envWsBase.replace(/\/$/, '') : defaultWsBase;
      connect(`${wsBase}/ws/interview/${sessionId}`);
    };


    init();

    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const handleSendMessage = (content: string) => {
    setMessages(prev => [...prev, { role: 'user', content }]);
    send({ type: 'chat', content });
  };

  const handleCodeSubmit = async () => {
    if (!sessionId) return;
    setIsCodeRunning(true);
    try {
      const res = await submitCode(sessionId, codeValue, currentQuestion || 'Coding question');
      setStdout(res.stdout);
      setStderr(res.stderr);
      setExitCode(res.exit_code);
    } catch {
      showToast('error', 'Failed to execute code.');
    } finally {
      setIsCodeRunning(false);
    }
  };

  const handleEndInterview = () => {
    if (window.confirm('Are you sure you want to end the interview?')) {
      send({ type: 'end_interview', content: '' });
      router.push(`/scorecard?session=${sessionId}`);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.topbar}>
        <div className={styles.actions}>
          <Timer startTime={startTime} isActive={connectionState === 'connected'} />
        </div>
        <div className={styles.progressContainer}>
          <ProgressBar current={currentQuestionIdx} total={totalQuestions} label="Interview Progress" />
        </div>
        <button className={styles.endButton} onClick={handleEndInterview}>
          End Interview
        </button>
      </div>

      <div className={styles.main}>
        <div className={styles.chatSection}>
          <ChatWindow
            messages={messages}
            isTyping={isTyping}
            connectionState={connectionState}
            onSend={handleSendMessage}
            disabled={connectionState !== 'connected'}
          />
        </div>
        
        <div className={styles.editorSection}>
          <div className={styles.editorWrapper}>
            <CodeEditor
              value={codeValue}
              onChange={(val) => setCodeValue(val || '')}
              onSubmit={handleCodeSubmit}
              isRunning={isCodeRunning}
              question={currentQuestion} 
            />
          </div>
          <div className={styles.outputWrapper}>
            <CodeOutput
              stdout={stdout}
              stderr={stderr}
              exitCode={exitCode}
              isRunning={isCodeRunning}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InterviewPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading interview session...</div>}>
      <InterviewContent />
    </Suspense>
  );
}
