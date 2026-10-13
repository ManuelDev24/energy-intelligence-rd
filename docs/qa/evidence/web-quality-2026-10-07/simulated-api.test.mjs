import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("./simulated-api.mjs", import.meta.url));

async function availablePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  const port = address.port;
  server.close();
  await once(server, "close");
  return port;
}

async function startSimulator(t) {
  const port = await availablePort();
  const child = fork(script, [], {
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let output = "";
  let listenerAddress;
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  child.on("message", (message) => {
    if (message?.type === "simulator-listening") listenerAddress = message.address;
  });
  t.after(() => child.kill("SIGTERM"));

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`simulator exited early (${child.exitCode})`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return { port, child, listenerAddress: () => listenerAddress, output: () => output };
    } catch {
      // The child has not started listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("simulator did not become ready");
}

test("the simulator caps requested latency", async (t) => {
  const { port } = await startSimulator(t);
  const response = await fetch(`http://127.0.0.1:${port}/__sim?delay=999999999`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).delay, 10_000);
});

test("the simulator listens only on the IPv4 loopback interface", async (t) => {
  const { port, listenerAddress } = await startSimulator(t);
  assert.deepEqual(listenerAddress(), { address: "127.0.0.1", family: "IPv4", port });
});
