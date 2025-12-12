import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { JetStreamClient, JetStreamManager, StorageType } from "nats";
import { formatError, STORAGE_TYPE_MAP, streamExists } from "../utils.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function registerObjectStoreTools(
  server: McpServer,
  js: JetStreamClient,
  jsm: JetStreamManager
): void {
  server.registerTool(
    "nats_obj_list_buckets",
    {
      description: "List all object store buckets",
      inputSchema: {},
    },
    async () => {
      try {
        const buckets: Array<{
          bucket: string;
          description: string;
          size: number;
          storage: string;
          replicas: number;
        }> = [];

        for await (const status of jsm.streams.listObjectStores()) {
          buckets.push({
            bucket: status.bucket,
            description: status.description,
            size: status.size,
            storage: status.storage === StorageType.File ? "file" : "memory",
            replicas: status.replicas,
          });
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify(buckets, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error listing object store buckets: ${formatError(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "nats_obj_create_bucket",
    {
      description: "Create a new object store bucket",
      inputSchema: {
        bucket: z.string().describe("Bucket name"),
        description: z.string().optional().describe("Bucket description"),
        max_bytes: z.number().optional().describe("Maximum bucket size in bytes"),
        storage: z.enum(["file", "memory"]).default("file").describe("Storage type"),
        ttl: z.number().optional().describe("TTL in nanoseconds"),
      },
    },
    async ({ bucket, description, max_bytes, storage, ttl }) => {
      try {
        if (await streamExists(jsm, `OBJ_${bucket}`)) {
          return {
            content: [{
              type: "text",
              text: `Error creating bucket: bucket "${bucket}" already exists`,
            }],
            isError: true,
          };
        }

        const opts: Parameters<typeof js.views.os>[1] = {
          storage: STORAGE_TYPE_MAP[storage],
        };

        if (description) opts.description = description;
        if (max_bytes !== undefined) opts.max_bytes = max_bytes;
        if (ttl !== undefined) opts.ttl = ttl;

        await js.views.os(bucket, opts);

        return {
          content: [{
            type: "text",
            text: `Created object store bucket "${bucket}"`,
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
    "nats_obj_delete_bucket",
    {
      description: "Delete an object store bucket",
      inputSchema: {
        bucket: z.string().describe("Bucket name to delete"),
      },
    },
    async ({ bucket }) => {
      try {
        if (!(await streamExists(jsm, `OBJ_${bucket}`))) {
          return {
            content: [{
              type: "text",
              text: `Error deleting bucket: bucket "${bucket}" not found`,
            }],
            isError: true,
          };
        }

        const os = await js.views.os(bucket);
        await os.destroy();

        return {
          content: [{
            type: "text",
            text: `Deleted object store bucket "${bucket}"`,
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
    "nats_obj_list",
    {
      description: "List objects in an object store bucket",
      inputSchema: {
        bucket: z.string().describe("Object store bucket name"),
      },
    },
    async ({ bucket }) => {
      try {
        if (!(await streamExists(jsm, `OBJ_${bucket}`))) {
          return {
            content: [{
              type: "text",
              text: `Error listing objects: bucket "${bucket}" not found`,
            }],
            isError: true,
          };
        }

        const os = await js.views.os(bucket);
        const objects = await os.list();

        const result = objects.map((info) => ({
          name: info.name,
          description: info.description,
          size: info.size,
          chunks: info.chunks,
          mtime: info.mtime,
        }));

        return {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error listing objects: ${formatError(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "nats_obj_put",
    {
      description: "Store an object in the object store",
      inputSchema: {
        bucket: z.string().describe("Object store bucket name"),
        name: z.string().describe("Object name"),
        data: z.string().describe("Object data (string content)"),
        description: z.string().optional().describe("Object description"),
      },
    },
    async ({ bucket, name, data, description }) => {
      try {
        if (!(await streamExists(jsm, `OBJ_${bucket}`))) {
          return {
            content: [{
              type: "text",
              text: `Error storing object: bucket "${bucket}" not found`,
            }],
            isError: true,
          };
        }

        const os = await js.views.os(bucket);
        const meta: { name: string; description?: string } = { name };
        if (description) meta.description = description;

        const info = await os.putBlob(meta, encoder.encode(data));

        return {
          content: [{
            type: "text",
            text: `Stored object "${name}" in bucket "${bucket}" (${info.size} bytes)`,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error storing object: ${formatError(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "nats_obj_get",
    {
      description: "Get an object from the object store",
      inputSchema: {
        bucket: z.string().describe("Object store bucket name"),
        name: z.string().describe("Object name to retrieve"),
      },
    },
    async ({ bucket, name }) => {
      try {
        if (!(await streamExists(jsm, `OBJ_${bucket}`))) {
          return {
            content: [{
              type: "text",
              text: `Error getting object: bucket "${bucket}" not found`,
            }],
            isError: true,
          };
        }

        const os = await js.views.os(bucket);
        const data = await os.getBlob(name);

        if (!data) {
          return {
            content: [{
              type: "text",
              text: `Object "${name}" not found in bucket "${bucket}"`,
            }],
          };
        }

        return {
          content: [{
            type: "text",
            text: decoder.decode(data),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error getting object: ${formatError(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "nats_obj_delete",
    {
      description: "Delete an object from the object store",
      inputSchema: {
        bucket: z.string().describe("Object store bucket name"),
        name: z.string().describe("Object name to delete"),
      },
    },
    async ({ bucket, name }) => {
      try {
        if (!(await streamExists(jsm, `OBJ_${bucket}`))) {
          return {
            content: [{
              type: "text",
              text: `Error deleting object: bucket "${bucket}" not found`,
            }],
            isError: true,
          };
        }

        const os = await js.views.os(bucket);

        const info = await os.info(name);
        if (!info) {
          return {
            content: [{
              type: "text",
              text: `Error deleting object: object "${name}" not found in bucket "${bucket}"`,
            }],
            isError: true,
          };
        }

        await os.delete(name);

        return {
          content: [{
            type: "text",
            text: `Deleted object "${name}" from bucket "${bucket}"`,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error deleting object: ${formatError(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "nats_obj_info",
    {
      description: "Get metadata for an object in the object store",
      inputSchema: {
        bucket: z.string().describe("Object store bucket name"),
        name: z.string().describe("Object name"),
      },
    },
    async ({ bucket, name }) => {
      try {
        if (!(await streamExists(jsm, `OBJ_${bucket}`))) {
          return {
            content: [{
              type: "text",
              text: `Error getting object info: bucket "${bucket}" not found`,
            }],
            isError: true,
          };
        }

        const os = await js.views.os(bucket);
        const info = await os.info(name);

        if (!info) {
          return {
            content: [{
              type: "text",
              text: `Object "${name}" not found in bucket "${bucket}"`,
            }],
          };
        }

        const result = {
          name: info.name,
          description: info.description,
          bucket: info.bucket,
          size: info.size,
          chunks: info.chunks,
          digest: info.digest,
          mtime: info.mtime,
          revision: info.revision,
        };

        return {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error getting object info: ${formatError(error)}`,
          }],
          isError: true,
        };
      }
    }
  );
}
