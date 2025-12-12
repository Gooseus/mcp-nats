import { describe, test, expect, beforeAll } from "bun:test";
import { getTool } from "../setup";
import { registerDocsTools } from "../../src/tools/docs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

describe("Docs Tools", () => {
  let server: McpServer;

  beforeAll(async () => {
    server = new McpServer({ name: "test-server", version: "1.0.0" });
    registerDocsTools(server);
  });

  describe("nats_docs_list", () => {
    test("should list all available documentation topics", async () => {
      // Arrange
      const tool = getTool(server, "nats_docs_list");

      // Act
      const result = await tool.handler({}, {});

      // Assert
      expect(result.isError).toBeUndefined();
      const docs = JSON.parse(result.content[0].text);
      expect(Array.isArray(docs)).toBe(true);
      expect(docs.length).toBe(10);

      const names = docs.map((d: any) => d.name);
      expect(names).toContain("subjects");
      expect(names).toContain("jetstream");
      expect(names).toContain("consumers");
      expect(names).toContain("kv");
      expect(names).toContain("objectstore");
    });

    test("should include descriptions for each topic", async () => {
      // Arrange
      const tool = getTool(server, "nats_docs_list");

      // Act
      const result = await tool.handler({}, {});

      // Assert
      const docs = JSON.parse(result.content[0].text);
      for (const doc of docs) {
        expect(doc.name).toBeDefined();
        expect(doc.description).toBeDefined();
        expect(doc.description.length).toBeGreaterThan(10);
      }
    });
  });

  describe("nats_docs_read", () => {
    test("should read subjects documentation", async () => {
      // Arrange
      const tool = getTool(server, "nats_docs_read");

      // Act
      const result = await tool.handler({ topic: "subjects" }, {});

      // Assert
      expect(result.isError).toBeUndefined();
      const text = result.content[0].text.toLowerCase();
      expect(text).toContain("subject");
    });

    test("should read jetstream documentation", async () => {
      // Arrange
      const tool = getTool(server, "nats_docs_read");

      // Act
      const result = await tool.handler({ topic: "jetstream" }, {});

      // Assert
      expect(result.isError).toBeUndefined();
      const text = result.content[0].text.toLowerCase();
      expect(text).toContain("jetstream");
    });

    test("should read consumers documentation", async () => {
      // Arrange
      const tool = getTool(server, "nats_docs_read");

      // Act
      const result = await tool.handler({ topic: "consumers" }, {});

      // Assert
      expect(result.isError).toBeUndefined();
      const text = result.content[0].text.toLowerCase();
      expect(text).toContain("consumer");
    });

    test("should read kv documentation", async () => {
      // Arrange
      const tool = getTool(server, "nats_docs_read");

      // Act
      const result = await tool.handler({ topic: "kv" }, {});

      // Assert
      expect(result.isError).toBeUndefined();
      const text = result.content[0].text.toLowerCase();
      expect(text.includes("key") || text.includes("kv") || text.includes("bucket")).toBe(true);
    });

    test("should read objectstore documentation", async () => {
      // Arrange
      const tool = getTool(server, "nats_docs_read");

      // Act
      const result = await tool.handler({ topic: "objectstore" }, {});

      // Assert
      expect(result.isError).toBeUndefined();
      const text = result.content[0].text.toLowerCase();
      expect(text.includes("object") || text.includes("store") || text.includes("blob")).toBe(true);
    });
  });
});
