import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { formatError, logError } from "../utils.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = join(__dirname, "..", "..", "docs", "nats");
const METADATA_FILE = join(DOCS_DIR, ".metadata.json");

interface DocConfig {
  name: string;
  uri: string;
  description: string;
  localFile: string;
  sourceUrl: string;
}

interface DocMetadata {
  [key: string]: {
    etag?: string;
    lastModified?: string;
    fetchedAt: string;
  };
}

const DOCS_CONFIG: DocConfig[] = [
  // Core concepts
  {
    name: "docs_subjects",
    uri: "nats://docs/subjects",
    description: "NATS subject naming conventions and wildcard patterns",
    localFile: "subjects.md",
    sourceUrl:
      "https://raw.githubusercontent.com/nats-io/nats.docs/master/nats-concepts/subjects.md",
  },
  {
    name: "docs_acks",
    uri: "nats://docs/acks",
    description: "NATS acknowledgment patterns and semantics",
    localFile: "acks.md",
    sourceUrl:
      "https://raw.githubusercontent.com/nats-io/nats.docs/master/nats-concepts/acks.md",
  },
  {
    name: "docs_pubsub",
    uri: "nats://docs/pubsub",
    description: "Core NATS publish-subscribe messaging patterns",
    localFile: "pubsub.md",
    sourceUrl:
      "https://raw.githubusercontent.com/nats-io/nats.docs/master/nats-concepts/core-nats/publish-subscribe/pubsub.md",
  },
  {
    name: "docs_reqreply",
    uri: "nats://docs/reqreply",
    description: "NATS request-reply messaging pattern",
    localFile: "reqreply.md",
    sourceUrl:
      "https://raw.githubusercontent.com/nats-io/nats.docs/master/nats-concepts/core-nats/request-reply/reqreply.md",
  },
  // JetStream
  {
    name: "docs_jetstream",
    uri: "nats://docs/jetstream",
    description: "JetStream overview: persistence, at-least-once delivery",
    localFile: "jetstream.md",
    sourceUrl:
      "https://raw.githubusercontent.com/nats-io/nats.docs/master/nats-concepts/jetstream/README.md",
  },
  {
    name: "docs_streams",
    uri: "nats://docs/streams",
    description: "JetStream streams: configuration, retention, limits",
    localFile: "streams.md",
    sourceUrl:
      "https://raw.githubusercontent.com/nats-io/nats.docs/master/nats-concepts/jetstream/streams.md",
  },
  {
    name: "docs_consumers",
    uri: "nats://docs/consumers",
    description: "JetStream consumers: durable, ephemeral, push, pull",
    localFile: "consumers.md",
    sourceUrl:
      "https://raw.githubusercontent.com/nats-io/nats.docs/master/nats-concepts/jetstream/consumers.md",
  },
  {
    name: "docs_headers",
    uri: "nats://docs/headers",
    description: "NATS message headers and metadata",
    localFile: "headers.md",
    sourceUrl:
      "https://raw.githubusercontent.com/nats-io/nats.docs/master/nats-concepts/jetstream/headers.md",
  },
  // KV Store
  {
    name: "docs_kv",
    uri: "nats://docs/kv",
    description: "NATS Key-Value store: buckets, keys, history, TTL",
    localFile: "kv.md",
    sourceUrl:
      "https://raw.githubusercontent.com/nats-io/nats.docs/master/nats-concepts/jetstream/key-value-store/kv_walkthrough.md",
  },
  // Object Store
  {
    name: "docs_objectstore",
    uri: "nats://docs/objectstore",
    description: "NATS Object store: large file storage and retrieval",
    localFile: "objectstore.md",
    sourceUrl:
      "https://raw.githubusercontent.com/nats-io/nats.docs/master/nats-concepts/jetstream/object-store/obj_walkthrough.md",
  },
];

async function loadMetadata(): Promise<DocMetadata> {
  try {
    const content = await readFile(METADATA_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

async function checkForUpdates(): Promise<void> {
  try {
    const metadata = await loadMetadata();
    const updates: string[] = [];

    for (const doc of DOCS_CONFIG) {
      const docMeta = metadata[doc.name.replace("docs_", "")];
      if (!docMeta) {
        updates.push(doc.name);
        continue;
      }

      // Check if etag changed (quick HEAD request)
      try {
        const response = await fetch(doc.sourceUrl, { method: "HEAD" });
        const remoteEtag = response.headers.get("etag");
        const remoteLastModified = response.headers.get("last-modified");

        if (remoteEtag && docMeta.etag && remoteEtag !== docMeta.etag) {
          updates.push(doc.name);
        } else if (
          remoteLastModified &&
          docMeta.lastModified &&
          remoteLastModified !== docMeta.lastModified
        ) {
          updates.push(doc.name);
        }
      } catch {
        // Ignore network errors during update check
      }
    }

    if (updates.length > 0) {
      logError(
        `NATS docs may be outdated (${updates.join(", ")}). Run: npm run update-docs`
      );
    }
  } catch {
    // Silently ignore update check errors
  }
}

async function readLocalDoc(localFile: string): Promise<string> {
  const filePath = join(DOCS_DIR, localFile);
  return await readFile(filePath, "utf-8");
}

export function registerDocsResources(server: McpServer): void {
  // Check for updates in background (non-blocking)
  checkForUpdates();

  for (const doc of DOCS_CONFIG) {
    server.registerResource(
      doc.name,
      doc.uri,
      {
        description: doc.description,
        mimeType: "text/markdown",
      },
      async () => {
        try {
          const content = await readLocalDoc(doc.localFile);
          return {
            contents: [
              {
                uri: doc.uri,
                mimeType: "text/markdown",
                text: content,
              },
            ],
          };
        } catch (error) {
          return {
            contents: [
              {
                uri: doc.uri,
                mimeType: "text/plain",
                text: `Error reading documentation: ${formatError(error)}. Run: npm run update-docs`,
              },
            ],
          };
        }
      }
    );
  }
}
