import { StorageType, JetStreamManager } from "nats";

export const SERVICE_NAME = "nats-mcp";

/**
 * Logs a message to the console with the service name.
 */
export function logError(message: string): void {
  console.error(`[${SERVICE_NAME}] ${message}`);
}

/**
 * Formats an error for user-friendly display.
 */
export function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Shared storage type mapping from string to NATS StorageType enum.
 */
export const STORAGE_TYPE_MAP: Record<string, StorageType> = {
  file: StorageType.File,
  memory: StorageType.Memory,
};

/**
 * Checks if a stream exists by name.
 * Returns true if exists, false if not found.
 * Throws on other errors.
 */
export async function streamExists(
  jsm: JetStreamManager,
  streamName: string
): Promise<boolean> {
  try {
    await jsm.streams.info(streamName);
    return true;
  } catch (error) {
    // NATS throws an error with "stream not found" message when stream doesn't exist
    if (error instanceof Error && error.message.includes("stream not found")) {
      return false;
    }
    throw error;
  }
}
