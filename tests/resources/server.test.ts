import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { setupNats, teardownNats, getTestContext, getResource } from "../setup";
import { registerServerResources } from "../../src/resources/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

describe("Server Resources", () => {
  let server: McpServer;

  beforeAll(async () => {
    await setupNats();
    const { nc } = getTestContext();

    server = new McpServer({ name: "test-server", version: "1.0.0" });
    registerServerResources(server, nc);
  });

  afterAll(async () => {
    await teardownNats();
  });

  describe("nats://server", () => {
    test("should return server connection info", async () => {
      const serverResource = getResource(server, "nats://server");

      const result = await serverResource.readCallback(
        new URL("nats://server"),
        {}
      );

      const content = result.contents[0];
      expect(content.uri).toBe("nats://server");
      expect(content.mimeType).toBe("application/json");

      const info = JSON.parse(content.text);
      expect(info.server_id).toBeDefined();
      expect(info.version).toBeDefined();
      expect(info.port).toBe(4222);
      expect(info.jetstream).toBe(true);
    });

    test("should include server name and version", async () => {
      const serverResource = getResource(server, "nats://server");

      const result = await serverResource.readCallback(
        new URL("nats://server"),
        {}
      );

      const info = JSON.parse(result.contents[0].text);
      expect(typeof info.server_name).toBe("string");
      expect(typeof info.version).toBe("string");
      expect(info.version).toMatch(/^\d+\.\d+\.\d+/); // Semver-like version
    });

    test("should indicate JetStream is enabled", async () => {
      const serverResource = getResource(server, "nats://server");

      const result = await serverResource.readCallback(
        new URL("nats://server"),
        {}
      );

      const info = JSON.parse(result.contents[0].text);
      expect(info.jetstream).toBe(true);
    });
  });
});
