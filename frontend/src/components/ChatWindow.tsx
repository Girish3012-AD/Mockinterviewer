'use client';
/**
 * ChatWindow.tsx — WebSocket-driven message list with auto-scroll and input bar.
 */
import { useEffect, useRef, useState } from 'react';
import { ChatBubble, TypingIndicator } from './ChatBubble';
import styles from './ChatWindow.module.css';
import type { Message } from '@/types';

interface Props {
  messages: Message[];
  isTyping: boolean;
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'error';
  onSend: (content: string) => void;
  disabled?: boolean;
}

const CONNECTION_LABELS: Record<string, string> = {
  connecting: '⏳ Connecting to interview server...',
  connected: '● Connected',
  disconnected: '✕ Disconnected',
  error: '✕ Connection error',
};

export function ChatWindow({ messages, isTyping, connectionState, onSend, disabled }: Props) {
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight}px`;
    }
  }, [draft]);

  const handleSend = () => {
    const text = draft.trim();
    if (!text || disabled || connectionState !== 'connected') return;
    onSend(text);
    setDraft('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = draft.trim().length > 0 && connectionState === 'connected' && !disabled;

  return (
    <div className={styles.window}>
      {/* Connection banner */}
      {connectionState !== 'connected' && (
        <div className={`${styles.connectionBanner} ${styles[`connectionBanner--${connectionState}`]}`}>
          {CONNECTION_LABELS[connectionState]}
        </div>
      )}

      {/* Message list */}
      <div className={styles.messages} id="chat-messages">
        {messages.length === 0 ? (
          <div className={styles.emptyState}>
            <span>💬</span>
            <span>Waiting for the interview to begin...</span>
          </div>
        ) : (
          messages.map((msg, i) => (
            <ChatBubble key={i} message={msg} />
          ))
        )}
        {isTyping && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className={styles.inputBar}>
        <textarea
          ref={textareaRef}
          id="chat-input"
          className={styles.input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? 'Interview ended.' : 'Type your response... (Enter to send)'}
          disabled={disabled || connectionState !== 'connected'}
          rows={1}
        />
        <button
          id="chat-send-btn"
          className={styles.sendBtn}
          onClick={handleSend}
          disabled={!canSend}
          aria-label="Send message"
          title="Send (Enter)"
        >
          ↑
        </button>
      </div>
    </div>
  );
}
