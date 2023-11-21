"use strict";

let PXM = 16; // px per meter
let CGRIDSIZE = 1/PXM;
class MapDefinition{
	constructor(){
		this.name = "UnnamedMap";
		this.playerspawns = [[],[]];
		this.itemspawns = [];
		this.flagspawns = [[],[]];
		this.objects = [];
		this.walls = [];
		this.foreground = null;
		this.inplane = null;
		this.background = null;
		this.farbackground = null;
	}
	place_object(name, x, y, r){
		this.objects.push([name, x, y, r]);
	}
	delete_object(obj){
		this.objects.splice(this.objects.indexOf(obj), 1);
	}
	closest_object(x, y){
		let ret = null;
		let dist = Infinity;
		this.objects.forEach((o) => {
			let dx = x-o[1];
			let dy = y-o[2];
			let d = dx*dx+dy*dy;
			if(d < dist){
				dist = d;
				ret = o;
			}
		});
		return ret;
	}
	draw_highlight_object(ctx, obj){
		let t = ctx.getTransform();
		ctx.transform(1,0,0,1,obj[1], obj[2]);
		let r = obj[3];
		ctx.transform(Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0);
		let o = object_definitions[obj[0]];
		ctx.transform(1,0,0,1,-o.width/2,-o.height/2);
		ctx.fillStyle = '#ff000090';
		ctx.fillRect(0,0,o.width,o.height);
		ctx.fillStyle = '#00000090';
		ctx.fillRect(o.width*0.1, o.height*0.1, o.width*0.8, o.height*0.8);
		ctx.setTransform(t);	
	}
	draw_map_objects(ctx){
		this.objects.forEach((o) => {
			object_definitions[o[0]].draw(ctx, o[1],o[2],o[3]);
		});
	}
	drawSpecialItem(ctx, name, x, y, color){
		ctx.strokeStyle=color;
	}
	recalc_walls(){
		console.log('recalculating walls');
		let i = this.inplane;
		this.walls = [];
		if(i == null){
			console.log("no map loaded");
			return;
		}
		let w = i.width;
		let h = i.height;
		let tcanv = document.createElement('canvas');
		tcanv.width = w;
		tcanv.height = h;
		let tcanvctx = tcanv.getContext('2d');
		tcanvctx.drawImage(i, 0, 0);
		let dat = tcanvctx.getImageData(0,0,w,h).data;
		for(let y=1; y<h-1; y++){
			for(let x=1; x<w-1; x++){
				let alpha = dat[x*4+y*4*w+3];
				if(alpha != 0 && [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].some((c) => dat[c[0]*4+c[1]*4*w+3] == 0)){
					this.walls.push([x/PXM, y/PXM]);
				}
			}
		}
		console.log('Got '+this.walls.length+' map collision points');
	}
	async export(){
		let arch = new Marchive();
		if(this.foreground != null){
			arch.add_item('FGND.PNG', this.foreground);
		}
		if(this.inplane != null){
			arch.add_item('IPLN.PNG', this.inplane);
		}
		if(this.background != null){
			arch.add_item('BGND.PNG', this.background);
		}
		if(this.farbackground != null){
			arch.add_item('FBGD.PNG', this.farbackground);
		}
		arch.add_item('DEF.JSON', {
			"name":this.name,
			"playerspawns":this.playerspawns,
			"itemspawns":this.itemspawns,
			"flagspawns":this.flagspawns,
			"objects":this.objects
		});
		return await marchive_compress(arch);
	}
}

async function import_map_definition(f){
	let arch = (await marchive_from(f)).items;
	console.log("Imported archive contains:",Object.keys(arch));
	let ret = new MapDefinition();
	if('FGND.PNG' in arch){
		ret.foreground = arch['FGND.PNG'];
	}
	if('IPLN.PNG' in arch){
		ret.inplane = arch['IPLN.PNG'];
		if(ret.complete){
			ret.recalc_walls();
		}else{
			ret.inplane.onload = function(){ret.recalc_walls()};
		}
	}
	if('BGND.PNG' in arch){
		ret.background = arch['BGND.PNG'];
	}
	if('FBGD.PNG' in arch){
		ret.farbackground = arch['FBGD.PNG'];
	}
	let def = arch['DEF.JSON'];
	ret.name = def['name'];
	ret.playerspawns = def['playerspawns'];
	ret.itemspawns = def['itemspawns'];
	ret.flagspawns = def['flagspawns'];
	ret.objects = def['objects'];
	return ret;
}
class ObjectDefinition{
	constructor(name, mass, massdistribution, ix, iy, width, height){
		this.name = name;
		this.mass = Number(mass);
		this.pxx = Number(ix);
		this.pxy = Number(iy);
		this.pxwidth = Number(width);
		this.pxheight = Number(height);
		this.width = this.pxwidth/PXM;
		this.height = this.pxheight/PXM;
		if(/^\$(INF|([+-]?(\d+|\d*\.\d+|\d+\.\d*)([Ee][+-]?\d+)?))\$$/.test(massdistribution)){
			if(massdistribution == '$INF$'){
				this.i_moment = Infinity;
			}else{
				this.i_moment = Number(massdistribution.slice(1,-1));
			}
		}else{
			this.i_moment = this.mass*(Math.pow(this.width, 2)+Math.pow(this.height, 2))/Number(massdistribution);
		}
	}
	draw(ctx, x, y, r){
		let t = ctx.getTransform();
		ctx.transform(1,0,0,1,x,y);
		ctx.transform(Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0);
		ctx.transform(1,0,0,1,-this.width/2,-this.height/2);
		ctx.drawImage(object_textures, this.pxx, this.pxy, this.pxwidth, this.pxheight, 0,0, this.width, this.height);
		ctx.setTransform(t);
	}
}
class Obj{
	constructor(objdef, x, y, r){
		this.def = objdef;
		this.map = map;
		this.phys = new Block(objdef.width, objdef.height, objdef.mass, objdef.i_moment, x, y, r, 0, 0, 0, -9.8);
	}
	draw(ctx){
		this.def.draw(ctx, this.phys.cx, this.phys.cy, this.phys.rot);
	}
}
class Map{
	constructor(definition){
		this.def = definition;
		this.world = new World(50, 25, CGRIDSIZE);
		this.world.fixedpoints = this.def.walls.map((c) => {
			let cg = this.world.to_cgrid_coords(c);
			return cg[0]+cg[1]*this.world.cgridx;
		});
		this.objects = this.def.objects.map((o) => new Obj(object_definitions[o[0]], o[1], o[2], o[3]));
		this.objects.forEach((o) => this.world.add_block(o.phys));
	}
	draw(ctx){
		this.objects.forEach((o) => o.draw(ctx));
	}
}
let object_textures = document.createElement('IMG');
object_textures.src = "textures.png";

function get_object_definitions(){
	return new Promise((resolve) => {
	let obj_def = {};
	fetch("objects.cfg")
	 .then((r) => r.text())
	 .then((t) => {
		t.split('\n').forEach(l => {
			l = l.split('#')[0].trim();
			if(l.length == 0) return;
			let fields = l.split(/[ \t]+/);
			if(fields.length != 7){
				console.warn("invalid object definition '"+l+"'", fields);
			}
			let obj = new ObjectDefinition(...fields);
//			console.log("Loaded object '"+obj.name+"':",obj);
			obj_def[obj.name] = obj;
		});
		console.log("Loaded",Object.keys(obj_def).length,"objects");
		resolve(obj_def);
	});
	});
}
