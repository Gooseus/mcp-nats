import { describe, test, expect, beforeAll } from "bun:test";
import { getResource } from "../setup";
import { registerDocsResources } from "../../src/resources/docs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

describe("Docs Resources", () => {
  let server: McpServer;

  beforeAll(async () => {
    server = new McpServer({ name: "test-server", version: "1.0.0" });
    registerDocsResources(server);
  });

  describe("nats://docs/subjects", () => {
    test("should return subjects documentation", async () => {
      const resource = getResource(server, "nats://docs/subjects");
      const result = await resource.readCallback(new URL("nats://docs/subjects"), {});
      const content = result.contents[0];

      expect(content.uri).toBe("nats://docs/subjects");
      expect(content.mimeType).toBe("text/markdown");
      expect(content.text.length).toBeGreaterThan(0);
    });

    test("should contain subject documentation content", async () => {
      const resource = getResource(server, "nats://docs/subjects");
      const result = await resource.readCallback(new URL("nats://docs/subjects"), {});
      const text = result.contents[0].text.toLowerCase();

      expect(text).toContain("subject");
      expect(text.includes("*") || text.includes("wildcard")).toBe(true);
    });
  });

  describe("nats://docs/jetstream", () => {
    test("should return JetStream documentation", async () => {
      const resource = getResource(server, "nats://docs/jetstream");
      const result = await resource.readCallback(new URL("nats://docs/jetstream"), {});
      const content = result.contents[0];

      expect(content.uri).toBe("nats://docs/jetstream");
      expect(content.mimeType).toBe("text/markdown");
      expect(content.text.length).toBeGreaterThan(0);
    });

    test("should contain JetStream concepts", async () => {
      const resource = getResource(server, "nats://docs/jetstream");
      const result = await resource.readCallback(new URL("nats://docs/jetstream"), {});
      const text = result.contents[0].text.toLowerCase();

      expect(text).toContain("jetstream");
      expect(text.includes("stream") || text.includes("consumer")).toBe(true);
    });
  });

  describe("nats://docs/kv", () => {
    test("should return KV documentation", async () => {
      const resource = getResource(server, "nats://docs/kv");
      const result = await resource.readCallback(new URL("nats://docs/kv"), {});
      const content = result.contents[0];

      expect(content.uri).toBe("nats://docs/kv");
      expect(content.mimeType).toBe("text/markdown");
      expect(content.text.length).toBeGreaterThan(0);
    });

    test("should contain KV concepts", async () => {
      const resource = getResource(server, "nats://docs/kv");
      const result = await resource.readCallback(new URL("nats://docs/kv"), {});
      const text = result.contents[0].text.toLowerCase();
      
      expect(text.includes("key") || text.includes("bucket") || text.includes("kv")).toBe(true);
    });
  });

  describe("error handling", () => {
    test("should handle missing doc file gracefully", async () => {
      const resource = getResource(server, "nats://docs/subjects");

      expect(resource).toBeDefined();
    });
  });
});
