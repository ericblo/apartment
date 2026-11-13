// Scan -> cleaned game asset. Usage: node build.js scan.glb outdir
const fs=require('fs');const sharp=require('sharp');const {PNG}=require('pngjs');const {read}=require('./glb.cjs');
const src=process.argv[2],out=process.argv[3];
(async()=>{
const g=read(src);const A=116*Math.PI/180,ca=Math.cos(A),sa=Math.sin(A);
const nv=g.pos.length/3;const pos=new Float32Array(g.pos.length);
for(let i=0;i<pos.length;i+=3){const x=g.pos[i],z=g.pos[i+2];pos[i]=x*ca+z*sa;pos[i+1]=g.pos[i+1];pos[i+2]=-x*sa+z*ca;}
const idx=g.idx,nt=idx.length/3;
const inBox=(x,y,z,b)=>x>b[0]&&x<b[1]&&y>b[2]&&y<b[3]&&z>b[4]&&z<b[5];
const MIRROR=[2.55,4.15,-1,3,-2.12,0.95];        // reflected ghost room off the hallway
const BED=[6.22,7.98,0.16,1.35,-3.2,-0.5];       // roommate + bedding (replaced by a clean bed in-game)
const JUNK=[1.6,2.76,0.08,3,-2.72,-2.08];        // warped slabs where the kitchen meets the hallway (mirror fallout)
const keep=new Uint8Array(nt);
for(let t=0;t<nt;t++){const a=idx[t*3]*3,b=idx[t*3+1]*3,c=idx[t*3+2]*3;
 const cx=(pos[a]+pos[b]+pos[c])/3,cy=(pos[a+1]+pos[b+1]+pos[c+1])/3,cz=(pos[a+2]+pos[b+2]+pos[c+2])/3;
 const mny=Math.min(pos[a+1],pos[b+1],pos[c+1]);
 if(cy>2.42||mny>2.3)continue; if(inBox(cx,cy,cz,MIRROR))continue; if(inBox(cx,cy,cz,BED))continue; if(inBox(cx,cy,cz,JUNK))continue; keep[t]=1;}
// weld by position, drop tiny floating islands
const key=new Map();const rep=new Int32Array(nv);
for(let v=0;v<nv;v++){const k=Math.round(pos[v*3]*2000)+'_'+Math.round(pos[v*3+1]*2000)+'_'+Math.round(pos[v*3+2]*2000);let r=key.get(k);if(r===undefined){r=v;key.set(k,v);}rep[v]=r;}
const par=new Int32Array(nv);for(let i=0;i<nv;i++)par[i]=i;const find=x=>{while(par[x]!==x){par[x]=par[par[x]];x=par[x];}return x;};
for(let t=0;t<nt;t++){if(!keep[t])continue;const a=find(rep[idx[t*3]]),b=find(rep[idx[t*3+1]]),c=find(rep[idx[t*3+2]]);par[b]=a;par[find(c)]=a;}
const cnt=new Map();for(let t=0;t<nt;t++){if(!keep[t])continue;const r=find(rep[idx[t*3]]);cnt.set(r,(cnt.get(r)||0)+1);}
let dropped=0;for(let t=0;t<nt;t++){if(keep[t]&&cnt.get(find(rep[idx[t*3]]))<120){keep[t]=0;dropped++;}}
console.log('components',cnt.size,'dropped island tris',dropped);
// compact
const SMOOTH_ITERS=+(process.env.SMOOTH||10),MEDIAN=+(process.env.MEDIAN||3),EVEN=+(process.env.EVEN||0.6);
const map=new Int32Array(nv).fill(-1);let n2=0;const nidx=[];
for(let t=0;t<nt;t++){if(!keep[t])continue;for(let k=0;k<3;k++){const v=idx[t*3+k];if(map[v]<0)map[v]=n2++;nidx.push(map[v]);}}
let P=new Float32Array(n2*3),UV=new Float32Array(n2*2),COL=new Uint8Array(n2*4);
const sm=(e0,e1,x)=>{const t=Math.min(1,Math.max(0,(x-e0)/(e1-e0)));return t*t*(3-2*t);};
const BASE=0.2; // material colour is 1/BASE, so vertex colour BASE == unchanged
for(let v=0;v<nv;v++){const m=map[v];if(m<0)continue;P[m*3]=pos[v*3];P[m*3+1]=pos[v*3+1];P[m*3+2]=pos[v*3+2];UV[m*2]=g.uv[v*2];UV[m*2+1]=g.uv[v*2+1];
 const x=pos[v*3],z=pos[v*3+2];
 const w=sm(1.7,2.5,x)*(1-sm(5.2,5.9,x))*sm(-4.1,-3.9,z)*(1-sm(-2.4,-1.9,z)); // dark hallway
 const gain=1+3.2*w;const c=Math.round(255*BASE*gain);COL[m*4]=c;COL[m*4+1]=c;COL[m*4+2]=Math.round(c*(1-0.04*w));COL[m*4+3]=255;}

// ---- clean-up pass: fill small holes, smooth the surface, flatten the floor, even out lighting ----
let Pa=Array.from(P),UVa=Array.from(UV);const Ia=Array.from(nidx);
{ // weld compacted verts by position
  const wk=new Map();const wrep=new Int32Array(n2);
  for(let v=0;v<n2;v++){const k=Math.round(P[v*3]*2000)+'_'+Math.round(P[v*3+1]*2000)+'_'+Math.round(P[v*3+2]*2000);let r=wk.get(k);if(r===undefined){r=v;wk.set(k,v);}wrep[v]=r;}
  // boundary edges (directed a->b with no b->a twin)
  const E=new Set();for(let t=0;t<Ia.length;t+=3)for(let k=0;k<3;k++){E.add(wrep[Ia[t+k]]+'>'+wrep[Ia[t+(k+1)%3]]);}
  const out=new Map();let nb=0;
  for(let t=0;t<Ia.length;t+=3)for(let k=0;k<3;k++){const a=Ia[t+k],b=Ia[t+(k+1)%3];const ra=wrep[a],rb=wrep[b];if(ra===rb)continue;if(!E.has(rb+'>'+ra)){nb++;
    // the hole runs the other way round: b -> a
    if(!out.has(rb))out.set(rb,[]);out.get(rb).push({a:b,b:a,to:ra});}}
  let filled=0,ftris=0;const used=new Set();
  for(const [start,list] of out){for(const e0 of list){if(used.has(e0))continue;const loop=[];let e=e0,ok=true;
     for(let guard=0;guard<400;guard++){if(used.has(e)){ok=false;break;}used.add(e);loop.push(e);if(e.to===start)break;const nx=(out.get(e.to)||[]).find(x=>!used.has(x));if(!nx){ok=false;break;}e=nx;if(guard===399)ok=false;}
     if(!ok||loop.length<3)continue;
     let per=0,cx=0,cy=0,cz=0;for(const q of loop){const a=q.a*3,b=q.b*3;per+=Math.hypot(Pa[a]-Pa[b],Pa[a+1]-Pa[b+1],Pa[a+2]-Pa[b+2]);cx+=Pa[a];cy+=Pa[a+1];cz+=Pa[a+2];}
     if(per>2.6)continue;cx/=loop.length;cy/=loop.length;cz/=loop.length;
     for(const q of loop){const c=Pa.length/3;Pa.push(cx,cy,cz);UVa.push((UVa[q.a*2]+UVa[q.b*2])/2,(UVa[q.a*2+1]+UVa[q.b*2+1])/2);Ia.push(q.a,q.b,c);ftris++;}
     filled++;}}
  console.log('boundary edges',nb,'holes filled',filled,'tris added',ftris);
}
n2=Pa.length/3;P=new Float32Array(Pa);UV=new Float32Array(UVa);COL=new Uint8Array(n2*4);
{ // Taubin smoothing on welded vertices, borders pinned
  const wk=new Map();const wrep=new Int32Array(n2);
  for(let v=0;v<n2;v++){const k=Math.round(P[v*3]*2000)+'_'+Math.round(P[v*3+1]*2000)+'_'+Math.round(P[v*3+2]*2000);let r=wk.get(k);if(r===undefined){r=v;wk.set(k,v);}wrep[v]=r;}
  const nbr=new Map();const E=new Set();const add=(a,b)=>{if(a===b)return;let s=nbr.get(a);if(!s){s=new Set();nbr.set(a,s);}s.add(b);};
  for(let t=0;t<Ia.length;t+=3)for(let k=0;k<3;k++){const a=wrep[Ia[t+k]],b=wrep[Ia[t+(k+1)%3]];add(a,b);add(b,a);E.add(a+'>'+b);}
  const pin=new Uint8Array(n2);for(const k of E){const [a,b]=k.split('>');if(!E.has(b+'>'+a)){pin[+a]=1;pin[+b]=1;}}
  // vertices only move along their normal, so the texture does not slide over the surface
  const N=new Float32Array(n2*3);
  const normals=()=>{N.fill(0);for(let t=0;t<Ia.length;t+=3){const a=wrep[Ia[t]],b=wrep[Ia[t+1]],c=wrep[Ia[t+2]];
     const ux=P[b*3]-P[a*3],uy=P[b*3+1]-P[a*3+1],uz=P[b*3+2]-P[a*3+2],vx=P[c*3]-P[a*3],vy=P[c*3+1]-P[a*3+1],vz=P[c*3+2]-P[a*3+2];
     const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;for(const q of [a,b,c]){N[q*3]+=nx;N[q*3+1]+=ny;N[q*3+2]+=nz;}}
   for(let v=0;v<n2;v++){const l=Math.hypot(N[v*3],N[v*3+1],N[v*3+2])||1;N[v*3]/=l;N[v*3+1]/=l;N[v*3+2]/=l;}};
  const pass=(f)=>{const Q=new Float32Array(P.length);Q.set(P);for(const [v,s] of nbr){if(pin[v])continue;let x=0,y=0,z=0;for(const u of s){x+=P[u*3];y+=P[u*3+1];z+=P[u*3+2];}const n=s.size;
     const dx=x/n-P[v*3],dy=y/n-P[v*3+1],dz=z/n-P[v*3+2];const d=f*(dx*N[v*3]+dy*N[v*3+1]+dz*N[v*3+2]);
     Q[v*3]=P[v*3]+d*N[v*3];Q[v*3+1]=P[v*3+1]+d*N[v*3+1];Q[v*3+2]=P[v*3+2]+d*N[v*3+2];}P.set(Q);};
  for(let it=0;it<SMOOTH_ITERS;it++){normals();pass(0.5);pass(-0.53);}
  for(let v=0;v<n2;v++){const r=wrep[v];if(r!==v){P[v*3]=P[r*3];P[v*3+1]=P[r*3+1];P[v*3+2]=P[r*3+2];}}
  // flatten the floor
  for(let v=0;v<n2;v++){const y=P[v*3+1];if(y>-0.09&&y<0.028)P[v*3+1]=0;}
}
const tex0=g.bin.slice(g.json.bufferViews[g.json.images[0].bufferView].byteOffset||0,(g.json.bufferViews[g.json.images[0].bufferView].byteOffset||0)+g.json.bufferViews[g.json.images[0].bufferView].byteLength);
// slightly richer colour and contrast for a more illustrated feel
const texStyled=await sharp(tex0,{limitInputPixels:false}).resize(4096,4096,{kernel:'lanczos3'}).modulate({saturation:1.14}).linear(1.04,-4).jpeg({quality:92}).toBuffer();
// lighting field: how bright/what tint each part of the apartment was captured at
const LS=1024;const {data:ld}=await sharp(tex0,{limitInputPixels:false}).resize(LS,LS).removeAlpha().raw().toBuffer({resolveWithObject:true});
const LC=0.5,LX0=-12.5,LZ0=-4.5,LNX=48,LNZ=19;const cellS=Array.from({length:LNX*LNZ},()=>[]);
for(let v=0;v<n2;v++){const i=Math.floor((P[v*3]-LX0)/LC),j=Math.floor((P[v*3+2]-LZ0)/LC);if(i<0||j<0||i>=LNX||j>=LNZ||P[v*3+1]>2.2)continue;let u=UV[v*2],w=UV[v*2+1];u-=Math.floor(u);w-=Math.floor(w);
  const o=(Math.min(LS-1,Math.floor(w*LS))*LS+Math.min(LS-1,Math.floor(u*LS)))*3;cellS[j*LNX+i].push([ld[o],ld[o+1],ld[o+2]]);}
const field=new Float32Array(LNX*LNZ*3),fk=new Uint8Array(LNX*LNZ);
cellS.forEach((arr,k)=>{if(arr.length<40)return;arr.sort((a,b)=>(a[0]+a[1]+a[2])-(b[0]+b[1]+b[2]));const lo=Math.floor(arr.length*0.55),hi=Math.floor(arr.length*0.9);let s=[0,0,0];for(let q=lo;q<hi;q++){s[0]+=arr[q][0];s[1]+=arr[q][1];s[2]+=arr[q][2];}
  for(let c=0;c<3;c++)field[k*3+c]=s[c]/(hi-lo);fk[k]=1;});
{let cur=fk.slice();for(let it=0;it<60;it++){const nx=cur.slice();let ch=0;for(let j=0;j<LNZ;j++)for(let i=0;i<LNX;i++){const k=j*LNX+i;if(cur[k])continue;let s=[0,0,0],c=0;for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1]]){const a=i+di,b=j+dj;if(a<0||b<0||a>=LNX||b>=LNZ)continue;const kk=b*LNX+a;if(cur[kk]){s[0]+=field[kk*3];s[1]+=field[kk*3+1];s[2]+=field[kk*3+2];c++;}}
   if(c){for(let q=0;q<3;q++)field[k*3+q]=s[q]/c;nx[k]=1;ch++;}}cur=nx;if(!ch)break;}}
