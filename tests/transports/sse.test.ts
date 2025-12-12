import { describe, test, expect, beforeAll, afterAll, afterEach } from "bun:test";
import { setupNats, teardownNats, getTestContext } from "../setup";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCoreTools } from "../../src/tools/core";
import { registerKvTools } from "../../src/tools/kv";
import { registerJetstreamTools } from "../../src/tools/jetstream";
import { registerSubscribeTools } from "../../src/tools/subscribe";
import { registerStreamResources } from "../../src/resources/streams";
import { registerKvResources } from "../../src/resources/kv";
import { registerServerResources } from "../../src/resources/server";
import { createSseServer, type SseServer } from "../../src/transports/sse";

describe("SSE Transport", () => {
  let sseServer: SseServer | null = null;
  const TEST_PORT = 3456;
  const BASE_URL = `http://localhost:${TEST_PORT}`;

  beforeAll(async () => {
    await setupNats();
  });

  afterEach(async () => {
    // Clean up SSE server after each test
    if (sseServer) {
      await sseServer.close();
      sseServer = null;
    }
  });

  afterAll(async () => {
    await teardownNats();
  });

  async function createTestServer(): Promise<SseServer> {
    const { nc, js, jsm } = getTestContext();

    const server = new McpServer({ name: "test-sse-server", version: "1.0.0" });

    // Register tools and resources
    registerCoreTools(server, nc);
    registerKvTools(server, js);
    registerJetstreamTools(server, js, jsm);
    registerSubscribeTools(server, nc);
    registerStreamResources(server, jsm);
    registerKvResources(server, js);
    registerServerResources(server, nc);

    sseServer = await createSseServer(server, { port: TEST_PORT, host: "localhost" });
    return sseServer;
  }

  describe("HTTP Server", () => {
    test("should start and respond to health check", async () => {
      await createTestServer();

      const response = await fetch(`${BASE_URL}/health`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBe("ok");
      expect(data.transport).toBe("sse");
    });

    test("should return 404 for unknown paths", async () => {
      await createTestServer();

      const response = await fetch(`${BASE_URL}/unknown`);
      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data.error).toBe("Not found");
    });

    test("should handle CORS preflight requests", async () => {
      await createTestServer();

      const response = await fetch(`${BASE_URL}/mcp`, {
        method: "OPTIONS",
      });

      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(response.headers.get("Access-Control-Allow-Methods")).toContain("GET");
      expect(response.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    });
  });

  describe("MCP Protocol", () => {
    test("should handle initialization via POST", async () => {
      await createTestServer();

      // Send initialize request
      const initRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: {
            name: "test-client",
            version: "1.0.0",
          },
        },
      };

      const response = await fetch(`${BASE_URL}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
        },
        body: JSON.stringify(initRequest),
      });

      expect(response.status).toBe(200);

      // Check for session ID in response headers
      const sessionId = response.headers.get("mcp-session-id");
      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe("string");
    });

    test("should list tools after initialization", async () => {
      await createTestServer();

      const acceptHeader = "application/json, text/event-stream";

      // Initialize first
      const initResponse = await fetch(`${BASE_URL}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": acceptHeader,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0" },
          },
        }),
      });

      const sessionId = initResponse.headers.get("mcp-session-id")!;

      // Send initialized notification
      await fetch(`${BASE_URL}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": acceptHeader,
          "mcp-session-id": sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "notifications/initialized",
        }),
      });

      // List tools
      const toolsResponse = await fetch(`${BASE_URL}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": acceptHeader,
          "mcp-session-id": sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
        }),
      });

      expect(toolsResponse.status).toBe(200);

      // Parse SSE response
      const text = await toolsResponse.text();
      // SSE format: data: {...}\n\n
      const dataLine = text.split("\n").find((line) => line.startsWith("data: "));
      if (dataLine) {
        const data = JSON.parse(dataLine.substring(6));
        expect(data.result).toBeDefined();
        expect(data.result.tools).toBeDefined();
        expect(Array.isArray(data.result.tools)).toBe(true);

        // Check for our tools
        const toolNames = data.result.tools.map((t: any) => t.name);
        expect(toolNames).toContain("nats_publish");
        expect(toolNames).toContain("nats_request");
        expect(toolNames).toContain("nats_subscribe");
        expect(toolNames).toContain("nats_kv_get");
        expect(toolNames).toContain("nats_stream_info");
      }
    });

    test("should return 404 for invalid session ID", async () => {
      await createTestServer();

      const response = await fetch(`${BASE_URL}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
          "mcp-session-id": "invalid-session-id",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
        }),
      });

      expect(response.status).toBe(404);
    });
  });

  describe("Server Lifecycle", () => {
    test("should close cleanly", async () => {
      const server = await createTestServer();

      // Verify server is running
      const healthCheck = await fetch(`${BASE_URL}/health`);
      expect(healthCheck.status).toBe(200);

      // Close server
      await server.close();
      sseServer = null;

      // Verify server is closed (connection refused)
      // Give the OS time to release the socket
      await new Promise((resolve) => setTimeout(resolve, 100));

      let connectionFailed = false;
      try {
        await fetch(`${BASE_URL}/health`);
        // If we get here, the server didn't close properly
      } catch (error: any) {
        // Expected - connection refused or fetch failed
        connectionFailed = true;
      }
      expect(connectionFailed).toBe(true);
    });
  });
});
