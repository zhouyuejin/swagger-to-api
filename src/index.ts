/**
 * @yuejin/swagger-to-api 程序化 API 入口
 *
 * 用法：
 *   import { loadSwagger, parse, emit, PinyinNamingStrategy } from '@yuejin/swagger-to-api';
 *
 *   const swagger = await loadSwagger(config.input);
 *   const naming = new PinyinNamingStrategy({ nameMap: { '企业信息': 'Supplier' } });
 *   const result = parse(swagger, naming);
 *   emit(result, { input, output, nameMap });
 */
export * from './core/types.js';
export { loadSwagger } from './core/loader.js';
export * from './core/naming.js';
export { parse } from './core/parser.js';
export { emit } from './core/emitter.js';
export { RUNTIME_TEMPLATE } from './core/runtime-template.js';
