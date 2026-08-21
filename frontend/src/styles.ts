import type { CSSProperties } from "react";

export const paneHeaderStyle: CSSProperties = {
  padding: "6px 10px",
  background: "var(--bg-alt)",
  borderBottom: "1px solid var(--border)",
  fontSize: 12,
  color: "var(--text-dim)",
};

export const paneStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  border: "1px solid var(--border)",
  borderRadius: 6,
  overflow: "hidden",
  minWidth: 0,
};

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
