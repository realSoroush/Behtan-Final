/** Volatile JPEG normalization strips metadata; no image is persisted. */
export async function normalizeFoodPhoto(file:File):Promise<string>{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('عکس JPG، PNG یا WebP انتخاب کن.');
 if(file.size>10*1024*1024)throw Error('حجم عکس باید کمتر از ۱۰ مگابایت باشد.');
 const url=URL.createObjectURL(file);
 try{
  const image=await new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('عکس خوانده نشد. عکس دیگری انتخاب کن.'));img.src=url;});
  if(image.naturalWidth*image.naturalHeight>40000000||Math.min(image.naturalWidth,image.naturalHeight)<100)throw Error('ابعاد عکس مناسب نیست. عکس دیگری انتخاب کن.');
  const scale=Math.min(1,1400/Math.max(image.naturalWidth,image.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);const ctx=canvas.getContext('2d');if(!ctx)throw Error('آماده‌سازی عکس انجام نشد.');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.82);
 }finally{URL.revokeObjectURL(url);}
}
