# Changelog

## [0.4.4](https://github.com/DamianFlynn/cgate-mqtt/compare/v0.4.3...v0.4.4) (2026-04-02)


### Bug Fixes

* **#17:** CatalogNumber may be missing on some XML units ([9cea454](https://github.com/DamianFlynn/cgate-mqtt/commit/9cea454f27217e3fabb3856498074100a5ffb4ee))
* **#24:** cbusEventChannel missing line-buffering ([9cea454](https://github.com/DamianFlynn/cgate-mqtt/commit/9cea454f27217e3fabb3856498074100a5ffb4ee))
* **#24:** cbusEventChannel missing line-buffering ([9cea454](https://github.com/DamianFlynn/cgate-mqtt/commit/9cea454f27217e3fabb3856498074100a5ffb4ee))
* **#25:** started() re-fires one-time init on every reconnect ([9cea454](https://github.com/DamianFlynn/cgate-mqtt/commit/9cea454f27217e3fabb3856498074100a5ffb4ee))
* use path-prefixed release-please outputs for src package ([#53](https://github.com/DamianFlynn/cgate-mqtt/issues/53)) ([9cea454](https://github.com/DamianFlynn/cgate-mqtt/commit/9cea454f27217e3fabb3856498074100a5ffb4ee))

## [0.4.3](https://github.com/DamianFlynn/cgate-mqtt/compare/v0.4.2...v0.4.3) (2026-04-02)


### Bug Fixes

* **#17:** CatalogNumber may be missing on some XML units ([efdcbeb](https://github.com/DamianFlynn/cgate-mqtt/commit/efdcbeb51ae815de2cc20373ad411d41f78c4cbd))
* **#24:** cbusEventChannel missing line-buffering ([efdcbeb](https://github.com/DamianFlynn/cgate-mqtt/commit/efdcbeb51ae815de2cc20373ad411d41f78c4cbd))
* **#24:** cbusEventChannel missing line-buffering ([efdcbeb](https://github.com/DamianFlynn/cgate-mqtt/commit/efdcbeb51ae815de2cc20373ad411d41f78c4cbd))
* **#25:** started() re-fires one-time init on every reconnect ([efdcbeb](https://github.com/DamianFlynn/cgate-mqtt/commit/efdcbeb51ae815de2cc20373ad411d41f78c4cbd))
* cbusEventChannel line-buffering, hasStarted guard, CatalogNumber optional chain ([#51](https://github.com/DamianFlynn/cgate-mqtt/issues/51)) ([efdcbeb](https://github.com/DamianFlynn/cgate-mqtt/commit/efdcbeb51ae815de2cc20373ad411d41f78c4cbd))

## [0.4.2](https://github.com/DamianFlynn/cgate-mqtt/compare/v0.4.1...v0.4.2) (2026-04-02)


### Bug Fixes

* default mqttMessage.publish opts to settings.retainreads ([#45](https://github.com/DamianFlynn/cgate-mqtt/issues/45)) ([392d78f](https://github.com/DamianFlynn/cgate-mqtt/commit/392d78f31a7a46da4a409815116430f60a83c866))
* guard against short MQTT topics in handleMqttMessage ([#43](https://github.com/DamianFlynn/cgate-mqtt/issues/43)) ([3799b5e](https://github.com/DamianFlynn/cgate-mqtt/commit/3799b5e76c3d66699238ad306662e4f75930d6b1)), closes [#22](https://github.com/DamianFlynn/cgate-mqtt/issues/22)
* honour options and callback in mqttMessage.publish ([#44](https://github.com/DamianFlynn/cgate-mqtt/issues/44)) ([f178b83](https://github.com/DamianFlynn/cgate-mqtt/commit/f178b838dcc88c76acd0a8d5cdd010c836510e93)), closes [#23](https://github.com/DamianFlynn/cgate-mqtt/issues/23)
* housekeeping — reserved word, dead import, pinned base image, version string, expose port ([#46](https://github.com/DamianFlynn/cgate-mqtt/issues/46)) ([f4737fa](https://github.com/DamianFlynn/cgate-mqtt/commit/f4737fa49baeddf5347d6a073930c7c5ed3ca194))
* wrap xml2js.parseString callback ([#47](https://github.com/DamianFlynn/cgate-mqtt/issues/47)) ([a014854](https://github.com/DamianFlynn/cgate-mqtt/commit/a0148544eb5b0c25306fe593f19d9a28b6701f3d))

## [0.4.1](https://github.com/DamianFlynn/cgate-mqtt/compare/cgate-mqtt-v0.4.0...cgate-mqtt-v0.4.1) (2026-04-02)


### Features

* add banner and version ([#11](https://github.com/DamianFlynn/cgate-mqtt/issues/11)) ([319829a](https://github.com/DamianFlynn/cgate-mqtt/commit/319829a9d78dc64abb37afbd6c48c2bf21def86b))
* add eDLT (Electronic Dynamic Labelling) support ([#18](https://github.com/DamianFlynn/cgate-mqtt/issues/18)) ([d66df8c](https://github.com/DamianFlynn/cgate-mqtt/commit/d66df8c83ac5f00178043f89417a26dd9a9bb667)), closes [#12](https://github.com/DamianFlynn/cgate-mqtt/issues/12)
* renamed queue and trigger app ([4c22a79](https://github.com/DamianFlynn/cgate-mqtt/commit/4c22a7991267ed9391f65d2ebb67c478657384a6))
* restructure ([3425716](https://github.com/DamianFlynn/cgate-mqtt/commit/3425716d2c3efdafc6f41875f39f04a07a87f28b))


### Bug Fixes

* address Copilot review comments on eDLT ([af4edb3](https://github.com/DamianFlynn/cgate-mqtt/commit/af4edb33d385e24fa4d76a369c0235e121fd8f38))
* clean up eDLT implementation post-merge ([a8c0996](https://github.com/DamianFlynn/cgate-mqtt/commit/a8c09964098802c57923c2e2838afc1725ce82d4))
* correct label event parsing for group address and display label text ([9eb8e83](https://github.com/DamianFlynn/cgate-mqtt/commit/9eb8e8351b2ff44ba6ea6eea93a58c68bba350f2))
* docs and small code ([#9](https://github.com/DamianFlynn/cgate-mqtt/issues/9)) ([48a89dc](https://github.com/DamianFlynn/cgate-mqtt/commit/48a89dca2883266840ea60dc880c0df3c57294ed))
* MQTT reconnection ([8b371d8](https://github.com/DamianFlynn/cgate-mqtt/commit/8b371d8ccb156c7510c7c79f92daaf6a239cdc0e))
* prevent crash on malformed C-Bus trigger events ([#16](https://github.com/DamianFlynn/cgate-mqtt/issues/16)) ([d278903](https://github.com/DamianFlynn/cgate-mqtt/commit/d2789036753590cc44bcbc5e6ab9604e6652c85a))
* replace deprecated object_id with default_entity_id for HA 2026.04 ([341a4ec](https://github.com/DamianFlynn/cgate-mqtt/commit/341a4eccc54e0bd12d45b00128db0a222d15a934)), closes [#19](https://github.com/DamianFlynn/cgate-mqtt/issues/19)
* store getallperiod setInterval handle to prevent timer leak on reconnect ([#36](https://github.com/DamianFlynn/cgate-mqtt/issues/36)) ([d79edce](https://github.com/DamianFlynn/cgate-mqtt/commit/d79edcecb3eaaacb3c7f47aa1a15c212847f97d6))
