import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { JetStreamClient, JetStreamManager } from "nats";
import { formatError } from "../utils.js";

interface ConsumerHealth {
  name: string;
  pending: number;
  ack_pending: number;
  paused: boolean;
  last_delivery?: {
    stream_seq: number;
    consumer_seq: number;
  };
  lag: number;
}

interface HealthAssessment {
  status: "healthy" | "degraded" | "unhealthy";
  issues: string[];
}

interface StreamHealthResult {
  stream: {
    name: string;
    subjects: string[];
    messages: number;
    bytes: number;
    first_seq: number;
    last_seq: number;
  };
  consumers: ConsumerHealth[];
  health: HealthAssessment;
}

function assessHealth(
  consumers: ConsumerHealth[],
  lagThreshold: number,
  ackPendingThreshold: number
): HealthAssessment {
  const issues: string[] = [];
  let status: "healthy" | "degraded" | "unhealthy" = "healthy";

  // Informational note if no consumers
  if (consumers.length === 0) {
    issues.push("No consumers configured");
    return { status: "healthy", issues };
  }

  for (const consumer of consumers) {
    // Unhealthy: paused with pending messages
    if (consumer.paused && consumer.pending > 0) {
      issues.push(
        `Consumer "${consumer.name}" is paused with ${consumer.pending} pending messages`
      );
      status = "unhealthy";
    }

    // Unhealthy: lag exceeds threshold
    if (consumer.lag > lagThreshold) {
      issues.push(
        `Consumer "${consumer.name}" lag (${consumer.lag}) exceeds threshold (${lagThreshold})`
      );
      status = "unhealthy";
    }

    // Degraded: ack_pending exceeds threshold (only if not already unhealthy)
    if (consumer.ack_pending > ackPendingThreshold) {
      issues.push(
        `Consumer "${consumer.name}" has ${consumer.ack_pending} ack pending (threshold: ${ackPendingThreshold})`
      );
      if (status !== "unhealthy") {
        status = "degraded";
      }
    }
  }

  return { status, issues };
}

export function registerStreamHealthTools(
  server: McpServer,
  js: JetStreamClient,
  jsm: JetStreamManager
): void {
  server.registerTool(
    "nats_stream_health",
    {
      description:
        "Get comprehensive health information for a JetStream stream including consumer states and health assessment",
      inputSchema: {
        stream: z.string().describe("Stream name to check health for"),
        lag_threshold: z
          .number()
          .default(1000)
          .describe("Number of pending messages to consider unhealthy"),
        ack_pending_threshold: z
          .number()
          .default(100)
          .describe("Number of ack pending messages to consider degraded"),
      },
    },
    async ({ stream, lag_threshold, ack_pending_threshold }) => {
      try {
        // Get stream info
        const streamInfo = await jsm.streams.info(stream);

        // Get all consumers for this stream
        const consumers: ConsumerHealth[] = [];
        const consumerList = await jsm.consumers.list(stream).next();

        for (const consumerInfo of consumerList) {
          // Calculate lag based on pending messages
          const lag = consumerInfo.num_pending;

          consumers.push({
            name: consumerInfo.name,
            pending: consumerInfo.num_pending,
            ack_pending: consumerInfo.num_ack_pending,
            paused: consumerInfo.paused || false,
            last_delivery: consumerInfo.delivered
              ? {
                  stream_seq: consumerInfo.delivered.stream_seq,
                  consumer_seq: consumerInfo.delivered.consumer_seq,
                }
              : undefined,
            lag,
          });
        }

        // Assess health
        const health = assessHealth(consumers, lag_threshold, ack_pending_threshold);

        const result: StreamHealthResult = {
          stream: {
            name: streamInfo.config.name,
            subjects: streamInfo.config.subjects || [],
            messages: streamInfo.state.messages,
            bytes: streamInfo.state.bytes,
            first_seq: streamInfo.state.first_seq,
            last_seq: streamInfo.state.last_seq,
          },
          consumers,
          health,
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting stream health: ${formatError(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
