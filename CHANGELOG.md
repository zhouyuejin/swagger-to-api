# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> 历史版本 (≤ 0.4.2) 由维护者手动维护。从 v0.5.0 起改用 [release-please](https://github.com/googleapis/release-please) 自动生成。

## [0.6.0](https://github.com/zhouyuejin/swagger-to-api/compare/swagger-to-api-v0.5.0...swagger-to-api-v0.6.0) (2026-08-25)


### Features

* CLI 新增 --check 模式（CI 检测 swagger 漂移） ([535cdac](https://github.com/zhouyuejin/swagger-to-api/commit/535cdac77717daad6edc450cccf5834bdaf44b3e))
* initial release ([c850f18](https://github.com/zhouyuejin/swagger-to-api/commit/c850f18036dd7c61a26d9cc1153d4cf65c8672d3))
* **v0.2.0:** P0 修复 — required 字段 / 循环引用 / runtime 安全 / provenance ([fd3121d](https://github.com/zhouyuejin/swagger-to-api/commit/fd3121de2be3d81a49a5b76fca2c39e5d9c1f4f6))
* **v0.3.0:** P1 — enum / format / CI matrix test ([7fa3f24](https://github.com/zhouyuejin/swagger-to-api/commit/7fa3f24292d73e1cad8c943d334a73d1816abd3a))
* **v0.4.0:** OpenAPI 3.x 支持 ([4418db4](https://github.com/zhouyuejin/swagger-to-api/commit/4418db4d77e9aac55f23dde1c7de458ed3e8185c))


### Bug Fixes

* **ci:** publish job 也按 ci → build → test 顺序（之前漏了） ([26f3afa](https://github.com/zhouyuejin/swagger-to-api/commit/26f3afad7cd8ff05d66bb1ebaceba4f91d0e4841))
* **ci:** publish job 接受 release-please 默认的 swagger-to-api-v* tag 格式 ([82cc1e6](https://github.com/zhouyuejin/swagger-to-api/commit/82cc1e6a89d23282ecd012814c8d45d5abfb7949))
* **ci:** test 在 build 之后 + 简化 release-please config ([081386d](https://github.com/zhouyuejin/swagger-to-api/commit/081386d200e1a2861b0d86b1eac622cb3e80a733))
* **release:** 移除 changelogPath 配置 ([3fb294d](https://github.com/zhouyuejin/swagger-to-api/commit/3fb294d7c589512306676767354d2cc25b11a678))
* rename scope to [@zhouyuejin1995](https://github.com/zhouyuejin1995) to match npm username, bump 0.1.1 ([7d5a883](https://github.com/zhouyuejin/swagger-to-api/commit/7d5a883357b49119ed5a4f315c3d316a1793a421))
* **test:** cli-check 测试自给自足（跑前先 build） ([01de631](https://github.com/zhouyuejin/swagger-to-api/commit/01de6312c45024023c12425fb8c4193d1a95607a))
* **v0.4.1:** 路径/查询参数 type 从 schema 平铺到 param 一级 ([b214e6f](https://github.com/zhouyuejin/swagger-to-api/commit/b214e6fc4337d793401787ebe217abc357811c5a))

## [0.5.0](https://github.com/zhouyuejin/swagger-to-api/compare/swagger-to-api-v0.4.2...swagger-to-api-v0.5.0) (2026-08-25)


### Features

* CLI 新增 --check 模式（CI 检测 swagger 漂移） ([535cdac](https://github.com/zhouyuejin/swagger-to-api/commit/535cdac77717daad6edc450cccf5834bdaf44b3e))
* initial release ([c850f18](https://github.com/zhouyuejin/swagger-to-api/commit/c850f18036dd7c61a26d9cc1153d4cf65c8672d3))
* **v0.2.0:** P0 修复 — required 字段 / 循环引用 / runtime 安全 / provenance ([fd3121d](https://github.com/zhouyuejin/swagger-to-api/commit/fd3121de2be3d81a49a5b76fca2c39e5d9c1f4f6))
* **v0.3.0:** P1 — enum / format / CI matrix test ([7fa3f24](https://github.com/zhouyuejin/swagger-to-api/commit/7fa3f24292d73e1cad8c943d334a73d1816abd3a))
* **v0.4.0:** OpenAPI 3.x 支持 ([4418db4](https://github.com/zhouyuejin/swagger-to-api/commit/4418db4d77e9aac55f23dde1c7de458ed3e8185c))


### Bug Fixes

* **ci:** test 在 build 之后 + 简化 release-please config ([081386d](https://github.com/zhouyuejin/swagger-to-api/commit/081386d200e1a2861b0d86b1eac622cb3e80a733))
* rename scope to [@zhouyuejin1995](https://github.com/zhouyuejin1995) to match npm username, bump 0.1.1 ([7d5a883](https://github.com/zhouyuejin/swagger-to-api/commit/7d5a883357b49119ed5a4f315c3d316a1793a421))
* **v0.4.1:** 路径/查询参数 type 从 schema 平铺到 param 一级 ([b214e6f](https://github.com/zhouyuejin/swagger-to-api/commit/b214e6fc4337d793401787ebe217abc357811c5a))

## [0.4.2] - 2026-08-25

### Tests
- 新增 `_stress-helper.ts` 工厂：构造 100+ 模型 / 30+ 接口的 swagger
- 新增 `stress.test.ts`：10 个 case（性能 / 结构 / 类型 / 跨模块冲突）
- 新增 `edge-cases.test.ts`：13 个 case（空 / 嵌套 / 缺省值 / 冲突兜底）
- 测试总数：**60 passed**（8 文件）

### Bug Fixes
- `parser.ts`：**direct `$ref` 返回类型**不再被错误当成响应包装。之前后端 swagger 返回值不带 `响应结果«»` 包装时返回 `void`，业务代码拿到空类型
- `parser.ts`：**operationId 缺省**时用 `method + urlPath` 兜底，不再产生空函数名

## [0.4.1] - 2026-08-25

### Bug Fixes
- OAS3 路径/查询参数：把 `schema.type` 平铺到 `param.type` 一级。修复后 `getUserById(id: number)` 而不是 `id: any`

## [0.4.0] - 2026-08-25

### Features
- **OpenAPI 3.x 支持**：新增 `src/core/openapi3.ts`，自动检测 `openapi: "3.x.x"` 并归一化成 Swagger 2.0 形态走老路径
  - `components.schemas` → `definitions`
  - `$ref: #/components/schemas/X` → `$ref: #/definitions/X`
  - `requestBody` (application/json) → `parameters[in=body]`
  - `requestBody` (multipart/form-data) → 单个 body schema
  - `responses[200].content[mt].schema` → `responses[200].schema`

## [0.3.0] - 2026-08-25

### Features
- **enum 字段支持**：顶层 enum definition 生成字面量联合类型（如 `OrderStatus = 'PENDING' \| 'ACTIVE' \| 'CLOSED'`）；内联 enum 生成内联字面量
- **format 字段支持**：`date-time` / `int64` / `binary` 等加 JSDoc 提示；`binary` 映射成 `Blob`
- **CI 矩阵测试**：workflow 拆成 test + publish 两 job，Node 18/20/22 三版本并行

## [0.2.0] - 2026-08-25

### Features
- **required 字段支持**：`definitions.required` 数组里的字段在生成代码中不加 `?:`，业务代码可静态强制必填
- **循环引用防护**：`resolveType` 加 `seenRefs` 栈，自指 / 互指不再栈溢出
- **runtime 安全**：`runtime.ts` 默认 30s 超时 + AbortSignal 支持 + 结构化 `ApiError`（含 status / body / url）

## [0.1.1] - 2026-08-25

### Features
- 初版发布
- Swagger 2.0 → TypeScript API 客户端代码生成器
- CLI + 程序化 API
- 命名策略接口（内置 `PinyinNamingStrategy`）
- 冲突三级兜底（方法前缀 → URL 末段 → 数字后缀）
- 跨模块函数名冲突在顶层 `index.ts` 用 namespace alias 消歧
- runtime 客户端的导入路径与 HTTP 方法名都可配置
- 默认 `runtime.ts` 模板（已存在则不覆盖）
