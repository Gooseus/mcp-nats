import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { setupNats, teardownNats, getTestContext, getTool } from "../setup";
import { registerObjectStoreTools } from "../../src/tools/objectstore";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

describe("Object Store Tools", () => {
  let server: McpServer;
  let cleanupBucket: (() => Promise<void>) | null = null;
  const TEST_BUCKET = "test-obj-bucket";

  beforeAll(async () => {
    await setupNats();
    const { js, jsm } = getTestContext();

    server = new McpServer({ name: "test-server", version: "1.0.0" });
    registerObjectStoreTools(server, js, jsm);
  });

  beforeEach(async () => {
    // Create a fresh bucket for each test
    if (cleanupBucket) {
      await cleanupBucket();
    }
    cleanupBucket = await createTestObjectStoreBucket(TEST_BUCKET);
  });

  afterAll(async () => {
    if (cleanupBucket) {
      await cleanupBucket();
    }
    await teardownNats();
  });

  // Helper to create test object store bucket
  async function createTestObjectStoreBucket(bucket: string): Promise<() => Promise<void>> {
    const { js } = getTestContext();
    const os = await js.views.os(bucket);

    return async () => {
      try {
        await os.destroy();
      } catch {
        // Bucket may already be deleted
      }
    };
  }

  describe("nats_obj_list_buckets", () => {
    test("should list all object store buckets", async () => {
      // Arrange
      const tool = getTool(server, "nats_obj_list_buckets");

      // Act
      const result = await tool.handler({}, {});

      // Assert
      expect(result.isError).toBeUndefined();
      const buckets = JSON.parse(result.content[0].text);
      expect(Array.isArray(buckets)).toBe(true);
      expect(buckets.some((b: any) => b.bucket === TEST_BUCKET)).toBe(true);
    });

    test("should return empty array when no buckets exist", async () => {
      // Arrange - delete the test bucket first
      if (cleanupBucket) {
        await cleanupBucket();
        cleanupBucket = null;
      }

      const { jsm } = getTestContext();
      // Delete any other object store buckets
      const streams = jsm.streams.listObjectStores();
      for await (const status of streams) {
        try {
          await jsm.streams.delete(`OBJ_${status.bucket}`);
        } catch {
          // Ignore
        }
      }

      const tool = getTool(server, "nats_obj_list_buckets");

      // Act
      const result = await tool.handler({}, {});

      // Assert
      expect(result.isError).toBeUndefined();
      const buckets = JSON.parse(result.content[0].text);
      expect(buckets).toEqual([]);

      // Recreate the test bucket for subsequent tests
      cleanupBucket = await createTestObjectStoreBucket(TEST_BUCKET);
    });
  });

  describe("nats_obj_create_bucket", () => {
    test("should create a bucket with default settings", async () => {
      // Arrange
      const tool = getTool(server, "nats_obj_create_bucket");
      const bucketName = "test-create-bucket";

      // Act
      const result = await tool.handler({ bucket: bucketName }, {});

      // Assert
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("Created");
      expect(result.content[0].text).toContain(bucketName);

      // Cleanup
      const { jsm } = getTestContext();
      await jsm.streams.delete(`OBJ_${bucketName}`);
    });

    test("should create a bucket with description", async () => {
      // Arrange
      const tool = getTool(server, "nats_obj_create_bucket");
      const bucketName = "test-create-bucket-desc";
      const description = "Test bucket description";

      // Act
      const result = await tool.handler({ bucket: bucketName, description }, {});

      // Assert
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("Created");

      // Cleanup
      const { jsm } = getTestContext();
      await jsm.streams.delete(`OBJ_${bucketName}`);
    });

    test("should return error for duplicate bucket name", async () => {
      // Arrange - TEST_BUCKET already exists from beforeEach
      const tool = getTool(server, "nats_obj_create_bucket");

      // Act
      const result = await tool.handler({ bucket: TEST_BUCKET }, {});

      // Assert
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("already exists");
    });
  });

  describe("nats_obj_delete_bucket", () => {
    test("should delete an existing bucket", async () => {
      // Arrange
      const tool = getTool(server, "nats_obj_delete_bucket");
      const { js } = getTestContext();
      const bucketName = "test-delete-bucket";
      await js.views.os(bucketName);

      // Act
      const result = await tool.handler({ bucket: bucketName }, {});

      // Assert
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("Deleted");
      expect(result.content[0].text).toContain(bucketName);
    });

    test("should return error for non-existent bucket", async () => {
      // Arrange
      const tool = getTool(server, "nats_obj_delete_bucket");

      // Act
      const result = await tool.handler({ bucket: "nonexistent-bucket" }, {});

      // Assert
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not found");
    });
  });

  describe("nats_obj_put", () => {
    test("should store an object", async () => {
      // Arrange
      const tool = getTool(server, "nats_obj_put");

      // Act
      const result = await tool.handler({
        bucket: TEST_BUCKET,
        name: "test-object",
        data: "Hello, Object Store!",
      }, {});

      // Assert
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("Stored");
      expect(result.content[0].text).toContain("test-object");
    });

    test("should store an object with description", async () => {
      // Arrange
      const tool = getTool(server, "nats_obj_put");

      // Act
      const result = await tool.handler({
        bucket: TEST_BUCKET,
        name: "test-object-desc",
        data: "Object with description",
        description: "A test object",
      }, {});

      // Assert
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("Stored");
    });

    test("should overwrite an existing object", async () => {
      // Arrange
      const tool = getTool(server, "nats_obj_put");

      // First put
      await tool.handler({
        bucket: TEST_BUCKET,
        name: "overwrite-test",
        data: "Original content",
      }, {});

      // Act - overwrite
      const result = await tool.handler({
        bucket: TEST_BUCKET,
        name: "overwrite-test",
        data: "Updated content",
      }, {});

      // Assert
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("Stored");
    });

    test("should return error for non-existent bucket", async () => {
      // Arrange
      const tool = getTool(server, "nats_obj_put");

      // Act
      const result = await tool.handler({
        bucket: "nonexistent-bucket",
        name: "test-object",
        data: "test data",
      }, {});

      // Assert
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not found");
    });
  });

  describe("nats_obj_get", () => {
    test("should get an object by name", async () => {
      // Arrange
      const putTool = getTool(server, "nats_obj_put");
      const getTool_ = getTool(server, "nats_obj_get");
      const testData = "Test object content";

      await putTool.handler({
        bucket: TEST_BUCKET,
        name: "get-test-object",
        data: testData,
      }, {});

      // Act
      const result = await getTool_.handler({
        bucket: TEST_BUCKET,
        name: "get-test-object",
      }, {});

      // Assert
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toBe(testData);
    });

    test("should return not found for non-existent object", async () => {
      // Arrange
      const tool = getTool(server, "nats_obj_get");

      // Act
      const result = await tool.handler({
        bucket: TEST_BUCKET,
        name: "nonexistent-object",
      }, {});

      // Assert
      expect(result.content[0].text).toContain("not found");
    });

    test("should return error for non-existent bucket", async () => {
      // Arrange
      const tool = getTool(server, "nats_obj_get");

      // Act
      const result = await tool.handler({
        bucket: "nonexistent-bucket",
        name: "test-object",
      }, {});

      // Assert
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not found");
    });
  });

  describe("nats_obj_delete", () => {
    test("should delete an existing object", async () => {
      // Arrange
      const putTool = getTool(server, "nats_obj_put");
      const deleteTool = getTool(server, "nats_obj_delete");

      await putTool.handler({
        bucket: TEST_BUCKET,
        name: "delete-test-object",
        data: "To be deleted",
      }, {});

      // Act
      const result = await deleteTool.handler({
        bucket: TEST_BUCKET,
        name: "delete-test-object",
      }, {});

      // Assert
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("Deleted");
    });

    test("should return error for non-existent object", async () => {
      // Arrange
      const tool = getTool(server, "nats_obj_delete");

      // Act
      const result = await tool.handler({
        bucket: TEST_BUCKET,
        name: "nonexistent-object",
      }, {});

      // Assert
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not found");
    });

    test("should return error for non-existent bucket", async () => {
      // Arrange
      const tool = getTool(server, "nats_obj_delete");

      // Act
      const result = await tool.handler({
        bucket: "nonexistent-bucket",
        name: "test-object",
      }, {});

      // Assert
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not found");
    });
  });

  describe("nats_obj_info", () => {
    test("should get object metadata", async () => {
      // Arrange
      const putTool = getTool(server, "nats_obj_put");
      const infoTool = getTool(server, "nats_obj_info");
      const testData = "Test object for info";

      await putTool.handler({
        bucket: TEST_BUCKET,
        name: "info-test-object",
        data: testData,
        description: "Info test description",
      }, {});

      // Act
      const result = await infoTool.handler({
        bucket: TEST_BUCKET,
        name: "info-test-object",
      }, {});

      // Assert
      expect(result.isError).toBeUndefined();
      const info = JSON.parse(result.content[0].text);
      expect(info.name).toBe("info-test-object");
      expect(info.description).toBe("Info test description");
      expect(info.size).toBe(testData.length);
      expect(info.bucket).toBe(TEST_BUCKET);
    });

    test("should return not found for non-existent object", async () => {
      // Arrange
      const tool = getTool(server, "nats_obj_info");

      // Act
      const result = await tool.handler({
        bucket: TEST_BUCKET,
        name: "nonexistent-object",
      }, {});

      // Assert
      expect(result.content[0].text).toContain("not found");
    });

    test("should return error for non-existent bucket", async () => {
      // Arrange
      const tool = getTool(server, "nats_obj_info");

      // Act
      const result = await tool.handler({
        bucket: "nonexistent-bucket",
        name: "test-object",
      }, {});

      // Assert
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not found");
    });
  });

  describe("nats_obj_list", () => {
    test("should return empty array for empty bucket", async () => {
      // Arrange
      const tool = getTool(server, "nats_obj_list");

      // Act
      const result = await tool.handler({ bucket: TEST_BUCKET }, {});

      // Assert
      expect(result.isError).toBeUndefined();
      const objects = JSON.parse(result.content[0].text);
      expect(objects).toEqual([]);
    });

    test("should list all objects in a bucket", async () => {
      // Arrange
      const putTool = getTool(server, "nats_obj_put");
      const listTool = getTool(server, "nats_obj_list");

      // Add some objects
      await putTool.handler({ bucket: TEST_BUCKET, name: "obj1", data: "data1" }, {});
      await putTool.handler({ bucket: TEST_BUCKET, name: "obj2", data: "data2" }, {});
      await putTool.handler({ bucket: TEST_BUCKET, name: "obj3", data: "data3" }, {});

      // Act
      const result = await listTool.handler({ bucket: TEST_BUCKET }, {});

      // Assert
      expect(result.isError).toBeUndefined();
      const objects = JSON.parse(result.content[0].text);
      expect(objects.length).toBe(3);
      expect(objects.map((o: any) => o.name).sort()).toEqual(["obj1", "obj2", "obj3"]);
    });

    test("should return error for non-existent bucket", async () => {
      // Arrange
      const tool = getTool(server, "nats_obj_list");

      // Act
      const result = await tool.handler({ bucket: "nonexistent-bucket" }, {});

      // Assert
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not found");
    });
  });
});
