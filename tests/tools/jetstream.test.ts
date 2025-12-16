import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import {
  setupNats,
  teardownNats,
  getTestContext,
  createTestStream,
  publishTestMessages,
  getTool,
} from "../setup";
import { registerJetstreamTools } from "../../src/tools/jetstream";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RetentionPolicy, StorageType } from "nats";

describe("JetStream Tools", () => {
  let server: McpServer;
  let cleanupStream: (() => Promise<void>) | null = null;
  const TEST_STREAM = "TEST_STREAM";

  beforeAll(async () => {
    await setupNats();
    const { js, jsm } = getTestContext();

    server = new McpServer({ name: "test-server", version: "1.0.0" });
    registerJetstreamTools(server, js, jsm);
  });

  beforeEach(async () => {
    if (cleanupStream) {
      await cleanupStream();
    }
    cleanupStream = await createTestStream(TEST_STREAM, ["test.stream.>"]);
  });

  afterAll(async () => {
    if (cleanupStream) {
      await cleanupStream();
    }
    await teardownNats();
  });

  describe("nats_stream_list", () => {
    test("should list all streams", async () => {
      const streamListTool = getTool(server, "nats_stream_list");
      const result = await streamListTool.handler({}, {});
      const streams = JSON.parse(result.content[0].text);
      
      expect(Array.isArray(streams)).toBe(true);
      expect(streams.length).toBeGreaterThanOrEqual(1);

      const testStream = streams.find((s: any) => s.name === TEST_STREAM);

      expect(testStream).toBeDefined();
      expect(testStream.subjects).toContain("test.stream.>");
      expect(testStream.messages).toBe(0);
      expect(testStream.bytes).toBe(0);
      expect(testStream.consumers).toBe(0);
      expect(result.isError).toBeUndefined();
    });

    test("should include message count after publishing", async () => {
      await publishTestMessages("test.stream.messages", ["msg1", "msg2", "msg3"]);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const streamListTool = getTool(server, "nats_stream_list");
      const result = await streamListTool.handler({}, {});
      const streams = JSON.parse(result.content[0].text);
      const testStream = streams.find((s: any) => s.name === TEST_STREAM);

      expect(testStream.messages).toBe(3);
      expect(testStream.bytes).toBeGreaterThan(0);
    });
  });

  describe("nats_stream_info", () => {
    test("should return stream information", async () => {
      const streamInfoTool = getTool(server, "nats_stream_info");
      const result = await streamInfoTool.handler({ stream: TEST_STREAM }, {});
      const info = JSON.parse(result.content[0].text);

      expect(info.name).toBe(TEST_STREAM);
      expect(info.subjects).toContain("test.stream.>");
      expect(info.state.messages).toBe(0);
      expect(result.isError).toBeUndefined();
    });

    test("should return error for nonexistent stream", async () => {
      const streamInfoTool = getTool(server, "nats_stream_info");
      const result = await streamInfoTool.handler(
        { stream: "NONEXISTENT_STREAM" },
        {}
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error");
    });
  });

  describe("nats_stream_publish", () => {
    test("should publish to stream with ack", async () => {
      const publishTool = getTool(server, "nats_stream_publish");
      const result = await publishTool.handler(
        { subject: "test.stream.messages", payload: "Hello JetStream!" },
        {}
      );

      expect(result.content[0].text).toContain("Published to stream");
      expect(result.content[0].text).toContain(TEST_STREAM);
      expect(result.content[0].text).toContain("sequence");
      expect(result.isError).toBeUndefined();
    });

    test("should fail for subject not matching any stream", async () => {
      const publishTool = getTool(server, "nats_stream_publish");
      const result = await publishTool.handler(
        { subject: "no.stream.subject", payload: "This should fail" },
        {}
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error");
    });
  });

  describe("nats_stream_get_messages", () => {
    test("should fetch messages from stream", async () => {
      await publishTestMessages("test.stream.messages", [
        "Message 1",
        "Message 2",
        "Message 3",
      ]);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const getMessagesTool = getTool(server, "nats_stream_get_messages");
      const result = await getMessagesTool.handler(
        { stream: TEST_STREAM, count: 10 },
        {}
      );
      const messages = JSON.parse(result.content[0].text);

      expect(messages.length).toBe(3);
      expect(messages[0].data).toBe("Message 1");
      expect(messages[1].data).toBe("Message 2");
      expect(messages[2].data).toBe("Message 3");
      expect(messages[0].subject).toBe("test.stream.messages");
    });

    test("should return empty array for stream with no messages", async () => {
      const getMessagesTool = getTool(server, "nats_stream_get_messages");
      const result = await getMessagesTool.handler(
        { stream: TEST_STREAM, count: 10 },
        {}
      );
      const messages = JSON.parse(result.content[0].text);

      expect(messages).toEqual([]);
    });

    test("should limit message count", async () => {
      await publishTestMessages("test.stream.messages", [
        "Msg 1",
        "Msg 2",
        "Msg 3",
        "Msg 4",
        "Msg 5",
      ]);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const getMessagesTool = getTool(server, "nats_stream_get_messages");
      const result = await getMessagesTool.handler(
        { stream: TEST_STREAM, count: 2 },
        {}
      );
      const messages = JSON.parse(result.content[0].text);

      expect(messages.length).toBe(2);
    });

    test("should not exceed max count of 100", async () => {
      const getMessagesTool = getTool(server, "nats_stream_get_messages");
      const result = await getMessagesTool.handler(
        { stream: TEST_STREAM, count: 200 },
        {}
      );

      expect(result.isError).toBeUndefined();
    });
  });

  describe("nats_stream_create", () => {
    const CREATED_STREAM = "TEST_CREATED_STREAM";

    async function deleteStreamIfExists(name: string) {
      const { jsm } = getTestContext();
      try {
        await jsm.streams.delete(name);
      } catch {
      }
    }

    test("should create a stream with basic configuration", async () => {
      await deleteStreamIfExists(CREATED_STREAM);

      const tool = getTool(server, "nats_stream_create");
      const result = await tool.handler({
        name: CREATED_STREAM,
        subjects: ["test.created.>"],
      }, {});

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain(CREATED_STREAM);
      expect(result.content[0].text).toContain("Created stream");

      const { jsm } = getTestContext();
      const info = await jsm.streams.info(CREATED_STREAM);

      expect(info.config.name).toBe(CREATED_STREAM);
      expect(info.config.subjects).toContain("test.created.>");

      await deleteStreamIfExists(CREATED_STREAM);
    });

    test("should create a stream with retention policy", async () => {
      await deleteStreamIfExists(CREATED_STREAM);

      const tool = getTool(server, "nats_stream_create");
      const result = await tool.handler({
        name: CREATED_STREAM,
        subjects: ["test.retention.>"],
        retention: "workqueue",
      }, {});

      expect(result.isError).toBeUndefined();

      const { jsm } = getTestContext();
      const info = await jsm.streams.info(CREATED_STREAM);

      expect(info.config.retention).toBe(RetentionPolicy.Workqueue);

      await deleteStreamIfExists(CREATED_STREAM);
    });

    test("should create a stream with max messages limit", async () => {
      await deleteStreamIfExists(CREATED_STREAM);

      const tool = getTool(server, "nats_stream_create");
      const result = await tool.handler({
        name: CREATED_STREAM,
        subjects: ["test.maxmsgs.>"],
        max_msgs: 500,
      }, {});

      expect(result.isError).toBeUndefined();

      const { jsm } = getTestContext();
      const info = await jsm.streams.info(CREATED_STREAM);

      expect(info.config.max_msgs).toBe(500);

      await deleteStreamIfExists(CREATED_STREAM);
    });

    test("should create a stream with storage type", async () => {
      await deleteStreamIfExists(CREATED_STREAM);

      const tool = getTool(server, "nats_stream_create");
      const result = await tool.handler({
        name: CREATED_STREAM,
        subjects: ["test.storage.>"],
        storage: "memory",
      }, {});

      expect(result.isError).toBeUndefined();

      const { jsm } = getTestContext();
      const info = await jsm.streams.info(CREATED_STREAM);

      expect(info.config.storage).toBe(StorageType.Memory);

      await deleteStreamIfExists(CREATED_STREAM);
    });

    test("should return error for duplicate stream name", async () => {
      await deleteStreamIfExists(CREATED_STREAM);

      const { jsm } = getTestContext();

      await jsm.streams.add({
        name: CREATED_STREAM,
        subjects: ["test.duplicate.>"],
        storage: StorageType.Memory,
      });

      const tool = getTool(server, "nats_stream_create");
      const result = await tool.handler({
        name: CREATED_STREAM,
        subjects: ["test.duplicate.other.>"],
      }, {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error");

      await deleteStreamIfExists(CREATED_STREAM);
    });
  });

  describe("nats_stream_delete", () => {
    const DELETE_STREAM = "TEST_DELETE_STREAM";

    test("should delete an existing stream", async () => {
      const { jsm } = getTestContext();

      try {
        await jsm.streams.delete(DELETE_STREAM);
      } catch {
      }

      await jsm.streams.add({
        name: DELETE_STREAM,
        subjects: ["test.delete.>"],
        storage: StorageType.Memory,
      });

      const tool = getTool(server, "nats_stream_delete");
      const result = await tool.handler({ stream: DELETE_STREAM }, {});

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("Deleted stream");
      expect(result.content[0].text).toContain(DELETE_STREAM);

      try {
        await jsm.streams.info(DELETE_STREAM);
        throw new Error("Stream should not exist");
      } catch (error) {
        expect(String(error)).toContain("stream not found");
      }
    });

    test("should return error for non-existent stream", async () => {
      const tool = getTool(server, "nats_stream_delete");
      const result = await tool.handler({ stream: "NONEXISTENT_STREAM_XYZ" }, {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error");
    });
  });

  describe("nats_stream_purge", () => {
    const PURGE_STREAM = "TEST_PURGE_STREAM";

    async function setupPurgeStream() {
      const { jsm } = getTestContext();
      try {
        await jsm.streams.delete(PURGE_STREAM);
      } catch {
      }

      await jsm.streams.add({
        name: PURGE_STREAM,
        subjects: ["test.purge.>"],
        storage: StorageType.Memory,
      });
    }

    test("should purge all messages from a stream", async () => {
      await setupPurgeStream();
      await publishTestMessages("test.purge.messages", ["msg1", "msg2", "msg3"]);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const { jsm } = getTestContext();
      let info = await jsm.streams.info(PURGE_STREAM);

      expect(info.state.messages).toBe(3);

      const tool = getTool(server, "nats_stream_purge");
      const result = await tool.handler({ stream: PURGE_STREAM }, {});

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("Purged");

      info = await jsm.streams.info(PURGE_STREAM);
      expect(info.state.messages).toBe(0);

      await jsm.streams.delete(PURGE_STREAM);
    });

    test("should purge messages matching a subject filter", async () => {
      await setupPurgeStream();
      await publishTestMessages("test.purge.keep", ["keep1", "keep2"]);
      await publishTestMessages("test.purge.delete", ["del1", "del2", "del3"]);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const { jsm } = getTestContext();
      let info = await jsm.streams.info(PURGE_STREAM);

      expect(info.state.messages).toBe(5);

      const tool = getTool(server, "nats_stream_purge");

      const result = await tool.handler({
        stream: PURGE_STREAM,
        filter: "test.purge.delete",
      }, {});

      expect(result.isError).toBeUndefined();

      info = await jsm.streams.info(PURGE_STREAM);

      expect(info.state.messages).toBe(2);

      await jsm.streams.delete(PURGE_STREAM);
    });

    test("should purge messages up to a sequence number", async () => {
      await setupPurgeStream();
      await publishTestMessages("test.purge.seq", ["msg1", "msg2", "msg3", "msg4", "msg5"]);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const { jsm } = getTestContext();
      let info = await jsm.streams.info(PURGE_STREAM);

      expect(info.state.messages).toBe(5);

      const tool = getTool(server, "nats_stream_purge");
      const result = await tool.handler({
        stream: PURGE_STREAM,
        seq: 3,
      }, {});

      expect(result.isError).toBeUndefined();

      info = await jsm.streams.info(PURGE_STREAM);

      expect(info.state.messages).toBe(3);

      await jsm.streams.delete(PURGE_STREAM);
    });

    test("should return error for non-existent stream", async () => {
      const tool = getTool(server, "nats_stream_purge");
      const result = await tool.handler({ stream: "NONEXISTENT_PURGE_STREAM" }, {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error");
    });
  });

  describe("nats_stream_get_message", () => {
    const MSG_STREAM = "TEST_MSG_STREAM";

    async function setupMessageStream() {
      const { jsm } = getTestContext();
      try {
        await jsm.streams.delete(MSG_STREAM);
      } catch {
      }

      await jsm.streams.add({
        name: MSG_STREAM,
        subjects: ["test.msg.>"],
        storage: StorageType.Memory,
      });
    }

    test("should get a message by sequence number", async () => {
      await setupMessageStream();
      await publishTestMessages("test.msg.data", ["msg1", "msg2", "msg3"]);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const tool = getTool(server, "nats_stream_get_message");
      const result = await tool.handler({
        stream: MSG_STREAM,
        seq: 2,
      }, {});

      expect(result.isError).toBeUndefined();

      const msg = JSON.parse(result.content[0].text);

      expect(msg.seq).toBe(2);
      expect(msg.data).toBe("msg2");
      expect(msg.subject).toBe("test.msg.data");

      const { jsm } = getTestContext();

      await jsm.streams.delete(MSG_STREAM);
    });

    test("should get last message by subject", async () => {
      await setupMessageStream();
      await publishTestMessages("test.msg.first", ["first1", "first2"]);
      await publishTestMessages("test.msg.second", ["second1", "second2", "second3"]);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const tool = getTool(server, "nats_stream_get_message");
      const result = await tool.handler({
        stream: MSG_STREAM,
        last_by_subject: "test.msg.second",
      }, {});

      expect(result.isError).toBeUndefined();

      const msg = JSON.parse(result.content[0].text);

      expect(msg.data).toBe("second3");
      expect(msg.subject).toBe("test.msg.second");

      const { jsm } = getTestContext();

      await jsm.streams.delete(MSG_STREAM);
    });

    test("should return error for non-existent sequence", async () => {
      await setupMessageStream();

      const tool = getTool(server, "nats_stream_get_message");

      const result = await tool.handler({
        stream: MSG_STREAM,
        seq: 999,
      }, {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error");

      const { jsm } = getTestContext();

      await jsm.streams.delete(MSG_STREAM);
    });

    test("should return error for non-existent stream", async () => {
      const tool = getTool(server, "nats_stream_get_message");
      const result = await tool.handler({
        stream: "NONEXISTENT_MSG_STREAM",
        seq: 1,
      }, {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error");
    });
  });

  describe("nats_stream_delete_message", () => {
    const DEL_MSG_STREAM = "TEST_DEL_MSG_STREAM";

    async function setupDeleteMessageStream() {
      const { jsm } = getTestContext();
      try {
        await jsm.streams.delete(DEL_MSG_STREAM);
      } catch {
      }

      await jsm.streams.add({
        name: DEL_MSG_STREAM,
        subjects: ["test.delmsg.>"],
        storage: StorageType.Memory,
      });
    }

    test("should delete a message by sequence number", async () => {
      await setupDeleteMessageStream();
      await publishTestMessages("test.delmsg.data", ["msg1", "msg2", "msg3"]);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const { jsm } = getTestContext();
      let info = await jsm.streams.info(DEL_MSG_STREAM);

      expect(info.state.messages).toBe(3);

      const tool = getTool(server, "nats_stream_delete_message");

      const result = await tool.handler({
        stream: DEL_MSG_STREAM,
        seq: 2,
      }, {});

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("Deleted message");
      expect(result.content[0].text).toContain("sequence 2");

      info = await jsm.streams.info(DEL_MSG_STREAM);

      expect(info.state.messages).toBe(2);

      await jsm.streams.delete(DEL_MSG_STREAM);
    });

    test("should return error for non-existent sequence", async () => {
      await setupDeleteMessageStream();

      const tool = getTool(server, "nats_stream_delete_message");
      const result = await tool.handler({
        stream: DEL_MSG_STREAM,
        seq: 999,
      }, {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error");

      const { jsm } = getTestContext();

      await jsm.streams.delete(DEL_MSG_STREAM);
    });

    test("should return error for non-existent stream", async () => {
      const tool = getTool(server, "nats_stream_delete_message");

      const result = await tool.handler({
        stream: "NONEXISTENT_DEL_STREAM",
        seq: 1,
      }, {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error");
    });
  });
});