const fblur=(src)=>{const o=new Float32Array(src.length);for(let j=0;j<LNZ;j++)for(let i=0;i<LNX;i++){let s=[0,0,0],c=0;for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){const a=i+di,b=j+dj;if(a<0||b<0||a>=LNX||b>=LNZ)continue;const kk=b*LNX+a;s[0]+=src[kk*3];s[1]+=src[kk*3+1];s[2]+=src[kk*3+2];c++;}const k=j*LNX+i;for(let q=0;q<3;q++)o[k*3+q]=s[q]/c;}return o;};
const fld=fblur(fblur(field));
const med=(c)=>{const a=[];for(let k=0;k<LNX*LNZ;k++)if(fk[k])a.push(fld[k*3+c]);a.sort((x,y)=>x-y);return a[Math.floor(a.length*0.6)];};
const TGT=[med(0),med(1),med(2)];console.log('light target',TGT.map(Math.round));
const gainAt=(x,z)=>{const fx=Math.min(LNX-1.001,Math.max(0,(x-LX0)/LC-0.5)),fz=Math.min(LNZ-1.001,Math.max(0,(z-LZ0)/LC-0.5));const i=Math.floor(fx),j=Math.floor(fz),tx=fx-i,tz=fz-j;const out=[0,0,0];
  for(let c=0;c<3;c++){const v=(fld[(j*LNX+i)*3+c]*(1-tx)+fld[(j*LNX+i+1)*3+c]*tx)*(1-tz)+(fld[((j+1)*LNX+i)*3+c]*(1-tx)+fld[((j+1)*LNX+i+1)*3+c]*tx)*tz;
   out[c]=Math.min(1.8,Math.max(0.82,Math.pow(TGT[c]/Math.max(8,v),EVEN)));}return out;}; // gain in display (sRGB) terms
