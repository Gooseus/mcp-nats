import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { NatsConnection, StringCodec } from "nats";
import { formatError } from "../utils.js";

const sc = StringCodec();

const MAX_TIMEOUT_MS = 30000;
const MAX_MESSAGES = 100;

export function registerSubscribeTools(
  server: McpServer,
  nc: NatsConnection
): void {
  server.registerTool(
    "nats_subscribe",
    {
      description: "Subscribe to a NATS subject and collect messages (with timeout)",
      inputSchema: {
        subject: z.string().describe("Subject pattern to subscribe to (supports wildcards: * for single token, > for multiple)"),
        timeout: z.number().default(5000).describe("How long to listen in ms (max 30000)"),
        max_messages: z.number().default(10).describe("Max messages to collect (max 100)"),
        queue: z.string().optional().describe("Queue group name for load balancing"),
      },
    },
    async ({ subject, timeout, max_messages, queue }) => {
      try {
        const effectiveTimeout = Math.min(timeout, MAX_TIMEOUT_MS);
        const effectiveMaxMessages = Math.min(max_messages, MAX_MESSAGES);

        const messages: Array<{
          subject: string;
          data: string;
          timestamp: string;
        }> = [];

        const opts: { max?: number; queue?: string } = {
          max: effectiveMaxMessages,
        };

        if (queue) {
          opts.queue = queue;
        }

        const sub = nc.subscribe(subject, opts);

        const timeoutPromise = new Promise<void>((resolve) => {
          setTimeout(() => {
            sub.unsubscribe();
            resolve();
          }, effectiveTimeout);
        });

        const messagePromise = (async () => {
          for await (const msg of sub) {
            messages.push({
              subject: msg.subject,
              data: sc.decode(msg.data),
              timestamp: new Date().toISOString(),
            });

            if (messages.length >= effectiveMaxMessages) {
              sub.unsubscribe();
              break;
            }
          }
        })();

        await Promise.race([timeoutPromise, messagePromise]);

        return {
          content: [{
            type: "text",
            text: JSON.stringify(messages, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error subscribing: ${formatError(error)}`,
          }],
          isError: true,
        };
      }
    }
  );
}
