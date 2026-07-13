# [1.31.0](https://github.com/ExaDev/graphle/compare/v1.30.0...v1.31.0) (2026-07-13)


### Features

* **github:** add assignee/author/involves fields to pull-request filters ([ae5ca33](https://github.com/ExaDev/graphle/commit/ae5ca337ad4afb20c74c9a101d3a7fb7c7f15d13))
* **github:** route filtered PR-list loads through the search API ([bd842a7](https://github.com/ExaDev/graphle/commit/bd842a7542c9275fda83b34a67716a824aa37e4a))
* **ui:** add assignee/author/involves inputs to the PR filter form ([02b0f9e](https://github.com/ExaDev/graphle/commit/02b0f9e73717375ccdb22e2a5a57c4d32bf15d06))

# [1.30.0](https://github.com/ExaDev/graphle/compare/v1.29.0...v1.30.0) (2026-07-13)


### Bug Fixes

* **ui:** compute edge port assignment from rerouted subgraph endpoints ([6cff189](https://github.com/ExaDev/graphle/commit/6cff189bf24909956106c5e3a54026ee7da3e427))
* **ui:** render edge labels by passing labelX/labelY through FloatingEdge ([46311b2](https://github.com/ExaDev/graphle/commit/46311b2c9bbadc88fce681ae82c39f16586643e6))


### Features

* **domain:** add pure edge-to-side port assignment with same-direction crowding merge ([cd7935c](https://github.com/ExaDev/graphle/commit/cd7935ce41e22f9495e7347cbe6e5b20ebadf5b9))
* **ui:** render edges via dynamic floating connection points ([75aa465](https://github.com/ExaDev/graphle/commit/75aa4652aa47950eb57423519129466cbce45dca))
* **ui:** switch node handles to four floating connection points ([7d11bf8](https://github.com/ExaDev/graphle/commit/7d11bf8d9034f031e4eb38a9c3cfc5a96a56c76c))

# [1.29.0](https://github.com/ExaDev/graphle/compare/v1.28.0...v1.29.0) (2026-07-13)


### Bug Fixes

* **ui:** correct stale dagre references and shared-endpoint crossing bug ([667b468](https://github.com/ExaDev/graphle/commit/667b468f388988424240474123dc2c03bb5e6f70))


### Features

* **ui:** orient node handles to the last layout direction ([91d6b0e](https://github.com/ExaDev/graphle/commit/91d6b0e9e07991d0eba313834099d1f7ce9ecc07))
* **ui:** replace dagre with ELK layered layout tuned to reduce edge crossings ([6c75250](https://github.com/ExaDev/graphle/commit/6c752501bf2c508570afd361e45b9d2c50c1dd58))

# [1.28.0](https://github.com/ExaDev/graphle/compare/v1.27.0...v1.28.0) (2026-07-12)


### Features

* **ui:** add mod+K command palette to jump to a node ([c0faa4b](https://github.com/ExaDev/graphle/commit/c0faa4b5f9209aca6aab0d260389ed92f847149c))

# [1.27.0](https://github.com/ExaDev/graphle/compare/v1.26.0...v1.27.0) (2026-07-12)


### Bug Fixes

* **flow:** use React Flow's hook-bound getNodesBounds for PNG/SVG export ([cf1cebd](https://github.com/ExaDev/graphle/commit/cf1cebd77d33c2e540bf9c56700205a16990e728))


### Features

* **flow:** add PNG/SVG canvas snapshot export ([34d2a10](https://github.com/ExaDev/graphle/commit/34d2a109a953b108ee6341c79fea19e25539e50a))
* **sharing:** add CSV adjacency-list import ([a8b8614](https://github.com/ExaDev/graphle/commit/a8b861410a0927a460acc38e957d47579a40031f))
* **sharing:** add Graphviz DOT export ([83a9843](https://github.com/ExaDev/graphle/commit/83a98434a589d0c165ba7c115a65481e67c81efd))
* **sharing:** add Mermaid flowchart export ([7d4b847](https://github.com/ExaDev/graphle/commit/7d4b847232f3135fe07a33ed114354d4ac651c2e))
* **ui:** add CSV import to the Graphs drawer ([9265f93](https://github.com/ExaDev/graphle/commit/9265f932b515125060526ff03f5fc35dd86f8c29))
* **ui:** add unified Export menu to the header ([1d2d33e](https://github.com/ExaDev/graphle/commit/1d2d33e3155217ba95607119ede59e06e008e6e9))

# [1.26.0](https://github.com/ExaDev/graphle/compare/v1.25.0...v1.26.0) (2026-07-12)


### Features

* **domain:** add overwrite mode to applyDelta for refresh ([894dc25](https://github.com/ExaDev/graphle/commit/894dc257e010792610342ca86a9ff7b826fb9f45))
* **github:** stamp fetchedAt on expansion nodes, add silent/onExistingMatch options ([9457355](https://github.com/ExaDev/graphle/commit/9457355b959a523be5dc4feb3d81508ee347c47a))
* **github:** thread rate-limit budget into the graph store ([77d8820](https://github.com/ExaDev/graphle/commit/77d8820116eae6dba230860aebbd9c61edc1b90c))
* **schema:** add optional fetchedAt to GraphNode ([635d6c6](https://github.com/ExaDev/graphle/commit/635d6c6335e209e529ef044f40125dabf4f9a853))
* **ui:** add context-menu refresh for GitHub-sourced nodes ([e235bbb](https://github.com/ExaDev/graphle/commit/e235bbbc322e9d0fb4f1a6a8853bb5e58df0a37c))
* **ui:** add schema drift report drawer ([e7cce7c](https://github.com/ExaDev/graphle/commit/e7cce7cd5b06498959848238772d3f29e96acd5f))
* **ui:** bulk GitHub expand across a multi-selection ([9e45252](https://github.com/ExaDev/graphle/commit/9e45252fe3444312acb2030bf6683fdd3d764b38))
* **ui:** show a stale badge on ageing GitHub-sourced nodes ([2ec9d05](https://github.com/ExaDev/graphle/commit/2ec9d059005426b6d500946165e6adc9ed4bc381))
* **ui:** surface GitHub rate limit in the header, share state via the store ([f8acb1c](https://github.com/ExaDev/graphle/commit/f8acb1c763c70be549042f6a9934c69bc0614e6f))

# [1.25.0](https://github.com/ExaDev/graphle/compare/v1.24.0...v1.25.0) (2026-07-12)


### Bug Fixes

* **canvas:** resync the canvas when a non-drag position commit lands ([38c5032](https://github.com/ExaDev/graphle/commit/38c5032b4c03c9961fbf5522484ec7a9174e3eeb))
* **ui:** sync store selection back onto the canvas ([fb2b56c](https://github.com/ExaDev/graphle/commit/fb2b56c80927faafcacbb6eba2d71b748ca9ba23))


### Features

* **canvas:** add align and distribute to the multi-select context menu ([edf95a4](https://github.com/ExaDev/graphle/commit/edf95a456d33d9963704473c6b98ca14b9d8bd1d))
* **canvas:** add alt-drag to subtract from marquee selection ([ea4efb9](https://github.com/ExaDev/graphle/commit/ea4efb9d0003b3e07b8aa7dc8c415f57cb4a2b21))
* **canvas:** add select orphan nodes to pane context menu ([f2d0d74](https://github.com/ExaDev/graphle/commit/f2d0d7451d616c6082475257986be6512ab80bf4))
* **canvas:** add select-connected to the single-node context menu ([371a920](https://github.com/ExaDev/graphle/commit/371a920c635767a6adaac85c8e922eedb2623a93))
* **canvas:** add snap-to-grid toggle to the Controls panel ([a2eaf08](https://github.com/ExaDev/graphle/commit/a2eaf086266f38c0eb2c0c65a464feae09aad28a))
* **domain:** add alignNodes and distributeNodes helpers ([ad9e992](https://github.com/ExaDev/graphle/commit/ad9e9922dd1a451c11d5750be10b398b642d5cab))
* **domain:** add bidirectional edge-reachability BFS ([66e0648](https://github.com/ExaDev/graphle/commit/66e06486fa0cc21bb3e060c0e61be56b571a0cc2))
* **domain:** add schema drift detection ([cea341a](https://github.com/ExaDev/graphle/commit/cea341a3e2edd2f4850b01df2b0a9a70bc9aea45))

# [1.24.0](https://github.com/ExaDev/graphle/compare/v1.23.0...v1.24.0) (2026-07-12)


### Features

* **ui:** support duplicate and delete on multi-selected nodes ([fbe81b6](https://github.com/ExaDev/graphle/commit/fbe81b6d051c6dd9ffe9b6953e1de15b25816789))

# [1.23.0](https://github.com/ExaDev/graphle/compare/v1.22.0...v1.23.0) (2026-07-12)


### Features

* **ui:** add GitHub expand actions and select-all to the canvas ([cd2c515](https://github.com/ExaDev/graphle/commit/cd2c5157229509bac458d242c0b6bbb62fa406cc))

# [1.22.0](https://github.com/ExaDev/graphle/compare/v1.21.0...v1.22.0) (2026-07-12)


### Features

* **github:** replace stacked-PR edges with head/base branch nodes ([6f7faf8](https://github.com/ExaDev/graphle/commit/6f7faf8785e7a18eace4773e11888075aa95eeac))

# [1.21.0](https://github.com/ExaDev/graphle/compare/v1.20.1...v1.21.0) (2026-07-12)


### Features

* **ui:** show a build version/commit link in the header ([3c47a8a](https://github.com/ExaDev/graphle/commit/3c47a8ac2c03484805adf5e91da9db09aab0bb15))

## [1.20.1](https://github.com/ExaDev/graphle/compare/v1.20.0...v1.20.1) (2026-07-12)


### Bug Fixes

* **github:** auto-open the Add-token form when no tokens are stored ([606535c](https://github.com/ExaDev/graphle/commit/606535c3fa9d435ff822768bfef48977cef3c127))

# [1.20.0](https://github.com/ExaDev/graphle/compare/v1.19.2...v1.20.0) (2026-07-12)


### Features

* **github:** add multi-owner GitHub token schema and resolution ([1f42e8e](https://github.com/ExaDev/graphle/commit/1f42e8eabc8c0de7ba4d41dd355863a31670a219))
* **github:** support multiple stored GitHub tokens with auto-resolution ([b62ef2a](https://github.com/ExaDev/graphle/commit/b62ef2ae0a1f9df048a733cba1602b59588817cc))

## [1.19.2](https://github.com/ExaDev/graphle/compare/v1.19.1...v1.19.2) (2026-07-12)


### Bug Fixes

* **github:** scope searchAccounts integration coverage to fine-grained token ([0f79069](https://github.com/ExaDev/graphle/commit/0f7906940aa8d8ccdb66f0d10755c7e8e1b5f825))

## [1.19.1](https://github.com/ExaDev/graphle/compare/v1.19.0...v1.19.1) (2026-07-12)


### Bug Fixes

* **github:** run searchAccounts integration coverage against public tokens ([54440c0](https://github.com/ExaDev/graphle/commit/54440c08d7fd3d8d3f0d4683fe081b8e0b53a0fd))

# [1.19.0](https://github.com/ExaDev/graphle/compare/v1.18.0...v1.19.0) (2026-07-12)


### Bug Fixes

* **github:** parse GraphQL nullable name/description fields as explicit null ([d6d6a84](https://github.com/ExaDev/graphle/commit/d6d6a84018222fba1ee41e9bab844d54821015dc))


### Features

* **github:** add personal-account browsing and GitHub search methods ([01fa72e](https://github.com/ExaDev/graphle/commit/01fa72e4ddcbd0ccecc7c3c10e20804b5a97de18))
* **ui:** add a searchable GitHub resource browser to GitHubPanel ([9c368d0](https://github.com/ExaDev/graphle/commit/9c368d07458ceeec72e2eb2153e6ff4dae281696))

# [1.18.0](https://github.com/ExaDev/graphle/compare/v1.17.3...v1.18.0) (2026-07-12)


### Features

* **github:** show stacked pull request relationships ([0cd2746](https://github.com/ExaDev/graphle/commit/0cd2746b46b278a731ec377dd92be89a5362c5ae)), closes [#5](https://github.com/ExaDev/graphle/issues/5)

## [1.17.3](https://github.com/ExaDev/graphle/compare/v1.17.2...v1.17.3) (2026-07-11)


### Bug Fixes

* **github:** use IssueOrderField for pull request ordering ([e729b36](https://github.com/ExaDev/graphle/commit/e729b368a3b297545758f64e2b4a8e26271e9727))

## [1.17.2](https://github.com/ExaDev/graphle/compare/v1.17.1...v1.17.2) (2026-07-11)


### Bug Fixes

* **github:** query subIssues, not trackedIssues, for sub-issues ([72188e7](https://github.com/ExaDev/graphle/commit/72188e72fee5b9cb1ff0eebcc3d8d99dd7fbcca3))

## [1.17.1](https://github.com/ExaDev/graphle/compare/v1.17.0...v1.17.1) (2026-07-11)


### Bug Fixes

* **test:** rename GITHUB_ test PAT vars, fix empty-secret guard ([1ffafde](https://github.com/ExaDev/graphle/commit/1ffafdea0c84227c920d32a6dc320d62107a5455))

# [1.17.0](https://github.com/ExaDev/graphle/compare/v1.16.1...v1.17.0) (2026-07-11)


### Features

* **test:** add integration and e2e testing with a local .env ([f77b941](https://github.com/ExaDev/graphle/commit/f77b94171780d764a8f768edc34fed5922473bad))

## [1.16.1](https://github.com/ExaDev/graphle/compare/v1.16.0...v1.16.1) (2026-07-11)


### Bug Fixes

* **ui:** wrap PAT entry in a form so Enter submits it ([f52dabd](https://github.com/ExaDev/graphle/commit/f52dabddb26bd1048901d3bf71f42661e1023efb))

# [1.16.0](https://github.com/ExaDev/graphle/compare/v1.15.0...v1.16.0) (2026-07-11)


### Features

* **ui:** add deterministic auto-layout controls ([7fd6c85](https://github.com/ExaDev/graphle/commit/7fd6c85b15308b2de04e5cdd03c7c3f44e49e463))

# [1.15.0](https://github.com/ExaDev/graphle/compare/v1.14.1...v1.15.0) (2026-07-11)


### Features

* **github:** fetch and visualise issue blocking relationships ([6afcc2d](https://github.com/ExaDev/graphle/commit/6afcc2d007864d77edcd5f09c26986765013fecc))

## [1.14.1](https://github.com/ExaDev/graphle/compare/v1.14.0...v1.14.1) (2026-07-11)


### Bug Fixes

* **github:** nest issues by ownership, not project tracking ([496d0ba](https://github.com/ExaDev/graphle/commit/496d0ba2b0cf9828be6851c84a7b2e0452aeb438))

# [1.14.0](https://github.com/ExaDev/graphle/compare/v1.13.0...v1.14.0) (2026-07-11)


### Features

* **domain:** add hierarchy traversal and subgraph operations ([e8e7564](https://github.com/ExaDev/graphle/commit/e8e75640400dad4c6e3d333dab89fc5eb53a1b2d))
* **github:** fetch sub-issues and auto-nest every expansion's results ([8e2454b](https://github.com/ExaDev/graphle/commit/8e2454bc8df839e2b0323325025788cbbb85d333))
* **schema:** add subgraph fields and group built-in node type ([a081b53](https://github.com/ExaDev/graphle/commit/a081b53cc90871d1c0dda791c7178e5ef31694a9))
* **ui:** render collapsed subgraphs with group/collapse/ungroup actions ([195e069](https://github.com/ExaDev/graphle/commit/195e069a6b3c8636c4e1de9517ad57acae2431dd))

# [1.13.0](https://github.com/ExaDev/graphle/compare/v1.12.1...v1.13.0) (2026-07-11)


### Features

* **github:** editable state/sort/label filters for issues and PRs ([0f84808](https://github.com/ExaDev/graphle/commit/0f848083fb9b9ac1bf8918b9c52a7bece58377cf))

## [1.12.1](https://github.com/ExaDev/graphle/compare/v1.12.0...v1.12.1) (2026-07-11)


### Bug Fixes

* **github:** normalise issue/PR state from GitHub's upper-case enums ([07bed6e](https://github.com/ExaDev/graphle/commit/07bed6edea9de9ba6e4c9dc6b2539dd0e36ed3d6))

# [1.12.0](https://github.com/ExaDev/graphle/compare/v1.11.0...v1.12.0) (2026-07-11)


### Bug Fixes

* **github:** dedupe repo-list loaders, add missing test, simplify URL wiring ([b495868](https://github.com/ExaDev/graphle/commit/b495868b23f8578bbde84154de271486b8380d57))


### Features

* **github:** add a repo issues/pull-requests list URL loader ([a4c87dc](https://github.com/ExaDev/graphle/commit/a4c87dc0fbdfb78c4398d51b38566654ea511ac8))
* **github:** add single-repo metadata fetch to GraphQL client ([b12b386](https://github.com/ExaDev/graphle/commit/b12b3864aa635f4270eaa9a09a717a1aea8b5aea))
* **github:** list a repo's pull requests via the GraphQL client ([ba28a8a](https://github.com/ExaDev/graphle/commit/ba28a8a7a958e119a0c5e82eaa2dceb7aa1db9f4))
* **github:** materialise pull requests and expand them from a repo node ([91c0594](https://github.com/ExaDev/graphle/commit/91c059425d634e7741bc09458fb073c8f81d999c))
* **github:** parse repo issues and pull-requests list URLs ([d8d73df](https://github.com/ExaDev/graphle/commit/d8d73df2e3e54064c957e9b3024c31edfc1ff2bf))
* **schema:** add a pull-request built-in node type ([1fa4e8e](https://github.com/ExaDev/graphle/commit/1fa4e8e6e1486b2cfbc86d385cec0f2b3c6eaee3))
* **ui:** load GitHub repo issues/pull-requests list URLs ([74321cf](https://github.com/ExaDev/graphle/commit/74321cf6988066e7420792ef0478278de346c915))

# [1.11.0](https://github.com/ExaDev/graphle/compare/v1.10.0...v1.11.0) (2026-07-10)


### Features

* **domain:** extract type-name collision checks ([f964071](https://github.com/ExaDev/graphle/commit/f964071b11640ce9dde6afd2468851d380f28a1e))
* **schema:** add type library document and its storage schema ([2300393](https://github.com/ExaDev/graphle/commit/23003933461e622689fb843a435b4f9976393227))
* **sharing:** add JSON serialisation for type library documents ([a824d51](https://github.com/ExaDev/graphle/commit/a824d51bf8a2375787c0ef7ff32b5a8a0a91c59c))
* **sharing:** add revision fetchers for synced type libraries ([0ee6aae](https://github.com/ExaDev/graphle/commit/0ee6aaecda5aead28ddf0559561e1b285a722896))
* **storage:** add type library store ([49fe34d](https://github.com/ExaDev/graphle/commit/49fe34dc49e63037f97f75eaa49a10bf606a181d))
* **ui:** add modal for copying types from the library into a graph ([b00138a](https://github.com/ExaDev/graphle/commit/b00138a826f58c99f2d37bcee2a4881a242b8206))
* **ui:** add TypesDrawer combining type management and library sync ([1115764](https://github.com/ExaDev/graphle/commit/1115764ca1766cb1091f57c4b065fddad4a0acca))
* **ui:** add updateType and updateEdgeType store actions ([394a81b](https://github.com/ExaDev/graphle/commit/394a81b010bbb855d1af2457091bfc9910594905))
* **ui:** auto-sync the type library on load and tab focus ([9ccad27](https://github.com/ExaDev/graphle/commit/9ccad27a4c4f394e8acdec9aa5ef836ad4ae433a))
* **ui:** mount type library sync and manage-types drawer in AppShell ([0b98dde](https://github.com/ExaDev/graphle/commit/0b98ddece7623c8bdf1458cafacd47bb2ef5371d))
* **ui:** support editing existing node and edge types ([db22a6c](https://github.com/ExaDev/graphle/commit/db22a6ce9f2eb505745c27f966dfd3e4fb512c72))

# [1.10.0](https://github.com/ExaDev/graphle/compare/v1.9.0...v1.10.0) (2026-07-10)


### Features

* **github:** request write access to repository contents ([6402113](https://github.com/ExaDev/graphle/commit/640211365c517e761d1f59fa5b1bf65e610256d6))
* **sharing:** parse GitHub repo file URLs ([470b08a](https://github.com/ExaDev/graphle/commit/470b08a7f309eaa7d8480823425a5bf2df75ebd6))
* **sharing:** read, list history of, and write a GitHub repo file ([ed049d7](https://github.com/ExaDev/graphle/commit/ed049d706093fb8821ab253728cca4041d4c3a87))
* **ui:** auto-sync a linked graph to its GitHub repo file ([f6f174f](https://github.com/ExaDev/graphle/commit/f6f174f66d39f9ead7034ad8f53db1838d146af0))
* **ui:** load, sync, and browse history for a linked GitHub repo file ([4b447c8](https://github.com/ExaDev/graphle/commit/4b447c81249ca9c05a55b538f9a6413706aa004a))

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
