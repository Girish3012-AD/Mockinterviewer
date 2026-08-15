'use client';
/**
 * CodeEditor.tsx — Monaco Editor for Java code submission.
 */
import { useRef } from 'react';
import Editor from '@monaco-editor/react';
import styles from './CodeEditor.module.css';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isRunning: boolean;
  question?: string;
}

const JAVA_STARTER = `public class Solution {
    public static void main(String[] args) {
        // Write your solution here
        
    }
}`;

export function CodeEditor({ value, onChange, onSubmit, isRunning, question }: Props) {
  const editorRef = useRef<unknown>(null);

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <span className={styles.lang}>Java</span>
        {question && (
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-muted)', flex: 1, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {question}
          </span>
        )}
        <div className={styles.actions}>
          <button
            id="code-reset-btn"
            className="btn btn--ghost btn--sm"
            onClick={() => onChange(JAVA_STARTER)}
            title="Reset to starter code"
          >
            ↺ Reset
          </button>
          <button
            id="code-run-btn"
            className={`btn btn--primary btn--sm ${isRunning ? 'btn--loading' : ''}`}
            onClick={onSubmit}
            disabled={isRunning}
          >
            {isRunning ? '' : '▶ Run'}
          </button>
        </div>
      </div>

      <div className={styles.editorContainer}>
        <Editor
          height="100%"
          defaultLanguage="java"
          value={value || JAVA_STARTER}
          onChange={(v) => onChange(v ?? '')}
          onMount={(editor) => { editorRef.current = editor; }}
          theme="vs-dark"
          options={{
            fontSize: 14,
            fontFamily: 'JetBrains Mono, Fira Code, monospace',
            fontLigatures: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            padding: { top: 16, bottom: 16 },
            lineNumbersMinChars: 3,
            renderLineHighlight: 'line',
            tabSize: 4,
            insertSpaces: true,
            automaticLayout: true,
          }}
        />
      </div>
    </div>
  );
}
