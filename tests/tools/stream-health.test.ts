import { describe, test, expect, beforeAll, afterAll, afterEach } from "bun:test";
import {
  setupNats,
  teardownNats,
  getTestContext,
  createTestStream,
  getTool,
  publishTestMessages,
} from "../setup";
import { registerStreamHealthTools } from "../../src/tools/stream-health";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AckPolicy, DeliverPolicy } from "nats";

describe("Stream Health Tools", () => {
  let server: McpServer;
  const cleanupFunctions: (() => Promise<void>)[] = [];

  beforeAll(async () => {
    await setupNats();
    const { js, jsm } = getTestContext();

    server = new McpServer({ name: "test-server", version: "1.0.0" });
    registerStreamHealthTools(server, js, jsm);
  });

  afterEach(async () => {
    for (const cleanup of cleanupFunctions) {
      await cleanup();
    }
    cleanupFunctions.length = 0;
  });

  afterAll(async () => {
    await teardownNats();
  });

  describe("nats_stream_health", () => {
    test("should return stream basic info", async () => {
      const cleanup = await createTestStream("HEALTH_BASIC_TEST", ["health.basic.>"]);

      cleanupFunctions.push(cleanup);

      await publishTestMessages("health.basic.msg", ["msg1", "msg2", "msg3"]);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const tool = getTool(server, "nats_stream_health");
      const result = await tool.handler({ stream: "HEALTH_BASIC_TEST" }, {});

      expect(result.isError).toBeUndefined();

      const data = JSON.parse(result.content[0].text);

      expect(data.stream.name).toBe("HEALTH_BASIC_TEST");
      expect(data.stream.messages).toBe(3);
      expect(data.stream.subjects).toContain("health.basic.>");
      expect(typeof data.stream.bytes).toBe("number");
      expect(typeof data.stream.first_seq).toBe("number");
      expect(typeof data.stream.last_seq).toBe("number");
    });

    test("should return healthy status with no consumers", async () => {
      const cleanup = await createTestStream("HEALTH_NO_CONSUMERS", ["health.nocon.>"]);

      cleanupFunctions.push(cleanup);

      const tool = getTool(server, "nats_stream_health");
      const result = await tool.handler({ stream: "HEALTH_NO_CONSUMERS" }, {});

      expect(result.isError).toBeUndefined();

      const data = JSON.parse(result.content[0].text);

      expect(data.consumers).toEqual([]);
      expect(data.health.status).toBe("healthy");
      expect(data.health.issues).toContain("No consumers configured");
    });

    test("should include consumer health details", async () => {
      const cleanup = await createTestStream("HEALTH_WITH_CONSUMER", ["health.consumer.>"]);

      cleanupFunctions.push(cleanup);

      await publishTestMessages("health.consumer.msg", ["msg1", "msg2", "msg3"]);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const { jsm } = getTestContext();
      await jsm.consumers.add("HEALTH_WITH_CONSUMER", {
        durable_name: "health-test-consumer",
        ack_policy: AckPolicy.Explicit,
      });

      const tool = getTool(server, "nats_stream_health");
      const result = await tool.handler({ stream: "HEALTH_WITH_CONSUMER" }, {});

      expect(result.isError).toBeUndefined();

      const data = JSON.parse(result.content[0].text);

      expect(data.consumers.length).toBe(1);
      expect(data.consumers[0].name).toBe("health-test-consumer");
      expect(data.consumers[0].pending).toBe(3);
      expect(data.consumers[0].paused).toBe(false);
      expect(typeof data.consumers[0].ack_pending).toBe("number");
      expect(typeof data.consumers[0].lag).toBe("number");
    });

    test("should detect unhealthy when consumer paused with pending messages", async () => {
      const cleanup = await createTestStream("HEALTH_PAUSED", ["health.paused.>"]);

      cleanupFunctions.push(cleanup);

      await publishTestMessages("health.paused.msg", ["msg1", "msg2"]);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const { jsm } = getTestContext();

      await jsm.consumers.add("HEALTH_PAUSED", {
        durable_name: "paused-consumer",
        ack_policy: AckPolicy.Explicit,
      });
      await jsm.consumers.pause(
        "HEALTH_PAUSED",
        "paused-consumer",
        new Date(Date.now() + 3600000)
      );

      const tool = getTool(server, "nats_stream_health");
      const result = await tool.handler({ stream: "HEALTH_PAUSED" }, {});

      expect(result.isError).toBeUndefined();

      const data = JSON.parse(result.content[0].text);

      expect(data.consumers[0].paused).toBe(true);
      expect(data.health.status).toBe("unhealthy");
      expect(data.health.issues.some((i: string) => i.toLowerCase().includes("paused"))).toBe(
        true
      );
    });

    test("should detect degraded when ack_pending exceeds threshold", async () => {
      const cleanup = await createTestStream("HEALTH_ACK_PENDING", ["health.ackpending.>"]);

      cleanupFunctions.push(cleanup);

      const messages = Array.from({ length: 10 }, (_, i) => `msg${i}`);

      await publishTestMessages("health.ackpending.msg", messages);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const { jsm, js } = getTestContext();
      await jsm.consumers.add("HEALTH_ACK_PENDING", {
        durable_name: "ack-pending-consumer",
        ack_policy: AckPolicy.Explicit,
      });

      const consumer = await js.consumers.get("HEALTH_ACK_PENDING", "ack-pending-consumer");
      const iter = await consumer.fetch({ max_messages: 5, expires: 2000 });

      let count = 0;
      for await (const msg of iter) {
        count++;
        if (count >= 5) break;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      const tool = getTool(server, "nats_stream_health");
      const result = await tool.handler(
        {
          stream: "HEALTH_ACK_PENDING",
          ack_pending_threshold: 2,
        },
        {}
      );

      expect(result.isError).toBeUndefined();

      const data = JSON.parse(result.content[0].text);

      expect(data.consumers[0].ack_pending).toBeGreaterThan(0);
      expect(data.health.status).toBe("degraded");
      expect(
        data.health.issues.some((i: string) => i.toLowerCase().includes("ack"))
      ).toBe(true);
    });

    test("should detect unhealthy when lag exceeds threshold", async () => {
      const cleanup = await createTestStream("HEALTH_LAG", ["health.lag.>"]);

      cleanupFunctions.push(cleanup);

      const messages = Array.from({ length: 50 }, (_, i) => `msg${i}`);

      await publishTestMessages("health.lag.msg", messages);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const { jsm } = getTestContext();

      await jsm.consumers.add("HEALTH_LAG", {
        durable_name: "lagging-consumer",
        ack_policy: AckPolicy.Explicit,
      });

      const tool = getTool(server, "nats_stream_health");
      const result = await tool.handler(
        {
          stream: "HEALTH_LAG",
          lag_threshold: 10,
        },
        {}
      );

      expect(result.isError).toBeUndefined();

      const data = JSON.parse(result.content[0].text);

      expect(data.health.status).toBe("unhealthy");
      expect(data.health.issues.some((i: string) => i.toLowerCase().includes("lag"))).toBe(
        true
      );
    });

    test("should return healthy when consumers are caught up", async () => {
      const cleanup = await createTestStream("HEALTH_HEALTHY", ["health.healthy.>"]);

      cleanupFunctions.push(cleanup);

      const { jsm, js } = getTestContext();

      await jsm.consumers.add("HEALTH_HEALTHY", {
        durable_name: "healthy-consumer",
        ack_policy: AckPolicy.Explicit,
        deliver_policy: DeliverPolicy.New,
      });

      const tool = getTool(server, "nats_stream_health");
      const result = await tool.handler({ stream: "HEALTH_HEALTHY" }, {});

      expect(result.isError).toBeUndefined();

      const data = JSON.parse(result.content[0].text);

      expect(data.health.status).toBe("healthy");
      expect(
        data.health.issues.filter((i: string) => !i.includes("No consumers")).length
      ).toBe(0);
    });

    test("should return error for non-existent stream", async () => {
      const tool = getTool(server, "nats_stream_health");
      const result = await tool.handler({ stream: "NON_EXISTENT_STREAM" }, {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text.toLowerCase()).toContain("error");
    });

    test("should calculate lag correctly for multiple consumers", async () => {
      const cleanup = await createTestStream("HEALTH_MULTI_CONSUMER", ["health.multi.>"]);

      cleanupFunctions.push(cleanup);

      await publishTestMessages("health.multi.msg", ["msg1", "msg2", "msg3", "msg4", "msg5"]);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const { jsm, js } = getTestContext();

      await jsm.consumers.add("HEALTH_MULTI_CONSUMER", {
        durable_name: "consumer-1",
        ack_policy: AckPolicy.Explicit,
      });

      await jsm.consumers.add("HEALTH_MULTI_CONSUMER", {
        durable_name: "consumer-2",
        ack_policy: AckPolicy.Explicit,
      });

      const c1 = await js.consumers.get("HEALTH_MULTI_CONSUMER", "consumer-1");
      const iter = await c1.fetch({ max_messages: 5, expires: 2000 });
      for await (const msg of iter) {
        msg.ack();
      }

      const tool = getTool(server, "nats_stream_health");
      const result = await tool.handler({ stream: "HEALTH_MULTI_CONSUMER" }, {});

      expect(result.isError).toBeUndefined();

      const data = JSON.parse(result.content[0].text);

      expect(data.consumers.length).toBe(2);

      const consumer1 = data.consumers.find((c: any) => c.name === "consumer-1");
      const consumer2 = data.consumers.find((c: any) => c.name === "consumer-2");

      expect(consumer1.pending).toBe(0);
      expect(consumer2.pending).toBe(5);
    });

    test("should use custom thresholds", async () => {
      const cleanup = await createTestStream("HEALTH_CUSTOM_THRESH", ["health.custom.>"]);

      cleanupFunctions.push(cleanup);

      const messages = Array.from({ length: 20 }, (_, i) => `msg${i}`);

      await publishTestMessages("health.custom.msg", messages);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const { jsm } = getTestContext();
      await jsm.consumers.add("HEALTH_CUSTOM_THRESH", {
        durable_name: "custom-consumer",
        ack_policy: AckPolicy.Explicit,
      });

      const tool = getTool(server, "nats_stream_health");
      const result = await tool.handler(
        {
          stream: "HEALTH_CUSTOM_THRESH",
          lag_threshold: 1000,
          ack_pending_threshold: 500,
        },
        {}
      );

      expect(result.isError).toBeUndefined();

      const data = JSON.parse(result.content[0].text);

      expect(data.health.status).toBe("healthy");
    });
  });
});
