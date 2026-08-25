# @zhouyuejin1995/swagger-to-api

> Swagger 2.0 / OpenAPI 3.0 → TypeScript API 客户端代码生成器。拉一份 swagger 文档（URL 或本地 JSON），在项目里生成强类型的请求函数与 DTO。

业务方拿到的是「带类型的 service 函数 + DTO」，运行时调用由你控制（fetch / axios / 自研封装都行）。生成的代码只是 `http.<method>` 的薄包装。

## 特性

- 🚀 **一行命令**：`npx swagger-to-api -i <swagger> -o ./src/api`
- 🧩 **命名策略可插拔**：内置 `PinyinNamingStrategy`，可自定义（i18n 映射表 / 自定义规则）
- 📚 **双格式支持**：Swagger 2.0 + OpenAPI 3.0（自动检测）
- 🈶 **中文模型名 → 拼音 PascalCase** + 映射表覆盖
- 📄 **分页容器识别**：`PageVO«X»` / `通用分页响应VO«X»` → `PageVO<T>` 泛型
- 🔁 **解开统一响应体**：`响应结果«X»` → 业务返回类型 `X`
- ✅ **required 字段保留**：`definitions.required` 数组里的字段在 TS 中不带 `?:`，业务代码可静态保证必填
- 🔄 **循环引用安全**：自指 / 互指不再栈溢出
- 🏷️ **enum 字面量联合**：`type: string, enum: ['A','B']` → `type Status = 'A' | 'B'`
- 📝 **format 提示**：`date-time` / `int64` / `binary` 等加 JSDoc 注释；`binary` 映射成 `Blob`
- ⚔️ **同模块冲突兜底**：方法前缀 → URL 末段 → 数字后缀
- 🌐 **跨模块冲突 namespace alias**：`getInfo` 撞名 → `userGetInfo` / `orderGetInfo`
- 🛠️ **HTTP 方法名可配置**：`httpMethodMap` 让 axios / 自研 client 都能适配
- 🔍 **CI 漂移检测**：`--check` 模式，swagger 改了没重生成就 fail
- 📦 **零运行依赖**：`pinyin-pro` + `js-yaml`，产物 ~25KB

## 安装

```bash
# pnpm
pnpm add -D @zhouyuejin1995/swagger-to-api

# npm
npm install --save-dev @zhouyuejin1995/swagger-to-api

# yarn
yarn add -D @zhouyuejin1995/swagger-to-api
```

## 快速开始

### 1. 写配置 `api-gen.config.yaml`

```yaml
input: https://your-backend.com/v2/api-docs   # URL 或本地文件
output: src/api/generated

# runtime 客户端相对 services/ 的导入路径（默认 '../runtime'）
runtimeImport: '../runtime'

# 已存在 runtime.ts 时不覆盖（业务方有自定义实现时设 false）
emitRuntimeTemplate: false

# 中文模型名 → 英文映射（可选，10-100 条常见翻译可省下大量拼音兜底警告）
nameMap:
  企业信息: Supplier
  验证码返回对象: CaptchaResult
```

### 2. 加 npm script

```jsonc
{
  "scripts": {
    "generate-api": "swagger-to-api --config api-gen.config.yaml"
  }
}
```

### 3. 跑

```bash
pnpm generate-api          # 实际生成
pnpm generate-api -- --check   # CI 检测：swagger 改了没重生成就 exit 1
```

### 4. 业务代码里用

```ts
import { login, getInfo, saveSupplier, type Supplier, type PageVO } from '@/api/generated';

const { data: token } = await login({ username: 'foo', password: 'bar' });
const { data: page } = await pageSupplier({ pageNum: 1, pageSize: 20, keyword: '' });
page.list.forEach((item: Supplier) => console.log(item.name));
```

## 生成产物结构

```
<output>/
├── runtime.ts            ← 仅当 emitRuntimeTemplate=true 且文件不存在时生成
├── models/
│   ├── PageVO.ts         ← 泛型分页类型
│   ├── <ModelA>.ts       ← DTO（来自 definitions）
│   ├── <ModelB>.ts
│   └── index.ts          ← models 总导出
├── services/
│   ├── <moduleA>.ts      ← 每个业务模块一个文件（如 supplier.ts）
│   ├── <moduleB>.ts
│   └── ...
└── index.ts              ← 顶层入口，含跨模块冲突消歧
```

## OpenAPI 3.x 支持

无需任何配置，自动检测 `openapi: "3.x.x"` 字段并归一化为 Swagger 2.0 形态处理：

