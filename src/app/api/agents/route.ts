import { existingAgents, isLocalHost } from "@/server/agents";

/** Server-sent events: the full agent list now and after every change. */
export async function GET(request: Request) {
  if (!isLocalHost(request.headers.get("host"))) return new Response("Forbidden", { status: 403 });
  const encoder = new TextEncoder();
  let stop = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = () => {
        const list = existingAgents()?.list() ?? [];
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(list)}\n\n`));
      };
      send();
      // The registry may not exist until the first spawn; poll for it, then subscribe.
      let unsubscribe = existingAgents()?.subscribe(send);
      const attach = setInterval(() => {
        if (!unsubscribe && existingAgents()) {
          unsubscribe = existingAgents()!.subscribe(send);
          send();
        }
      }, 1000);
      const ping = setInterval(() => controller.enqueue(encoder.encode(": ping\n\n")), 15_000);
      stop = () => {
        clearInterval(attach);
        clearInterval(ping);
        unsubscribe?.();
      };
      request.signal.addEventListener("abort", () => {
        stop();
        controller.close();
      });
    },
    cancel() {
      stop();
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" },
  });
}
