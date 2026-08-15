/**
 * ChatBubble.tsx — Individual message bubble (user vs assistant)
 */
import styles from './ChatBubble.module.css';
import type { Message } from '@/types';

interface Props {
  message: Message;
}

export function TypingIndicator() {
  return (
    <div className={`${styles.bubble} ${styles['bubble--assistant']}`}>
      <div className={styles.avatar}>A</div>
      <div className={`${styles.messageBox} ${styles.typingIndicator}`}>
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </div>
    </div>
  );
}

export function ChatBubble({ message }: Props) {
  const isUser = message.role === 'user';

  return (
    <div className={`${styles.bubble} ${isUser ? styles['bubble--user'] : styles['bubble--assistant']}`}>
      <div className={styles.avatar}>
        {isUser ? 'Y' : 'A'}
      </div>
      <div className={styles.messageBox}>
        {message.content}
      </div>
    </div>
  );
}
