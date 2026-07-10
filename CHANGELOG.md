# [1.9.0](https://github.com/ExaDev/graphle/compare/v1.8.0...v1.9.0) (2026-07-10)


### Features

* **domain:** add capped undo/redo history stack helper ([9df40b6](https://github.com/ExaDev/graphle/commit/9df40b6dd25a9747b6dc14be159c949168af3952))
* **schema:** add GraphRevision schema for point-in-time graph checkpoints ([d5a5054](https://github.com/ExaDev/graphle/commit/d5a50541840b25d75fdb7150f1f7a3d290a21189))
* **schema:** add LinkedRemoteSource discriminated union ([abe3c38](https://github.com/ExaDev/graphle/commit/abe3c385f78bdc6b900bf7e9705b19918e6fee3a))
* **schema:** link stored graphs to an optional remote source ([288ebfb](https://github.com/ExaDev/graphle/commit/288ebfbcf091d753646306a4423c70ad3872dd89))
* **sharing:** add gist history read and write API calls ([8c538f3](https://github.com/ExaDev/graphle/commit/8c538f3c31bb876587643ec934f12455598cc1ae))
* **storage:** add Dexie-backed RevisionStore adapter ([31bfd12](https://github.com/ExaDev/graphle/commit/31bfd12d50ec3aae096ec098bcf60d80fd4d56bd))
* **storage:** add revisions table to Dexie schema ([f7cf997](https://github.com/ExaDev/graphle/commit/f7cf997ffdf3f0492ab6e15b94459af6e03ee470))
* **storage:** add RevisionStore contract ([e62e77c](https://github.com/ExaDev/graphle/commit/e62e77cc5b80cdcd23358c337792e5523445ab96))
* **ui:** add ephemeral undo/redo stacks to the graph store ([babde6a](https://github.com/ExaDev/graphle/commit/babde6ac7b6f5486f898fc847abc6fecbb8f725d))
* **ui:** add HistoryDrawer panel for browsing and restoring graph revisions ([9e61109](https://github.com/ExaDev/graphle/commit/9e61109e83066b26b59d5e259a7e68ad82b417f6))
* **ui:** auto-sync a linked graph to its gist and detect drift ([63eb4b6](https://github.com/ExaDev/graphle/commit/63eb4b6a5143874259247801af51d5554609ab74))
* **ui:** autosave dirty saved graphs and append revision history ([80f6eb9](https://github.com/ExaDev/graphle/commit/80f6eb9fe4d85e7d78e93682c50795c75de36201))
* **ui:** wire autosave/gist-sync hooks, add gist push/pull and conflict UI ([2772c6e](https://github.com/ExaDev/graphle/commit/2772c6eeffd9ea4dde13effaca4d91fe6c262d4b))
* **ui:** wire mod+Z/mod+shift+Z undo-redo hotkeys and a history drawer toggle ([6b0fb25](https://github.com/ExaDev/graphle/commit/6b0fb25cb8f0877f7b66789579de5f1f8b616784))

# [1.8.0](https://github.com/ExaDev/graphle/compare/v1.7.0...v1.8.0) (2026-07-10)


### Bug Fixes

* **github:** classify GraphQL NOT_FOUND errors and share message formatting ([58a32fd](https://github.com/ExaDev/graphle/commit/58a32fd10f1710ecb88ac4b33281ce89f8c1518a))


### Features

* **github:** load a full project document from a parsed URL ([509c346](https://github.com/ExaDev/graphle/commit/509c346de9fd74658a2f6fc7fe49cb8bdaf793d4))
* **github:** look up an org or user project by number ([993530c](https://github.com/ExaDev/graphle/commit/993530c283cd1f88b13a7328b20dd5a8645c56b0))
* **github:** parse GitHub Projects v2 URLs ([e8fe7ef](https://github.com/ExaDev/graphle/commit/e8fe7efd59cf556c36989d804908b472777c70c3))
* **ui:** load GitHub Projects URLs from the address bar and graphs drawer ([3a18701](https://github.com/ExaDev/graphle/commit/3a1870197495f3879e8fc7d04ba91b258211fdbf))
* **ui:** resume a pending GitHub action after PAT validation, link prefilled token scopes ([0ecda58](https://github.com/ExaDev/graphle/commit/0ecda586b123cf139790a7739f9be6f306a6e600))

# [1.7.0](https://github.com/ExaDev/graphle/compare/v1.6.0...v1.7.0) (2026-07-10)


### Bug Fixes

* **sharing:** reuse shared JSON-shape detection for file import ([c48c5ef](https://github.com/ExaDev/graphle/commit/c48c5efacc3f91ecc1ed8ee7365488dfb0aec346))


### Features

* replace fixed edge relation enum with dynamic portable edge types ([c37803d](https://github.com/ExaDev/graphle/commit/c37803d68a4eb5523dbbac970af3e55fc103f753))
* **sharing:** disambiguate gist URLs that name multiple graph files ([5dfe7e6](https://github.com/ExaDev/graphle/commit/5dfe7e628aa0b8237ca574ac5ed557fcdb08016e))
* **sharing:** load a graph document from a remote URL ([b89c89d](https://github.com/ExaDev/graphle/commit/b89c89de2bb974fa4252391ed7ef232a5d30f796))
* **ui:** wire remote URL and gist loading into the app ([975e8c5](https://github.com/ExaDev/graphle/commit/975e8c5393afba18040d523b06c402dad93c21bd))

# [1.6.0](https://github.com/ExaDev/graphle/compare/v1.5.0...v1.6.0) (2026-07-10)


### Features

* **ci:** add native v8 test coverage ([2d4006d](https://github.com/ExaDev/graphle/commit/2d4006d388f56d0bde3aefcdbbb896f771feadac))

# [1.5.0](https://github.com/ExaDev/graphle/compare/v1.4.0...v1.5.0) (2026-07-10)


### Features

* **ui:** add right-click context menus to the canvas ([f18ada4](https://github.com/ExaDev/graphle/commit/f18ada4630a7881e7d69bde9e47861647f80eed8))

# [1.4.0](https://github.com/ExaDev/graphle/compare/v1.3.0...v1.4.0) (2026-07-10)


### Features

* replace hardcoded node kinds with dynamic portable type system ([3b220b3](https://github.com/ExaDev/graphle/commit/3b220b36e67fde10e54a091445e0ab166d319970))

# [1.3.0](https://github.com/ExaDev/graphle/compare/v1.2.1...v1.3.0) (2026-07-10)


### Features

* **sharing:** add json canvas import export and url-read support ([d87c9fc](https://github.com/ExaDev/graphle/commit/d87c9fcf5dd5609bd5c293585bedfaf68bcbef93))

## [1.2.1](https://github.com/ExaDev/graphle/compare/v1.2.0...v1.2.1) (2026-07-09)


### Bug Fixes

* **ui:** theme the react flow controls and minimap ([337482b](https://github.com/ExaDev/graphle/commit/337482bc6f9b54d31887082f04d7a2f3fd5eef03))

# [1.2.0](https://github.com/ExaDev/graphle/compare/v1.1.0...v1.2.0) (2026-07-09)


### Features

* **ui:** add system light dark theme cycling ([c657235](https://github.com/ExaDev/graphle/commit/c657235d12bb08807324f043d290b0abc21ffcd7))

# [1.1.0](https://github.com/ExaDev/graphle/compare/v1.0.0...v1.1.0) (2026-07-09)


### Bug Fixes

* address final-review findings across the app ([968b594](https://github.com/ExaDev/graphle/commit/968b59417b3bccd4e37b503ebd74d0752c14a7dd))
* **ui:** give the react flow canvas a definite height ([2f97a33](https://github.com/ExaDev/graphle/commit/2f97a3329d3566f590a57d3072d438d2d8feba5a))


### Features

* **domain:** add removeEdge op and clear edge label on empty ([4d79fd5](https://github.com/ExaDev/graphle/commit/4d79fd5e96d04050dabca02748f9d8083f6ce101))
* **github:** add graphql client materialisation and node expansion ([5f6a40e](https://github.com/ExaDev/graphle/commit/5f6a40edeee1c8ba39d1b1742a99167227146554))
* **ui:** add editing panels graph persistence and app shell ([8fa9895](https://github.com/ExaDev/graphle/commit/8fa989556cdf11cb2f512219b5d7b57872206879))
* **ui:** add github panel and node expansion ([b0fe8b9](https://github.com/ExaDev/graphle/commit/b0fe8b98be7cfae11e5db6e226b885688fa4cddf))
* **ui:** add graph store flow canvas and live url sync ([32f7740](https://github.com/ExaDev/graphle/commit/32f774077a9fa206f708319cb075fcc4be7fc844))

# 1.0.0 (2026-07-08)


### Features

* **domain:** add graph operations reducer identity merge and layout ([2b355e6](https://github.com/ExaDev/graphle/commit/2b355e654912210cd453a2d88889419387c5c213))
* **schema:** add graph document node and edge schemas ([930c1c8](https://github.com/ExaDev/graphle/commit/930c1c8c57a5bc13292d3c28b3f2f9e75c026d1b))
* **sharing:** add versioned url codec and json import export ([bc605c8](https://github.com/ExaDev/graphle/commit/bc605c874baf9fe3a9326a1a89daec575106f7ca))
* **storage:** add storage contracts and dexie adapters ([a79000e](https://github.com/ExaDev/graphle/commit/a79000ee51cea640d7023d6257f076642a4865eb))
