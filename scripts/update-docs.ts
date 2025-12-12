#!/usr/bin/env bun

/**
 * Script to fetch NATS documentation from GitHub and store locally.
 * Run with: bun run scripts/update-docs.ts
 */

import { mkdir, writeFile, readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = join(__dirname, "..", "docs", "nats");
const METADATA_FILE = join(DOCS_DIR, ".metadata.json");

interface DocConfig {
  name: string;
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
    name: "subjects",
    localFile: "subjects.md",
    sourceUrl:
      "https://raw.githubusercontent.com/nats-io/nats.docs/master/nats-concepts/subjects.md",
  },
  {
    name: "acks",
    localFile: "acks.md",
    sourceUrl:
      "https://raw.githubusercontent.com/nats-io/nats.docs/master/nats-concepts/acks.md",
  },
  {
    name: "pubsub",
    localFile: "pubsub.md",
    sourceUrl:
      "https://raw.githubusercontent.com/nats-io/nats.docs/master/nats-concepts/core-nats/publish-subscribe/pubsub.md",
  },
  {
    name: "reqreply",
    localFile: "reqreply.md",
    sourceUrl:
      "https://raw.githubusercontent.com/nats-io/nats.docs/master/nats-concepts/core-nats/request-reply/reqreply.md",
  },
  // JetStream
  {
    name: "jetstream",
    localFile: "jetstream.md",
    sourceUrl:
      "https://raw.githubusercontent.com/nats-io/nats.docs/master/nats-concepts/jetstream/README.md",
  },
  {
    name: "streams",
    localFile: "streams.md",
    sourceUrl:
      "https://raw.githubusercontent.com/nats-io/nats.docs/master/nats-concepts/jetstream/streams.md",
  },
  {
    name: "consumers",
    localFile: "consumers.md",
    sourceUrl:
      "https://raw.githubusercontent.com/nats-io/nats.docs/master/nats-concepts/jetstream/consumers.md",
  },
  {
    name: "headers",
    localFile: "headers.md",
    sourceUrl:
      "https://raw.githubusercontent.com/nats-io/nats.docs/master/nats-concepts/jetstream/headers.md",
  },
  // KV Store
  {
    name: "kv",
    localFile: "kv.md",
    sourceUrl:
      "https://raw.githubusercontent.com/nats-io/nats.docs/master/nats-concepts/jetstream/key-value-store/kv_walkthrough.md",
  },
  // Object Store
  {
    name: "objectstore",
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

async function saveMetadata(metadata: DocMetadata): Promise<void> {
  await writeFile(METADATA_FILE, JSON.stringify(metadata, null, 2));
}

async function fetchDoc(config: DocConfig): Promise<{
  content: string;
  etag?: string;
  lastModified?: string;
}> {
  console.log(`Fetching ${config.name} from ${config.sourceUrl}...`);

  const response = await fetch(config.sourceUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${config.name}: ${response.status} ${response.statusText}`);
  }

  const content = await response.text();
  const etag = response.headers.get("etag") || undefined;
  const lastModified = response.headers.get("last-modified") || undefined;

  return { content, etag, lastModified };
}

async function main() {
  console.log("NATS Documentation Update Script");
  console.log("=================================\n");

  // Ensure docs directory exists
  await mkdir(DOCS_DIR, { recursive: true });

  const metadata = await loadMetadata();
  let updatedCount = 0;

  for (const doc of DOCS_CONFIG) {
    try {
      const { content, etag, lastModified } = await fetchDoc(doc);

      const localPath = join(DOCS_DIR, doc.localFile);
      await writeFile(localPath, content);

      metadata[doc.name] = {
        etag,
        lastModified,
        fetchedAt: new Date().toISOString(),
      };

      console.log(`  ✓ ${doc.name}: saved to ${doc.localFile}`);
      updatedCount++;
    } catch (error) {
      console.error(`  ✗ ${doc.name}: ${error instanceof Error ? error.message : error}`);
    }
  }

  await saveMetadata(metadata);

  console.log(`\nDone! Updated ${updatedCount}/${DOCS_CONFIG.length} documents.`);
  console.log(`Metadata saved to ${METADATA_FILE}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
