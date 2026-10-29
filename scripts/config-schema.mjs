export const FILES={skills:'技能配置.xlsx',units:'单位配置.xlsx',economy:'经济配置.xlsx'};
export const SKILL_HEADERS=['技能ID','中文名称','等级','施法前摇ms','施法后摇ms','冷却ms','魔耗','施法距离','参数1','参数2','参数3','参数4','参数5','参数6','参数7','参数8','参数9','参数10'];
export const EXTRA_HEADERS=['等级域','技能ID','等级','参数键','数值'];
export const DICTIONARY_HEADERS=['等级域','技能ID','参数序号','参数键','含义','单位','最小值','最大值','整数','数值来源','来源说明'];
export const META_HEADERS=['技能ID','中文名称','英文名称','被动','终极技能','商店技能','基础说明','Super说明','Gaben说明'];
export const ROLE_HEADERS=['职业ID','中文名称','颜色','生命','法力','攻击','护甲','攻击间隔ms','攻击距离','移动速度','力量','敏捷','智力','主属性','转身速度rad每秒','攻击前摇ms','攻击后摇ms','弹体速度','攻击距离缓冲'];
export const UNIT_HEADERS=['单位ID','中文名称','生命','法力','最小攻击','最大攻击','护甲','魔抗百分数','基础攻击间隔ms','基础攻速','攻击前摇ms','攻击后摇ms','攻击距离','移动速度','生命恢复','法力恢复','转身速度rad每秒','弹体速度','攻击距离缓冲','攻击类型0无1近2远','原生等级'];
export const RULE_HEADERS=['组','字段','中文含义','数值','单位','来源说明'];
export const SHOP_HEADERS=['商店等级','普通商品开放数','升到下一级费用'];
export const ECONOMY_HEADERS=['字段','中文含义','数值','单位'];
export const SAFE_ID=/^[a-zA-Z0-9_.:-]+$/;
export const FORBIDDEN=new Set(['__proto__','constructor','prototype']);
export const TIERS=[1,2,3,6,9];
export function unitFor(key){return /DURATION|INTERVAL|COOLDOWN|DELAY|TIME|CASTPOINT|CAST POINT|TICK RATE|ATTACK RATE/.test(key)?'ms':/CHANCE|PERCENT|RESISTANCE/.test(key)?'%':/RADIUS|RANGE|DISTANCE|WIDTH|HEIGHT/.test(key)?'Dota单位':'数值';}
export const toSheet=(value,unit)=>unit==='ms'?value*1000:unit==='Dota单位(程序)'||unit==='Dota单位每秒(程序)'?value*100:value;
export const toRuntime=(value,unit)=>unit==='ms'?value/1000:unit==='Dota单位(程序)'||unit==='Dota单位每秒(程序)'?value/100:value;
export const programUnit=unit=>unit==='s'?'ms':unit==='world'?'Dota单位(程序)':unit==='world/s'?'Dota单位每秒(程序)':unit==='ratio'?'倍率':unit==='count'?'次数':'数值';
