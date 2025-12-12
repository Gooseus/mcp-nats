# NATS MCP Server - Claude Code Instructions

## Project Overview

MCP (Model Context Protocol) server that exposes NATS messaging capabilities to LLMs. Built with Bun runtime for TypeScript execution and testing.

## Tech Stack

- **Runtime**: Bun (TypeScript executed directly, no compilation needed for dev)
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **NATS Client**: `nats` (NATS.js)
- **Validation**: `zod`
- **Testing**: Bun's built-in test runner

## Project Structure

```
nats-mcp/
├── src/
│   ├── index.ts           # Entry point, MCP server setup
│   ├── connection.ts      # NATS connection management
│   ├── utils.ts           # Shared utilities and helpers
│   ├── tools/
│   │   ├── core.ts        # nats_publish, nats_request, nats_server_info
│   │   ├── subscribe.ts   # nats_subscribe
│   │   ├── kv.ts          # KV operations (get, put, delete, list)
│   │   ├── jetstream.ts   # Stream operations (list, info, publish, get_messages)
│   │   ├── consumers.ts   # Consumer operations (create, info, list, delete, pause, resume, fetch)
│   │   ├── objectstore.ts # Object store operations (buckets, objects)
│   │   ├── stream-health.ts # Stream health monitoring
│   │   └── docs.ts        # NATS documentation tools
│   ├── resources/
│   │   ├── streams.ts     # nats://streams resource
│   │   ├── kv.ts          # nats://kv resource
│   │   ├── server.ts      # nats://server resource
│   │   └── docs.ts        # nats://docs/* resources
│   └── transports/
│       └── sse.ts         # SSE/HTTP transport
├── tests/
│   ├── setup.ts           # Test helpers, NATS connection
│   ├── tools/             # Tool tests
│   └── resources/         # Resource tests
├── docs/
│   └── nats/              # Cached NATS documentation
├── scripts/
│   └── update-docs.ts     # Script to update cached docs
├── docker-compose.yml     # NATS with JetStream for testing
└── package.json
```

## Commands

```bash
# Development
bun run src/index.ts       # Run directly
bun run dev                # Run with watch mode

# Testing
bun run test:up            # Start NATS via Docker
bun test                   # Run tests
bun run test:down          # Stop NATS
bun run test:ci            # All-in-one for CI

# Building (for npm publishing)
bun run build              # Build to dist/ for Node.js compatibility

# MCP Inspector
bun run inspector          # Debug with MCP Inspector

# Documentation
bun run update-docs        # Update cached NATS documentation
```

## MCP Tools Implemented

| Tool | Description |
|------|-------------|
| `nats_publish` | Publish message to subject (with optional headers) |
| `nats_request` | Request-reply pattern with timeout |
| `nats_subscribe` | Listen for messages on subject (supports wildcards) |
| `nats_server_info` | Get NATS server connection info |
| `nats_kv_get` | Get value from KV bucket |
| `nats_kv_put` | Store value in KV bucket |
| `nats_kv_delete` | Delete key from KV bucket |
| `nats_kv_list_keys` | List keys in bucket (with optional filter) |
| `nats_stream_list` | List all JetStream streams |
| `nats_stream_info` | Get JetStream stream information |
| `nats_stream_publish` | Publish to JetStream with ack |
| `nats_stream_get_messages` | Fetch messages from stream (ephemeral consumer) |
| `nats_stream_health` | Get stream health with consumer states and assessment |
| `nats_consumer_create` | Create a durable consumer |
| `nats_consumer_info` | Get consumer state and config |
| `nats_consumer_list` | List consumers for a stream |
| `nats_consumer_delete` | Delete a consumer |
| `nats_consumer_pause` | Pause consumer delivery |
| `nats_consumer_resume` | Resume a paused consumer |
| `nats_consumer_fetch` | Fetch messages from a durable consumer |
| `nats_obj_list_buckets` | List all object store buckets |
| `nats_obj_create_bucket` | Create a new object store bucket |
| `nats_obj_delete_bucket` | Delete an object store bucket |
| `nats_obj_list` | List objects in a bucket |
| `nats_obj_put` | Store an object in the object store |
| `nats_obj_get` | Get an object from the object store |
| `nats_obj_delete` | Delete an object from the object store |
| `nats_obj_info` | Get object metadata |
| `nats_docs_list` | List available NATS documentation topics |
| `nats_docs_read` | Read NATS documentation on a specific topic |

## MCP Resources Implemented

| Resource | URI | Description |
|----------|-----|-------------|
| streams | `nats://streams` | List all JetStream streams |
| kv_buckets | `nats://kv` | KV bucket information |
| server_info | `nats://server` | NATS server connection info |
| docs_subjects | `nats://docs/subjects` | NATS subject naming conventions |
| docs_acks | `nats://docs/acks` | NATS acknowledgment patterns |
| docs_pubsub | `nats://docs/pubsub` | Core NATS publish-subscribe |
| docs_reqreply | `nats://docs/reqreply` | NATS request-reply pattern |
| docs_jetstream | `nats://docs/jetstream` | JetStream overview |
| docs_streams | `nats://docs/streams` | JetStream streams configuration |
| docs_consumers | `nats://docs/consumers` | JetStream consumers guide |
| docs_headers | `nats://docs/headers` | NATS message headers |
| docs_kv | `nats://docs/kv` | NATS Key-Value store guide |
| docs_objectstore | `nats://docs/objectstore` | NATS Object store guide |

## Environment Variables

```
NATS_URL=nats://localhost:4222    # NATS server URL
NATS_USER=                        # Optional username
NATS_PASS=                        # Optional password
NATS_TOKEN=                       # Optional token auth
NATS_CREDS_PATH=                  # Optional credentials file (NGS/Synadia)
```

## Testing Conventions

- Use Bun's built-in test runner (`bun:test`)
- Tests use Arrange-Act-Assert pattern
- Each test file sets up its own MCP server instance
- Use `getTool(server, name)` and `getResource(server, uri)` helpers
- Clean up streams/buckets after tests with cleanup functions

## Key Implementation Details

- **Tool registration**: Uses `server.tool(name, zodSchema, handler)`
- **Resource registration**: Uses `server.resource(name, uri, handler)`
- **Internal tool access**: `(server as any)._registeredTools[name]`
- **Internal resource access**: `(server as any)._registeredResources[uri]`
- **NATS connection**: Singleton pattern in `connection.ts`
