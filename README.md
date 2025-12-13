# NATS MCP Server

An MCP (Model Context Protocol) server that exposes NATS messaging capabilities to LLMs like Claude. This enables AI assistants to interact with NATS messaging infrastructure - publishing messages, subscribing, performing request-reply operations, managing JetStream streams and consumers, and working with Key-Value stores.

## Features

- **Core NATS Operations**: Publish messages, subscribe to subjects, request-reply pattern
- **Real-time Subscriptions**: Listen for messages with timeout and max message limits, wildcard support
- **JetStream**: Stream management, health monitoring, persistent publishing with acknowledgment
- **Consumer Management**: Create, list, pause, resume, fetch, and delete JetStream consumers
- **Key-Value Store**: Get, put, delete, and list keys with filtering support
- **Object Store**: Store and retrieve large objects with metadata
- **Embedded Documentation**: Access NATS documentation directly through tools and resources
- **Resources**: Query server info, list streams, KV buckets, and documentation
- **Multiple Transports**: Stdio (default) or SSE for network-accessible HTTP server

## Requirements

- Node.js 18+ (or [Bun](https://bun.sh/) for development)
- NATS server with JetStream enabled
- Docker (optional, for running tests)

## Installation

### Via npx (recommended)

No installation needed - run directly:

```bash
npx mcp-nats
```

### Install globally

```bash
npm install -g mcp-nats
mcp-nats
```

### From source (for development)

```bash
git clone https://github.com/Gooseus/mcp-nats.git
cd mcp-nats
bun install
bun run start
```

## Quick Start

1. Start a NATS server with JetStream:
```bash
docker run -p 4222:4222 nats:latest -js
```

2. Run the MCP server:
```bash
# Via npx
npx mcp-nats

# Or if installed globally
mcp-nats

# Or from source
bun run start
```

3. Or run with HTTP/SSE transport for network access:
```bash
npx mcp-nats --transport=sse --port=3000
# Server will be available at http://localhost:3000/mcp
```

4. Test with MCP Inspector:
```bash
npx @modelcontextprotocol/inspector npx mcp-nats
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NATS_URL` | NATS server URL | `nats://localhost:4222` |
| `NATS_USER` | Username for auth | - |
| `NATS_PASS` | Password for auth | - |
| `NATS_TOKEN` | Token authentication | - |
| `NATS_CREDS_PATH` | Credentials file path (NGS/Synadia) | - |

> **Using Synadia Cloud?** See [SYNADIA.md](./SYNADIA.md) for a complete setup guide.

### Command Line Options

```bash
bun run src/index.ts [options]

Options:
  --transport=<type>  Transport type: 'stdio' (default) or 'sse'
  --port=<port>       HTTP port for SSE transport (default: 3000)
  --host=<host>       Host to bind for SSE transport (default: 0.0.0.0)
  --help, -h          Show help message
```

## Claude Desktop Integration

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on Mac):

```json
{
  "mcpServers": {
    "nats": {
      "command": "npx",
      "args": ["mcp-nats"],
      "env": {
        "NATS_URL": "nats://localhost:4222"
      }
    }
  }
}
```

Or if installed globally:

```json
{
  "mcpServers": {
    "nats": {
      "command": "mcp-nats",
      "env": {
        "NATS_URL": "nats://localhost:4222"
      }
    }
  }
}
```

Or from source with Bun:

```json
{
  "mcpServers": {
    "nats": {
      "command": "bun",
      "args": ["/absolute/path/to/mcp-nats/src/index.ts"],
      "env": {
        "NATS_URL": "nats://localhost:4222"
      }
    }
  }
}
```

## Available Tools

### Core NATS

| Tool | Description | Parameters |
|------|-------------|------------|
| `nats_publish` | Publish a message to a subject | `subject`, `payload`, `headers?` |
| `nats_request` | Request-reply pattern | `subject`, `payload`, `timeout?` |
| `nats_subscribe` | Subscribe and collect messages | `subject`, `timeout?`, `max_messages?`, `queue?` |
| `nats_server_info` | Get NATS server connection info | - |

### Key-Value Store

| Tool | Description | Parameters |
|------|-------------|------------|
| `nats_kv_get` | Get value from KV bucket | `bucket`, `key` |
| `nats_kv_put` | Store value in KV bucket | `bucket`, `key`, `value` |
| `nats_kv_delete` | Delete key from KV bucket | `bucket`, `key` |
| `nats_kv_list_keys` | List keys in bucket | `bucket`, `filter?` |

### JetStream Streams

| Tool | Description | Parameters |
|------|-------------|------------|
| `nats_stream_list` | List all JetStream streams | - |
| `nats_stream_info` | Get stream information | `stream` |
| `nats_stream_publish` | Publish to JetStream | `subject`, `payload` |
| `nats_stream_get_messages` | Fetch messages from stream | `stream`, `count?`, `startSeq?` |
| `nats_stream_health` | Get stream health with consumer states | `stream`, `lag_threshold?`, `ack_pending_threshold?` |

### JetStream Consumers

| Tool | Description | Parameters |
|------|-------------|------------|
| `nats_consumer_create` | Create a consumer | `stream`, `name`, `deliver_policy?`, `ack_policy?`, `filter_subject?` |
| `nats_consumer_info` | Get consumer details | `stream`, `consumer` |
| `nats_consumer_list` | List consumers for stream | `stream` |
| `nats_consumer_delete` | Delete a consumer | `stream`, `consumer` |
| `nats_consumer_pause` | Pause a consumer | `stream`, `consumer`, `until?` |
| `nats_consumer_resume` | Resume a consumer | `stream`, `consumer` |
| `nats_consumer_fetch` | Fetch messages from durable consumer | `stream`, `consumer`, `batch?`, `expires?` |

### Object Store

| Tool | Description | Parameters |
|------|-------------|------------|
| `nats_obj_list_buckets` | List all object store buckets | - |
| `nats_obj_create_bucket` | Create a new object store bucket | `bucket`, `description?`, `max_bytes?`, `storage?`, `ttl?` |
| `nats_obj_delete_bucket` | Delete an object store bucket | `bucket` |
| `nats_obj_list` | List objects in a bucket | `bucket` |
| `nats_obj_put` | Store an object | `bucket`, `name`, `data`, `description?` |
| `nats_obj_get` | Get an object | `bucket`, `name` |
| `nats_obj_delete` | Delete an object | `bucket`, `name` |
| `nats_obj_info` | Get object metadata | `bucket`, `name` |

### Documentation

| Tool | Description | Parameters |
|------|-------------|------------|
| `nats_docs_list` | List available NATS documentation topics | - |
| `nats_docs_read` | Read NATS documentation on a topic | `topic` |

## Available Resources

### Server Resources

| Resource | URI | Description |
|----------|-----|-------------|
| Streams | `nats://streams` | List all JetStream streams with metadata |
| KV Buckets | `nats://kv` | KV bucket information |
| Server Info | `nats://server` | NATS server connection details |

### Documentation Resources

| Resource | URI | Description |
|----------|-----|-------------|
| Subjects | `nats://docs/subjects` | NATS subject naming conventions and wildcards |
| Acks | `nats://docs/acks` | NATS acknowledgment patterns and semantics |
| Pub/Sub | `nats://docs/pubsub` | Core NATS publish-subscribe patterns |
| Request/Reply | `nats://docs/reqreply` | NATS request-reply messaging pattern |
| JetStream | `nats://docs/jetstream` | JetStream overview and persistence |
| Streams | `nats://docs/streams` | JetStream stream configuration and retention |
| Consumers | `nats://docs/consumers` | JetStream consumer types and policies |
| Headers | `nats://docs/headers` | NATS message headers and metadata |
| Key-Value | `nats://docs/kv` | NATS Key-Value store guide |
| Object Store | `nats://docs/objectstore` | NATS Object store guide |

## SSE Transport

The SSE transport allows network clients to connect to the MCP server over HTTP. This enables:

- Web browser clients
- Remote connections
- Multiple concurrent clients
- Integration with web-based AI tools

```bash
# Start with SSE transport
bun run start:sse

# Or with custom port
bun run src/index.ts --transport=sse --port=8080
```

Endpoints:
- `GET /health` - Health check
- `POST /mcp` - JSON-RPC endpoint (requires `Accept: application/json, text/event-stream`)
- `GET /mcp` - SSE stream (requires `Accept: text/event-stream`)

## Development

```bash
# Run in development mode (with watch)
bun run dev

# Run with SSE in dev mode
bun run dev:sse

# Run tests
bun run test:up      # Start NATS container
bun test             # Run test suite
bun run test:down    # Stop NATS container

# Or all-in-one
bun run test:ci

# Build for Node.js distribution
bun run build
```

## Testing

The project uses Bun's built-in test runner with Docker Compose for the NATS server:

```bash
# Start test infrastructure
docker compose up -d

# Run tests (55 tests covering all tools, resources, and transports)
bun test

# Stop test infrastructure
docker compose down
```

## Example Usage

Once connected to Claude Desktop, you can ask Claude to:

- "Publish a message to the 'orders.new' subject with the order details"
- "Subscribe to 'events.>' and listen for messages for 10 seconds"
- "Check what messages are in the ORDERS stream"
- "Create a consumer on the ORDERS stream that only gets 'orders.important' messages"
- "List all consumers on the EVENTS stream"
- "Check the health of the ORDERS stream"
- "Store this configuration in the 'config' KV bucket under key 'app.settings'"
- "Store this large file in the 'files' object store bucket"
- "List all the streams in my NATS server"
- "Send a request to 'api.users.get' and wait for a response"
- "Read the NATS documentation on JetStream consumers"

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

- **Bug reports & feature requests**: [Open an issue](https://github.com/Gooseus/mcp-nats/issues)
- **Questions & discussions**: [GitHub Discussions](https://github.com/Gooseus/mcp-nats/discussions)

## License

[MIT](LICENSE)

## Author

Shawn Marincas ([@Gooseus](https://github.com/Gooseus))
