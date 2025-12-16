# Changelog

## [0.1.5](https://github.com/Gooseus/mcp-nats/compare/v0.1.4...v0.1.5) (2024-12-13)

### Miscellaneous

* add node version to engine; update node version v20 requirement

## [0.1.4](https://github.com/Gooseus/mcp-nats/compare/v0.1.3...v0.1.4) (2024-12-13)

### Features

* add README badges for github/npm

### Bug Fixes

* non-mac specific build script

## [0.1.3](https://github.com/Gooseus/mcp-nats/compare/v0.1.2...v0.1.3) (2024-12-13)

### Bug Fixes

* read app VERSION from package.json

## [0.1.2](https://github.com/Gooseus/mcp-nats/compare/v0.1.1...v0.1.2) (2024-12-13)

### Miscellaneous

* add npm publish workflow with OIDC trusted publishing

## [0.1.1](https://github.com/Gooseus/mcp-nats/compare/v0.1.0...v0.1.1) (2024-12-13)

### Bug Fixes

* add LICENSE and update README
* rename package for npm

## [0.1.0](https://github.com/Gooseus/mcp-nats/releases/tag/v0.1.0) (2024-12-13)

### Features

* Initial release of NATS MCP server
* Core NATS operations: publish, subscribe, request-reply
* JetStream stream management: list, info, publish, get messages
* JetStream consumer management: create, delete, pause, resume, fetch
* Key-Value store operations: get, put, delete, list keys
* Object store operations: buckets, objects, metadata
* Stream health monitoring with consumer state assessment
* Embedded NATS documentation resources
* Multiple transport options: stdio and SSE/HTTP
* Support for NATS authentication: basic auth, token, credentials files
* Synadia Cloud integration guide