- `components.schemas` → `definitions`
- `$ref: #/components/schemas/X` → `$ref: #/definitions/X`
- `requestBody` (application/json) → `parameters[in=body]`
- `requestBody` (multipart/form-data) → 单个 body schema
- `responses[200].content[mt].schema` → `responses[200].schema`

**当前限制**（v0.4.x）：
- 不支持 `oneOf` / `anyOf` / `allOf` 组合 schema
- 不支持 `discriminator`
- OpenAPI 3.1 专属特性（type union with null 等）

## 自定义 runtime

生成的 service 调 `http.get / post / postJson`。**默认 `runtime.ts` 是基于 `fetch` 的最小实现**：

```ts
export interface ApiError extends Error { status?: number; body?: unknown; url?: string; }
export interface HttpOptions { signal?: AbortSignal; }
const DEFAULT_TIMEOUT_MS = 30_000;

export const http = {
  get<T>(url: string, params?: Record<string, unknown>, options?: HttpOptions): Promise<T> { /* ... */ },
  post<T>(url: string, data?: Record<string, unknown>, options?: HttpOptions): Promise<T> { /* ... */ },
  postJson<T>(url: string, data?: unknown, options?: HttpOptions): Promise<T> { /* ... */ },
};
```

特性：30 秒默认超时（可通过 `AbortSignal` 覆盖）、结构化 `ApiError`、网络/HTTP/JSON 三类异常都能正确抛出。

业务方通常改造成 axios 包装，**保持三个方法签名一致即可**。下次 `pnpm generate-api` 不会覆盖你的 `runtime.ts`（默认行为：文件存在则跳过）。

## 自定义命名策略

实现 `NamingStrategy` 接口即可：

```ts
import type { NamingStrategy } from '@zhoujuejin/swagger-to-api';
import { parse, loadSwagger } from '@zhoujuejin/swagger-to-api';

class I18nNamingStrategy implements NamingStrategy {
  modelName(defName: string) { return yourDict.get(defName) ?? defName; }
  functionName(opId: string) { return opId; }
  moduleName(url: string) { return url.split('/')[2] ?? 'default'; }
}

const swagger = await loadSwagger('./swagger.json');
const result = parse(swagger, new I18nNamingStrategy());
```

## 自定义 HTTP 方法映射

如果你的 `http` 客户端方法名不同（如 `http.GET` / `http.POST_JSON`）：

```ts
emit(result, {
  input, output,
  httpMethodMap: {
    simple:  { GET: 'GET', DELETE: 'DELETE', POST: 'POST_FORM', PUT: 'POST_FORM', PATCH: 'POST_FORM' },
    withBody: { POST: 'POST_JSON', PUT: 'POST_JSON', PATCH: 'POST_JSON' },
  },
});
```

## 程序化 API

```ts
import {
  loadSwagger,   // 加载 swagger（URL / 文件）
  parse,         // parse(swaggerDoc, namingStrategy?) → { models, modules }
  emit,          // emit(parseResult, config) → 写文件
  PinyinNamingStrategy,
  isOpenAPI3,    // 类型守卫
  normalizeOpenApi3,  // 手动 OAS3 → Swagger2  转换
} from '@zhouyuejin1995/swagger-to-api';
```

## 配置参考（`GenerateConfig`）

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `input` | `string` | **必填** | swagger 文档：URL 或本地路径 |
| `output` | `string` | **必填** | 输出目录 |
| `nameMap` | `Record<string,string>` | `{}` | 中文定义名 → 英文模型名 |
| `runtimeImport` | `string` | `'../runtime'` | runtime 客户端相对 `services/` 的导入路径 |
| `emitRuntimeTemplate` | `boolean` | `true` | 是否生成默认 `runtime.ts`（已存在则不覆盖）|
| `httpMethodMap` | `HttpMethodMap` | 见下 | 生成的 service 调用 `http.<method>` 时的方法名映射 |

默认 `httpMethodMap`：

```ts
{
  simple:   { GET: 'get', DELETE: 'get', POST: 'post', PUT: 'post', PATCH: 'post' },
  withBody: { POST: 'postJson', PUT: 'postJson', PATCH: 'postJson' },
}
```

## CLI

```bash
swagger-to-api [选项]

选项:
  -c, --config <path>      配置文件路径（默认: api-gen.config.yaml）
  -i, --input <path>       Swagger 文档（URL 或本地文件），覆盖配置文件
  -o, --output <path>      输出目录，覆盖配置文件
      --check              生成到临时目录，与现有输出 diff；如有差异 exit 1
  -h, --help               显示帮助
  -v, --version            显示版本号
```

## 对比同类工具

