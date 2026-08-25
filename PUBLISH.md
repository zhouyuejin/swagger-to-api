# 发布到 npm 指南

> 这份指南是给**你本人**用的。`npm publish` 需要你自己的 npm 账号凭据，Codex 没法替你登录。

## 当前包信息（已填）

```json
{
  "name": "@yuejin/swagger-to-api",
  "version": "0.1.0",
  "author": "yuejin",
  "bin": { "swagger-to-api": "./dist/cli/index.js" }
}
```

注意：npm scoped 包默认是私有（需要付费），发布时加 `--access public` 强制公开。

## 发布前确认清单

- [ ] `npm run lint` 通过（`tsc --noEmit`，0 错误）
- [ ] `npm test` 全绿（20/20）
- [ ] `npm run build` 干净（无警告）
- [ ] 你已 `npm login`（已确认登录到 registry.npmjs.org）

可选补充（不填也能发布，npm 会警告）：
- `repository.url` — 填你的 GitHub repo URL（README 顶部会显示徽章）
- `homepage` — 同上
- `bugs.url` — 同上

## 首次发布步骤

```bash
# 1. 确认 registry 是官方源
npm config set registry https://registry.npmjs.org

# 2. 确认 scoped 包名可用（前面已经查过）
npm view @yuejin/swagger-to-api
# 404 就可以继续；否则报错

# 3. 跑 prepublish 钩子（自动 clean + lint + test + build）
npm run prepublishOnly

# 4. 干跑（检查 tarball 内容）
npm pack --dry-run

# 5. 正式发布（scoped 包必须加 --access public）
npm publish --access public

# 6. 切回 npmmirror（国内开发更稳）
npm config set registry https://registry.npmmirror.com
```

## 后续版本更新

```bash
# 修补丁号（0.1.0 → 0.1.1）
npm version patch
# 修次版本（0.1.0 → 0.2.0）
npm version minor
# 重大版本（0.1.0 → 1.0.0）
npm version major

npm publish --access public
```

## 接入 `schoolUniform` 项目

把现有 `scripts/gen-api/` 整个目录删除（或保留作参考），改 `package.json` 的脚本：

```jsonc
{
  "scripts": {
    "generate-api": "swagger-to-api --config config/api-generate.yaml"
  },
  "devDependencies": {
    "@yuejin/swagger-to-api": "^0.1.0"
  }
}
```

注意：`runtimeImport` 在 `api-generate.yaml` 里要改成 `'../../runtime'`（对应 `packages/common/src/service/api/runtime.ts`）。

## 接入新项目

```bash
npm install --save-dev @yuejin/swagger-to-api
# 写一份 api-gen.config.yaml
npx swagger-to-api
```

完成。
