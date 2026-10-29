import {createRequire} from 'node:module';
import {describe,it,expect} from 'vitest';
// @ts-expect-error The research parser is a standalone ESM tool.
import {parseKV} from '../scripts/parse-valve-kv.mjs';
describe('历史KV取证解析',()=>{
 it('保持原字符串/嵌套值，并区分字符串中的斜杠与注释',()=>{const r=parseKV('"root" { // comment\n "path" "https://example.test/a" "n" "1 2 3" "child" { "x" "4" } }');expect(r.data.root.path).toBe('https://example.test/a');expect(r.data.root.n).toBe('1 2 3');expect(r.data.root.child.x).toBe('4');});
 it('不丢弃重复值与平台条件，记录字段行号',()=>{const r=parseKV('"root" {\n"x" "1"\n"x" "2" [$WIN32]\n}');expect(r.data.root.x).toBe('2');expect(r.duplicates[0]).toEqual({path:'/root/x',values:['1','2'],lines:[2,3]});expect(r.conditions[0]).toMatchObject({path:'/root/x',value:'[$WIN32]'});});
 it('拒绝不完整嵌套和引号，不把损坏来源静默当成完整数据',()=>{expect(()=>parseKV('"root" { "x" "1"')).toThrow();expect(()=>parseKV('"root" "broken')).toThrow();});
});
