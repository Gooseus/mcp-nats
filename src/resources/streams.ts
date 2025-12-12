import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { JetStreamManager } from "nats";
import { formatError } from "../utils.js";

export function registerStreamResources(server: McpServer, jsm: JetStreamManager): void {
  server.registerResource(
    "streams",
    "nats://streams",
    {
      description: "List all JetStream streams with their current state",
      mimeType: "application/json",
    },
    async () => {
      try {
        const streams: Array<{
          name: string;
          subjects: string[];
          messages: number;
          bytes: number;
          consumers: number;
        }> = [];

        for await (const stream of jsm.streams.list()) {
          streams.push({
            name: stream.config.name,
            subjects: stream.config.subjects,
            messages: stream.state.messages,
            bytes: stream.state.bytes,
            consumers: stream.state.consumer_count,
          });
        }

        return {
          contents: [{
            uri: "nats://streams",
            mimeType: "application/json",
            text: JSON.stringify(streams, null, 2),
          }],
        };
      } catch (error) {
        return {
          contents: [{
            uri: "nats://streams",
            mimeType: "text/plain",
            text: `Error listing streams: ${formatError(error)}`,
          }],
        };
      }
    }
  );
}
