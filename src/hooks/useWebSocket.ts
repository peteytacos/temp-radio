"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type ConnectionState = "connecting" | "open" | "closed" | "error";

interface UseWebSocketOptions {
  onMessage?: (event: MessageEvent) => void;
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
}

export function useWebSocket(
  url: string | null,
  options: UseWebSocketOptions = {}
) {
  const [state, setState] = useState<ConnectionState>("closed");
  const wsRef = useRef<WebSocket | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!url) return;

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
      setState("open");
      optionsRef.current.onOpen?.();
    };

    ws.onmessage = (event) => {
      optionsRef.current.onMessage?.(event);
    };

    ws.onclose = (event) => {
      setState("closed");
      optionsRef.current.onClose?.(event);
    };

    ws.onerror = () => {
      setState("error");
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [url]);

  const send = useCallback((data: ArrayBuffer | string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
  }, []);

  const close = useCallback(() => {
    wsRef.current?.close();
  }, []);

  return { state, send, close, ws: wsRef };
}
