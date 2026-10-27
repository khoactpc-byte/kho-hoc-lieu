export const FULL_ESSAY_CROP = { left:0, top:0, right:1, bottom:1 };
export function essayCropFromPoints(a, b) {
  const crop={left:Math.min(a.x,b.x)/1000,top:Math.min(a.y,b.y)/1000,right:Math.max(a.x,b.x)/1000,bottom:Math.max(a.y,b.y)/1000};
  return crop.right-crop.left >= .02 && crop.bottom-crop.top >= .02 ? crop : null;
}
export function essayCropLayout(crop=FULL_ESSAY_CROP) {
  const width=crop.right-crop.left,height=crop.bottom-crop.top;
  return {width:`${100/width}%`,left:`${-crop.left/width*100}%`,top:`${-crop.top/height*100}%`};
}
