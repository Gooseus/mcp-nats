import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { IncomingMessage, ServerResponse, createServer, Server } from "node:http";
import { randomUUID } from "node:crypto";

export interface SseServerOptions {
  port: number;
  host?: string;
}

export interface SseServer {
  server: Server;
  transport: StreamableHTTPServerTransport | undefined;
  close: () => Promise<void>;
}

/**
 * Creates an HTTP server that exposes the MCP server via SSE/Streamable HTTP transport.
 * This allows network-accessible clients to connect to the MCP server.
 */
export async function createSseServer(
  mcpServer: McpServer,
  options: SseServerOptions
): Promise<SseServer> {
  const { port, host = "0.0.0.0" } = options;

  const transports = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id");
    res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", transport: "sse" }));
      return;
    }

    if (url.pathname === "/mcp") {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      if (req.method === "GET") {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            transports.set(sid, transport);
            console.error(`[sse] New session: ${sid}`);
          },
          onsessionclosed: (sid) => {
            transports.delete(sid);
            console.error(`[sse] Session closed: ${sid}`);
          },
        });

        transport.onclose = () => {
          if (transport.sessionId) {
            transports.delete(transport.sessionId);
          }
        };

        await mcpServer.connect(transport);

        await transport.handleRequest(req, res);
      } else if (req.method === "POST") {
        if (!sessionId) {
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sid) => {
              transports.set(sid, transport);
              console.error(`[sse] New session: ${sid}`);
            },
            onsessionclosed: (sid) => {
              transports.delete(sid);
              console.error(`[sse] Session closed: ${sid}`);
            },
          });

          transport.onclose = () => {
            if (transport.sessionId) {
              transports.delete(transport.sessionId);
            }
          };

          await mcpServer.connect(transport);
          await transport.handleRequest(req, res);
        } else {
          const transport = transports.get(sessionId);
          if (!transport) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Session not found" }));
            return;
          }
          await transport.handleRequest(req, res);
        }
      } else if (req.method === "DELETE") {
        if (sessionId) {
          const transport = transports.get(sessionId);
          if (transport) {
            await transport.handleRequest(req, res);
          } else {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Session not found" }));
          }
        } else {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Session ID required" }));
        }
      } else {
        res.writeHead(405, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Method not allowed" }));
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(port, host, () => {
      console.error(`[sse] MCP server listening on http://${host}:${port}/mcp`);
      resolve();
    });
  });

  return {
    server: httpServer,
    transport: transports.values().next().value,
    close: async () => {
      for (const transport of transports.values()) {
        await transport.close();
      }
      transports.clear();

      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
  };
}
