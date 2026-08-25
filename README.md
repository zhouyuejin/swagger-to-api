# @yuejin/swagger-to-api

> Swagger 2.0 → TypeScript API 客户端代码生成器。拉一份 swagger 文档（URL 或本地 JSON），在项目里生成强类型的请求函数与 DTO。

零运行时依赖 axios / 框架，生成出来的 service 函数调用一个由本包提供的 `http` 客户端（默认基于 `fetch` 的最小实现，可被业务方完全替换）。

## 特性

- 🚀 一行命令：`npx swagger-to-api -i <swagger> -o ./src/api`
- 🧩 命名策略可插拔（内置 `PinyinNamingStrategy`，支持自定义）
- 🈶 中文模型名 → 拼音 PascalCase 兜底 + 映射表覆盖
- 📄 自动识别并展开分页容器（`PageVO«X»`、`通用分页响应VO«X»` → `PageVO<X>` 泛型）
- 🔁 自动解开统一响应体（`响应结果«X»` 的 `data` → 实际返回类型）
- ⚔️ 同模块内函数名三级冲突兜底（方法前缀 → URL 末段 → 数字后缀）
- 🌐 跨模块函数名冲突在顶层 `index.ts` 用 namespace alias 消歧
- 🛠 runtime 客户端的导入路径与 HTTP 方法名都可配置
- 📝 自动写一份可工作的 `runtime.ts` 模板（已存在则不覆盖，方便业务方自定义）

## 安装

```bash
npm install --save-dev @yuejin/swagger-to-api
# 或
pnpm add -D @yuejin/swagger-to-api
```

## 快速开始

### CLI

在工作目录下放一份 `api-gen.config.yaml`：

```yaml
input: http://localhost:8080/v2/api-docs   # 也可以是本地 JSON 路径
output: ./src/api/generated
# 可选：中文模型名 → 英文映射
nameMap:
  企业信息: Supplier
  验证码返回对象: CaptchaResult
# 可选：运行时 http 客户端的导入路径（相对 services/）
runtimeImport: '../runtime'
# 可选：是否生成默认 runtime.ts 模板（已存在则不覆盖），默认 true
emitRuntimeTemplate: true
```

然后：

```bash
npx swagger-to-api
# 或
npx swagger-to-api -c api-gen.config.yaml
# 或覆盖配置
npx swagger-to-api -i ./swagger.json -o ./src/api
```

### 程序化 API

```ts
import { loadSwagger, parse, emit, PinyinNamingStrategy } from '@yuejin/swagger-to-api';
import type { SwaggerDoc } from '@yuejin/swagger-to-api';

const swagger: SwaggerDoc = await loadSwagger('http://localhost:8080/v2/api-docs');
const naming = new PinyinNamingStrategy({ nameMap: { 企业信息: 'Supplier' } });
const result = parse(swagger, naming);

emit(result, {
  input: '...',
  output: './src/api/generated',
  runtimeImport: '../runtime', // 相对 services/ 的导入路径
});

console.log(`生成 ${result.models.size} 个 DTO, ${result.modules.size} 个模块`);
```

## 生成产物结构

```
<output>/
├── runtime.ts          ← 默认模板（业务方可改，已存在则不会覆盖）
├── models/
│   ├── PageVO.ts       ← 泛型分页类型
│   ├── <ModelA>.ts
│   ├── <ModelB>.ts
│   └── index.ts        ← models 总导出
├── services/
│   ├── <moduleA>.ts
│   ├── <moduleB>.ts
│   └── ...
└── index.ts            ← 顶层入口，含跨模块冲突消歧
```

## 自定义 runtime

第一次生成会在 `output/runtime.ts` 写入一份基于浏览器 / Node 内置 `fetch` 的最小实现：

```ts
export const http = {
  get<T>(url, params?): Promise<T> { /* ... */ },
  post<T>(url, data?): Promise<T> { /* x-www-form-urlencoded */ },
  postJson<T>(url, data?): Promise<T> { /* application/json */ },
};
```

**它仅作为起点**。业务方通常会把它替换成自己的 axios / umi-request / 自研请求封装 —— 只要保持 `get / post / postJson` 三个方法签名一致即可。下一次 `swagger-to-api` 运行时**不会覆盖**你修改过的 `runtime.ts`，自定义代码安全。

如果想重新生成模板，删除 `runtime.ts` 再运行一次即可。

## 自定义命名策略

实现 `NamingStrategy` 接口即可：

```ts
import type { NamingStrategy } from '@yuejin/swagger-to-api';
import { parse, loadSwagger } from '@yuejin/swagger-to-api';

class I18nNamingStrategy implements NamingStrategy {
  modelName(defName: string): string {
    return yourTranslationTable.get(defName) ?? defName;
  }
  functionName(operationId: string): string {
    return operationId;
  }
  moduleName(urlPath: string): string {
    return urlPath.split('/')[2] ?? 'default';
  }
}

const swagger = await loadSwagger('./swagger.json');
const result = parse(swagger, new I18nNamingStrategy());
```

## 自定义 HTTP 方法映射

如果你的 `http` 客户端方法名不同（例如 `http.GET` / `http.POST_JSON`），可通过 `httpMethodMap`：

```ts
emit(result, {
  input, output,
  httpMethodMap: {
    simple: { GET: 'GET', DELETE: 'DELETE', POST: 'POST_FORM', PUT: 'POST_FORM', PATCH: 'POST_FORM' },
    withBody: { POST: 'POST_JSON', PUT: 'POST_JSON', PATCH: 'POST_JSON' },
  },
});
```

## 配置参考（`GenerateConfig`）

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `input` | `string` | **必填** | swagger 文档：URL 或本地路径 |
| `output` | `string` | **必填** | 输出目录 |
| `nameMap` | `Record<string,string>` | `{}` | 中文定义名 → 英文模型名 |
| `runtimeImport` | `string` | `'../runtime'` | runtime 客户端相对 `services/` 的导入路径 |
| `emitRuntimeTemplate` | `boolean` | `true` | 是否生成默认 `runtime.ts`（已存在则不覆盖） |
| `httpMethodMap` | `HttpMethodMap` | `{ simple: GET→get, POST→post, ...; withBody: POST→postJson, ... }` | 生成的 service 调用 `http.<method>` 时的方法名映射 |

## 常见问题

### 1. 生成器生成的 import 路径不对？

调整 `runtimeImport`（默认 `'../runtime'`，意味着运行时放在 `<output>/runtime.ts`）。

### 2. 我想让某类接口不走 JSON 也不走 form？

通过 `httpMethodMap` 给 `withBody` 映射一个自定义方法名，再在你的 `http` 对象里实现它。

### 3. swagger 是 OpenAPI 3.x？

当前版本针对 Swagger 2.0。OpenAPI 3.x 的 `components.schemas` 与 `requestBody` 需要另一套适配。

## License

MIT
