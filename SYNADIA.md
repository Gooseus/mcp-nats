# Connecting to Synadia Cloud

This guide walks through setting up the NATS MCP server with [Synadia Cloud](https://www.synadia.com/cloud) (formerly NGS - NATS Global Service).

## Prerequisites

- NATS MCP server installed (`bun install`)
- Synadia Cloud account ([sign up here](https://cloud.synadia.com) - 14-day free trial available)

## Step 1: Create a User in Synadia Cloud

1. Log into [cloud.synadia.com](https://cloud.synadia.com)
2. Select "NGS" to access your NATS system
3. Navigate to an account (or create one)
4. Go to the "Users" tab
5. Click "Create User"
6. Name it something like "mcp-server"
7. Configure permissions (for full access, grant pub/sub to `>`)
8. Save the user

## Step 2: Download Credentials

1. Click on your user
2. Click the "Get Connected" button
3. Click "Download Credentials"
4. Save the `.creds` file somewhere safe:
   ```bash
   mkdir -p ~/.nats
   mv ~/Downloads/*.creds ~/.nats/synadia.creds
   ```

**Important:** Keep this file secure - it contains your authentication keys.

## Step 3: Run the MCP Server

### Option A: Environment Variables

```bash
NATS_URL="tls://connect.ngs.global" \
NATS_CREDS_PATH="$HOME/.nats/synadia.creds" \
bun run start
```

### Option B: Using a .env File

Create a `.env` file in the project root:

```env
NATS_URL=tls://connect.ngs.global
NATS_CREDS_PATH=/Users/yourname/.nats/synadia.creds
```

Then run:
```bash
bun run start
```

### Option C: Test with MCP Inspector

```bash
NATS_URL="tls://connect.ngs.global" \
NATS_CREDS_PATH="$HOME/.nats/synadia.creds" \
bun run inspector
```

## Step 4: Claude Desktop Configuration

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on Mac):

```json
{
  "mcpServers": {
    "nats-synadia": {
      "command": "bun",
      "args": ["/absolute/path/to/nats-mcp/src/index.ts"],
      "env": {
        "NATS_URL": "tls://connect.ngs.global",
        "NATS_CREDS_PATH": "/Users/yourname/.nats/synadia.creds"
      }
    }
  }
}
```

## Creating JetStream Resources

### Via NATS CLI

```bash
# Install NATS CLI
brew install nats-io/nats-tools/nats

# Create a context for Synadia Cloud
nats context save synadia \
  --server "tls://connect.ngs.global" \
  --creds ~/.nats/synadia.creds \
  --select

# Create a stream
nats stream add EVENTS \
  --subjects "events.>" \
  --storage memory \
  --retention limits \
  --max-msgs 10000

# Create a KV bucket
nats kv add config
```

### Via Synadia Cloud Dashboard

1. Navigate to JetStream → Streams
2. Click "Create Stream"
3. Configure your stream settings

## Connection Details

| Setting | Value |
|---------|-------|
| Server URL | `tls://connect.ngs.global` |
| WebSocket URL | `wss://connect.ngs.global:443` |
| Auth Method | Credentials file (`.creds`) |

## Troubleshooting

### Connection Refused
- Ensure you're using `tls://` not `nats://`
- Verify your credentials file path is correct and the file exists

### Permission Denied
- Check user permissions in the Synadia Cloud dashboard
- Ensure the user has pub/sub access to the required subjects

### JetStream Errors
- Verify JetStream is enabled for your account
- Check stream/consumer quotas in your plan

### Certificate Errors
- The `tls://` scheme uses the system's trusted CA certificates
- Synadia Cloud uses valid public certificates, so no custom CA is needed

## Resources

- [Synadia Cloud](https://www.synadia.com/cloud)
- [Synadia Cloud Documentation](https://docs.synadia.com/cloud)
- [Synadia Cloud Quick Start](https://docs.synadia.com/cloud/user-guides/quick-start)
- [NATS Client Libraries](https://nats.io/download/)
