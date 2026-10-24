/* Flat-top axial footprints shared by authoring, combat and the player display. */
(function(root){
 'use strict';
 const side=.42,hexH=Math.sqrt(3)*side,stepX=side*1.5;
 const labels={small:'Маленький',normal:'Нормальный',large:'Крупный',huge:'Большой',massive:'Массивный',colossal:'Колоссальный'};
 const disk=r=>{const out=[];for(let q=-r;q<=r;q++)for(let s=-r;s<=r;s++)if(Math.max(Math.abs(q),Math.abs(s),Math.abs(q+s))<=r)out.push([q,s]);return out;};
 const triangle=[[0,0],[1,0],[0,1]],expanded=[...new Map(triangle.flatMap(([q,r])=>disk(1).map(([a,b])=>[`${q+a}:${r+b}`,[q+a,r+b]]))).values()];
 const shapes={small:[[0,0]],normal:[[0,0]],large:triangle,huge:disk(1),massive:expanded,colossal:disk(2)};
 const normalize=value=>Object.hasOwn(labels,String(value))?String(value):Object.keys(labels).find(k=>labels[k].toLowerCase()===String(value||'').toLowerCase())||'normal';
 const metrics=Object.fromEntries(Object.entries(shapes).map(([key,offsets])=>{
  const points=offsets.map(([q,r])=>({x:q*stepX,y:(r+q/2)*hexH})),minX=Math.min(...points.map(p=>p.x))-side,minY=Math.min(...points.map(p=>p.y))-hexH/2,maxX=Math.max(...points.map(p=>p.x))+side,maxY=Math.max(...points.map(p=>p.y))+hexH/2;
  const one=offsets.length===1,w=one?hexH*.9:maxX-minX,h=one?hexH*.9:maxY-minY;
  return [key,{key,label:labels[key],count:offsets.length,offsets,points,probes:points.flatMap(p=>[p,...Array.from({length:6},(_,i)=>({x:p.x+side*.88*Math.cos(Math.PI*i/3),y:p.y+side*.88*Math.sin(Math.PI*i/3)}))]),w,h,ox:one?w/2:-minX,oy:one?h/2:-minY,minX,minY,maxX,maxY}];
 }));
 function info(value){return metrics[normalize(value)];}
 function anchor(token){const m=info(token.unitSize);return token.footprintV184?{x:Number(token.x||0)+m.ox,y:Number(token.y||0)+m.oy}:{x:Number(token.x||0)+Number(token.w??1)/2,y:Number(token.y||0)+Number(token.h??1)/2};}
 function cells(token,at=anchor(token)){return info(token.unitSize).points.map(p=>({x:at.x+p.x,y:at.y+p.y}));}
 function node(col,row){return {col,row,x:side+col*stepX,y:hexH/2+(col&1)*hexH/2+row*hexH};}
 function nearest(point){const c=Math.round((point.x-side)/stepX);let best,d=Infinity;for(let q=c-2;q<=c+2;q++){const base=hexH/2+(q&1)*hexH/2,r=Math.round((point.y-base)/hexH);for(let s=r-1;s<=r+1;s++){const n=node(q,s),dist=(n.x-point.x)**2+(n.y-point.y)**2;if(dist<d){d=dist;best=n;}}}return best;}
 function inBounds(size,scene,at){const m=info(size);return at.x+m.minX>=-1e-6&&at.y+m.minY>=-1e-6&&at.x+m.maxX<=scene.width+1e-6&&at.y+m.maxY<=scene.height+1e-6;}
 function fit(token,scene,point=anchor(token)){
  const m=info(token.unitSize),origin=nearest(point);let best=null,d=Infinity;
  for(let q=origin.col-5;q<=origin.col+5;q++)for(let r=origin.row-5;r<=origin.row+5;r++){const n=node(q,r);if(!inBounds(m.key,scene,n))continue;const dist=(n.x-point.x)**2+(n.y-point.y)**2;if(dist<d){d=dist;best=n;}}
  if(!best)return false;
  token.unitSize=m.key;token.footprintV184=true;token.w=m.w;token.h=m.h;token.x=best.x-m.ox;token.y=best.y-m.oy;return true;
 }
 function contains(token,x,y,pad=0){
  const m=info(token.unitSize),at=anchor(token),rx=x-at.x,ry=y-at.y;
  if(rx<m.minX-pad||rx>m.maxX+pad||ry<m.minY-pad||ry>m.maxY+pad)return false;
  return m.points.some(p=>{const dx=Math.abs(rx-p.x),dy=Math.abs(ry-p.y);return dx<=side+pad&&dy<=hexH/2+pad&&Math.sqrt(3)*dx+dy<=hexH+pad*2;});
 }
 function probes(token,at){return info(token.unitSize).probes.map(p=>({x:at.x+p.x,y:at.y+p.y}));}
 function svg(token){const m=info(token.unitSize);if(m.count===1)return '';return `<svg class="unit-footprint-v184" viewBox="0 0 ${m.w} ${m.h}" preserveAspectRatio="none" aria-hidden="true">${m.points.map(p=>`<polygon points="${Array.from({length:6},(_,i)=>{const a=Math.PI*i/3;return `${p.x+m.ox+side*.98*Math.cos(a)},${p.y+m.oy+side*.98*Math.sin(a)}`;}).join(' ')}"/>`).join('')}</svg>`;}
 function distance(a,b,atA,atB){let min=Infinity;for(const p of cells(a,atA))for(const q of cells(b,atB)){const x=nearest(p),y=nearest(q),ar=x.row-(x.col-(x.col&1))/2,br=y.row-(y.col-(y.col&1))/2;min=Math.min(min,Math.max(Math.abs(x.col-y.col),Math.abs(ar-br),Math.abs(x.col+ar-y.col-br)));}return min;}
 const api={labels,normalize,info,anchor,cells,node,nearest,inBounds,fit,contains,probes,svg,distance,side,hexH};root.GRPGUnitSizeV184=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
