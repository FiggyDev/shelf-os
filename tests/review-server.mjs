import { spawn } from "node:child_process";
import { once } from "node:events";

export async function stopReviewServer(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
  await exited; clearTimeout(timer);
}

export async function startReviewServer(port) {
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start",
    "--hostname", "127.0.0.1", "--port", String(port)], { stdio: ["ignore", "pipe", "pipe"] });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Owned fixture startup timeout")), 60000);
      const fail = (error) => { clearTimeout(timer); reject(error); };
      child.once("error", fail);
      child.once("exit", code => fail(new Error(`Owned fixture exited: ${code}`)));
      let output = "";
      const capture = chunk => {
        output = (output + chunk.toString()).slice(-10000);
        if (/Ready in/.test(output)) { clearTimeout(timer); resolve(); }
      };
      child.stdout.on("data", capture); child.stderr.on("data", capture);
    });
    return child;
  } catch (error) {
    await stopReviewServer(child);
    throw error;
  }
}
