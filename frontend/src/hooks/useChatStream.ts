import { useEffect, useState } from "react";

export interface ChatToolUse {
  id: string;
  name: string;
  input: unknown;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  toolUses: ChatToolUse[];
  createdAt: string;
  error?: string;
}

interface ChatStreamState {
  messages: ChatMessage[];
  busy: boolean;
  error: string | null;
}

const EMPTY_STATE: ChatStreamState = { messages: [], busy: false, error: null };

export function useChatStream(sessionId: string | null): { state: ChatStreamState; connected: boolean } {
  const [state, setState] = useState<ChatStreamState>(EMPTY_STATE);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setState(EMPTY_STATE);
      return;
    }
    setState(EMPTY_STATE);
    let ws: WebSocket | null = null;
    let closedByEffect = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${proto}//${location.host}/api/sessions/${sessionId}/chat/stream`);

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!closedByEffect) retryTimer = setTimeout(connect, 1500);
      };
      ws.onerror = () => ws?.close();

      ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data as string) as { type: string } & Record<string, unknown>;
        setState((prev) => applyEvent(prev, msg));
      };
    }

    connect();
    return () => {
      closedByEffect = true;
      if (retryTimer) clearTimeout(retryTimer);
      ws?.close();
    };
  }, [sessionId]);

  return { state, connected };
}

function applyEvent(prev: ChatStreamState, msg: { type: string } & Record<string, unknown>): ChatStreamState {
  switch (msg.type) {
    case "snapshot":
      return {
        messages: (msg.messages as ChatMessage[]) ?? [],
        busy: Boolean(msg.busy),
        error: null,
      };
    case "user_message":
      return { ...prev, messages: [...prev.messages, msg.message as ChatMessage], busy: true, error: null };
    case "assistant_start":
      return { ...prev, messages: [...prev.messages, msg.message as ChatMessage] };
    case "text_delta": {
      const { id, delta } = msg as unknown as { id: string; delta: string };
      return {
        ...prev,
        messages: prev.messages.map((m) => (m.id === id ? { ...m, text: m.text + delta } : m)),
      };
    }
    case "tool_use": {
      const { id, tool } = msg as unknown as { id: string; tool: ChatToolUse };
      return {
        ...prev,
        messages: prev.messages.map((m) => (m.id === id ? { ...m, toolUses: [...m.toolUses, tool] } : m)),
      };
    }
    case "assistant_done": {
      const message = msg.message as ChatMessage;
      return { ...prev, messages: prev.messages.map((m) => (m.id === message.id ? message : m)) };
    }
    case "idle":
      return { ...prev, busy: false };
    case "error":
      return { ...prev, error: String(msg.message) };
    default:
      return prev;
  }
}
