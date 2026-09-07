// Test-only TLS termination. A fresh self-signed certificate is trusted only
// by the isolated Playwright context; production cookie policy is unchanged.
import https from "node:https";
import http from "node:http";
import net from "node:net";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { startReviewServer, stopReviewServer } from "./review-server.mjs";

export async function startHttpsReviewServer(port) {
  const directory = await mkdtemp(path.join(tmpdir(), "shelf-review-tls-"));
  let child, proxy;
  try {
    const key = path.join(directory, "key.pem"), cert = path.join(directory, "cert.pem");
    execFileSync("/usr/bin/openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=127.0.0.1", "-keyout", key, "-out", cert], { stdio: "ignore" });
    const reserve = net.createServer();
    await new Promise((resolve, reject) => { reserve.once("error", reject); reserve.listen(0, "127.0.0.1", resolve); });
    const upstreamPort = reserve.address().port;
    await new Promise(resolve => reserve.close(resolve));
    child = await startReviewServer(upstreamPort);
    proxy = https.createServer({ key: await readFile(key), cert: await readFile(cert) }, (request, response) => {
      const upstream = http.request({ hostname: "127.0.0.1", port: upstreamPort, path: request.url, method: request.method,
        headers: { ...request.headers, "x-forwarded-proto": "https" } }, incoming => {
        response.writeHead(incoming.statusCode, incoming.headers); incoming.pipe(response);
      });
      upstream.on("error", () => { if (!response.headersSent) response.writeHead(502); response.end(); });
      request.on("aborted", () => upstream.destroy());
      request.pipe(upstream);
    });
    await new Promise((resolve, reject) => { proxy.once("error", reject); proxy.listen(port, "127.0.0.1", resolve); });
    return { child, proxy, directory };
  } catch (error) {
    await stopHttpsReviewServer({ child, proxy, directory }); throw error;
  }
}
export async function stopHttpsReviewServer(handle) {
  if (!handle) return;
  if (handle.proxy?.listening) {
    const closed = new Promise(resolve => handle.proxy.close(resolve));
    handle.proxy.closeAllConnections(); await closed;
  }
  await stopReviewServer(handle.child);
  await rm(handle.directory, { recursive: true, force: true });
}
