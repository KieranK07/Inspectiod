import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { query } from "@anthropic-ai/claude-agent-sdk";

const SYSTEM_PROMPT = `You are helping a security researcher inspect a captured browser game session.
The session directory (your working directory) contains:
- console.log: browser console messages and uncaught errors, timestamped
- network.har: full HTTP request/response log with bodies (JSON)
- ws-frames.log: WebSocket frames sent/received, timestamped, JSON pretty-printed when possible
- bundles/: every JS file the page loaded, saved verbatim
- dom-snapshot.html: the page's rendered HTML on load
- state-dumps/: numbered JSON snapshots of in-page game state, if any were taken
- manifest.json: metadata about the capture (target URL, timing, file list, counts)

Use Read, Grep, and Glob to explore these files and answer questions about what the
game's client did — network/WebSocket traffic, client-side logic in the bundles, game
state, timing, anomalies. Be concise. Quote file paths and line numbers or byte offsets
when pointing to specific evidence.`;

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

interface ChatState {
  claudeSessionId: string | null;
  messages: ChatMessage[];
  busy: boolean;
}

export const chatEvents = new EventEmitter();
chatEvents.setMaxListeners(50);

const states = new Map<string, ChatState>();

function getState(sessionId: string): ChatState {
  let s = states.get(sessionId);
  if (!s) {
    s = { claudeSessionId: null, messages: [], busy: false };
    states.set(sessionId, s);
  }
  return s;
}

function emit(sessionId: string, payload: unknown): void {
  chatEvents.emit(sessionId, payload);
}

export function getChatSnapshot(sessionId: string): { messages: ChatMessage[]; busy: boolean } {
  const s = getState(sessionId);
  return { messages: s.messages, busy: s.busy };
}

export function isBusy(sessionId: string): boolean {
  return getState(sessionId).busy;
}

export async function sendMessage(sessionId: string, sessionDir: string, text: string): Promise<void> {
  const state = getState(sessionId);
  if (state.busy) return;
  state.busy = true;

  const userMessage: ChatMessage = {
    id: randomUUID(),
    role: "user",
    text,
    toolUses: [],
    createdAt: new Date().toISOString(),
  };
  state.messages.push(userMessage);
  emit(sessionId, { type: "user_message", message: userMessage });

  const assistantMessage: ChatMessage = {
    id: randomUUID(),
    role: "assistant",
    text: "",
    toolUses: [],
    createdAt: new Date().toISOString(),
  };
  let assistantStarted = false;
  const ensureStarted = () => {
    if (assistantStarted) return;
    assistantStarted = true;
    state.messages.push(assistantMessage);
    emit(sessionId, { type: "assistant_start", message: assistantMessage });
  };

  try {
    const stream = query({
      prompt: text,
      options: {
        cwd: sessionDir,
        resume: state.claudeSessionId ?? undefined,
        tools: ["Read", "Grep", "Glob"],
        settingSources: [],
        systemPrompt: SYSTEM_PROMPT,
        includePartialMessages: true,
      },
    });

    for await (const msg of stream) {
      if (msg.type === "system" && msg.subtype === "init") {
        state.claudeSessionId = msg.session_id;
        continue;
      }

      if (msg.type === "stream_event") {
        const evt = msg.event;
        if (evt.type === "content_block_delta" && evt.delta.type === "text_delta") {
          ensureStarted();
          assistantMessage.text += evt.delta.text;
          emit(sessionId, { type: "text_delta", id: assistantMessage.id, delta: evt.delta.text });
        }
        continue;
      }

      if (msg.type === "assistant") {
        for (const block of msg.message.content) {
          if (block.type === "tool_use") {
            ensureStarted();
            const toolUse: ChatToolUse = { id: block.id, name: block.name, input: block.input };
            assistantMessage.toolUses.push(toolUse);
            emit(sessionId, { type: "tool_use", id: assistantMessage.id, tool: toolUse });
          }
        }
        continue;
      }

      if (msg.type === "result") {
        ensureStarted();
        if (msg.is_error) {
          assistantMessage.error = msg.subtype;
          emit(sessionId, { type: "error", message: `Agent stopped: ${msg.subtype}` });
        }
        emit(sessionId, { type: "assistant_done", message: assistantMessage });
        continue;
      }
    }
  } catch (err) {
    ensureStarted();
    assistantMessage.error = String(err);
    emit(sessionId, { type: "error", message: String(err) });
    emit(sessionId, { type: "assistant_done", message: assistantMessage });
  } finally {
    state.busy = false;
    emit(sessionId, { type: "idle" });
  }
}