for(let v=0;v<n2;v++){const gn=gainAt(P[v*3],P[v*3+2]);for(let c=0;c<3;c++)COL[v*4+c]=Math.min(255,Math.round(255*BASE*Math.pow(gn[c],2.2)));COL[v*4+3]=255;}

const I=new Uint32Array(Ia);console.log('verts',n2,'tris',I.length/3);
// write glb
const bv=g.json.bufferViews[g.json.images[0].bufferView];const tex=g.bin.slice(bv.byteOffset||0,(bv.byteOffset||0)+bv.byteLength);
const pad=b=>{const p=(4-b.length%4)%4;return p?Buffer.concat([b,Buffer.alloc(p)]):b;};
const bufs=[texStyled,Buffer.from(P.buffer),Buffer.from(UV.buffer),Buffer.from(COL.buffer),Buffer.from(I.buffer)].map(b=>Buffer.from(b));
let o=0;const bvs=bufs.map(b=>{const r={buffer:0,byteOffset:o,byteLength:b.length};o+=pad(b).length;return r;});
let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];for(let i=0;i<P.length;i+=3)for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],P[i+k]);mx[k]=Math.max(mx[k],P[i+k]);}
const json={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{name:'apartment',mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0,TEXCOORD_0:1,COLOR_0:2},indices:3,material:0}]}],
 materials:[{name:'scan',pbrMetallicRoughness:{baseColorTexture:{index:0},metallicFactor:0,roughnessFactor:1}}],textures:[{source:0,sampler:0}],samplers:[{magFilter:9729,minFilter:9987}],
 images:[{bufferView:0,mimeType:'image/jpeg'}],
 accessors:[{bufferView:1,componentType:5126,count:n2,type:'VEC3',min:mn,max:mx},{bufferView:2,componentType:5126,count:n2,type:'VEC2'},{bufferView:3,componentType:5121,normalized:true,count:n2,type:'VEC4'},{bufferView:4,componentType:5125,count:I.length,type:'SCALAR'}],
 bufferViews:bvs,buffers:[{byteLength:o}]};
