import manifest from './data/ultimate-icons.json';
import type {SkillDefinition} from './model';
/** Framing is part of each delivered standalone icon, shared by every view. */
export function skillIconURL(definition:Pick<SkillDefinition,'id'|'icon'|'ultimate'>):string{
 const icons=manifest.icons as Record<string,{framed:string}>;
 return definition.ultimate?icons[definition.id]?.framed??definition.icon:definition.icon;
}
