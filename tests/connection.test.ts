import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  createNatsConnection,
  closeNatsConnection,
  getNatsConnection,
  getConnectionHealth,
  NatsConnectionError,
} from "../src/connection";

describe("Connection Management", () => {
  describe("getConnectionHealth", () => {
    beforeAll(async () => {
      await createNatsConnection();
    });

    afterAll(async () => {
      await closeNatsConnection();
    });

    test("should return health status when connected", async () => {
      const health = getConnectionHealth();

      expect(health.connected).toBe(true);
      expect(typeof health.reconnectCount).toBe("number");
      expect(health.reconnectCount).toBeGreaterThanOrEqual(0);
    });

    test("should include server info when connected", async () => {
      const health = getConnectionHealth();

      expect(health.connected).toBe(true);
      expect("server" in health).toBe(true);
    });

    test("should track reconnect count starting at zero", async () => {
      const health = getConnectionHealth();

      expect(health.reconnectCount).toBe(0);
      expect(health.lastReconnectTime).toBeNull();
    });
  });

  describe("getNatsConnection", () => {
    test("should return connection bundle when connected", async () => {
      await createNatsConnection();

      const bundle = await getNatsConnection();

      expect(bundle.nc).toBeDefined();
      expect(bundle.js).toBeDefined();
      expect(bundle.jsm).toBeDefined();

      await closeNatsConnection();
    });

    test("should throw NatsConnectionError when not initialized", async () => {
      await closeNatsConnection();

      expect(() => getNatsConnection()).toThrow(NatsConnectionError);
    });
  });

  describe("NatsConnectionError", () => {
    test("should be instanceof Error", () => {
      const error = new NatsConnectionError("test message");
      expect(error instanceof Error).toBe(true);
      expect(error instanceof NatsConnectionError).toBe(true);
    });

    test("should have correct name", () => {
      const error = new NatsConnectionError("test message");
      expect(error.name).toBe("NatsConnectionError");
    });

    test("should preserve message", () => {
      const error = new NatsConnectionError("connection failed");
      expect(error.message).toBe("connection failed");
    });
  });
});
