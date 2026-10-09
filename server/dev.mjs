import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const server = spawn(process.execPath, ["server/index.mjs"], {
  stdio: "inherit",
});
const vite = spawn(
  process.execPath,
  [fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url))],
  { stdio: "inherit" },
);
const stop = () => {
  server.kill();
  vite.kill();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const child of [server, vite])
  child.on("exit", (code) => {
    stop();
    process.exit(code || 0);
  });
