/* Shared party vision selection for the editor and player display. */
(function(root){
  'use strict';
  function sources(scene,runtime){
    const tokens=Array.isArray(runtime?.tokens)?runtime.tokens:[];
    const devices=token=>(token.equipmentType||token.type)==='drone';
    const eligible=token=>!token.hidden&&token.visibleToPlayers!==false;
    return tokens.filter(token=>eligible(token)&&(token.playerId||token.sharesVisionWithPlayers)&&(!devices(token)||token.droneShareVision225));
  }
  const isElevation=zone=>Number.isInteger(zone?.elevation233)&&zone.elevation233>=-3&&zone.elevation233<=3&&zone.shape==='polygon'&&zone.points?.length>=3;
  function elevationZones(scene){return (scene?.templates||[]).filter(isElevation);}
  function contains(points,p){
    let inside=false;
    for(let i=0,j=points.length-1;i<points.length;j=i++){
      const a=points[j],b=points[i];
      if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
    }
    return inside;
  }
  function floorAt(zones,point){
    for(let i=zones.length-1;i>=0;i--)if(contains(zones[i].points,point))return zones[i].elevation233;
    return 0;
  }
  function elevationAt(scene,point){
    const zones=elevationZones(scene);
    return zones.length?floorAt(zones,root.GRPGUnitSizeV184.nearest(point)):0;
  }
  function elevationCover(scene,from,to){
    const zones=elevationZones(scene);if(!zones.length)return 0;
    const grid=root.GRPGUnitSizeV184,a=floorAt(zones,grid.nearest(from)),b=floorAt(zones,grid.nearest(to));
    return b>a?Math.min(3,b>0?b:b-a):0;
  }
  function elevationBlocksSight(scene,from,to){
    const zones=elevationZones(scene);if(!zones.length)return false;
    const grid=root.GRPGUnitSizeV184,a=grid.nearest(from),b=grid.nearest(to),dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
    if(!length)return false;
    const fromFloor=floorAt(zones,a),toFloor=floorAt(zones,b),crossings=[0,1];
    for(const {points} of zones){
      for(let i=0;i<points.length;i++){
        const p=points[i],q=points[(i+1)%points.length],ex=q.x-p.x,ey=q.y-p.y,den=dx*ey-dy*ex;
        if(Math.abs(den)<1e-9)continue;
        const px=p.x-a.x,py=p.y-a.y,t=(px*ey-py*ex)/den,u=(px*dy-py*dx)/den;
        if(t>0&&t<1&&u>=0&&u<=1)crossings.push(t);
      }
    }
    crossings.sort((x,y)=>x-y);
    let entered=0,previous=fromFloor;
    for(let i=1;i<crossings.length;i++){
      const lo=crossings[i-1],hi=crossings[i];if(hi-lo<1e-9)continue;
      const mid=(lo+hi)/2,floor=floorAt(zones,{x:a.x+dx*mid,y:a.y+dy*mid});
      if(floor>Math.max(fromFloor,toFloor))return true;
      if(floor===toFloor&&previous!==toFloor)entered=lo;
      previous=floor;
    }
    if(toFloor<=fromFloor)return false;
    // Uphill visibility reaches only a strip behind the facing edge. Nearer
    // observers see farther across it; a larger floor difference narrows it.
    const gap=length*entered/grid.hexH;
    const strip=grid.hexH*Math.max(.85,(.95+1.6/(1+gap/2))/Math.sqrt(toFloor-fromFloor));
    return length*(1-entered)>strip+1e-9;
  }
  const api={sources,isElevation,elevationAt,elevationCover,elevationBlocksSight,elevationZones};
  root.GRPGCombatVisionV225=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
