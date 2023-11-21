"use strict";
class Marchive{
	constructor(dat=null){
		this.items = {};
		if(dat != null){
			let dec = new TextDecoder();
			let ptr = 0;
			while(ptr < dat.byteLength){
				let e_name = dec.decode(new Uint8Array(dat.slice(ptr, ptr+8))).trim();
				ptr += 8;
				let suffix = e_name.split('.')[1];
				let fsize = new Uint32Array(dat.slice(ptr, ptr+4))[0];
				ptr += 4;
				let fdat = dat.slice(ptr, ptr+fsize);
				ptr += fsize;
				if(suffix == 'JSON'){
					this.items[e_name] = JSON.parse(dec.decode(new Uint8Array(fdat)));
				}else if(suffix == 'PNG'){
					this.items[e_name] = document.createElement('IMG');
					this.items[e_name].src = URL.createObjectURL(new Blob([fdat], {type:'image/png'}));
				}else{
					
				}
			}
		}
	}
	add_item(name, item){
		this.items[name] = item;
	}
	async write_to(w){
		let enc = new TextEncoder();
		let sizeBuf = new Uint32Array(new ArrayBuffer(4));
		for(let k in this.items){
			let i = this.items[k];
			let suffix = k.split('.')[1];
			w.write(enc.encode(k.padStart(8, ' ')));
			if(suffix == 'JSON'){
				let j = enc.encode(JSON.stringify(i));
				sizeBuf[0] = j.byteLength;
				w.write(sizeBuf);
				w.write(j);
			}else if(suffix == 'PNG'){
				let imgarry = await fetch(i.src).then(r => r.arrayBuffer());
				sizeBuf[0] = imgarry.byteLength;
				w.write(sizeBuf);
				w.write(imgarry);
			}
		}
	}
}
async function marchive_from(f){
	let dStream = f.stream().pipeThrough(new DecompressionStream('gzip'));
	return new Marchive(await (new Response(dStream)).blob().then((b) => b.arrayBuffer()));
}
async function marchive_compress(arch){
	let cStream = new CompressionStream('gzip');
	let writer = cStream.writable.getWriter();
	let ret = (new Response(cStream.readable)).blob();
	await arch.write_to(writer);
	writer.close();
	return await ret;
}