| 工具 | 输入格式 | 类型 | 命名策略 | 中文支持 | 产物 | 学习曲线 |
|---|---|---|---|---|---|---|
| **`@zhouyuejin/swagger-to-api`** | Swagger 2.0 + OpenAPI 3.0 | TS | 可插拔 + 拼音 | ✅ | ~25KB | 低 |
| `openapi-typescript` | OpenAPI 3.x | TS only | 固定 | ❌ | ~50KB | 低 |
| `orval` | OpenAPI 3.x | TS | 固定 | ❌ | ~1MB+ | 高 |
| `swagger-codegen` | 多 | 多语言 | 配置驱动 | ❌ | ~100MB+ | 极高 |

## 常见问题

### 1. 生成器生成的 import 路径不对？
调整 `runtimeImport`（默认 `'../runtime'`，意味着运行时放在 `<output>/runtime.ts`）。

### 2. 我想让某类接口不走 JSON 也不走 form？
通过 `httpMethodMap` 给 `withBody` 映射一个自定义方法名，再在你的 `http` 对象里实现它。

### 3. swagger 是 OpenAPI 3.x？
开箱即用。`openapi: "3.x.x"` 自动识别，详见上文「OpenAPI 3.x 支持」。如果用了 `oneOf` / `anyOf` 等复杂 schema，等后续版本。

### 4. 后端 swagger 改了没重新生成怎么办？
`--check` 模式专门管这个：
```bash
swagger-to-api --check --config api-gen.config.yaml
```
集成到 CI：swagger 漂移就 fail PR。配合 GitHub Actions 用法见仓库 `. `.github/workflows/publish.yml`。

### 5. 函数名撞了怎么办？
同模块内 `auth/POST/GET/DELETE` → `saveAuth/getAuth/updateAuth/removeAuth`，再撞按 URL 末段重命名，再撞加 `_1/_2`。跨模块撞名（如 `auth.getInfo` 和 `order.getInfo`）顶层 `index.ts` 用 namespace alias 消歧：`getInfo as authGetInfo` / `getInfo as orderGetInfo`。

### 6. 后端有 `format: int64` 字段怎么用？
JS Number 精度只有 2^53。`int64` 字段生成类型仍是 `number` 但加了 JSDoc 提示「考虑用 string 传输」。业务代码收数据时 `BigInt(s)` 转换，序列化时 `s.toString()`。

### 7. 后端分页怎么用？
后端 swagger 通常形如 `响应结果«PageVO«订单»»`：
- 自动展开成 `Promise<PageVO<Order>>`
- `page.list: Order[]`
- `page.pageNum` / `pageSize` / `pages` / `total` 都有定义

### 8. 上传文件怎么生成？
multipart/form-data 字段合并成单个 body schema：
```ts
export function uploadFile(data: { file: Blob; note: string }): Promise<WrappedString> {
  return http.postJson<WrappedString>('/api/upload', data);
}
```
**注意**：默认 runtime 的 `postJson` 是 application/json。要走 multipart 编码，把 `http.postJson` 替换成你自己实现的 `http.postForm`（自定义方法名 + `httpMethodMap` 映射）。

## 发布流程（维护者）

从 v0.5.0 起，本项目用 [release-please](https://github.com/googleapis/release-please) 自动化发布：

```
开发者合并 PR（commit 用 conventional 格式：feat: / fix: / chore:）
         ↓
release-please Action 自动开 / 更新「chore(main): release v0.X.0」PR
         ↓
维护者 review 该 PR（自动 bump version + 更新 CHANGELOG.md + 改 manifest.json）
         ↓
合并 release PR → release-please 自动打 tag + 开 GitHub Release
         ↓
现有 publish.yml 监听到 tag push → npm publish --access public
         ↓
新版本上 npm
```

### Conventional Commits 约定

| prefix | 触发版本 | 例 |
|---|---|---|
| `feat:` | minor (0.5.0 → 0.6.0) | `feat: 支持 oneOf 联合类型` |
| `fix:` | patch (0.5.0 → 0.5.1) | `fix: 路径参数 type 错误` |
| `feat!:` 或 `BREAKING CHANGE:` | major | `feat!: 重命名 runtime 默认方法名` |
| `chore:` / `docs:` / `test:` / `refactor:` / `perf:` | 不触发版本 | `chore: 更新 README` |

### 手动应急发布

若 release-please 罢工，可用本地脚本：
```bash
npm run release:patch    # 0.5.0 → 0.5.1（自动 clean + lint + test + build + 推送）
# 然后手动到 GitHub 开 release + push tag 触发 publish.yml
```

## License

MIT
