import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { setupNats, teardownNats, getTestContext, getResource, createTestKvBucket } from "../setup";
import { registerKvResources } from "../../src/resources/kv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

describe("KV Resources", () => {
  let server: McpServer;

  beforeAll(async () => {
    await setupNats();
    const { js, jsm } = getTestContext();

    server = new McpServer({ name: "test-server", version: "1.0.0" });
    registerKvResources(server, js, jsm);
  });

  afterAll(async () => {
    await teardownNats();
  });

  describe("nats://kv", () => {
    test("should return empty array when no KV buckets exist", async () => {
      const kvResource = getResource(server, "nats://kv");

      const result = await kvResource.readCallback(new URL("nats://kv"), {});

      const content = result.contents[0];
      expect(content.uri).toBe("nats://kv");
      expect(content.mimeType).toBe("application/json");

      const data = JSON.parse(content.text);
      expect(Array.isArray(data)).toBe(true);
    });

    test("should list KV buckets with their configuration", async () => {
      const cleanup = await createTestKvBucket("test-kv-resource");

      try {
        const kvResource = getResource(server, "nats://kv");
        const result = await kvResource.readCallback(new URL("nats://kv"), {});

        const content = result.contents[0];
        expect(content.uri).toBe("nats://kv");
        expect(content.mimeType).toBe("application/json");

        const data = JSON.parse(content.text);
        expect(Array.isArray(data)).toBe(true);

        const testBucket = data.find((b: any) => b.bucket === "test-kv-resource");
        expect(testBucket).toBeDefined();
        expect(testBucket.bucket).toBe("test-kv-resource");
        expect(typeof testBucket.history).toBe("number");
        expect(typeof testBucket.replicas).toBe("number");
        expect(typeof testBucket.size).toBe("number");
        expect(["file", "memory"]).toContain(testBucket.storage);
      } finally {
        await cleanup();
      }
    });
  });
});
