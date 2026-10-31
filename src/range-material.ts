import * as THREE from 'three';
import type {RadialMapping} from './range-geometry';

/** Warp the authored ring within its atlas cell, preserving its colors and
 * angular detail while placing its independently calibrated inner/outer band
 * at the actual simulation radii. The shader never writes game state. */
export function radialMaterial(material:THREE.MeshBasicMaterial){
 const uniforms={rangeEnabled:{value:0},rangeCell:{value:new THREE.Vector4(0,0,1,1)},rangeBand:{value:new THREE.Vector4(0,1,0,1)},rangeSize:{value:1}};
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms);
  shader.fragmentShader=`uniform float rangeEnabled;uniform vec4 rangeCell;uniform vec4 rangeBand;uniform float rangeSize;\n`+shader.fragmentShader;
  const sample=`vec2 rangeUv=vMapUv;
if(rangeEnabled>.5){
 vec2 local=(vMapUv-rangeCell.xy)/rangeCell.zw-vec2(.5);
 float distanceWorld=length(local)*rangeSize;
 float sourceRadius=rangeBand.z+(distanceWorld-rangeBand.x)/(rangeBand.y-rangeBand.x)*(rangeBand.w-rangeBand.z);
 vec2 sourceCell=vec2(.5)+local/max(length(local),.000001)*sourceRadius;
 if(sourceRadius<0.||any(lessThan(sourceCell,vec2(0.)))||any(greaterThan(sourceCell,vec2(1.))))discard;
 rangeUv=rangeCell.xy+sourceCell*rangeCell.zw;
}
vec4 sampledDiffuseColor=texture2D(map,rangeUv);`;
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',THREE.ShaderChunk.map_fragment.replace('vec4 sampledDiffuseColor = texture2D( map, vMapUv );',sample));
 };
 material.customProgramCacheKey=()=> 'range-annulus-v1';
 return {update(mapping:RadialMapping|undefined,size:number,texture:THREE.Texture|undefined){
  uniforms.rangeEnabled.value=mapping?1:0;
  if(mapping&&texture){uniforms.rangeBand.value.set(mapping.innerRadius,mapping.outerRadius,mapping.sourceInner,mapping.sourceOuter);uniforms.rangeSize.value=size;uniforms.rangeCell.value.set(texture.offset.x,texture.offset.y,texture.repeat.x,texture.repeat.y);}
 }};
}
