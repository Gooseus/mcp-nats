import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { setupNats, teardownNats, getTestContext, decode, getTool } from "../setup";
import { registerCoreTools } from "../../src/tools/core";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createNatsConnection, closeNatsConnection } from "../../src/connection";

describe("Core Tools", () => {
  let server: McpServer;

  beforeAll(async () => {
    await setupNats();
    const { nc } = getTestContext();

    await createNatsConnection();

    server = new McpServer({ name: "test-server", version: "1.0.0" });
    registerCoreTools(server, nc);
  });

  afterAll(async () => {
    await closeNatsConnection();
    await teardownNats();
  });

  describe("nats_publish", () => {
    test("should publish a message to a subject", async () => {
      const { nc } = getTestContext();

      const receivedMessages: string[] = [];
      const sub = nc.subscribe("test.publish.basic");

      const collectPromise = (async () => {
        for await (const msg of sub) {
          receivedMessages.push(decode(msg.data));
          break;
        }
      })();

      await new Promise((resolve) => setTimeout(resolve, 50));

      const publishTool = getTool(server, "nats_publish");
      const result = await publishTool.handler(
        { subject: "test.publish.basic", payload: "Hello, NATS!" },
        {}
      );

      await Promise.race([
        collectPromise,
        new Promise((resolve) => setTimeout(resolve, 500)),
      ]);
      sub.unsubscribe();

      expect(result.content[0].text).toContain("Successfully published");
      expect(receivedMessages).toContain("Hello, NATS!");
    });

    test("should publish a message with headers", async () => {
      const { nc } = getTestContext();

      let receivedHeaders: Record<string, string> = {};
      const sub = nc.subscribe("test.publish.headers");

      const collectPromise = (async () => {
        for await (const msg of sub) {
          if (msg.headers) {
            for (const [key, values] of msg.headers) {
              receivedHeaders[key] = values.join(",");
            }
          }
          break;
        }
      })();

      await new Promise((resolve) => setTimeout(resolve, 50));

      const publishTool = getTool(server, "nats_publish");
      const result = await publishTool.handler(
        {
          subject: "test.publish.headers",
          payload: "Message with headers",
          headers: { "X-Custom-Header": "test-value" },
        },
        {}
      );

      await Promise.race([
        collectPromise,
        new Promise((resolve) => setTimeout(resolve, 500)),
      ]);
      sub.unsubscribe();

      expect(result.content[0].text).toContain("Successfully published");
      expect(receivedHeaders["X-Custom-Header"]).toBe("test-value");
    });
  });

  describe("nats_server_info", () => {
    test("should return server connection information", async () => {
      const serverInfoTool = getTool(server, "nats_server_info");

      const result = await serverInfoTool.handler({}, {});

      expect(result.isError).toBeUndefined();
      const info = JSON.parse(result.content[0].text);
      expect(info.server_id).toBeDefined();
      expect(info.version).toBeDefined();
      expect(info.port).toBe(4222);
      expect(info.jetstream).toBe(true);
    });

    test("should include server name and protocol version", async () => {
      const serverInfoTool = getTool(server, "nats_server_info");

      const result = await serverInfoTool.handler({}, {});

      const info = JSON.parse(result.content[0].text);
      expect(typeof info.server_name).toBe("string");
      expect(typeof info.proto).toBe("number");
      expect(info.max_payload).toBeGreaterThan(0);
    });
  });

  describe("nats_connection_health", () => {
    test("should return connection health status", async () => {
      const healthTool = getTool(server, "nats_connection_health");
      const result = await healthTool.handler({}, {});
      
      expect(result.isError).toBeUndefined();

      const health = JSON.parse(result.content[0].text);

      expect(health.connected).toBe(true);
      expect(typeof health.reconnectCount).toBe("number");
      expect(health.reconnectCount).toBeGreaterThanOrEqual(0);
    });

    test("should include reconnect tracking fields", async () => {
      const healthTool = getTool(server, "nats_connection_health");
      const result = await healthTool.handler({}, {});
      const health = JSON.parse(result.content[0].text);

      expect("connected" in health).toBe(true);
      expect("server" in health).toBe(true);
      expect("reconnectCount" in health).toBe(true);
      expect("lastReconnectTime" in health).toBe(true);
    });
  });

  describe("nats_request", () => {
    test("should perform request-reply pattern", async () => {
      const { nc } = getTestContext();

      const sub = nc.subscribe("test.request.basic");
      const responderPromise = (async () => {
        for await (const msg of sub) {
          const requestData = decode(msg.data);
          if (msg.reply) {
            nc.publish(msg.reply, new TextEncoder().encode(`Echo: ${requestData}`));
          }
          break;
        }
      })();

      await new Promise((resolve) => setTimeout(resolve, 50));

      const requestTool = getTool(server, "nats_request");
      const result = await requestTool.handler(
        { subject: "test.request.basic", payload: "Hello", timeout: 5000 },
        {}
      );

      await responderPromise;
      sub.unsubscribe();

      expect(result.content[0].text).toBe("Echo: Hello");
      expect(result.isError).toBeUndefined();
    });

    test("should handle request timeout", async () => {
      const requestTool = getTool(server, "nats_request");

      const result = await requestTool.handler(
        { subject: "test.request.timeout", payload: "Hello", timeout: 100 },
        {}
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Request failed");
    });
  });
});
