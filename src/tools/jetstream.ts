import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { JetStreamClient, JetStreamManager, StringCodec, RetentionPolicy, PurgeOpts } from "nats";
import { formatError, STORAGE_TYPE_MAP } from "../utils.js";

const sc = StringCodec();

export function registerJetstreamTools(
  server: McpServer,
  js: JetStreamClient,
  jsm: JetStreamManager
): void {
  server.registerTool(
    "nats_stream_list",
    {
      description: "List all JetStream streams",
      inputSchema: {},
    },
    async () => {
      try {
        const streams: Array<{
          name: string;
          description?: string;
          subjects: string[];
          messages: number;
          bytes: number;
          consumers: number;
        }> = [];

        for await (const stream of jsm.streams.list()) {
          streams.push({
            name: stream.config.name,
            description: stream.config.description,
            subjects: stream.config.subjects,
            messages: stream.state.messages,
            bytes: stream.state.bytes,
            consumers: stream.state.consumer_count,
          });
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify(streams, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error listing streams: ${formatError(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "nats_stream_info",
    {
      description: "Get detailed information about a JetStream stream",
      inputSchema: {
        stream: z.string().describe("Stream name"),
      },
    },
    async ({ stream }) => {
      try {
        const info = await jsm.streams.info(stream);

        const result = {
          name: info.config.name,
          description: info.config.description,
          subjects: info.config.subjects,
          retention: info.config.retention,
          maxConsumers: info.config.max_consumers,
          maxMsgs: info.config.max_msgs,
          maxBytes: info.config.max_bytes,
          maxAge: info.config.max_age,
          state: {
            messages: info.state.messages,
            bytes: info.state.bytes,
            firstSeq: info.state.first_seq,
            lastSeq: info.state.last_seq,
            consumerCount: info.state.consumer_count,
          },
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
            text: `Error getting stream info: ${formatError(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "nats_stream_get_messages",
    {
      description: "Fetch messages from a JetStream stream",
      inputSchema: {
        stream: z.string().describe("Stream name"),
        count: z.number().default(10).describe("Number of messages to fetch (max 100)"),
        startSeq: z.number().optional().describe("Starting sequence number (defaults to latest messages)"),
      },
    },
    async ({ stream, count, startSeq }) => {
      try {
        const fetchCount = Math.min(count, 100);

        const messages: Array<{
          seq: number;
          subject: string;
          data: string;
          time: string;
        }> = [];

        const streamInfo = await jsm.streams.info(stream);
        if (streamInfo.state.messages === 0) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify([], null, 2),
            }],
          };
        }

        const consumer = await js.consumers.get(stream, {
          opt_start_seq: startSeq ?? streamInfo.state.first_seq,
        });

        const iter = await consumer.fetch({
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
            text: `Error fetching messages: ${formatError(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "nats_stream_publish",
    {
      description: "Publish a message to JetStream with acknowledgment",
      inputSchema: {
        subject: z.string().describe("Subject to publish to (must match a stream's subjects)"),
        payload: z.string().describe("Message payload"),
      },
    },
    async ({ subject, payload }) => {
      try {
        const ack = await js.publish(subject, sc.encode(payload));

        return {
          content: [{
            type: "text",
            text: `Published to stream "${ack.stream}" at sequence ${ack.seq}`,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error publishing to stream: ${formatError(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "nats_stream_create",
    {
      description: "Create a new JetStream stream",
      inputSchema: {
        name: z.string().describe("Stream name"),
        subjects: z.array(z.string()).describe("Subjects to capture"),
        description: z.string().optional().describe("Stream description"),
        retention: z.enum(["limits", "interest", "workqueue"]).default("limits").describe("Retention policy"),
        storage: z.enum(["file", "memory"]).default("file").describe("Storage type"),
        max_msgs: z.number().optional().describe("Maximum number of messages"),
        max_bytes: z.number().optional().describe("Maximum total bytes"),
        max_age: z.number().optional().describe("Maximum age in nanoseconds"),
        max_msg_size: z.number().optional().describe("Maximum message size in bytes"),
        duplicate_window: z.number().optional().describe("Duplicate detection window in nanoseconds"),
      },
    },
    async ({ name, subjects, description, retention, storage, max_msgs, max_bytes, max_age, max_msg_size, duplicate_window }) => {
      try {
        const retentionMap: Record<string, RetentionPolicy> = {
          limits: RetentionPolicy.Limits,
          interest: RetentionPolicy.Interest,
          workqueue: RetentionPolicy.Workqueue,
        };

        const config: Parameters<typeof jsm.streams.add>[0] = {
          name,
          subjects,
          retention: retentionMap[retention],
          storage: STORAGE_TYPE_MAP[storage],
        };

        if (description) config.description = description;
        if (max_msgs !== undefined) config.max_msgs = max_msgs;
        if (max_bytes !== undefined) config.max_bytes = max_bytes;
        if (max_age !== undefined) config.max_age = max_age;
        if (max_msg_size !== undefined) config.max_msg_size = max_msg_size;
        if (duplicate_window !== undefined) config.duplicate_window = duplicate_window;

        const stream = await jsm.streams.add(config);

        return {
          content: [{
            type: "text",
            text: `Created stream "${stream.config.name}" capturing subjects: ${stream.config.subjects.join(", ")}`,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error creating stream: ${formatError(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "nats_stream_delete",
    {
      description: "Delete a JetStream stream",
      inputSchema: {
        stream: z.string().describe("Stream name to delete"),
      },
    },
    async ({ stream }) => {
      try {
        await jsm.streams.delete(stream);

        return {
          content: [{
            type: "text",
            text: `Deleted stream "${stream}"`,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error deleting stream: ${formatError(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "nats_stream_purge",
    {
      description: "Purge messages from a JetStream stream",
      inputSchema: {
        stream: z.string().describe("Stream name"),
        filter: z.string().optional().describe("Subject filter - only purge messages matching this subject"),
        seq: z.number().optional().describe("Purge messages up to but not including this sequence"),
      },
    },
    async ({ stream, filter, seq }) => {
      try {
        let opts: PurgeOpts | undefined;

        if(seq !== undefined) {
          opts = filter ? { seq, filter } : { seq };
        } else if (filter) {
          opts = { filter };
        }

        const result = await jsm.streams.purge(stream, opts);

        return {
          content: [{
            type: "text",
            text: `Purged ${result.purged} messages from stream "${stream}"`,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error purging stream: ${formatError(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "nats_stream_get_message",
    {
      description: "Get a single message from a JetStream stream by sequence or subject",
      inputSchema: {
        stream: z.string().describe("Stream name"),
        seq: z.number().optional().describe("Sequence number to retrieve"),
        last_by_subject: z.string().optional().describe("Get last message for this subject"),
      },
    },
    async ({ stream, seq, last_by_subject }) => {
      try {
        let msg;

        if (last_by_subject) {
          msg = await jsm.streams.getMessage(stream, { last_by_subj: last_by_subject });
        } else if (seq !== undefined) {
          msg = await jsm.streams.getMessage(stream, { seq });
        } else {
          return {
            content: [{
              type: "text",
              text: "Error: Either 'seq' or 'last_by_subject' must be provided",
            }],
            isError: true,
          };
        }

        const result = {
          seq: msg.seq,
          subject: msg.subject,
          data: sc.decode(msg.data),
          time: msg.time ? msg.time.toISOString() : "unknown",
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
            text: `Error getting message: ${formatError(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "nats_stream_delete_message",
    {
      description: "Delete a specific message from a JetStream stream",
      inputSchema: {
        stream: z.string().describe("Stream name"),
        seq: z.number().describe("Sequence number to delete"),
        no_erase: z.boolean().default(false).describe("If true, remove but don't overwrite data"),
      },
    },
    async ({ stream, seq, no_erase }) => {
      try {
        await jsm.streams.deleteMessage(stream, seq, no_erase);

        return {
          content: [{
            type: "text",
            text: `Deleted message at sequence ${seq} from stream "${stream}"`,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error deleting message: ${formatError(error)}`,
          }],
          isError: true,
        };
      }
    }
  );
}
