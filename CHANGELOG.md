# Changelog

## [0.1.6](https://github.com/Gooseus/mcp-nats/compare/mcp-nats-v0.1.5...mcp-nats-v0.1.6) (2025-12-16)


### Features

* add CI/CD automation with release-please ([865536e](https://github.com/Gooseus/mcp-nats/commit/865536e54fd739a447df0793e04c03d7b993eee6))
* add NPM installation and usage ([c2721ef](https://github.com/Gooseus/mcp-nats/commit/c2721efa51ba8dd343e376464c08632cfc009838))
* add README badges for github/npm ([87d0829](https://github.com/Gooseus/mcp-nats/commit/87d08293aa189afbe2235b11c4a123e923adf7f6))


### Bug Fixes

* add LICENSE and update README ([b9ea524](https://github.com/Gooseus/mcp-nats/commit/b9ea524dc3b47aa869d0815dedc5d88da3332a55))
* non-mac specific build script ([5b68581](https://github.com/Gooseus/mcp-nats/commit/5b68581f51872a2701c533dc0bfd46bd7a316f2d))
* read app VERSION from package.json ([56c2a78](https://github.com/Gooseus/mcp-nats/commit/56c2a78387266023c364a4ccd973fe1c46e9cdbd))
* rename  to ([8777826](https://github.com/Gooseus/mcp-nats/commit/87778268cde66c29e0817e3093107d91d2d0ce47))

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