let jb=Buffer.from(JSON.stringify(json));jb=Buffer.concat([jb,Buffer.alloc((4-jb.length%4)%4,0x20)]);const bin=Buffer.concat(bufs.map(pad));
const h=Buffer.alloc(12);h.writeUInt32LE(0x46546C67,0);h.writeUInt32LE(2,4);h.writeUInt32LE(28+jb.length+bin.length,8);
const c1=Buffer.alloc(8);c1.writeUInt32LE(jb.length,0);c1.writeUInt32LE(0x4E4F534A,4);const c2=Buffer.alloc(8);c2.writeUInt32LE(bin.length,0);c2.writeUInt32LE(0x004E4942,4);
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/clean.glb',Buffer.concat([h,c1,jb,c2,bin]));
// ---- grids (5cm) ----
const X0=-12.4,Z0=-4.3,CS=0.05,NX=480,NZ=186,N=NX*NZ;
const has=new Uint8Array(N),flr=new Uint8Array(N),obs=new Uint8Array(N);
const S=2048;const {data:td}=await sharp(texStyled,{limitInputPixels:false}).resize(S,S).removeAlpha().raw().toBuffer({resolveWithObject:true});
const fc=new Float32Array(N*3),fn=new Float32Array(N);
for(let t=0;t<I.length;t+=3){const a=I[t],b=I[t+1],c=I[t+2];
 const ax=P[a*3],ay=P[a*3+1],az=P[a*3+2],bx=P[b*3],by=P[b*3+1],bz=P[b*3+2],cx=P[c*3],cy=P[c*3+1],cz=P[c*3+2];
 const l=Math.max(Math.hypot(bx-ax,by-ay,bz-az),Math.hypot(cx-ax,cy-ay,cz-az));const n=Math.max(1,Math.ceil(l/0.025));
 for(let i=0;i<=n;i++)for(let j=0;j<=n-i;j++){const u=i/n,v=j/n,w=1-u-v;const x=ax*w+bx*u+cx*v,y=ay*w+by*u+cy*v,z=az*w+bz*u+cz*v;
  const gi=Math.floor((x-X0)/CS),gj=Math.floor((z-Z0)/CS);if(gi<0||gj<0||gi>=NX||gj>=NZ)continue;const k=gj*NX+gi;has[k]=1;
  if(y<0.14){flr[k]=1;let tu=UV[a*2]*w+UV[b*2]*u+UV[c*2]*v,tv=UV[a*2+1]*w+UV[b*2+1]*u+UV[c*2+1]*v;tu-=Math.floor(tu);tv-=Math.floor(tv);
   const o=(Math.min(S-1,Math.floor(tv*S))*S+Math.min(S-1,Math.floor(tu*S)))*3;const gn=gainAt(x,z);fc[k*3]+=td[o]*gn[0];fc[k*3+1]+=td[o+1]*gn[1];fc[k*3+2]+=td[o+2]*gn[2];fn[k]++;}
  if(y>0.3&&y<1.4)obs[k]=1;}}
