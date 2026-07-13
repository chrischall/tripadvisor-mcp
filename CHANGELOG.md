# Changelog

## [0.3.0](https://github.com/chrischall/tripadvisor-mcp/compare/v0.2.1...v0.3.0) (2026-07-13)


### Features

* **skill:** add tripadvisor api access skill ([#25](https://github.com/chrischall/tripadvisor-mcp/issues/25)) ([cd3247a](https://github.com/chrischall/tripadvisor-mcp/commit/cd3247a977eccf60ec31f4a71b91f76b66ac721e))


### Refactor

* **skill:** move root SKILL.md into skills/, point plugin.json at ./skills/ ([#28](https://github.com/chrischall/tripadvisor-mcp/issues/28)) ([36a2295](https://github.com/chrischall/tripadvisor-mcp/commit/36a2295a5d68afe310e9d584189f2d62b186c8f5))


### Documentation

* **skill:** add search_type param to terra-endpoints §1 ([#30](https://github.com/chrischall/tripadvisor-mcp/issues/30)) ([454fe18](https://github.com/chrischall/tripadvisor-mcp/commit/454fe187945b14922ca44cfe0d3f1a1af8cdcfae)), closes [#26](https://github.com/chrischall/tripadvisor-mcp/issues/26)

## [0.2.1](https://github.com/chrischall/tripadvisor-mcp/compare/v0.2.0...v0.2.1) (2026-07-07)


### Bug Fixes

* bump @chrischall/mcp-utils to ^0.12.0 ([#20](https://github.com/chrischall/tripadvisor-mcp/issues/20)) ([f30f4fb](https://github.com/chrischall/tripadvisor-mcp/commit/f30f4fb85b8ed9da7f04e82a1d5036d2b5d7c53c))


### Refactor

* adopt mcp-utils createResponseCache (+ parseRetryAfterMs) ([#18](https://github.com/chrischall/tripadvisor-mcp/issues/18)) ([d30513f](https://github.com/chrischall/tripadvisor-mcp/commit/d30513f67ffd4d28a062dc488faa49a92e827afd))


### Documentation

* document first-party dependency-bump label exception ([#21](https://github.com/chrischall/tripadvisor-mcp/issues/21)) ([3029fcf](https://github.com/chrischall/tripadvisor-mcp/commit/3029fcff1cb24b497ed158170f0fe752f59d8b8a))

## [0.2.0](https://github.com/chrischall/tripadvisor-mcp/compare/v0.1.0...v0.2.0) (2026-07-05)


### Features

* batch multi-get, opt-in compact projection, nearby center modes ([#13](https://github.com/chrischall/tripadvisor-mcp/issues/13)) ([bd4167b](https://github.com/chrischall/tripadvisor-mcp/commit/bd4167bac1d135333f244b418c9aa3f978cafc7d))


### Bug Fixes

* reject partial nearby center params before they bleed into the URL ([#16](https://github.com/chrischall/tripadvisor-mcp/issues/16)) ([517f6e6](https://github.com/chrischall/tripadvisor-mcp/commit/517f6e6b2652df3533a8c33c9aba146684a13ec3)), closes [#14](https://github.com/chrischall/tripadvisor-mcp/issues/14)

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
