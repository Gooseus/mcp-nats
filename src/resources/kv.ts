import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { JetStreamClient, JetStreamManager, StorageType } from "nats";
import { formatError } from "../utils.js";

export function registerKvResources(
  server: McpServer,
  js: JetStreamClient,
  jsm: JetStreamManager
): void {
  server.registerResource(
    "kv_buckets",
    "nats://kv",
    {
      description: "List all KV buckets with their configuration",
      mimeType: "application/json",
    },
    async () => {
      try {
        const buckets: Array<{
          bucket: string;
          description: string;
          values: number;
          history: number;
          ttl: number;
          storage: string;
          replicas: number;
          size: number;
        }> = [];

        for await (const status of jsm.streams.listKvs()) {
          const storage = status.streamInfo.config.storage === StorageType.File ? "file" : "memory";
          buckets.push({
            bucket: status.bucket,
            description: status.description,
            values: status.values,
            history: status.history,
            ttl: status.ttl,
            storage,
            replicas: status.replicas,
            size: status.size,
          });
        }

        return {
          contents: [{
            uri: "nats://kv",
            mimeType: "application/json",
            text: JSON.stringify(buckets, null, 2),
          }],
        };
      } catch (error) {
        return {
          contents: [{
            uri: "nats://kv",
            mimeType: "text/plain",
            text: `Error listing KV buckets: ${formatError(error)}`,
          }],
        };
      }
    }
  );
}