// footprint: scanned cells, closed, plus small enclosed holes; minus the mirror ghost
const dil=(m,r)=>{const o=new Uint8Array(N);for(let j=0;j<NZ;j++)for(let i=0;i<NX;i++){let f=0;for(let dj=-r;dj<=r&&!f;dj++)for(let di=-r;di<=r;di++){if(di*di+dj*dj>r*r)continue;const a=i+di,b=j+dj;if(a>=0&&b>=0&&a<NX&&b<NZ&&m[b*NX+a]){f=1;break;}}o[j*NX+i]=f;}return o;};
const inv=m=>m.map(v=>v?0:1);const ero=(m,r)=>inv(dil(inv(m),r));
let foot=ero(dil(has,3),3);
// fill enclosed holes < 3.2 m^2
{const seen=new Uint8Array(N);for(let s=0;s<N;s++){if(foot[s]||seen[s])continue;const q=[s];seen[s]=1;let edge=false;for(let h=0;h<q.length;h++){const k=q[h],i=k%NX,j=(k/NX)|0;if(i===0||j===0||i===NX-1||j===NZ-1)edge=true;
   for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1]]){const a=i+di,b=j+dj;if(a<0||b<0||a>=NX||b>=NZ)continue;const kk=b*NX+a;if(!foot[kk]&&!seen[kk]){seen[kk]=1;q.push(kk);}}}
  if(!edge&&q.length*CS*CS<3.2)for(const k of q)foot[k]=1;}}
