import data from './generated/game-config.json';

export interface GlobalBattleConfig {timeLimit:number;armorCoefficient:number;baseAttackSpeed:number;castRangeBuffer:number;assassinateRangeBuffer:number;netherStrikeRangeBuffer:number;defaultAttackPointCap:number;defaultAttackPointFactor:number;magicResistanceCap:number;minimumSpellAmplification:number}
export interface BoardConfig {scale:number;width:number;height:number;formationHalfWidth:number;formationMinY:number;formationMaxY:number;defaultHeroX1:number;defaultHeroX2:number;defaultHeroX3:number;defaultHeroX4:number;defaultHeroX5:number;frontRowY:number;backRowY:number}
export interface AiConfig {baseSkillScore:number;tankSynergyScore:number;attackSynergyScore:number;mageSynergyScore:number;mageActiveScore:number;assassinSynergyScore:number;ultimateScore:number;equippedSlotPenalty:number;duplicateBaseScore:number;duplicatePointScore:number;upgradeThresholdScore:number;unplaceablePenalty:number;shopUpgradeMinimumStacks:number;shopUpgradeStacksPerHero:number}
export interface UiConfig {tabletMaximumAspectRatio:number;tabletMinimumHeight:number;tabletMinimumWidth:number;tabletShopColumns:number;tabletTouchTarget:number;minimumTextScale:number;referenceViewportWidth:number;referenceViewportHeight:number;shopNameFontSize:number;shopNameMinimumFontSize:number;healthBarMinimumWidth:number;healthBarMaximumWidth:number;healthBarWorldWidth:number;healthBarHeight:number;summonHealthBarMinimumWidth:number;summonHealthBarMaximumWidth:number;summonHealthBarWorldWidth:number;summonHealthBarHeight:number;manaBarHeight:number;healthBarYOffset:number;manaBarYOffset:number;buffIconGap:number;buffBorderWidth:number;buffStackFontSize:number;buffDetailIconSize:number}
const globals=(data as unknown as {globals:{battle:GlobalBattleConfig;board:BoardConfig;ai:AiConfig;ui:UiConfig}}).globals;
export const GLOBAL_BATTLE_CONFIG=globals.battle;
export const BOARD_CONFIG=globals.board;
export const AI_CONFIG=globals.ai;
export const UI_CONFIG=globals.ui;
