// Claude Code hook for Mini Office agents. Claude Code runs this for each hook
// event with the event JSON on stdin; we forward it to the Mini Office server
// over its private Unix socket. For PermissionRequest the server answers once
// the user clicks Allow/Deny in the office, and we print that decision.
import { request } from "node:http";

const socketPath = process.env.MINI_OFFICE_HOOK_SOCKET;
const agent = process.env.MINI_OFFICE_AGENT_ID;
const token = process.env.MINI_OFFICE_AGENT_TOKEN;
if (!socketPath || !agent || !token) process.exit(0); // not a Mini Office session

let body = "";
for await (const chunk of process.stdin) body += chunk;

const req = request({
  socketPath,
  path: "/hook",
  method: "POST",
  headers: { "content-type": "application/json", "x-agent-id": agent, "x-agent-token": token },
});
req.on("response", (res) => {
  let reply = "";
  res.on("data", (d) => (reply += d));
  res.on("end", () => {
    if (res.statusCode === 200 && reply.trim() && reply.trim() !== "{}") process.stdout.write(reply);
    process.exit(0);
  });
});
// If the office isn't reachable, stay out of the way: Claude Code carries on as usual.
req.on("error", () => process.exit(0));
req.end(body);
