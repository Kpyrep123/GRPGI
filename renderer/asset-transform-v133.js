/* Pointer geometry in scene coordinates; opposite corner remains fixed. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.GRPGAssetTransformV133=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function transform(original,start,point,mode,shift=false){
    const {x,y,w,h}=original,rotation=Number(original.rotation)||0;
    const cx=x+w/2,cy=y+h/2,r=rotation*Math.PI/180,c=Math.cos(r),s=Math.sin(r);
    if(mode==='rotate'){
      const initial=Math.atan2(start.y-cy,start.x-cx),current=Math.atan2(point.y-cy,point.x-cx);
      let angle=rotation+(current-initial)*180/Math.PI;
      if(shift)angle=Math.round(angle/15)*15;
      return{x,y,w,h,rotation:((angle%360)+360)%360};
    }
    const sx=mode.includes('e')?1:-1,sy=mode.includes('s')?1:-1;
    const dx=point.x-start.x,dy=point.y-start.y;
    let nw=Math.max(.5,Math.min(40,w+sx*(c*dx+s*dy)));
    let nh=Math.max(.5,Math.min(40,h+sy*(-s*dx+c*dy)));
    if(shift){
      let scale=Math.abs(nw/w-1)>=Math.abs(nh/h-1)?nw/w:nh/h;
      scale=Math.max(Math.max(.5/w,.5/h),Math.min(Math.min(40/w,40/h),scale));
      nw=w*scale;nh=h*scale;
    }
    const lx=sx*(nw-w)/2,ly=sy*(nh-h)/2;
    let nx=cx+c*lx-s*ly-nw/2,ny=cy+s*lx+c*ly-nh/2;
    // Limit the gesture at the scene origin; retain the fixed opposite corner.
    const fraction=Math.min(1,nx<0?x/(x-nx):1,ny<0?y/(y-ny):1);
    if(fraction<1){nx=x+(nx-x)*fraction;ny=y+(ny-y)*fraction;nw=w+(nw-w)*fraction;nh=h+(nh-h)*fraction;}
    return{x:Math.max(0,nx),y:Math.max(0,ny),w:nw,h:nh,rotation};
  }
  return Object.freeze({transform});
});
