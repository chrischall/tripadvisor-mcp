# Changelog

## 0.1.0 (2026-07-05)


### ⚠ BREAKING CHANGES

* primary-tier tools now target the TripAdvisor Terra API with Terra parameter names and response shapes; the legacy Content API is no longer used.

### Features

* fetchproxy web-bridge layer (transport, web client, ta_web_healthcheck) ([#3](https://github.com/chrischall/tripadvisor-mcp/issues/3)) ([c76f6d3](https://github.com/chrischall/tripadvisor-mcp/commit/c76f6d392e098f00a35b4ae50391989e818e599b))
* retarget the primary tier from the legacy Content API to Terra ([#10](https://github.com/chrischall/tripadvisor-mcp/issues/10)) ([7bcc951](https://github.com/chrischall/tripadvisor-mcp/commit/7bcc951dcdbcc41969075900cc27e97efdbf5dc6))
* ta_web_get_location — key-free location details via the browser bridge ([#8](https://github.com/chrischall/tripadvisor-mcp/issues/8)) ([9c57d4d](https://github.com/chrischall/tripadvisor-mcp/commit/9c57d4dd24b1e30974b22c5520f6bb0c2642d694))
* TripAdvisor Content API MCP server ([411a910](https://github.com/chrischall/tripadvisor-mcp/commit/411a910a59fbfef6969684d6e91f50f1d147bf20))


### Bug Fixes

* name the unactivated-key cause in the 403 error ([#1](https://github.com/chrischall/tripadvisor-mcp/issues/1)) ([77e8602](https://github.com/chrischall/tripadvisor-mcp/commit/77e86020e55bbe89a296c1e9f65b19ac66ff71d5))


### Documentation

* address PR [#3](https://github.com/chrischall/tripadvisor-mcp/issues/3) auto-review nits; assert defaultSubdomain in test ([#5](https://github.com/chrischall/tripadvisor-mcp/issues/5)) ([8d689da](https://github.com/chrischall/tripadvisor-mcp/commit/8d689dac874f24cb1aaa62fd01eb2dc35283a11a)), closes [#4](https://github.com/chrischall/tripadvisor-mcp/issues/4)
* record the probed key-free search dead-ends ([#9](https://github.com/chrischall/tripadvisor-mcp/issues/9)) ([9d1a64d](https://github.com/chrischall/tripadvisor-mcp/commit/9d1a64d42294e3b28435978071779cb33324933f))
