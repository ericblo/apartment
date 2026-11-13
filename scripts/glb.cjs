const fs=require('fs');
exports.read=(f)=>{const b=fs.readFileSync(f);const jl=b.readUInt32LE(12);const json=JSON.parse(b.slice(20,20+jl));const bin=b.slice(20+jl+8);
 const acc=(i)=>{const a=json.accessors[i],bv=json.bufferViews[a.bufferView];const off=(bv.byteOffset||0)+(a.byteOffset||0);const n={SCALAR:1,VEC2:2,VEC3:3}[a.type];
  const T={5126:Float32Array,5125:Uint32Array,5123:Uint16Array}[a.componentType];if(bv.byteStride&&bv.byteStride!==n*T.BYTES_PER_ELEMENT)throw 'stride';
  return new T(bin.buffer.slice(bin.byteOffset+off,bin.byteOffset+off+a.count*n*T.BYTES_PER_ELEMENT));};
 const p=json.meshes[0].primitives[0];return {json,bin,pos:acc(p.attributes.POSITION),uv:acc(p.attributes.TEXCOORD_0),idx:acc(p.indices)};};
exports.write=(f,g,pos,idx,uv,texBuf)=>{ // rebuild glb
 texBuf=texBuf||g.bin.slice(g.json.bufferViews[g.json.images[0].bufferView].byteOffset||0,(g.json.bufferViews[g.json.images[0].bufferView].byteOffset||0)+g.json.bufferViews[g.json.images[0].bufferView].byteLength);
 const pad=(b)=>{const p=(4-b.length%4)%4;return p?Buffer.concat([b,Buffer.alloc(p)]):b;};
 const parts=[pad(Buffer.from(texBuf)),pad(Buffer.from(pos.buffer,pos.byteOffset,pos.byteLength)),pad(Buffer.from(uv.buffer,uv.byteOffset,uv.byteLength)),pad(Buffer.from(idx.buffer,idx.byteOffset,idx.byteLength))];
 let o=0;const bvs=parts.map((p,i)=>{const r={buffer:0,byteOffset:o,byteLength:[texBuf.length,pos.byteLength,uv.byteLength,idx.byteLength][i]};o+=p.length;return r;});
 bvs[1].target=34962;bvs[2].target=34962;bvs[3].target=34963;
 let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];for(let i=0;i<pos.length;i+=3)for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],pos[i+k]);mx[k]=Math.max(mx[k],pos[i+k]);}
 const json={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{name:'apt',mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0,TEXCOORD_0:1},indices:2,material:0}]}],
  materials:[{name:'main',pbrMetallicRoughness:{baseColorTexture:{index:0},metallicFactor:0,roughnessFactor:1}}],textures:[{source:0,sampler:0}],samplers:[{magFilter:9729,minFilter:9987}],
  images:[{bufferView:0,mimeType:g.json.images[0].mimeType}],
  accessors:[{bufferView:1,componentType:5126,count:pos.length/3,type:'VEC3',min:mn,max:mx},{bufferView:2,componentType:5126,count:uv.length/2,type:'VEC2'},{bufferView:3,componentType:5125,count:idx.length,type:'SCALAR'}],
  bufferViews:bvs,buffers:[{byteLength:o}]};
 let jb=Buffer.from(JSON.stringify(json));jb=Buffer.concat([jb,Buffer.alloc((4-jb.length%4)%4,0x20)]);const bin=Buffer.concat(parts);
 const h=Buffer.alloc(12);h.writeUInt32LE(0x46546C67,0);h.writeUInt32LE(2,4);h.writeUInt32LE(12+8+jb.length+8+bin.length,8);
 const c1=Buffer.alloc(8);c1.writeUInt32LE(jb.length,0);c1.writeUInt32LE(0x4E4F534A,4);const c2=Buffer.alloc(8);c2.writeUInt32LE(bin.length,0);c2.writeUInt32LE(0x004E4942,4);
 fs.writeFileSync(f,Buffer.concat([h,c1,jb,c2,bin]));return {mn,mx};};
