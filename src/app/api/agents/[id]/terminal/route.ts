import { existingAgents, isLocalHost } from "@/server/agents";

/** Server-sent events: an agent's terminal output so far, then live chunks. */
export async function GET(request: Request, ctx: RouteContext<"/api/agents/[id]/terminal">) {
  if (!isLocalHost(request.headers.get("host"))) return new Response("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  const term = existingAgents()?.terminal(id);
  if (!term) return new Response("Not found", { status: 404 });
  const encoder = new TextEncoder();
  let stop = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (chunk: string) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      send(term.replay());
      const unsubscribe = term.subscribe(send);
      stop = unsubscribe;
      request.signal.addEventListener("abort", () => {
        unsubscribe();
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
