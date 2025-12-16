import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { setupNats, teardownNats, getTestContext, createTestStream, getTool, publishTestMessages } from "../setup";
import { registerConsumerTools } from "../../src/tools/consumers";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AckPolicy, ConsumerConfig } from "nats";

describe("Consumer Tools", () => {
  let server: McpServer;
  const cleanupFunctions: (() => Promise<void>)[] = [];

  beforeAll(async () => {
    await setupNats();
    const { js, jsm } = getTestContext();

    server = new McpServer({ name: "test-server", version: "1.0.0" });
    registerConsumerTools(server, js, jsm);
  });

  afterEach(async () => {
    for (const cleanup of cleanupFunctions) await cleanup();
    cleanupFunctions.length = 0;
  });

  afterAll(async () => {
    await teardownNats();
  });

  describe("nats_consumer_create", () => {
    test("should create a durable consumer", async () => {
      const cleanup = await createTestStream("CONSUMER_CREATE_TEST", ["consumer.create.>"]);
      cleanupFunctions.push(cleanup);

      const createTool = getTool(server, "nats_consumer_create");
      const result = await createTool.handler(
        {
          stream: "CONSUMER_CREATE_TEST",
          name: "test-consumer",
          deliver_policy: "all",
          ack_policy: "explicit",
        },
        {}
      );

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("test-consumer");
      expect(result.content[0].text).toContain("CONSUMER_CREATE_TEST");
    });

    test("should create a consumer with filter subject", async () => {
      const cleanup = await createTestStream("CONSUMER_FILTER_TEST", ["consumer.filter.>"]);
      cleanupFunctions.push(cleanup);

      const createTool = getTool(server, "nats_consumer_create");
      const result = await createTool.handler(
        {
          stream: "CONSUMER_FILTER_TEST",
          name: "filtered-consumer",
          deliver_policy: "new",
          ack_policy: "explicit",
          filter_subject: "consumer.filter.important",
        },
        {}
      );

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.filter_subject).toBe("consumer.filter.important");
    });

    test("should handle error for non-existent stream", async () => {
      const createTool = getTool(server, "nats_consumer_create");
      const result = await createTool.handler(
        {
          stream: "NON_EXISTENT_STREAM",
          name: "test-consumer",
          deliver_policy: "all",
          ack_policy: "explicit",
        },
        {}
      );

      expect(result.isError).toBe(true);
    });
  });

  describe("nats_consumer_info", () => {
    test("should get consumer information", async () => {
      const cleanup = await createTestStream("CONSUMER_INFO_TEST", ["consumer.info.>"]);
      cleanupFunctions.push(cleanup);

      const { jsm } = getTestContext();
      await jsm.consumers.add("CONSUMER_INFO_TEST", {
        durable_name: "info-test-consumer",
        ack_policy: AckPolicy.Explicit,
      });

      const infoTool = getTool(server, "nats_consumer_info");
      const result = await infoTool.handler(
        {
          stream: "CONSUMER_INFO_TEST",
          consumer: "info-test-consumer",
        },
        {}
      );

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.name).toBe("info-test-consumer");
      expect(data.stream_name).toBe("CONSUMER_INFO_TEST");
    });

    test("should handle non-existent consumer", async () => {
      const cleanup = await createTestStream("CONSUMER_INFO_MISSING", ["consumer.missing.>"]);
      cleanupFunctions.push(cleanup);

      const infoTool = getTool(server, "nats_consumer_info");
      const result = await infoTool.handler(
        {
          stream: "CONSUMER_INFO_MISSING",
          consumer: "non-existent",
        },
        {}
      );

      expect(result.isError).toBe(true);
    });
  });

  describe("nats_consumer_list", () => {
    test("should list consumers for a stream", async () => {
      const cleanup = await createTestStream("CONSUMER_LIST_TEST", ["consumer.list.>"]);
      cleanupFunctions.push(cleanup);

      const { jsm } = getTestContext();
      await jsm.consumers.add("CONSUMER_LIST_TEST", {
        durable_name: "list-consumer-1",
        ack_policy: AckPolicy.Explicit,
      });
      await jsm.consumers.add("CONSUMER_LIST_TEST", {
        durable_name: "list-consumer-2",
        ack_policy: AckPolicy.Explicit,
      });

      const listTool = getTool(server, "nats_consumer_list");
      const result = await listTool.handler(
        { stream: "CONSUMER_LIST_TEST" },
        {}
      );

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(2);

      const names = data.map((c: any) => c.name);
      expect(names).toContain("list-consumer-1");
      expect(names).toContain("list-consumer-2");
    });

    test("should return empty array for stream with no consumers", async () => {
      const cleanup = await createTestStream("CONSUMER_LIST_EMPTY", ["consumer.empty.>"]);
      cleanupFunctions.push(cleanup);

      const listTool = getTool(server, "nats_consumer_list");
      const result = await listTool.handler(
        { stream: "CONSUMER_LIST_EMPTY" },
        {}
      );

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(0);
    });
  });

  describe("nats_consumer_delete", () => {
    test("should delete a consumer", async () => {
      const cleanup = await createTestStream("CONSUMER_DELETE_TEST", ["consumer.delete.>"]);
      cleanupFunctions.push(cleanup);

      const { jsm } = getTestContext();
      await jsm.consumers.add("CONSUMER_DELETE_TEST", {
        durable_name: "delete-test-consumer",
        ack_policy: AckPolicy.Explicit,
      });

      const deleteTool = getTool(server, "nats_consumer_delete");
      const result = await deleteTool.handler(
        {
          stream: "CONSUMER_DELETE_TEST",
          consumer: "delete-test-consumer",
        },
        {}
      );

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("Deleted");

      try {
        await jsm.consumers.info("CONSUMER_DELETE_TEST", "delete-test-consumer");
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test("should handle deleting non-existent consumer", async () => {
      const cleanup = await createTestStream("CONSUMER_DELETE_MISSING", ["consumer.dmissing.>"]);
      cleanupFunctions.push(cleanup);

      const deleteTool = getTool(server, "nats_consumer_delete");
      const result = await deleteTool.handler(
        {
          stream: "CONSUMER_DELETE_MISSING",
          consumer: "non-existent",
        },
        {}
      );

      expect(result.isError).toBe(true);
    });
  });

  describe("nats_consumer_pause", () => {
    test("should pause a consumer", async () => {
      const cleanup = await createTestStream("CONSUMER_PAUSE_TEST", ["consumer.pause.>"]);
      cleanupFunctions.push(cleanup);

      const { jsm } = getTestContext();
      await jsm.consumers.add("CONSUMER_PAUSE_TEST", {
        durable_name: "pause-test-consumer",
        ack_policy: AckPolicy.Explicit,
      });

      const pauseTool = getTool(server, "nats_consumer_pause");
      const result = await pauseTool.handler(
        {
          stream: "CONSUMER_PAUSE_TEST",
          consumer: "pause-test-consumer",
        },
        {}
      );

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("Paused");
    });

    test("should pause consumer until specific time", async () => {
      const cleanup = await createTestStream("CONSUMER_PAUSE_UNTIL", ["consumer.pauseuntil.>"]);
      cleanupFunctions.push(cleanup);

      const { jsm } = getTestContext();
      await jsm.consumers.add("CONSUMER_PAUSE_UNTIL", {
        durable_name: "pause-until-consumer",
        ack_policy: AckPolicy.Explicit,
      });

      const pauseUntil = new Date(Date.now() + 3600000).toISOString();

      const pauseTool = getTool(server, "nats_consumer_pause");
      const result = await pauseTool.handler(
        {
          stream: "CONSUMER_PAUSE_UNTIL",
          consumer: "pause-until-consumer",
          until: pauseUntil,
        },
        {}
      );

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("Paused");
    });
  });

  describe("nats_consumer_resume", () => {
    test("should resume a paused consumer", async () => {
      const cleanup = await createTestStream("CONSUMER_RESUME_TEST", ["consumer.resume.>"]);
      cleanupFunctions.push(cleanup);

      const { jsm } = getTestContext();
      await jsm.consumers.add("CONSUMER_RESUME_TEST", {
        durable_name: "resume-test-consumer",
        ack_policy: AckPolicy.Explicit,
      });

      await jsm.consumers.pause("CONSUMER_RESUME_TEST", "resume-test-consumer", new Date(Date.now() + 3600000));

      const resumeTool = getTool(server, "nats_consumer_resume");
      const result = await resumeTool.handler(
        {
          stream: "CONSUMER_RESUME_TEST",
          consumer: "resume-test-consumer",
        },
        {}
      );

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("Resumed");
    });
  });

  describe("nats_consumer_fetch", () => {
    test("should fetch messages from a durable consumer", async () => {
      const cleanup = await createTestStream("CONSUMER_FETCH_TEST", ["consumer.fetch.>"]);
      cleanupFunctions.push(cleanup);

      await publishTestMessages("consumer.fetch.messages", ["msg1", "msg2", "msg3"]);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const { jsm } = getTestContext();
      await jsm.consumers.add("CONSUMER_FETCH_TEST", {
        durable_name: "fetch-test-consumer",
        ack_policy: AckPolicy.Explicit,
      });

      const fetchTool = getTool(server, "nats_consumer_fetch");
      const result = await fetchTool.handler(
        {
          stream: "CONSUMER_FETCH_TEST",
          consumer: "fetch-test-consumer",
          count: 10,
        },
        {}
      );

      expect(result.isError).toBeUndefined();
      const messages = JSON.parse(result.content[0].text);
      expect(Array.isArray(messages)).toBe(true);
      expect(messages.length).toBe(3);
      expect(messages[0].data).toBe("msg1");
      expect(messages[1].data).toBe("msg2");
      expect(messages[2].data).toBe("msg3");
      expect(messages[0].subject).toBe("consumer.fetch.messages");
    });

    test("should limit message count", async () => {
      const cleanup = await createTestStream("CONSUMER_FETCH_LIMIT", ["consumer.fetchlimit.>"]);
      cleanupFunctions.push(cleanup);

      await publishTestMessages("consumer.fetchlimit.msgs", ["a", "b", "c", "d", "e"]);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const { jsm } = getTestContext();
      await jsm.consumers.add("CONSUMER_FETCH_LIMIT", {
        durable_name: "limit-consumer",
        ack_policy: AckPolicy.Explicit,
      });

      const fetchTool = getTool(server, "nats_consumer_fetch");
      const result = await fetchTool.handler(
        {
          stream: "CONSUMER_FETCH_LIMIT",
          consumer: "limit-consumer",
          count: 2,
        },
        {}
      );

      const messages = JSON.parse(result.content[0].text);
      expect(messages.length).toBe(2);
    });

    test("should return empty array when no messages available", async () => {
      const cleanup = await createTestStream("CONSUMER_FETCH_EMPTY", ["consumer.fetchempty.>"]);
      cleanupFunctions.push(cleanup);

      const { jsm } = getTestContext();
      await jsm.consumers.add("CONSUMER_FETCH_EMPTY", {
        durable_name: "empty-consumer",
        ack_policy: AckPolicy.Explicit,
      });

      const fetchTool = getTool(server, "nats_consumer_fetch");
      const result = await fetchTool.handler(
        {
          stream: "CONSUMER_FETCH_EMPTY",
          consumer: "empty-consumer",
          count: 10,
        },
        {}
      );

      expect(result.isError).toBeUndefined();
      const messages = JSON.parse(result.content[0].text);
      expect(messages).toEqual([]);
    });

    test("should handle non-existent consumer", async () => {
      const cleanup = await createTestStream("CONSUMER_FETCH_MISSING", ["consumer.fetchmissing.>"]);
      cleanupFunctions.push(cleanup);

      const fetchTool = getTool(server, "nats_consumer_fetch");
      const result = await fetchTool.handler(
        {
          stream: "CONSUMER_FETCH_MISSING",
          consumer: "non-existent",
          count: 10,
        },
        {}
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error");
    });

    test("should acknowledge messages by default", async () => {
      const cleanup = await createTestStream("CONSUMER_FETCH_ACK", ["consumer.fetchack.>"]);
      cleanupFunctions.push(cleanup);

      await publishTestMessages("consumer.fetchack.msgs", ["ack1", "ack2"]);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const { jsm } = getTestContext();
      await jsm.consumers.add("CONSUMER_FETCH_ACK", {
        durable_name: "ack-consumer",
        ack_policy: AckPolicy.Explicit,
      });

      const fetchTool = getTool(server, "nats_consumer_fetch");

      const firstResult = await fetchTool.handler(
        {
          stream: "CONSUMER_FETCH_ACK",
          consumer: "ack-consumer",
          count: 10,
        },
        {}
      );

      const firstMessages = JSON.parse(firstResult.content[0].text);
      expect(firstMessages.length).toBe(2);

      const consumerInfo = await jsm.consumers.info("CONSUMER_FETCH_ACK", "ack-consumer");
      expect(consumerInfo.num_pending).toBe(0);
      expect(consumerInfo.num_ack_pending).toBe(0);
    }, 10000);
  });
});
