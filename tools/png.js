const zlib=require('zlib');
function decode(buf){
  let o=8,idat=[],ihdr=null;
  while(o<buf.length){
    const len=buf.readUInt32BE(o), type=buf.slice(o+4,o+8).toString(), data=buf.slice(o+8,o+8+len);
    if(type==='IHDR')ihdr={w:data.readUInt32BE(0),h:data.readUInt32BE(4),depth:data[8],color:data[9]};
    if(type==='IDAT')idat.push(data);
    if(type==='IEND')break;
    o+=12+len;
  }
  const raw=zlib.inflateSync(Buffer.concat(idat));
  const ch=ihdr.color===6?4:ihdr.color===2?3:1;
  const {w,h}=ihdr, stride=w*ch;
  const px=Buffer.alloc(h*stride);
  let p=0;
  for(let y=0;y<h;y++){
    const ft=raw[p++]; const line=raw.slice(p,p+stride); p+=stride;
    const cur=px.slice(y*stride,(y+1)*stride);
    const prev=y>0?px.slice((y-1)*stride,y*stride):Buffer.alloc(stride);
    for(let i=0;i<stride;i++){
      const a=i>=ch?cur[i-ch]:0, b=prev[i], c=i>=ch?prev[i-ch]:0, x=line[i];
      let v;
      if(ft===0)v=x; else if(ft===1)v=x+a; else if(ft===2)v=x+b; else if(ft===3)v=x+((a+b)>>1);
      else{const pa=Math.abs(b-c),pb=Math.abs(a-c),pc=Math.abs(a+b-2*c);v=x+(pa<=pb&&pa<=pc?a:pb<=pc?b:c);}
      cur[i]=v&255;
    }
  }
  return {ihdr,px,ch};
}
function crc32(buf){
  let c,t=[];
  for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c;}
  let crc=0xFFFFFFFF;
  for(let i=0;i<buf.length;i++)crc=t[(crc^buf[i])&255]^(crc>>>8);
  return (crc^0xFFFFFFFF)>>>0;
}
function chunk(type,data){
  const len=Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td=Buffer.concat([Buffer.from(type),data]);
  const crc=Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len,td,crc]);
}
// codifica con filtrado adaptativo (prueba los 5 filtros por fila y se queda con el de menor suma absoluta)
function encode(px,w,h,ch,color,extra=[]){
  const stride=w*ch;
  const out=Buffer.alloc(h*(stride+1));
  let p=0;
  for(let y=0;y<h;y++){
    const cur=px.slice(y*stride,(y+1)*stride);
    const prev=y>0?px.slice((y-1)*stride,y*stride):Buffer.alloc(stride);
    let bestF=0,bestScore=Infinity,bestLine=null;
    for(let f=0;f<5;f++){
      const line=Buffer.alloc(stride); let score=0;
      for(let i=0;i<stride;i++){
        const a=i>=ch?cur[i-ch]:0, b=prev[i], c=i>=ch?prev[i-ch]:0, x=cur[i];
        let v;
        if(f===0)v=x; else if(f===1)v=x-a; else if(f===2)v=x-b; else if(f===3)v=x-((a+b)>>1);
        else{const pa=Math.abs(b-c),pb=Math.abs(a-c),pc=Math.abs(a+b-2*c);v=x-(pa<=pb&&pa<=pc?a:pb<=pc?b:c);}
        line[i]=v&255;
        score+=line[i]<128?line[i]:256-line[i];
      }
      if(score<bestScore){bestScore=score;bestF=f;bestLine=line;}
    }
    out[p++]=bestF; bestLine.copy(out,p); p+=stride;
  }
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=color;
  const idat=zlib.deflateSync(out,{level:9,memLevel:9,windowBits:15,strategy:zlib.constants.Z_DEFAULT_STRATEGY});
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),...extra,chunk('IDAT',idat),chunk('IEND',Buffer.alloc(0))]);
}
module.exports={decode,encode,chunk};
