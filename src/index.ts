#!/usr/bin/env bun

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createNatsConnection, closeNatsConnection, getNatsConnection } from "./connection.js";
import { registerCoreTools } from "./tools/core.js";
import { registerKvTools } from "./tools/kv.js";
import { registerJetstreamTools } from "./tools/jetstream.js";
import { registerSubscribeTools } from "./tools/subscribe.js";
import { registerConsumerTools } from "./tools/consumers.js";
import { registerObjectStoreTools } from "./tools/objectstore.js";
import { registerStreamHealthTools } from "./tools/stream-health.js";
import { registerDocsTools } from "./tools/docs.js";
import { registerStreamResources } from "./resources/streams.js";
import { registerKvResources } from "./resources/kv.js";
import { registerServerResources } from "./resources/server.js";
import { registerDocsResources } from "./resources/docs.js";
import { createSseServer, type SseServer } from "./transports/sse.js";
import { logError, SERVICE_NAME, formatError } from "./utils.js";
import pkg from "../package.json" with { type: "json" };

const VERSION = pkg.version;
const USAGE_TEXT = `
NATS MCP Server

Usage: bun run src/index.ts [options]

Options:
  --transport=<type>  Transport type: 'stdio' (default) or 'sse'
  --port=<port>       HTTP port for SSE transport (default: 3000)
  --host=<host>       Host to bind for SSE transport (default: 0.0.0.0)
  --help, -h          Show this help message

Environment Variables:
  NATS_URL            NATS server URL (default: nats://localhost:4222)
  NATS_USER           Username for auth
  NATS_PASS           Password for auth
  NATS_TOKEN          Token authentication
  NATS_CREDS_PATH     Credentials file path (NGS/Synadia)

Examples:
  bun run src/index.ts                    # Start with stdio transport
  bun run src/index.ts --transport=sse    # Start with SSE transport on port 3000
  bun run src/index.ts --transport=sse --port=8080
`;

function parseArgs(): { transport: "stdio" | "sse"; port: number; host: string } {
  const args = process.argv.slice(2);
  let transport: "stdio" | "sse" = "stdio";
  let port = 3000;
  let host = "0.0.0.0";

  for (const arg of args) {
    if (arg.startsWith("--transport=")) {
      const value = arg.split("=")[1];
      if (value === "sse" || value === "stdio") {
        transport = value;
      } else {
        console.error(`Invalid transport: ${value}. Use 'stdio' or 'sse'.`);
        process.exit(1);
      }
    } else if (arg.startsWith("--port=")) {
      port = parseInt(arg.split("=")[1], 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        console.error(`Invalid port: ${arg.split("=")[1]}`);
        process.exit(1);
      }
    } else if (arg.startsWith("--host=")) {
      host = arg.split("=")[1];
    } else if (arg === "--help" || arg === "-h") {
      console.log(USAGE_TEXT);
      process.exit(0);
    }
  }

  return { transport, port, host };
}

const server = new McpServer({
  name: SERVICE_NAME,
  version: VERSION,
});

let sseServer: SseServer | null = null;

async function main() {
  const config = parseArgs();

  try {
    logError(`Connecting to NATS...`);
    await createNatsConnection();
    logError(`Connected to NATS`);

    const { nc, js, jsm } = getNatsConnection();

    registerCoreTools(server, nc);
    registerKvTools(server, js, jsm);
    registerJetstreamTools(server, js, jsm);
    registerSubscribeTools(server, nc);
    registerConsumerTools(server, js, jsm);
    registerObjectStoreTools(server, js, jsm);
    registerStreamHealthTools(server, js, jsm);
    registerDocsTools(server);

    registerStreamResources(server, jsm);
    registerKvResources(server, js, jsm);
    registerServerResources(server, nc);
    registerDocsResources(server);

    logError(`Tools and resources registered`);

    const shutdown = async () => {
      logError(`Shutting down...`);
      if (sseServer) {
        await sseServer.close();
      }
      await closeNatsConnection();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    if (config.transport === "sse") {
      sseServer = await createSseServer(server, {
        port: config.port,
        host: config.host,
      });
      logError(`MCP server running on http://${config.host}:${config.port}/mcp`);
    } else {
      const transport = new StdioServerTransport();
      await server.connect(transport);
      logError(`MCP server running on stdio`);
    }
  } catch (error) {
    logError(`Fatal error: ${formatError(error)}`);
    process.exit(1);
  }
}

main();
