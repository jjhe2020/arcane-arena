import type ExcelJS from 'exceljs';
import type {SkillDefinition} from '../src/model';
export function canonical(value:unknown):string;
export function contentHash(value:unknown):string;
export function loadWorkbook(filename:string):Promise<ExcelJS.Workbook>;
export interface ConfigurationResult {config:Record<string,any>;definitions:SkillDefinition[];report:Record<string,any>;outputs:Map<string,string>}
export function readConfiguration(root?:string):Promise<ConfigurationResult>;
export function compileConfiguration(options?:{root?:string;check?:boolean}):Promise<ConfigurationResult>;
