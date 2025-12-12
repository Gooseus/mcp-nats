import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { setupNats, teardownNats, getTestContext, createTestKvBucket, getTool } from "../setup";
import { registerKvTools } from "../../src/tools/kv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

describe("KV Tools", () => {
  let server: McpServer;
  let cleanupBucket: (() => Promise<void>) | null = null;
  const TEST_BUCKET = "test-kv-bucket";

  beforeAll(async () => {
    await setupNats();
    const { js, jsm } = getTestContext();

    server = new McpServer({ name: "test-server", version: "1.0.0" });
    registerKvTools(server, js, jsm);
  });

  beforeEach(async () => {
    // Create a fresh bucket for each test
    if (cleanupBucket) {
      await cleanupBucket();
    }
    cleanupBucket = await createTestKvBucket(TEST_BUCKET);
  });

  afterAll(async () => {
    if (cleanupBucket) {
      await cleanupBucket();
    }
    await teardownNats();
  });

  describe("nats_kv_put", () => {
    test("should store a new key-value pair", async () => {
      const putTool = getTool(server, "nats_kv_put");

      const result = await putTool.handler(
        { bucket: TEST_BUCKET, key: "test-key", value: "test-value" },
        {}
      );

      expect(result.content[0].text).toContain("Stored");
      expect(result.content[0].text).toContain("test-key");
      expect(result.content[0].text).toContain("revision");
    });

    test("should update an existing key", async () => {
      const putTool = getTool(server, "nats_kv_put");

      // First put
      await putTool.handler(
        { bucket: TEST_BUCKET, key: "update-key", value: "initial" },
        {}
      );

      // Update
      const result = await putTool.handler(
        { bucket: TEST_BUCKET, key: "update-key", value: "updated" },
        {}
      );

      expect(result.content[0].text).toContain("Stored");
      expect(result.content[0].text).toContain("revision 2");
    });
  });

  describe("nats_kv_get", () => {
    test("should retrieve an existing key", async () => {
      const putTool = getTool(server, "nats_kv_put");
      const getTool_ = getTool(server, "nats_kv_get");

      // Store a value first
      await putTool.handler(
        { bucket: TEST_BUCKET, key: "get-key", value: "retrieved-value" },
        {}
      );

      // Get the value
      const result = await getTool_.handler(
        { bucket: TEST_BUCKET, key: "get-key" },
        {}
      );

      expect(result.content[0].text).toBe("retrieved-value");
      expect(result.isError).toBeUndefined();
    });

    test("should return not found for missing key", async () => {
      const getTool_ = getTool(server, "nats_kv_get");

      const result = await getTool_.handler(
        { bucket: TEST_BUCKET, key: "nonexistent-key" },
        {}
      );

      expect(result.content[0].text).toContain("not found");
    });
  });

  describe("nats_kv_delete", () => {
    test("should delete an existing key", async () => {
      const putTool = getTool(server, "nats_kv_put");
      const deleteTool = getTool(server, "nats_kv_delete");
      const getTool_ = getTool(server, "nats_kv_get");

      // Store a value first
      await putTool.handler(
        { bucket: TEST_BUCKET, key: "delete-key", value: "to-be-deleted" },
        {}
      );

      // Delete the key
      const deleteResult = await deleteTool.handler(
        { bucket: TEST_BUCKET, key: "delete-key" },
        {}
      );

      expect(deleteResult.content[0].text).toContain("Deleted");

      // Verify it's gone
      const getResult = await getTool_.handler(
        { bucket: TEST_BUCKET, key: "delete-key" },
        {}
      );

      expect(getResult.content[0].text).toContain("not found");
    });
  });

  describe("nats_kv_list_keys", () => {
    test("should list all keys in bucket", async () => {
      const putTool = getTool(server, "nats_kv_put");
      const listTool = getTool(server, "nats_kv_list_keys");

      // Store multiple keys
      await putTool.handler(
        { bucket: TEST_BUCKET, key: "key1", value: "value1" },
        {}
      );
      await putTool.handler(
        { bucket: TEST_BUCKET, key: "key2", value: "value2" },
        {}
      );
      await putTool.handler(
        { bucket: TEST_BUCKET, key: "key3", value: "value3" },
        {}
      );

      // List keys
      const result = await listTool.handler({ bucket: TEST_BUCKET }, {});

      const keys = JSON.parse(result.content[0].text);
      expect(keys).toContain("key1");
      expect(keys).toContain("key2");
      expect(keys).toContain("key3");
      expect(keys.length).toBe(3);
    });

    test("should return empty array for empty bucket", async () => {
      const listTool = getTool(server, "nats_kv_list_keys");

      const result = await listTool.handler({ bucket: TEST_BUCKET }, {});

      const keys = JSON.parse(result.content[0].text);
      expect(keys).toEqual([]);
    });

    test("should filter keys by pattern", async () => {
      const putTool = getTool(server, "nats_kv_put");
      const listTool = getTool(server, "nats_kv_list_keys");

      // Store keys with different prefixes
      await putTool.handler(
        { bucket: TEST_BUCKET, key: "user.1", value: "user1" },
        {}
      );
      await putTool.handler(
        { bucket: TEST_BUCKET, key: "user.2", value: "user2" },
        {}
      );
      await putTool.handler(
        { bucket: TEST_BUCKET, key: "config.app", value: "config" },
        {}
      );

      // List with filter
      const result = await listTool.handler(
        { bucket: TEST_BUCKET, filter: "user.>" },
        {}
      );

      const keys = JSON.parse(result.content[0].text);
      expect(keys).toContain("user.1");
      expect(keys).toContain("user.2");
      expect(keys).not.toContain("config.app");
    });
  });

  describe("nats_kv_create", () => {
    const CREATED_BUCKET = "test-created-bucket";

    async function deleteBucketIfExists(bucket: string) {
      const { jsm } = getTestContext();
      try {
        await jsm.streams.delete(`KV_${bucket}`);
      } catch {
        // Bucket may not exist
      }
    }

    test("should create a KV bucket with default settings", async () => {
      // Arrange
      await deleteBucketIfExists(CREATED_BUCKET);
      const tool = getTool(server, "nats_kv_create");

      // Act
      const result = await tool.handler({
        bucket: CREATED_BUCKET,
      }, {});

      // Assert
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("Created");
      expect(result.content[0].text).toContain(CREATED_BUCKET);

      // Verify bucket exists by trying to use it
      const { js } = getTestContext();
      const kv = await js.views.kv(CREATED_BUCKET);
      await kv.put("test-key", new TextEncoder().encode("test-value"));
      const entry = await kv.get("test-key");
      expect(entry).toBeDefined();

      // Cleanup
      await deleteBucketIfExists(CREATED_BUCKET);
    });

    test("should create a KV bucket with history", async () => {
      // Arrange
      await deleteBucketIfExists(CREATED_BUCKET);
      const tool = getTool(server, "nats_kv_create");

      // Act
      const result = await tool.handler({
        bucket: CREATED_BUCKET,
        history: 10,
      }, {});

      // Assert
      expect(result.isError).toBeUndefined();

      // Verify the history setting via stream info
      const { jsm } = getTestContext();
      const info = await jsm.streams.info(`KV_${CREATED_BUCKET}`);
      expect(info.config.max_msgs_per_subject).toBe(10);

      // Cleanup
      await deleteBucketIfExists(CREATED_BUCKET);
    });

    test("should create a KV bucket with TTL", async () => {
      // Arrange
      await deleteBucketIfExists(CREATED_BUCKET);
      const tool = getTool(server, "nats_kv_create");

      // Act - TTL of 60 seconds (in milliseconds)
      const result = await tool.handler({
        bucket: CREATED_BUCKET,
        ttl: 60000,
      }, {});

      // Assert
      expect(result.isError).toBeUndefined();

      // Verify the TTL setting via stream info (converted to nanos)
      const { jsm } = getTestContext();
      const info = await jsm.streams.info(`KV_${CREATED_BUCKET}`);
      expect(info.config.max_age).toBe(60000 * 1_000_000); // ms to ns

      // Cleanup
      await deleteBucketIfExists(CREATED_BUCKET);
    });

    test("should create a KV bucket with max bytes", async () => {
      // Arrange
      await deleteBucketIfExists(CREATED_BUCKET);
      const tool = getTool(server, "nats_kv_create");

      // Act
      const result = await tool.handler({
        bucket: CREATED_BUCKET,
        max_bytes: 1024 * 1024, // 1MB
      }, {});

      // Assert
      expect(result.isError).toBeUndefined();

      // Verify the max_bytes setting
      const { jsm } = getTestContext();
      const info = await jsm.streams.info(`KV_${CREATED_BUCKET}`);
      expect(info.config.max_bytes).toBe(1024 * 1024);

      // Cleanup
      await deleteBucketIfExists(CREATED_BUCKET);
    });

    test("should create a KV bucket with memory storage", async () => {
      // Arrange
      await deleteBucketIfExists(CREATED_BUCKET);
      const tool = getTool(server, "nats_kv_create");

      // Act
      const result = await tool.handler({
        bucket: CREATED_BUCKET,
        storage: "memory",
      }, {});

      // Assert
      expect(result.isError).toBeUndefined();

      // Verify the storage setting
      const { jsm } = getTestContext();
      const info = await jsm.streams.info(`KV_${CREATED_BUCKET}`);
      expect(info.config.storage).toBe("memory");

      // Cleanup
      await deleteBucketIfExists(CREATED_BUCKET);
    });

    test("should return error for duplicate bucket name", async () => {
      // Arrange - create bucket first
      await deleteBucketIfExists(CREATED_BUCKET);
      const { js } = getTestContext();
      await js.views.kv(CREATED_BUCKET);

      const tool = getTool(server, "nats_kv_create");

      // Act - try to create same bucket again
      const result = await tool.handler({
        bucket: CREATED_BUCKET,
      }, {});

      // Assert
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error");

      // Cleanup
      await deleteBucketIfExists(CREATED_BUCKET);
    });
  });

  describe("nats_kv_delete_bucket", () => {
    const DELETE_BUCKET = "test-delete-bucket";

    test("should delete an existing KV bucket", async () => {
      // Arrange - create a bucket first
      const { js, jsm } = getTestContext();
      try {
        await jsm.streams.delete(`KV_${DELETE_BUCKET}`);
      } catch { /* ignore */ }

      await js.views.kv(DELETE_BUCKET);

      const tool = getTool(server, "nats_kv_delete_bucket");

      // Act
      const result = await tool.handler({ bucket: DELETE_BUCKET }, {});

      // Assert
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("Deleted");
      expect(result.content[0].text).toContain(DELETE_BUCKET);

      // Verify bucket no longer exists
      try {
        await jsm.streams.info(`KV_${DELETE_BUCKET}`);
        throw new Error("Bucket should not exist");
      } catch (error) {
        expect(String(error)).toContain("stream not found");
      }
    });

    test("should return error for non-existent bucket", async () => {
      // Arrange
      const tool = getTool(server, "nats_kv_delete_bucket");

      // Act
      const result = await tool.handler({ bucket: "NONEXISTENT_BUCKET_XYZ" }, {});

      // Assert
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error");
    });
  });

  describe("nats_kv_history", () => {
    const HISTORY_BUCKET = "test-history-bucket";

    async function setupHistoryBucket() {
      const { js, jsm } = getTestContext();
      try {
        await jsm.streams.delete(`KV_${HISTORY_BUCKET}`);
      } catch { /* ignore */ }
      // Create bucket with history enabled
      await js.views.kv(HISTORY_BUCKET, { history: 10 });
    }

    async function cleanupHistoryBucket() {
      const { jsm } = getTestContext();
      try {
        await jsm.streams.delete(`KV_${HISTORY_BUCKET}`);
      } catch { /* ignore */ }
    }

    test("should return empty history for non-existent key", async () => {
      // Arrange
      await setupHistoryBucket();
      const tool = getTool(server, "nats_kv_history");

      // Act
      const result = await tool.handler({
        bucket: HISTORY_BUCKET,
        key: "nonexistent-key",
      }, {});

      // Assert
      expect(result.isError).toBeUndefined();
      const history = JSON.parse(result.content[0].text);
      expect(history).toEqual([]);

      await cleanupHistoryBucket();
    });

    test("should return single entry for key with no updates", async () => {
      // Arrange
      await setupHistoryBucket();
      const { js } = getTestContext();
      const kv = await js.views.kv(HISTORY_BUCKET);
      await kv.put("single-key", new TextEncoder().encode("value1"));

      const tool = getTool(server, "nats_kv_history");

      // Act
      const result = await tool.handler({
        bucket: HISTORY_BUCKET,
        key: "single-key",
      }, {});

      // Assert
      expect(result.isError).toBeUndefined();
      const history = JSON.parse(result.content[0].text);
      expect(history.length).toBe(1);
      expect(history[0].value).toBe("value1");
      expect(history[0].revision).toBe(1);

      await cleanupHistoryBucket();
    });

    test("should return multiple entries for key with history", async () => {
      // Arrange
      await setupHistoryBucket();
      const { js } = getTestContext();
      const kv = await js.views.kv(HISTORY_BUCKET);
      await kv.put("history-key", new TextEncoder().encode("value1"));
      await kv.put("history-key", new TextEncoder().encode("value2"));
      await kv.put("history-key", new TextEncoder().encode("value3"));

      const tool = getTool(server, "nats_kv_history");

      // Act
      const result = await tool.handler({
        bucket: HISTORY_BUCKET,
        key: "history-key",
      }, {});

      // Assert
      expect(result.isError).toBeUndefined();
      const history = JSON.parse(result.content[0].text);
      expect(history.length).toBe(3);
      expect(history[0].value).toBe("value1");
      expect(history[1].value).toBe("value2");
      expect(history[2].value).toBe("value3");

      await cleanupHistoryBucket();
    });

    test("should return error for non-existent bucket", async () => {
      // Arrange
      const tool = getTool(server, "nats_kv_history");

      // Act
      const result = await tool.handler({
        bucket: "NONEXISTENT_HISTORY_BUCKET",
        key: "any-key",
      }, {});

      // Assert
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error");
    });
  });

  describe("nats_kv_watch", () => {
    const WATCH_BUCKET = "test-watch-bucket";

    async function setupWatchBucket() {
      const { js, jsm } = getTestContext();
      try {
        await jsm.streams.delete(`KV_${WATCH_BUCKET}`);
      } catch { /* ignore */ }
      await js.views.kv(WATCH_BUCKET, { history: 5 });
    }

    async function cleanupWatchBucket() {
      const { jsm } = getTestContext();
      try {
        await jsm.streams.delete(`KV_${WATCH_BUCKET}`);
      } catch { /* ignore */ }
    }

    test("should receive initial values for existing keys", async () => {
      // Arrange
      await setupWatchBucket();
      const { js } = getTestContext();
      const kv = await js.views.kv(WATCH_BUCKET);
      await kv.put("existing-key", new TextEncoder().encode("existing-value"));

      const tool = getTool(server, "nats_kv_watch");

      // Act - watch with include_history to get existing values
      const result = await tool.handler({
        bucket: WATCH_BUCKET,
        timeout: 1000,
        include_history: true,
      }, {});

      // Assert
      expect(result.isError).toBeUndefined();
      const entries = JSON.parse(result.content[0].text);
      expect(entries.length).toBeGreaterThanOrEqual(1);
      expect(entries.some((e: any) => e.key === "existing-key" && e.value === "existing-value")).toBe(true);

      await cleanupWatchBucket();
    });

    test("should receive updates when key is modified", async () => {
      // Arrange
      await setupWatchBucket();
      const { js } = getTestContext();
      const kv = await js.views.kv(WATCH_BUCKET);

      const tool = getTool(server, "nats_kv_watch");

      // Start watch, then update key in the background
      const watchPromise = tool.handler({
        bucket: WATCH_BUCKET,
        timeout: 2000,
      }, {});

      // Small delay then update a key
      await new Promise((resolve) => setTimeout(resolve, 100));
      await kv.put("new-key", new TextEncoder().encode("new-value"));

      // Act
      const result = await watchPromise;

      // Assert
      expect(result.isError).toBeUndefined();
      const entries = JSON.parse(result.content[0].text);
      expect(entries.some((e: any) => e.key === "new-key" && e.value === "new-value")).toBe(true);

      await cleanupWatchBucket();
    });

    test("should filter by key pattern", async () => {
      // Arrange
      await setupWatchBucket();
      const { js } = getTestContext();
      const kv = await js.views.kv(WATCH_BUCKET);
      await kv.put("user.1", new TextEncoder().encode("user1"));
      await kv.put("user.2", new TextEncoder().encode("user2"));
      await kv.put("config.app", new TextEncoder().encode("config"));

      const tool = getTool(server, "nats_kv_watch");

      // Act - watch only user.* keys
      const result = await tool.handler({
        bucket: WATCH_BUCKET,
        key: "user.>",
        timeout: 1000,
        include_history: true,
      }, {});

      // Assert
      expect(result.isError).toBeUndefined();
      const entries = JSON.parse(result.content[0].text);
      expect(entries.every((e: any) => e.key.startsWith("user."))).toBe(true);
      expect(entries.some((e: any) => e.key === "config.app")).toBe(false);

      await cleanupWatchBucket();
    });

    test("should timeout after specified duration", async () => {
      // Arrange
      await setupWatchBucket();
      const tool = getTool(server, "nats_kv_watch");

      const startTime = Date.now();

      // Act - watch with short timeout
      const result = await tool.handler({
        bucket: WATCH_BUCKET,
        timeout: 500,
      }, {});

      const elapsed = Date.now() - startTime;

      // Assert - should timeout around 500ms
      expect(result.isError).toBeUndefined();
      expect(elapsed).toBeGreaterThanOrEqual(400);
      expect(elapsed).toBeLessThan(2000);

      await cleanupWatchBucket();
    });

    test("should return error for non-existent bucket", async () => {
      // Arrange
      const tool = getTool(server, "nats_kv_watch");

      // Act
      const result = await tool.handler({
        bucket: "NONEXISTENT_WATCH_BUCKET",
        timeout: 500,
      }, {});

      // Assert
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error");
    });
  });
});
