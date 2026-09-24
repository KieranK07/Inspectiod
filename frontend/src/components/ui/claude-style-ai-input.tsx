import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Check, ChevronDown, FileText, Plus, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const MAX_TEXTAREA_HEIGHT = 160;
const PASTE_THRESHOLD = 200;
const MAX_ATTACHMENTS = 10;

export interface ChatModelOption {
  id: string;
  name: string;
  description: string;
  badge?: string;
}

export const CHAT_MODELS: ChatModelOption[] = [
  { id: "claude-sonnet-5", name: "Claude Sonnet 5", description: "Balanced model", badge: "Latest" },
  { id: "claude-opus-5", name: "Claude Opus 5", description: "Highest intelligence" },
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", description: "Fastest responses" },
];

interface Attachment {
  id: string;
  kind: "file" | "paste";
  label: string;
  content: string;
  meta: string;
}

const TEXTUAL_EXTENSIONS = new Set([
  "txt", "md", "py", "js", "ts", "jsx", "tsx", "html", "htm", "css", "scss", "sass", "json", "xml",
  "yaml", "yml", "csv", "sql", "sh", "bash", "php", "rb", "go", "java", "c", "cpp", "h", "hpp", "cs",
  "rs", "swift", "kt", "log", "gitignore", "toml", "ini", "conf", "config",
]);

function isTextualFile(file: File): boolean {
  if (file.type.startsWith("text/") || file.type.includes("json") || file.type.includes("xml")) return true;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return TEXTUAL_EXTENSIONS.has(ext) || /readme|dockerfile|makefile/i.test(file.name);
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve((e.target?.result as string) ?? "");
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsText(file);
  });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}

function composeMessage(text: string, attachments: Attachment[]): string {
  if (attachments.length === 0) return text;
  const blocks = attachments
    .map((a) => `--- ${a.kind === "file" ? "Attached file" : "Pasted content"}: ${a.label} ---\n\`\`\`\n${a.content}\n\`\`\``)
    .join("\n\n");
  return text.trim() ? `${text}\n\n${blocks}` : blocks;
}

export interface ClaudeStyleChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (composedText: string) => void;
  disabled?: boolean;
  placeholder?: string;
  model: string;
  onModelChange: (modelId: string) => void;
  className?: string;
}

export function ClaudeStyleChatInput({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder = "How can I help you today?",
  model,
  onModelChange,
  className,
}: ClaudeStyleChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [value]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setModelMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const addFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      setAttachError(null);
      if (attachments.length >= MAX_ATTACHMENTS) {
        setAttachError(`Maximum ${MAX_ATTACHMENTS} attachments.`);
        return;
      }
      const files = Array.from(fileList).slice(0, MAX_ATTACHMENTS - attachments.length);
      const rejected: string[] = [];
      for (const file of files) {
        if (!isTextualFile(file)) {
          rejected.push(file.name);
          continue;
        }
        try {
          const content = await readFileAsText(file);
          setAttachments((prev) => [
            ...prev,
            { id: crypto.randomUUID(), kind: "file", label: file.name, content, meta: formatBytes(file.size) },
          ]);
        } catch {
          rejected.push(file.name);
        }
      }
      if (rejected.length > 0) {
        setAttachError(
          `Couldn't attach as text: ${rejected.join(", ")}. Only text-based files (code, logs, JSON, etc.) are supported.`,
        );
      }
    },
    [attachments.length],
  );

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const text = e.clipboardData.getData("text");
    if (text && text.length > PASTE_THRESHOLD) {
      e.preventDefault();
      onChange(value + text.slice(0, PASTE_THRESHOLD) + "…");
      setAttachments((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          kind: "paste",
          label: `Pasted text (${text.split(/\s+/).filter(Boolean).length} words)`,
          content: text,
          meta: `${text.length} chars`,
        },
      ]);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    void addFiles(e.dataTransfer.files);
  }

  const canSend = (value.trim().length > 0 || attachments.length > 0) && !disabled;

  function handleSend() {
    if (!canSend) return;
    onSend(composeMessage(value, attachments));
    onChange("");
    setAttachments([]);
    setAttachError(null);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  }

  const selectedModel = CHAT_MODELS.find((m) => m.id === model) ?? CHAT_MODELS[0];

  return (
    <div
      className={cn("relative w-full", className)}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragging(false);
      }}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-xl border-2 border-dashed border-blue-500 bg-[#1C3F62] pointer-events-none">
          <p className="text-sm text-blue-400">Drop text files to attach</p>
        </div>
      )}
      <div className="flex flex-col rounded-xl border border-zinc-700 bg-[#30302E] shadow-lg">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="min-h-[52px] max-h-40 w-full resize-none border-0 bg-transparent px-4 py-3 text-sm text-zinc-100 shadow-none placeholder:text-zinc-500 focus-visible:ring-0"
        />
        {(attachments.length > 0 || attachError) && (
          <div className="border-t border-zinc-700 px-3 py-2">
            {attachError && <div className="mb-2 text-xs text-red-400">{attachError}</div>}
            {attachments.length > 0 && (
              <div className="flex gap-2 overflow-x-auto">
                {attachments.map((a) => (
                  <div key={a.id} className="relative w-[140px] flex-shrink-0 rounded-lg border border-zinc-600 bg-zinc-700 p-2">
                    <div className="mb-1 flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 flex-shrink-0 text-zinc-400" />
                      <span className="truncate text-[11px] font-medium text-zinc-100" title={a.label}>
                        {a.label}
                      </span>
                    </div>
                    <div className="text-[10px] text-zinc-500">{a.meta}</div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(a.id)}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-zinc-600 bg-zinc-800 text-zinc-400 hover:text-zinc-100"
                      title="Remove"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-1">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              title="Attach a text file"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100"
              disabled={disabled}
              title="Options (not implemented)"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="relative" ref={modelMenuRef}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs font-medium text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
                onClick={() => setModelMenuOpen((v) => !v)}
                disabled={disabled}
              >
                {selectedModel.name}
                <ChevronDown className={cn("ml-1 h-3.5 w-3.5 transition-transform", modelMenuOpen && "rotate-180")} />
              </Button>
              {modelMenuOpen && (
                <div className="absolute bottom-full right-0 z-20 mb-2 w-64 rounded-lg border border-zinc-700 bg-zinc-800 p-1.5 shadow-xl">
                  {CHAT_MODELS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-between rounded-md p-2 text-left hover:bg-zinc-700",
                        m.id === model && "bg-zinc-700",
                      )}
                      onClick={() => {
                        onModelChange(m.id);
                        setModelMenuOpen(false);
                      }}
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-zinc-100">{m.name}</span>
                          {m.badge && (
                            <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] text-blue-300">{m.badge}</span>
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-400">{m.description}</div>
                      </div>
                      {m.id === model && <Check className="h-3.5 w-3.5 flex-shrink-0 text-blue-400" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button
              type="button"
              size="icon"
              className={cn(
                "h-8 w-8 rounded-md",
                canSend ? "bg-amber-600 text-white hover:bg-amber-700" : "cursor-not-allowed bg-zinc-700 text-zinc-500",
              )}
              onClick={handleSend}
              disabled={!canSend}
              title="Send message"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          void addFiles(e.target.files);
          if (e.target) e.target.value = "";
        }}
      />
    </div>
  );
}
