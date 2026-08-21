import { startCapture } from "./session.js";

const url = process.argv[2];
if (!url) {
  console.error("Usage: tsx src/capture/run.ts <url>");
  process.exit(1);
}

const handle = await startCapture(url);
console.log(`Capturing session ${handle.sessionId}`);
console.log(`  -> ${handle.sessionDir}`);
console.log("Play the game in the opened browser window. Press Ctrl+C here to stop.");

let stopping = false;
async function stopOnce(reason: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log(`\nStopping (${reason})...`);
  const manifest = await handle.stop();
  console.log("Session stopped.", manifest.counts);
  process.exit(0);
}

process.on("SIGINT", () => void stopOnce("SIGINT"));
process.on("SIGTERM", () => void stopOnce("SIGTERM"));
