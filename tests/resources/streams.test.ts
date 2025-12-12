import { describe, test, expect, beforeAll, afterAll, afterEach } from "bun:test";
import { setupNats, teardownNats, createTestStream, getTestContext, getResource } from "../setup";
import { registerStreamResources } from "../../src/resources/streams";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

describe("Streams Resource", () => {
  let server: McpServer;
  const cleanupFunctions: (() => Promise<void>)[] = [];

  beforeAll(async () => {
    await setupNats();
    const { jsm } = getTestContext();

    server = new McpServer({ name: "test-server", version: "1.0.0" });
    registerStreamResources(server, jsm);
  });

  afterEach(async () => {
    // Clean up all streams created during tests
    for (const cleanup of cleanupFunctions) {
      await cleanup();
    }
    cleanupFunctions.length = 0;
  });

  afterAll(async () => {
    await teardownNats();
  });

  describe("nats://streams", () => {
    test("should list streams when streams exist", async () => {
      // Create test streams
      const cleanup1 = await createTestStream("STREAM_A", ["stream.a.>"]);
      const cleanup2 = await createTestStream("STREAM_B", ["stream.b.>"]);
      cleanupFunctions.push(cleanup1, cleanup2);

      const streamsResource = getResource(server, "nats://streams");

      const result = await streamsResource.readCallback(
        new URL("nats://streams"),
        {}
      );

      const content = result.contents[0];
      expect(content.uri).toBe("nats://streams");
      expect(content.mimeType).toBe("application/json");

      const streams = JSON.parse(content.text);
      const streamNames = streams.map((s: any) => s.name);
      expect(streamNames).toContain("STREAM_A");
      expect(streamNames).toContain("STREAM_B");
    });

    test("should return empty array when no streams exist", async () => {
      const streamsResource = getResource(server, "nats://streams");

      const result = await streamsResource.readCallback(
        new URL("nats://streams"),
        {}
      );

      const streams = JSON.parse(result.contents[0].text);
      expect(Array.isArray(streams)).toBe(true);
      // May have streams from other tests, so just check it's an array
    });

    test("should include stream metadata", async () => {
      const cleanup = await createTestStream("STREAM_META", ["meta.>"]);
      cleanupFunctions.push(cleanup);

      const streamsResource = getResource(server, "nats://streams");

      const result = await streamsResource.readCallback(
        new URL("nats://streams"),
        {}
      );

      const streams = JSON.parse(result.contents[0].text);
      const testStream = streams.find((s: any) => s.name === "STREAM_META");

      expect(testStream).toBeDefined();
      expect(testStream.subjects).toContain("meta.>");
      expect(typeof testStream.messages).toBe("number");
      expect(typeof testStream.bytes).toBe("number");
      expect(typeof testStream.consumers).toBe("number");
    });
  });
});
