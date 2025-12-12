import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { JetStreamClient, JetStreamManager, AckPolicy, DeliverPolicy, StringCodec, ConsumerConfig } from "nats";
import { formatError } from "../utils.js";

const sc = StringCodec();

const deliverPolicyMap: Record<string, DeliverPolicy> = {
  all: DeliverPolicy.All,
  last: DeliverPolicy.Last,
  new: DeliverPolicy.New,
  by_start_sequence: DeliverPolicy.StartSequence,
  by_start_time: DeliverPolicy.StartTime,
  last_per_subject: DeliverPolicy.LastPerSubject,
};

const ackPolicyMap: Record<string, AckPolicy> = {
  none: AckPolicy.None,
  all: AckPolicy.All,
  explicit: AckPolicy.Explicit,
};

export function registerConsumerTools(
  server: McpServer,
  js: JetStreamClient,
  jsm: JetStreamManager
): void {
  server.registerTool(
    "nats_consumer_create",
    {
      description: "Create a durable consumer on a JetStream stream",
      inputSchema: {
        stream: z.string().describe("Name of the stream"),
        name: z.string().describe("Consumer name (durable)"),
        deliver_policy: z.enum(["all", "last", "new", "by_start_sequence", "by_start_time", "last_per_subject"])
          .default("all")
          .describe("When to start delivering messages"),
        ack_policy: z.enum(["none", "all", "explicit"])
          .default("explicit")
          .describe("How messages are acknowledged"),
        filter_subject: z.string().optional().describe("Filter to only receive messages matching this subject"),
        start_sequence: z.number().optional().describe("Sequence to start at (for by_start_sequence policy)"),
        start_time: z.string().optional().describe("ISO timestamp to start at (for by_start_time policy)"),
      },
    },
    async ({ stream, name, deliver_policy, ack_policy, filter_subject, start_sequence, start_time }) => {
      try {
        const config: Partial<ConsumerConfig> = {
          durable_name: name,
          deliver_policy: deliverPolicyMap[deliver_policy],
          ack_policy: ackPolicyMap[ack_policy],
        };

        if (filter_subject) {
          config.filter_subject = filter_subject;
        }

        if (deliver_policy === "by_start_sequence" && start_sequence !== undefined) {
          config.opt_start_seq = start_sequence;
        }

        if (deliver_policy === "by_start_time" && start_time) {
          config.opt_start_time = start_time;
        }

        const info = await jsm.consumers.add(stream, config);

        const result = {
          name: info.name,
          stream_name: info.stream_name,
          deliver_policy: info.config.deliver_policy,
          ack_policy: info.config.ack_policy,
          filter_subject: info.config.filter_subject,
          num_pending: info.num_pending,
          num_ack_pending: info.num_ack_pending,
        };

        return {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error creating consumer: ${formatError(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "nats_consumer_info",
    {
      description: "Get information about a consumer",
      inputSchema: {
        stream: z.string().describe("Name of the stream"),
        consumer: z.string().describe("Consumer name"),
      },
    },
    async ({ stream, consumer }) => {
      try {
        const info = await jsm.consumers.info(stream, consumer);

        const result = {
          name: info.name,
          stream_name: info.stream_name,
          created: info.created,
          config: {
            deliver_policy: info.config.deliver_policy,
            ack_policy: info.config.ack_policy,
            filter_subject: info.config.filter_subject,
            max_deliver: info.config.max_deliver,
            ack_wait: info.config.ack_wait,
          },
          delivered: info.delivered,
          ack_floor: info.ack_floor,
          num_pending: info.num_pending,
          num_ack_pending: info.num_ack_pending,
          num_redelivered: info.num_redelivered,
          paused: info.paused,
          pause_remaining: info.pause_remaining,
        };

        return {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error getting consumer info: ${formatError(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "nats_consumer_list",
    {
      description: "List all consumers for a JetStream stream",
      inputSchema: {
        stream: z.string().describe("Name of the stream"),
      },
    },
    async ({ stream }) => {
      try {
        const consumers: Array<{
          name: string;
          stream_name: string;
          deliver_policy: string;
          ack_policy: string;
          num_pending: number;
          num_ack_pending: number;
          paused: boolean;
        }> = [];

        const list = await jsm.consumers.list(stream).next();
        for (const info of list) {
          consumers.push({
            name: info.name,
            stream_name: info.stream_name,
            deliver_policy: String(info.config.deliver_policy),
            ack_policy: String(info.config.ack_policy),
            num_pending: info.num_pending,
            num_ack_pending: info.num_ack_pending,
            paused: info.paused || false,
          });
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify(consumers, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error listing consumers: ${formatError(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "nats_consumer_delete",
    {
      description: "Delete a consumer from a JetStream stream",
      inputSchema: {
        stream: z.string().describe("Name of the stream"),
        consumer: z.string().describe("Consumer name"),
      },
    },
    async ({ stream, consumer }) => {
      try {
        await jsm.consumers.delete(stream, consumer);

        return {
          content: [{
            type: "text",
            text: `Deleted consumer "${consumer}" from stream "${stream}"`,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error deleting consumer: ${formatError(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "nats_consumer_pause",
    {
      description: "Pause a consumer's message delivery",
      inputSchema: {
        stream: z.string().describe("Name of the stream"),
        consumer: z.string().describe("Consumer name"),
        until: z.string().optional().describe("ISO timestamp until which to pause (defaults to 1 hour from now)"),
      },
    },
    async ({ stream, consumer, until }) => {
      try {
        // NATS requires a Date for pause - default to 1 hour if not specified
        const pauseUntil = until ? new Date(until) : new Date(Date.now() + 3600000);
        const result = await jsm.consumers.pause(stream, consumer, pauseUntil);

        return {
          content: [{
            type: "text",
            text: `Paused consumer "${consumer}" on stream "${stream}"${
              result.pause_until ? ` until ${result.pause_until}` : ""
            }`,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error pausing consumer: ${formatError(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "nats_consumer_resume",
    {
      description: "Resume a paused consumer",
      inputSchema: {
        stream: z.string().describe("Name of the stream"),
        consumer: z.string().describe("Consumer name"),
      },
    },
    async ({ stream, consumer }) => {
      try {
        await jsm.consumers.resume(stream, consumer);

        return {
          content: [{
            type: "text",
            text: `Resumed consumer "${consumer}" on stream "${stream}"`,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error resuming consumer: ${formatError(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "nats_consumer_fetch",
    {
      description: "Fetch messages from a durable consumer",
      inputSchema: {
        stream: z.string().describe("Name of the stream"),
        consumer: z.string().describe("Consumer name"),
        count: z.number().default(10).describe("Number of messages to fetch (max 100)"),
      },
    },
    async ({ stream, consumer, count }) => {
      try {
        const fetchCount = Math.min(count, 100);

        const messages: Array<{
          seq: number;
          subject: string;
          data: string;
          time: string;
        }> = [];

        const c = await js.consumers.get(stream, consumer);

        const iter = await c.fetch({
          max_messages: fetchCount,
          expires: 3000,
        });

        for await (const msg of iter) {
          messages.push({
            seq: msg.seq,
            subject: msg.subject,
            data: sc.decode(msg.data),
            time: msg.info.timestampNanos
              ? new Date(Number(msg.info.timestampNanos) / 1_000_000).toISOString()
              : "unknown",
          });
          msg.ack();

          if (messages.length >= fetchCount) {
            break;
          }
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify(messages, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error fetching from consumer: ${formatError(error)}`,
          }],
          isError: true,
        };
      }
    }
  );
}
