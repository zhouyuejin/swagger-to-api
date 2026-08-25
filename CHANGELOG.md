# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> 历史版本 (≤ 0.4.2) 由维护者手动维护。从 v0.5.0 起改用 [release-please](https://github.com/googleapis/release-please) 自动生成。

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
