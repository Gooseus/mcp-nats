import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { formatError } from "../utils.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = join(__dirname, "..", "..", "docs", "nats");

interface DocInfo {
  name: string;
  description: string;
  localFile: string;
}

const AVAILABLE_DOCS: DocInfo[] = [
  { name: "subjects", description: "NATS subject naming conventions and wildcard patterns (* and >)", localFile: "subjects.md" },
  { name: "acks", description: "NATS acknowledgment patterns and semantics", localFile: "acks.md" },
  { name: "pubsub", description: "Core NATS publish-subscribe messaging patterns", localFile: "pubsub.md" },
  { name: "reqreply", description: "NATS request-reply messaging pattern", localFile: "reqreply.md" },
  { name: "jetstream", description: "JetStream overview: persistence, at-least-once delivery", localFile: "jetstream.md" },
  { name: "streams", description: "JetStream streams: configuration, retention policies, limits", localFile: "streams.md" },
  { name: "consumers", description: "JetStream consumers: durable, ephemeral, push, pull, ack policies", localFile: "consumers.md" },
  { name: "headers", description: "NATS message headers and metadata", localFile: "headers.md" },
  { name: "kv", description: "NATS Key-Value store: buckets, keys, history, TTL", localFile: "kv.md" },
  { name: "objectstore", description: "NATS Object store: large file storage and retrieval", localFile: "objectstore.md" },
];

export function registerDocsTools(server: McpServer): void {
  server.registerTool(
    "nats_docs_list",
    {
      description: "List available NATS documentation topics. Use this to discover what documentation is available before reading.",
      inputSchema: {},
    },
    async () => {
      const docs = AVAILABLE_DOCS.map((doc) => ({
        name: doc.name,
        description: doc.description,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(docs, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool(
    "nats_docs_read",
    {
      description:
        "Read NATS documentation on a specific topic. Use this to get accurate information about NATS concepts, APIs, and patterns before answering questions or writing code.",
      inputSchema: {
        topic: z
          .enum([
            "subjects",
            "acks",
            "pubsub",
            "reqreply",
            "jetstream",
            "streams",
            "consumers",
            "headers",
            "kv",
            "objectstore",
          ])
          .describe("Documentation topic to read"),
      },
    },
    async ({ topic }) => {
      try {
        const docInfo = AVAILABLE_DOCS.find((d) => d.name === topic);
        if (!docInfo) {
          return {
            content: [
              {
                type: "text",
                text: `Unknown topic: ${topic}. Use nats_docs_list to see available topics.`,
              },
            ],
            isError: true,
          };
        }

        const filePath = join(DOCS_DIR, docInfo.localFile);
        const content = await readFile(filePath, "utf-8");

        return {
          content: [
            {
              type: "text",
              text: content,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error reading documentation: ${formatError(error)}. Run: npm run update-docs`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
