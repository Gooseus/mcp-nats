import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { JetStreamClient, JetStreamManager, StringCodec, KvWatchInclude } from "nats";
import { formatError, STORAGE_TYPE_MAP, streamExists } from "../utils.js";

const sc = StringCodec();

export function registerKvTools(server: McpServer, js: JetStreamClient, jsm: JetStreamManager): void {
  server.registerTool(
    "nats_kv_get",
    {
      description: "Get a value from a KV bucket by key",
      inputSchema: {
        bucket: z.string().describe("KV bucket name"),
        key: z.string().describe("Key to retrieve"),
      },
    },
    async ({ bucket, key }) => {
      try {
        const kv = await js.views.kv(bucket);
        const entry = await kv.get(key);

        if (!entry || entry.operation === "DEL" || entry.operation === "PURGE") {
          return {
            content: [{
              type: "text",
              text: `Key "${key}" not found in bucket "${bucket}"`,
            }],
          };
        }

        const value = sc.decode(entry.value);
        return {
          content: [{
            type: "text",
            text: value,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error getting key: ${formatError(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "nats_kv_put",
    {
      description: "Store a value in a KV bucket",
      inputSchema: {
        bucket: z.string().describe("KV bucket name"),
        key: z.string().describe("Key to set"),
        value: z.string().describe("Value to store"),
      },
    },
    async ({ bucket, key, value }) => {
      try {
        const kv = await js.views.kv(bucket);
        const revision = await kv.put(key, sc.encode(value));

        return {
          content: [{
            type: "text",
            text: `Stored "${key}" in bucket "${bucket}" at revision ${revision}`,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error storing key: ${formatError(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "nats_kv_delete",
    {
      description: "Delete a key from a KV bucket",
      inputSchema: {
        bucket: z.string().describe("KV bucket name"),
        key: z.string().describe("Key to delete"),
      },
    },
    async ({ bucket, key }) => {
      try {
        const kv = await js.views.kv(bucket);
        await kv.delete(key);

        return {
          content: [{
            type: "text",
            text: `Deleted "${key}" from bucket "${bucket}"`,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error deleting key: ${formatError(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "nats_kv_list_keys",
    {
      description: "List keys in a KV bucket",
      inputSchema: {
        bucket: z.string().describe("KV bucket name"),
        filter: z.string().optional().describe("Optional key filter pattern"),
      },
    },
    async ({ bucket, filter }) => {
      try {
        const kv = await js.views.kv(bucket);
        const keys: string[] = [];

        const keyIter = await kv.keys(filter);
        for await (const key of keyIter) {
          keys.push(key);
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify(keys, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error listing keys: ${formatError(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "nats_kv_create",
    {
      description: "Create a new KV bucket",
      inputSchema: {
        bucket: z.string().describe("Bucket name"),
        description: z.string().optional().describe("Bucket description"),
        history: z.number().default(1).describe("Number of historical values to keep per key"),
        ttl: z.number().optional().describe("Time-to-live in milliseconds"),
        max_bytes: z.number().optional().describe("Maximum bucket size in bytes"),
        storage: z.enum(["file", "memory"]).default("file").describe("Storage type"),
      },
    },
    async ({ bucket, description, history, ttl, max_bytes, storage }) => {
      try {
        if (await streamExists(jsm, `KV_${bucket}`)) {
          return {
            content: [{
              type: "text",
              text: `Error creating bucket: bucket "${bucket}" already exists`,
            }],
            isError: true,
          };
        }

        const opts: Parameters<typeof js.views.kv>[1] = {
          history,
          storage: STORAGE_TYPE_MAP[storage],
        };

        if (description) opts.description = description;
        if (ttl !== undefined) opts.ttl = ttl;
        if (max_bytes !== undefined) opts.max_bytes = max_bytes; 

        await js.views.kv(bucket, opts);

        return {
          content: [{
            type: "text",
            text: `Created KV bucket "${bucket}" with history=${history}`,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error creating bucket: ${formatError(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "nats_kv_delete_bucket",
    {
      description: "Delete a KV bucket",
      inputSchema: {
        bucket: z.string().describe("Bucket name to delete"),
      },
    },
    async ({ bucket }) => {
      try {
        await jsm.streams.delete(`KV_${bucket}`);

        return {
          content: [{
            type: "text",
            text: `Deleted KV bucket "${bucket}"`,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error deleting bucket: ${formatError(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "nats_kv_history",
    {
      description: "Get the history of values for a key in a KV bucket",
      inputSchema: {
        bucket: z.string().describe("KV bucket name"),
        key: z.string().describe("Key to get history for"),
      },
    },
    async ({ bucket, key }) => {
      try {
        if (!(await streamExists(jsm, `KV_${bucket}`))) {
          return {
            content: [{
              type: "text",
              text: `Error getting history: bucket "${bucket}" not found`,
            }],
            isError: true,
          };
        }

        const kv = await js.views.kv(bucket);
        const history: Array<{
          key: string;
          value: string;
          revision: number;
          operation: string;
          created: string;
        }> = [];

        const iter = await kv.history({ key });
        for await (const entry of iter) {
          history.push({
            key: entry.key,
            value: entry.value ? sc.decode(entry.value) : "",
            revision: entry.revision,
            operation: entry.operation,
            created: entry.created.toISOString(),
          });
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify(history, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error getting history: ${formatError(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "nats_kv_watch",
    {
      description: "Watch a KV bucket for changes (with timeout)",
      inputSchema: {
        bucket: z.string().describe("KV bucket name"),
        key: z.string().optional().describe("Key pattern to watch (supports wildcards: * and >)"),
        timeout: z.number().default(5000).describe("Watch timeout in milliseconds (max 30000)"),
        include_history: z.boolean().default(false).describe("Include historical values"),
      },
    },
    async ({ bucket, key, timeout, include_history }) => {
      try {
        if (!(await streamExists(jsm, `KV_${bucket}`))) {
          return {
            content: [{
              type: "text",
              text: `Error watching bucket: bucket "${bucket}" not found`,
            }],
            isError: true,
          };
        }

        const MAX_TIMEOUT_MS = 30000;
        const effectiveTimeout = Math.min(timeout, MAX_TIMEOUT_MS);

        const kv = await js.views.kv(bucket);
        const entries: Array<{
          key: string;
          value: string;
          revision: number;
          operation: string;
          created: string;
        }> = [];

        const watchOpts: Parameters<typeof kv.watch>[0] = {};

        if (key) watchOpts.key = key;
        if (include_history) watchOpts.include = KvWatchInclude.AllHistory;

        const watch = await kv.watch(watchOpts);

        const timeoutPromise = new Promise<void>((resolve) => {
          setTimeout(() => {
            watch.stop();
            resolve();
          }, effectiveTimeout);
        });

        const watchPromise = (async () => {
          for await (const entry of watch) {
            entries.push({
              key: entry.key,
              value: entry.value ? sc.decode(entry.value) : "",
              revision: entry.revision,
              operation: entry.operation,
              created: entry.created.toISOString(),
            });
          }
        })();

        await Promise.race([timeoutPromise, watchPromise]);

        return {
          content: [{
            type: "text",
            text: JSON.stringify(entries, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error watching bucket: ${formatError(error)}`,
          }],
          isError: true,
        };
      }
    }
  );
}