const cellIn=(k,b)=>{const x=X0+(k%NX+0.5)*CS,z=Z0+(((k/NX)|0)+0.5)*CS;return x>b[0]&&x<b[1]&&z>b[4]&&z<b[5];};
for(let k=0;k<N;k++)if(cellIn(k,MIRROR))foot[k]=0;
// floor colour: known floor cells, diffused into unknown
const col=new Float32Array(N*3),known=new Uint8Array(N);for(let k=0;k<N;k++)if(fn[k]>0&&!obs[k]){known[k]=1;for(let c=0;c<3;c++)col[k*3+c]=fc[k*3+c]/fn[k];}
let cur=known.slice();for(let it=0;it<400;it++){const nx=cur.slice();let ch=0;for(let j=0;j<NZ;j++)for(let i=0;i<NX;i++){const k=j*NX+i;if(cur[k])continue;let r=0,gg=0,b=0,c=0;
  for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]){const a=i+di,bb=j+dj;if(a<0||bb<0||a>=NX||bb>=NZ)continue;const kk=bb*NX+a;if(cur[kk]){r+=col[kk*3];gg+=col[kk*3+1];b+=col[kk*3+2];c++;}}
  if(c){col[k*3]=r/c;col[k*3+1]=gg/c;col[k*3+2]=b/c;nx[k]=1;ch++;}}cur=nx;if(!ch)break;}
