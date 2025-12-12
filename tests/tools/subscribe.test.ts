import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { setupNats, teardownNats, getTestContext, getTool } from "../setup";
import { registerSubscribeTools } from "../../src/tools/subscribe";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StringCodec } from "nats";

const sc = StringCodec();

describe("Subscribe Tools", () => {
  let server: McpServer;

  beforeAll(async () => {
    await setupNats();
    const { nc } = getTestContext();

    server = new McpServer({ name: "test-server", version: "1.0.0" });
    registerSubscribeTools(server, nc);
  });

  afterAll(async () => {
    await teardownNats();
  });

  describe("nats_subscribe", () => {
    test("should receive published messages", async () => {
      const { nc } = getTestContext();
      const subscribeTool = getTool(server, "nats_subscribe");

      // Start subscription in background
      const subscribePromise = subscribeTool.handler(
        { subject: "test.subscribe.basic", timeout: 3000, max_messages: 5 },
        {}
      );

      // Give subscription time to establish
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Publish messages
      nc.publish("test.subscribe.basic", sc.encode("message 1"));
      nc.publish("test.subscribe.basic", sc.encode("message 2"));
      nc.publish("test.subscribe.basic", sc.encode("message 3"));
      await nc.flush();

      const result = await subscribePromise;

      expect(result.isError).toBeUndefined();
      const messages = JSON.parse(result.content[0].text);
      expect(messages.length).toBeGreaterThanOrEqual(3);
      expect(messages[0].data).toBe("message 1");
      expect(messages[1].data).toBe("message 2");
      expect(messages[2].data).toBe("message 3");
    });

    test("should return empty array when no messages received", async () => {
      const subscribeTool = getTool(server, "nats_subscribe");

      const result = await subscribeTool.handler(
        { subject: "test.subscribe.empty", timeout: 500, max_messages: 10 },
        {}
      );

      expect(result.isError).toBeUndefined();
      const messages = JSON.parse(result.content[0].text);
      expect(messages).toEqual([]);
    });

    test("should respect max_messages limit", async () => {
      const { nc } = getTestContext();
      const subscribeTool = getTool(server, "nats_subscribe");

      // Start subscription with max 2 messages
      const subscribePromise = subscribeTool.handler(
        { subject: "test.subscribe.limit", timeout: 3000, max_messages: 2 },
        {}
      );

      // Give subscription time to establish
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Publish more messages than max
      nc.publish("test.subscribe.limit", sc.encode("msg 1"));
      nc.publish("test.subscribe.limit", sc.encode("msg 2"));
      nc.publish("test.subscribe.limit", sc.encode("msg 3"));
      nc.publish("test.subscribe.limit", sc.encode("msg 4"));
      await nc.flush();

      const result = await subscribePromise;

      const messages = JSON.parse(result.content[0].text);
      expect(messages.length).toBe(2);
    });

    test("should support wildcard subscriptions", async () => {
      const { nc } = getTestContext();
      const subscribeTool = getTool(server, "nats_subscribe");

      // Subscribe to wildcard
      const subscribePromise = subscribeTool.handler(
        { subject: "test.subscribe.wild.*", timeout: 3000, max_messages: 10 },
        {}
      );

      // Give subscription time to establish
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Publish to various subjects matching wildcard
      nc.publish("test.subscribe.wild.one", sc.encode("wild 1"));
      nc.publish("test.subscribe.wild.two", sc.encode("wild 2"));
      nc.publish("test.subscribe.wild.three", sc.encode("wild 3"));
      await nc.flush();

      const result = await subscribePromise;

      const messages = JSON.parse(result.content[0].text);
      expect(messages.length).toBeGreaterThanOrEqual(3);

      const subjects = messages.map((m: any) => m.subject);
      expect(subjects).toContain("test.subscribe.wild.one");
      expect(subjects).toContain("test.subscribe.wild.two");
      expect(subjects).toContain("test.subscribe.wild.three");
    });

    test("should support multi-level wildcard (>)", async () => {
      const { nc } = getTestContext();
      const subscribeTool = getTool(server, "nats_subscribe");

      // Subscribe to multi-level wildcard
      const subscribePromise = subscribeTool.handler(
        { subject: "test.subscribe.multi.>", timeout: 3000, max_messages: 10 },
        {}
      );

      // Give subscription time to establish
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Publish to various deep subjects
      nc.publish("test.subscribe.multi.a", sc.encode("multi a"));
      nc.publish("test.subscribe.multi.a.b", sc.encode("multi a.b"));
      nc.publish("test.subscribe.multi.a.b.c", sc.encode("multi a.b.c"));
      await nc.flush();

      const result = await subscribePromise;

      const messages = JSON.parse(result.content[0].text);
      expect(messages.length).toBeGreaterThanOrEqual(3);
    });

    test("should include message metadata", async () => {
      const { nc } = getTestContext();
      const subscribeTool = getTool(server, "nats_subscribe");

      const subscribePromise = subscribeTool.handler(
        { subject: "test.subscribe.meta", timeout: 3000, max_messages: 1 },
        {}
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      nc.publish("test.subscribe.meta", sc.encode("test message"));
      await nc.flush();

      const result = await subscribePromise;

      const messages = JSON.parse(result.content[0].text);
      expect(messages.length).toBe(1);
      expect(messages[0].subject).toBe("test.subscribe.meta");
      expect(messages[0].data).toBe("test message");
      expect(messages[0].timestamp).toBeDefined();
    });

    test("should support queue groups for load balancing", async () => {
      const { nc } = getTestContext();
      const subscribeTool = getTool(server, "nats_subscribe");

      // Start two subscribers in same queue group
      const subscribe1 = subscribeTool.handler(
        { subject: "test.subscribe.queue", timeout: 2000, max_messages: 10, queue: "test-queue" },
        {}
      );

      const subscribe2 = subscribeTool.handler(
        { subject: "test.subscribe.queue", timeout: 2000, max_messages: 10, queue: "test-queue" },
        {}
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Publish multiple messages
      for (let i = 0; i < 10; i++) {
        nc.publish("test.subscribe.queue", sc.encode(`queue msg ${i}`));
      }
      await nc.flush();

      const [result1, result2] = await Promise.all([subscribe1, subscribe2]);

      const messages1 = JSON.parse(result1.content[0].text);
      const messages2 = JSON.parse(result2.content[0].text);

      // With queue groups, messages should be distributed
      // Both should have received some messages, but total should be ~10
      const totalMessages = messages1.length + messages2.length;
      expect(totalMessages).toBeGreaterThanOrEqual(9); // Allow for timing edge cases
      expect(totalMessages).toBeLessThanOrEqual(10);
    });

    test("should enforce max timeout of 30 seconds", async () => {
      const subscribeTool = getTool(server, "nats_subscribe");

      // Request 60 second timeout, should be capped to 30
      const startTime = Date.now();
      const result = await subscribeTool.handler(
        { subject: "test.subscribe.timeout.cap", timeout: 60000, max_messages: 1 },
        {}
      );
      const elapsed = Date.now() - startTime;

      // Should return quickly (no messages) but not wait 60 seconds
      // In practice it should be capped at 30s max
      expect(elapsed).toBeLessThan(35000);

      const messages = JSON.parse(result.content[0].text);
      expect(messages).toEqual([]);
    }, 35000);

    test("should enforce max messages of 100", async () => {
      const { nc } = getTestContext();
      const subscribeTool = getTool(server, "nats_subscribe");

      const subscribePromise = subscribeTool.handler(
        { subject: "test.subscribe.max.cap", timeout: 5000, max_messages: 200 },
        {}
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Publish 150 messages rapidly
      for (let i = 0; i < 150; i++) {
        nc.publish("test.subscribe.max.cap", sc.encode(`msg ${i}`));
      }
      await nc.flush();

      const result = await subscribePromise;

      const messages = JSON.parse(result.content[0].text);
      // Should be capped at 100 max
      expect(messages.length).toBeLessThanOrEqual(100);
    });
  });
});
