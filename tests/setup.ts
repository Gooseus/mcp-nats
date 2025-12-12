import { connect, NatsConnection, JetStreamClient, JetStreamManager, StringCodec, StorageType } from "nats";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const sc = StringCodec();

export interface TestContext {
  nc: NatsConnection;
  js: JetStreamClient;
  jsm: JetStreamManager;
}

let testContext: TestContext | null = null;

/**
 * Connect to NATS for testing. Call this in beforeAll.
 */
export async function setupNats(): Promise<TestContext> {
  const nc = await connect({
    servers: process.env.NATS_URL || "nats://localhost:4222",
  });
  const js = nc.jetstream();
  const jsm = await nc.jetstreamManager();

  testContext = { nc, js, jsm };
  return testContext;
}

/**
 * Close NATS connection. Call this in afterAll.
 */
export async function teardownNats(): Promise<void> {
  if (testContext?.nc) {
    await testContext.nc.drain();
    testContext = null;
  }
}

/**
 * Get the current test context. Throws if not initialized.
 */
export function getTestContext(): TestContext {
  if (!testContext) {
    throw new Error("Test context not initialized. Call setupNats() first.");
  }
  return testContext;
}

/**
 * Create a test stream. Returns cleanup function.
 */
export async function createTestStream(
  name: string,
  subjects: string[] = [`${name}.>`]
): Promise<() => Promise<void>> {
  const { jsm } = getTestContext();

  await jsm.streams.add({
    name,
    subjects,
    storage: StorageType.Memory,
    max_msgs: 1000,
  });

  return async () => {
    try {
      await jsm.streams.delete(name);
    } catch {
      // Stream may already be deleted
    }
  };
}

/**
 * Create a test KV bucket. Returns cleanup function.
 */
export async function createTestKvBucket(
  bucket: string
): Promise<() => Promise<void>> {
  const { js } = getTestContext();

  await js.views.kv(bucket, { history: 5 });

  return async () => {
    const { jsm } = getTestContext();
    try {
      await jsm.streams.delete(`KV_${bucket}`);
    } catch {
      // Bucket may already be deleted
    }
  };
}

/**
 * Publish messages to a stream for testing.
 */
export async function publishTestMessages(
  subject: string,
  messages: string[]
): Promise<void> {
  const { js } = getTestContext();

  for (const msg of messages) {
    await js.publish(subject, sc.encode(msg));
  }
}

/**
 * Helper to decode message data.
 */
export function decode(data: Uint8Array): string {
  return sc.decode(data);
}

/**
 * Helper to encode message data.
 */
export function encode(data: string): Uint8Array {
  return sc.encode(data);
}

/**
 * Get a registered tool from the MCP server by name.
 */
export function getTool(server: McpServer, name: string) {
  const tools = (server as any)._registeredTools;
  const tool = tools[name];
  if (!tool) {
    throw new Error(`Tool "${name}" not found`);
  }
  return tool;
}

/**
 * Get a registered resource from the MCP server by URI.
 */
export function getResource(server: McpServer, uri: string) {
  const resources = (server as any)._registeredResources;
  const resource = resources[uri];
  if (!resource) {
    throw new Error(`Resource "${uri}" not found`);
  }
  return resource;
}
