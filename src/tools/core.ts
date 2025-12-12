import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { NatsConnection, StringCodec, headers as createHeaders } from "nats";
import { formatError } from "../utils.js";
import { getConnectionHealth } from "../connection.js";

const sc = StringCodec();

export function registerCoreTools(server: McpServer, nc: NatsConnection): void {
  server.registerTool(
    "nats_publish",
    {
      description: "Publish a message to a NATS subject",
      inputSchema: {
        subject: z.string().describe("NATS subject to publish to"),
        payload: z.string().describe("Message payload (string or JSON string)"),
        headers: z.record(z.string()).optional().describe("Optional message headers"),
      },
    },
    async ({ subject, payload, headers }) => {
      try {
        const opts: { headers?: ReturnType<typeof createHeaders> } = {};

        if (headers && Object.keys(headers).length > 0) {
          opts.headers = createHeaders();
          for (const [key, value] of Object.entries(headers)) {
            opts.headers.append(key, value);
          }
        }

        nc.publish(subject, sc.encode(payload), opts);

        return {
          content: [{
            type: "text",
            text: `Successfully published message to subject "${subject}"`,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error publishing message: ${formatError(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "nats_request",
    {
      description: "Send a request and wait for a reply (request-reply pattern)",
      inputSchema: {
        subject: z.string().describe("NATS subject to send request to"),
        payload: z.string().describe("Request payload (string or JSON string)"),
        timeout: z.number().default(5000).describe("Request timeout in milliseconds"),
      },
    },
    async ({ subject, payload, timeout }) => {
      try {
        const response = await nc.request(subject, sc.encode(payload), { timeout });
        const responseData = sc.decode(response.data);

        return {
          content: [{
            type: "text",
            text: responseData,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Request failed: ${formatError(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "nats_server_info",
    {
      description: "Get NATS server connection information",
      inputSchema: {},
    },
    async () => {
      try {
        const info = nc.info;

        if (!info) {
          return {
            content: [{
              type: "text",
              text: "Server info not available",
            }],
            isError: true,
          };
        }

        const serverInfo = {
          server_id: info.server_id,
          server_name: info.server_name,
          version: info.version,
          proto: info.proto,
          host: info.host,
          port: info.port,
          max_payload: info.max_payload,
          client_id: info.client_id,
          client_ip: info.client_ip,
          cluster: info.cluster,
          jetstream: info.jetstream,
        };

        return {
          content: [{
            type: "text",
            text: JSON.stringify(serverInfo, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error getting server info: ${formatError(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "nats_connection_health",
    {
      description: "Get NATS connection health status including reconnection metrics",
      inputSchema: {},
    },
    async () => {
      try {
        const health = getConnectionHealth();

        return {
          content: [{
            type: "text",
            text: JSON.stringify(health, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error getting connection health: ${formatError(error)}`,
          }],
          isError: true,
        };
      }
    }
  );
}
