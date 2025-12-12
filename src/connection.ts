import { connect, NatsConnection, JetStreamClient, JetStreamManager, Events } from "nats";

// Custom error for connection issues
export class NatsConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NatsConnectionError";
  }
}

// Connection state tracking
interface ConnectionState {
  nc: NatsConnection | null;
  js: JetStreamClient | null;
  jsm: JetStreamManager | null;
  isConnected: boolean;
  reconnectCount: number;
  lastReconnectTime: number | null;
}

const state: ConnectionState = {
  nc: null,
  js: null,
  jsm: null,
  isConnected: false,
  reconnectCount: 0,
  lastReconnectTime: null,
};

export interface NatsConnectionBundle {
  nc: NatsConnection;
  js: JetStreamClient;
  jsm: JetStreamManager;
}

export interface ConnectionHealth {
  connected: boolean;
  server: string | null;
  reconnectCount: number;
  lastReconnectTime: string | null;
}

// Connection configuration for idle-tolerant MCP usage
const RECONNECTION_CONFIG = {
  reconnect: true,
  maxReconnectAttempts: -1,  // Unlimited for long-lived MCP server
  reconnectTimeWait: 2000,   // 2 seconds between attempts
  reconnectJitter: 500,      // Add 0-500ms randomness
  pingInterval: 30000,       // 30 second heartbeat (good for idle detection)
  maxPingOut: 3,             // Reconnect after ~90s of no response
};

function logStatus(message: string): void {
  const timestamp = new Date().toISOString();
  console.error(`[nats-mcp] ${timestamp} ${message}`);
}

async function handleStatusEvents(nc: NatsConnection): Promise<void> {
  try {
    for await (const status of nc.status()) {
      switch (status.type) {
        case Events.Disconnect:
          state.isConnected = false;
          logStatus("Disconnected from NATS");
          break;

        case Events.Reconnect:
          state.isConnected = true;
          state.reconnectCount++;
          state.lastReconnectTime = Date.now();
          // Invalidate JetStream clients - will be refreshed on next use
          state.js = null;
          state.jsm = null;
          logStatus(`Reconnected to NATS (reconnect #${state.reconnectCount})`);
          break;

        case Events.Update:
          logStatus("Connection updated (server config change)");
          break;

        case Events.LDM:
          logStatus("Lame Duck Mode - server is preparing to shut down");
          break;

        case Events.Error:
          logStatus(`Connection error: ${status.data}`);
          break;

        default:
          logStatus(`Connection status: ${status.type}`);
      }
    }
  } catch (error) {
    logStatus(`Status monitor error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function createNatsConnection(): Promise<NatsConnectionBundle> {
  const servers = process.env.NATS_URL || "nats://localhost:4222";

  const connectionOptions: Parameters<typeof connect>[0] = {
    servers,
    ...RECONNECTION_CONFIG,
  };

  if (process.env.NATS_USER && process.env.NATS_PASS) {
    connectionOptions.user = process.env.NATS_USER;
    connectionOptions.pass = process.env.NATS_PASS;
  }

  if (process.env.NATS_TOKEN) {
    connectionOptions.token = process.env.NATS_TOKEN;
  }

  if (process.env.NATS_CREDS_PATH) {
    const { credsAuthenticator } = await import("nats");
    const fs = await import("fs/promises");
    const creds = await fs.readFile(process.env.NATS_CREDS_PATH);
    connectionOptions.authenticator = credsAuthenticator(creds);
  }

  state.nc = await connect(connectionOptions);
  state.js = state.nc.jetstream();
  state.jsm = await state.nc.jetstreamManager();
  state.isConnected = true;
  state.reconnectCount = 0;
  state.lastReconnectTime = null;

  // Start status monitoring in background
  handleStatusEvents(state.nc);

  logStatus(`Connected to NATS at ${servers}`);

  return { nc: state.nc, js: state.js, jsm: state.jsm };
}

export function getNatsConnection(): NatsConnectionBundle {
  if (!state.nc) {
    throw new NatsConnectionError("NATS connection not initialized. Call createNatsConnection first.");
  }

  if (!state.isConnected) {
    throw new NatsConnectionError("NATS connection is disconnected. Reconnection in progress...");
  }

  // Lazy refresh JetStream clients after reconnection
  if (!state.js || !state.jsm) {
    state.js = state.nc.jetstream();
    // Note: jetstreamManager() is async but we need sync here
    // The jsm will be refreshed on first async call that needs it
    // For now, return potentially stale jsm - tools handle errors gracefully
  }

  // Handle async jsm refresh
  if (!state.jsm) {
    // Return with potentially null jsm - caller should handle
    // Most tools will catch the error and report it
    throw new NatsConnectionError("JetStreamManager not available. Try again shortly.");
  }

  return { nc: state.nc, js: state.js, jsm: state.jsm };
}

// Async version for cases that need guaranteed fresh JetStream clients
export async function getNatsConnectionAsync(): Promise<NatsConnectionBundle> {
  if (!state.nc) {
    throw new NatsConnectionError("NATS connection not initialized. Call createNatsConnection first.");
  }

  if (!state.isConnected) {
    throw new NatsConnectionError("NATS connection is disconnected. Reconnection in progress...");
  }

  // Refresh JetStream clients if needed
  if (!state.js) {
    state.js = state.nc.jetstream();
  }

  if (!state.jsm) {
    state.jsm = await state.nc.jetstreamManager();
    logStatus("JetStreamManager refreshed after reconnection");
  }

  return { nc: state.nc, js: state.js, jsm: state.jsm };
}

export function getConnectionHealth(): ConnectionHealth {
  return {
    connected: state.isConnected,
    server: state.nc?.info?.server_name ?? null,
    reconnectCount: state.reconnectCount,
    lastReconnectTime: state.lastReconnectTime
      ? new Date(state.lastReconnectTime).toISOString()
      : null,
  };
}

export async function closeNatsConnection(): Promise<void> {
  if (state.nc) {
    await state.nc.drain();
    state.nc = null;
    state.js = null;
    state.jsm = null;
    state.isConnected = false;
    logStatus("Connection closed");
  }
}
