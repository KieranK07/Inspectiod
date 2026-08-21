export function buildSnapshotInitScript(stateExpression: string): string {
  const exprSource = stateExpression.trim() || "undefined";
  return `
(() => {
  const MAX_DEPTH = 12;
  const MAX_ENTRIES = 500;

  function serialize(value, seen, path, depth) {
    if (value === null) return null;
    const t = typeof value;
    if (t === "string" || t === "number" || t === "boolean") return value;
    if (t === "undefined") return "[undefined]";
    if (t === "bigint") return value.toString() + "n";
    if (t === "function") return "[Function: " + (value.name || "anonymous") + "]";
    if (t === "symbol") return value.toString();

    if (depth > MAX_DEPTH) return "[MaxDepthExceeded]";

    if (typeof Node !== "undefined" && value instanceof Node) {
      return "[DOMNode: " + (value.nodeName || "unknown") + "]";
    }

    if (seen.has(value)) return { __circular: seen.get(value) };
    seen.set(value, path);

    if (value instanceof Date) return { __type: "Date", value: value.toISOString() };
    if (value instanceof RegExp) return { __type: "RegExp", source: value.source, flags: value.flags };

    if (value instanceof Map) {
      const entries = [];
      let i = 0;
      for (const [k, v] of value) {
        if (i >= MAX_ENTRIES) {
          entries.push(["__truncated__", true]);
          break;
        }
        entries.push([
          serialize(k, seen, path + ".key" + i, depth + 1),
          serialize(v, seen, path + "[" + i + "]", depth + 1),
        ]);
        i++;
      }
      return { __type: "Map", entries };
    }

    if (value instanceof Set) {
      const values = [];
      let i = 0;
      for (const v of value) {
        if (i >= MAX_ENTRIES) {
          values.push("__truncated__");
          break;
        }
        values.push(serialize(v, seen, path + "[" + i + "]", depth + 1));
        i++;
      }
      return { __type: "Set", values };
    }

    if (Array.isArray(value)) {
      const out = [];
      for (let i = 0; i < value.length; i++) {
        if (i >= MAX_ENTRIES) {
          out.push("[__truncated__]");
          break;
        }
        out.push(serialize(value[i], seen, path + "[" + i + "]", depth + 1));
      }
      return out;
    }

    const out = {};
    let count = 0;
    for (const key of Object.keys(value)) {
      if (count >= MAX_ENTRIES) {
        out.__truncated__ = true;
        break;
      }
      try {
        out[key] = serialize(value[key], seen, path + "." + key, depth + 1);
      } catch (e) {
        out[key] = "[Error reading property: " + String(e) + "]";
      }
      count++;
    }
    return out;
  }

  window.__inspectiod_snapshotState = function () {
    let target;
    try {
      target = (${exprSource});
    } catch (e) {
      return { __error: "Failed to evaluate state expression: " + String(e) };
    }
    if (typeof target === "undefined") {
      return { __error: "No value at the configured state expression (set one when starting the capture)" };
    }
    return serialize(target, new Map(), "$", 0);
  };

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "S" || e.key === "s")) {
        e.preventDefault();
        const data = window.__inspectiod_snapshotState();
        if (window.__inspectiod_reportSnapshot) {
          window.__inspectiod_reportSnapshot(data);
        }
      }
    },
    true,
  );
})();
`;
}
