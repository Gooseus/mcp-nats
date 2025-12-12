import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NatsConnection } from "nats";
import { formatError } from "../utils.js";

export function registerServerResources(server: McpServer, nc: NatsConnection): void {
  server.registerResource(
    "server_info",
    "nats://server",
    {
      description: "NATS server connection information",
      mimeType: "application/json",
    },
    async () => {
      try {
        const info = nc.info;

        if (!info) {
          return {
            contents: [{
              uri: "nats://server",
              mimeType: "text/plain",
              text: "Server info not available",
            }],
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
          contents: [{
            uri: "nats://server",
            mimeType: "application/json",
            text: JSON.stringify(serverInfo, null, 2),
          }],
        };
      } catch (error) {
        return {
          contents: [{
            uri: "nats://server",
            mimeType: "text/plain",
            text: `Error getting server info: ${formatError(error)}`,
          }],
        };
      }
    }
  );
}
