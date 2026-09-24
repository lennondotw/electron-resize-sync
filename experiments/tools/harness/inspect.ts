// Evaluates JavaScript in the main process of an app already staged by a tool
// (stage.ts, or any session started with launchSession), through the Node
// inspector it was started with.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

/** The --inspect port of the running staged Electron process. */
async function stagedInspectorPort() {
  const { stdout } = await promisify(execFile)("ps", ["-Ao", "command"]);
  const port = /MacOS\/Electron --inspect=(\d+)/.exec(stdout)?.[1];
  if (!port) throw new Error("No staged Electron process with --inspect found");
  return port;
}

/**
 * Evaluates `expression` in the staged app's main process and returns its
 * value (awaited if it is a promise). `require` is available.
 */
export async function evaluateInMain<T = unknown>(expression: string): Promise<T> {
  const port = await stagedInspectorPort();
  const [target] = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as {
    webSocketDebuggerUrl: string;
  }[];
  if (!target) throw new Error(`No inspector target on port ${port}`);
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
  socket.send(
    JSON.stringify({
      id: 1,
      method: "Runtime.evaluate",
      params: { expression, includeCommandLineAPI: true, returnByValue: true, awaitPromise: true },
    }),
  );
  const reply = await new Promise<string>((resolve) =>
    socket.addEventListener("message", (message) => resolve(String(message.data)), { once: true }),
  );
  socket.close();
  const { result } = JSON.parse(reply) as {
    result?: { result?: { value?: unknown }; exceptionDetails?: { text?: string } };
  };
  if (result?.exceptionDetails) {
    throw new Error(`Main process threw: ${JSON.stringify(result.exceptionDetails)}`);
  }
  return result?.result?.value as T;
}