// blur colours (box 9) for a soft, painterly fill
const blur=(src,r)=>{const o=new Float32Array(src.length);for(let j=0;j<NZ;j++)for(let i=0;i<NX;i++){let s=[0,0,0],c=0;for(let dj=-r;dj<=r;dj++)for(let di=-r;di<=r;di++){const a=i+di,b=j+dj;if(a<0||b<0||a>=NX||b>=NZ)continue;const kk=b*NX+a;s[0]+=src[kk*3];s[1]+=src[kk*3+1];s[2]+=src[kk*3+2];c++;}const k=j*NX+i;o[k*3]=s[0]/c;o[k*3+1]=s[1]/c;o[k*3+2]=s[2]/c;}return o;};
const bc=blur(blur(col,4),4);
const fp=new PNG({width:NX,height:NZ});for(let k=0;k<N;k++){fp.data[k*4]=Math.min(255,bc[k*3]);fp.data[k*4+1]=Math.min(255,bc[k*3+1]);fp.data[k*4+2]=Math.min(255,bc[k*3+2]);fp.data[k*4+3]=foot[k]?255:0;}
fs.writeFileSync(out+'/floor.png',PNG.sync.write(fp));
// soft shadow under the whole apartment
{const sh=new Float32Array(N);for(let k=0;k<N;k++)sh[k]=foot[k];const b1=(s,r)=>{const t=new Float32Array(N),o=new Float32Array(N);for(let j=0;j<NZ;j++)for(let i=0;i<NX;i++){let a=0,c=0;for(let d=-r;d<=r;d++){const x=i+d;if(x>=0&&x<NX){a+=s[j*NX+x];}c++;}t[j*NX+i]=a/c;}
  for(let j=0;j<NZ;j++)for(let i=0;i<NX;i++){let a=0,c=0;for(let d=-r;d<=r;d++){const y=j+d;if(y>=0&&y<NZ){a+=t[y*NX+i];}c++;}o[j*NX+i]=a/c;}return o;};
 const s2=b1(b1(sh,7),7);const sp=new PNG({width:NX,height:NZ});for(let k=0;k<N;k++){sp.data[k*4]=40;sp.data[k*4+1]=26;sp.data[k*4+2]=20;sp.data[k*4+3]=Math.round(150*s2[k]);}
 fs.writeFileSync(out+'/shadow.png',PNG.sync.write(sp));}
// ---- nav grid (10cm) ----
const GS=0.1,GX=NX/2,GZ=NZ/2;const free=new Uint8Array(N);for(let k=0;k<N;k++)free[k]=foot[k]&&!obs[k]?1:0;
// the new bed is solid
for(let k=0;k<N;k++)if(cellIn(k,[6.25,7.95,0,0,-2.7,-0.5]))free[k]=0;
const safe=ero(free,2); // 20cm body radius
const nav=new Uint8Array(GX*GZ);for(let j=0;j<GZ;j++)for(let i=0;i<GX;i++){nav[j*GX+i]=(safe[(j*2)*NX+i*2]&&safe[(j*2)*NX+i*2+1]&&safe[(j*2+1)*NX+i*2]&&safe[(j*2+1)*NX+i*2+1])?1:0;}
// keep only the largest connected region
{const lab=new Int32Array(GX*GZ).fill(-1);let best=-1,bs=0,id=0;const sizes=[];for(let s=0;s<nav.length;s++){if(!nav[s]||lab[s]>=0)continue;const q=[s];lab[s]=id;for(let h=0;h<q.length;h++){const k=q[h],i=k%GX,j=(k/GX)|0;for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1]]){const a=i+di,b=j+dj;if(a<0||b<0||a>=GX||b>=GZ)continue;const kk=b*GX+a;if(nav[kk]&&lab[kk]<0){lab[kk]=id;q.push(kk);}}}sizes.push(q.length);if(q.length>bs){bs=q.length;best=id;}id++;}
 console.log('nav regions',sizes.sort((a,b)=>b-a).slice(0,8));for(let k=0;k<nav.length;k++)if(lab[k]!==best)nav[k]=0;}
let rows=[];for(let j=0;j<GZ;j++){let s='';for(let i=0;i<GX;i++)s+=nav[j*GX+i]?'1':'0';rows.push(s);}
fs.writeFileSync(out+'/nav.json',JSON.stringify({x0:X0,z0:Z0,cell:GS,w:GX,h:GZ,rows}));
fs.writeFileSync(out+'/meta.json',JSON.stringify({x0:X0,z0:Z0,w:NX*CS,d:NZ*CS,min:mn,max:mx}));
const np=new PNG({width:GX*4,height:GZ*4});for(let j=0;j<GZ*4;j++)for(let i=0;i<GX*4;i++){const k=(j>>2)*GX+(i>>2);const o=(j*GX*4+i)*4;const f=foot[(j>>2)*2*NX+(i>>2)*2];let v=nav[k]?[80,210,110]:f?[150,70,70]:[25,25,25];if(i%40===0||j%40===0)v=v.map(x=>(x+255)>>1);np.data[o]=v[0];np.data[o+1]=v[1];np.data[o+2]=v[2];np.data[o+3]=255;}
fs.writeFileSync(out+'/nav_debug.png',PNG.sync.write(np));
})();
