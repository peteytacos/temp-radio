"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type ConnectionState = "connecting" | "open" | "closed" | "error";

interface UseWebSocketOptions {
  onMessage?: (event: MessageEvent) => void;
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
}

/** Close codes that mean "don't reconnect" */
const PERMANENT_CLOSE_CODES = new Set([
  4004, // Room not found
  4008, // Duplicate tab
  4010, // Password required/rejected — client handles UI
  4029, // Rate limited
]);

const MAX_RECONNECT_DELAY = 16_000;
const BASE_RECONNECT_DELAY = 1_000;

export function useWebSocket(
  url: string | null,
  options: UseWebSocketOptions = {}
) {
  const [state, setState] = useState<ConnectionState>("closed");
  const wsRef = useRef<WebSocket | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const intentionalCloseRef = useRef(false);

  useEffect(() => {
    if (!url) return;

    intentionalCloseRef.current = false;

    function connect() {
      setState("connecting");
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsPort = process.env.NEXT_PUBLIC_WS_PORT;
      const host = wsPort
        ? `${window.location.hostname}:${wsPort}`
        : window.location.host;
      const wsUrl = `${protocol}//${host}${url}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
        setState("open");
        optionsRef.current.onOpen?.();
      };

      ws.onmessage = (event) => {
        optionsRef.current.onMessage?.(event);
      };

      ws.onclose = (event) => {
        setState("closed");
        optionsRef.current.onClose?.(event);

        // Don't reconnect for intentional closes or permanent error codes
        if (intentionalCloseRef.current) return;
        if (PERMANENT_CLOSE_CODES.has(event.code)) return;

        // Exponential backoff reconnect
        const attempt = reconnectAttemptRef.current++;
        const delay = Math.min(
          BASE_RECONNECT_DELAY * Math.pow(2, attempt),
          MAX_RECONNECT_DELAY
        );
        reconnectTimerRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        // onclose will fire after onerror, which handles reconnection
      };
    }

    connect();

    return () => {
      intentionalCloseRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [url]);

  const send = useCallback((data: ArrayBuffer | string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
  }, []);

  const close = useCallback(() => {
    intentionalCloseRef.current = true;
    wsRef.current?.close();
  }, []);

  return { state, send, close, ws: wsRef };
}
