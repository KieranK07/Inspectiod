import { formatBytes } from "../styles";
import type { FileIndexEntry } from "../types";

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  bytes?: number;
  children?: TreeNode[];
}

export function buildTree(files: FileIndexEntry[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const f of files) {
    const parts = f.path.split("/");
    let children = root;
    let acc = "";
    parts.forEach((part, i) => {
      acc = acc ? `${acc}/${part}` : part;
      const isLast = i === parts.length - 1;
      let node = children.find((c) => c.name === part);
      if (!node) {
        node = { name: part, path: acc, isDir: !isLast, children: isLast ? undefined : [] };
        children.push(node);
      }
      if (isLast) {
        node.bytes = f.bytes;
      } else {
        children = node.children!;
      }
    });
  }
  const sortRec = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
    nodes.forEach((n) => n.children && sortRec(n.children));
  };
  sortRec(root);
  return root;
}

export function FileTree({
  nodes,
  depth = 0,
  selected,
  onSelectFile,
}: {
  nodes: TreeNode[];
  depth?: number;
  selected: string | null;
  onSelectFile: (path: string) => void;
}) {
  return (
    <>
      {nodes.map((n) => (
        <div key={n.path}>
          {n.isDir ? (
            <div style={{ paddingLeft: depth * 14, fontSize: 12, color: "var(--text-dim)", padding: "3px 0" }}>{n.name}/</div>
          ) : (
            <div
              onClick={() => onSelectFile(n.path)}
              style={{
                paddingLeft: depth * 14 + 8,
                fontSize: 12,
                cursor: "pointer",
                padding: "3px 4px",
                borderRadius: 4,
                background: selected === n.path ? "var(--accent)" : "transparent",
                color: selected === n.path ? "#fff" : "var(--text)",
              }}
            >
              {n.name}{" "}
              <span style={{ color: selected === n.path ? "rgba(255,255,255,0.75)" : "var(--text-dim)" }}>
                ({formatBytes(n.bytes ?? 0)})
              </span>
            </div>
          )}
          {n.children && <FileTree nodes={n.children} depth={depth + 1} selected={selected} onSelectFile={onSelectFile} />}
        </div>
      ))}
    </>
  );
}
