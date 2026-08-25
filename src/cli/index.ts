#!/usr/bin/env node
/**
 * swagger-to-api CLI
 *
 * 用法：
 *   swagger-to-api                                # 读取 ./api-gen.config.yaml
 *   swagger-to-api --config path/to/config.yaml
 *   swagger-to-api --input <url|file> --output <dir>
 *
 * 选项：
 *   -c, --config <path>      配置文件（默认 api-gen.config.yaml）
 *   -i, --input <path>       Swagger 文档（URL 或本地文件），覆盖配置文件
 *   -o, --output <path>      输出目录，覆盖配置文件
 *       --check              生成到临时目录，与现有输出 diff；如有差异 exit 1
 *   -h, --help               显示帮助
 *   -v, --version            显示版本
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as yamlLoad } from 'js-yaml';
import { loadSwagger, parse, emit, PinyinNamingStrategy } from '../index.js';
import { checkOutput } from './check.js';
import type { GenerateConfig } from '../core/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_VERSION: string = (() => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'package.json'), 'utf8'));
    return pkg.version as string;
  } catch {
    return '0.0.0';
  }
})();

const DEFAULT_CONFIG = 'api-gen.config.yaml';

interface CliArgs {
  config?: string;
  input?: string;
  output?: string;
  check?: boolean;
  help?: boolean;
  version?: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--config' || a === '-c') args.config = argv[++i];
    else if (a === '--input' || a === '-i') args.input = argv[++i];
    else if (a === '--output' || a === '-o') args.output = argv[++i];
    else if (a === '--check') args.check = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--version' || a === '-v') args.version = true;
  }
  return args;
}

function printHelp(): void {
  console.log(`
swagger-to-api v${PKG_VERSION} — Swagger 2.0 → TypeScript API 代码生成器

用法:
  swagger-to-api [选项]

选项:
  -c, --config <path>      配置文件路径（默认: api-gen.config.yaml）
  -i, --input <path>       Swagger 文档：URL 或本地文件（覆盖配置文件）
  -o, --output <path>      输出目录（覆盖配置文件）
      --check              生成到临时目录，与现有输出 diff；如有差异 exit 1
  -h, --help               显示帮助
  -v, --version            显示版本号

示例:
  swagger-to-api --config api-gen.config.yaml
  swagger-to-api --check --config api-gen.config.yaml     # CI 检测漂移
  swagger-to-api --input http://localhost:8080/v2/api-docs --output ./src/api
`);
}

function loadYamlConfig(configPath: string): Partial<GenerateConfig> {
  if (!fs.existsSync(configPath)) {
    console.error(`❌ 配置文件不存在: ${configPath}`);
    process.exit(1);
  }
  return yamlLoad(fs.readFileSync(configPath, 'utf8')) as Partial<GenerateConfig>;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { printHelp(); return; }
  if (args.version) { console.log(`swagger-to-api v${PKG_VERSION}`); return; }

  const configPath = args.config
    ? path.resolve(process.cwd(), args.config)
    : path.resolve(process.cwd(), DEFAULT_CONFIG);

  let config: Partial<GenerateConfig> = {};
  if (fs.existsSync(configPath)) {
    config = loadYamlConfig(configPath);
    console.log(`📋 配置文件: ${configPath}`);
  }
  if (args.input) config.input = args.input;
  if (args.output) config.output = args.output;

  if (!config.input || !config.output) {
    console.error(`❌ 缺少必要参数。请提供 --input 和 --output，或创建 ${DEFAULT_CONFIG} 配置文件`);
    printHelp();
    process.exit(1);
  }

  console.log(`📥 输入: ${config.input}`);
  console.log(`📤 输出: ${config.output}\n`);

  try {
    const swagger = await loadSwagger(config.input);
    const defCount = Object.keys(swagger.definitions ?? {}).length;
    const pathCount = Object.keys(swagger.paths ?? {}).length;
    console.log(`📄 swagger ${swagger.swagger ?? swagger.openapi ?? '?'} · ${pathCount} 接口 · ${defCount} 定义\n`);

    const naming = new PinyinNamingStrategy({ nameMap: config.nameMap ?? {} });
    const result = parse(swagger, naming);
    console.log(`📦 解析到 ${result.models.size} 个 DTO · ${result.modules.size} 个模块\n`);

    if (args.check) {
      // --check 模式：生成到临时目录，对比现有输出，不写任何文件
      const check = await checkOutput(result, {
        input: config.input,
        output: config.output,
        nameMap: config.nameMap,
        runtimeImport: config.runtimeImport,
        emitRuntimeTemplate: config.emitRuntimeTemplate,
      }, config.output);
      if (check.hasDiff) {
        console.log(`\n❌ --check 失败：检测到 ${check.changedFiles.length} 个文件会变化`);
        for (const f of check.changedFiles.slice(0, 20)) console.log(`    ${f}`);
        if (check.changedFiles.length > 20) console.log(`    ... 还有 ${check.changedFiles.length - 20} 个`);
        fs.rmSync(check.tempDir, { recursive: true, force: true });
        process.exit(1);
      }
      fs.rmSync(check.tempDir, { recursive: true, force: true });
      console.log(`\n✅ --check 通过：输出与现有文件一致`);
      return;
    }

    emit(result, {
      input: config.input,
      output: config.output,
      nameMap: config.nameMap,
      runtimeImport: config.runtimeImport,
      emitRuntimeTemplate: config.emitRuntimeTemplate,
    });

    console.log(`\n✅ 生成完成 → ${path.resolve(process.cwd(), config.output)}/`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ 生成失败: ${msg}`);
    if (err instanceof Error && err.stack) console.error(err.stack);
    process.exit(1);
  }
}

main();
