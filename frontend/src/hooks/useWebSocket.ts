'use client';
/**
 * useWebSocket.ts — Manages WebSocket connection for the live interview.
 *
 * Handles: connect, auto-reconnect, send JSON, receive JSON, connection state.
 * Messages typed by WsMessage discriminated union.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { WsMessage } from '@/types';

type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseWebSocketOptions {
  onMessage: (msg: WsMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (err: Event) => void;
  autoReconnect?: boolean;
  reconnectDelay?: number;
}

interface UseWebSocketReturn {
  connectionState: ConnectionState;
  send: (msg: object) => void;
  connect: (url: string) => void;
  disconnect: () => void;
}

export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
  const {
    onMessage,
    onOpen,
    onClose,
    onError,
    autoReconnect = false,
    reconnectDelay = 3000,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const urlRef = useRef<string>('');
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');

  const connect = useCallback(
    (url: string) => {
      urlRef.current = url;
      if (wsRef.current) {
        wsRef.current.close();
      }

      setConnectionState('connecting');
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionState('connected');
        onOpen?.();
      };

      ws.onmessage = (event) => {
        try {
          const msg: WsMessage = JSON.parse(event.data as string);
          onMessage(msg);
        } catch {
          console.error('Failed to parse WebSocket message:', event.data);
        }
      };

      ws.onclose = () => {
        setConnectionState('disconnected');
        onClose?.();
        if (autoReconnect && urlRef.current) {
          reconnectTimer.current = setTimeout(() => {
            connect(urlRef.current);
          }, reconnectDelay);
        }
      };

      ws.onerror = (err) => {
        setConnectionState('error');
        onError?.(err);
      };
    },
    [onMessage, onOpen, onClose, onError, autoReconnect, reconnectDelay],
  );

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    urlRef.current = '';
    wsRef.current?.close();
    wsRef.current = null;
    setConnectionState('disconnected');
  }, []);

  const send = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    } else {
      console.warn('WebSocket not connected. Message dropped:', msg);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, []);

  return { connectionState, send, connect, disconnect };
}
