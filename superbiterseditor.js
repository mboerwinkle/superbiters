"use strict";
let canv = document.getElementById("gamecanvas");
document.getElementById("totalform").reset();
let map = new MapDefinition();
let mapinst = null;
let tool_add_object = document.getElementById("tool_add_object");
let tool_mode_delete = document.getElementById("tool_mode_delete");
let tool_mode_add = document.getElementById("tool_mode_add");
let tool_add_rotation = document.getElementById("tool_add_rotation");
let rotation_display = document.getElementById("rotation_display");
let exportmapbutton = document.getElementById("exportmapbutton");
let importmapbutton = document.getElementById("importmapbutton");
let runbutton = document.getElementById("runbutton");
let stopbutton = document.getElementById("stopbutton");
let mapnameinput = document.getElementById("mapnameinput");
let input_map_script = document.getElementById('input_map_script');
let running = false;
function runsim(run){
	if(run && !running){
		mapinst = new Map(map);
	}else if(!run){
		mapinst = null;
	}
	running = run;
	reeval_enabled();
}
async function import_map(){
	let file = document.getElementById('importfileinput').files[0];
	console.log("Import file. Length:",file.size);
	map = await import_map_definition(file);
	reeval_enabled();
}
function set_map_name(){
	map.name = mapnameinput.value.replace(/[^\p{Alpha}0-9-_.()]/gu, '_');
	mapnameinput.value = map.name;
}
async function export_map(){
	let b = await map.export();
	var link = document.createElement("a"); // Or maybe get it from the current document
	link.href = URL.createObjectURL(b);
	link.download = map.name+".sm.gz";
	link.click();
	URL.revokeObjectURL(link.href);
}
document.getElementById("farbackground_input").onchange = function(){
	map.farbackground = document.createElement("IMG");
	map.farbackground.src = URL.createObjectURL(this.files[0]);
}
document.getElementById("background_input").onchange = function(){
	map.background = document.createElement("IMG");
	map.background.src = URL.createObjectURL(this.files[0]);
}
document.getElementById("inplane_input").onchange = function(){
	map.inplane = document.createElement("IMG");
	map.inplane.onload = function(){map.recalc_walls()};
	map.inplane.src = URL.createObjectURL(this.files[0]);
	reeval_enabled();
}
document.getElementById("foreground_input").onchange = function(){
	map.foreground = document.createElement("IMG");
	map.foreground.src = URL.createObjectURL(this.files[0]);
}
tool_mode_add.onchange = reeval_enabled;
tool_mode_delete.onchange = reeval_enabled;
tool_add_object.onchange = function(){
	reeval_enabled();
}
tool_add_rotation.oninput = function(){
	rotation_display.innerText = tool_add_rotation.value.padStart(3, ' ');
}
input_map_script.onchange = function(){
	map.script = input_map_script.value;
}
function reeval_enabled(){
	mapnameinput.value = map.name;
	if(map.script != null) input_map_script.value = map.script;
	tool_mode_add.disabled = true;
	tool_mode_delete.disabled = true;
	tool_add_object.disabled = true;
	tool_add_rotation.disabled = true;
	exportmapbutton.disabled = true;
	importmapbutton.disabled = true;
	runbutton.disabled = true;
	stopbutton.disabled = true;
	if(!running){
		importmapbutton.disabled = false;
	}
	if(map.inplane != null){
		if(running){
			stopbutton.disabled = false;
		}else{
			runbutton.disabled = false;
			tool_mode_add.disabled = false;
			tool_mode_delete.disabled = false;
			if(tool_mode_add.checked){
				tool_add_object.disabled = false;
				if(tool_add_object.value[0] != '$'){
					tool_add_rotation.disabled = false;
				}else{
					tool_add_rotation.value = 0;
				}
			}
			exportmapbutton.disabled = false;
		}
	}
}
reeval_enabled();
let object_definitions = null;
get_object_definitions().then((d) => {
	object_definitions = d;
	for(let k in object_definitions){
		let opt = document.createElement('option');
		opt.value = k;
		opt.innerText = k;
		tool_add_object.appendChild(opt);
	}
});

let ctx = canv.getContext('2d');

let scale = canv.width/50;//canvaswidth(px)/worldwidth(m)
let transform = [scale, 0, 0, scale, 0, 0];
let inverttransform = invert_affine(transform);
function canvas_to_game_coords(c){
	let m = inverttransform;
	let x = c[0];
	let y = c[1];
	return [x*m[0]+y*m[2]+m[4], x*m[1]+y*m[3]+m[5]];
}
let substeps = 10;
let fps = 60;
let speedmult = 1;
window.setInterval(function () {
	ctx.clearRect(0, 0, canv.width, canv.height);
	if(map.farbackground != null){
		ctx.drawImage(map.farbackground, 0,0, 800,400);
	}
	if(map.background != null){
		ctx.drawImage(map.background, 0,0, 800,400);
	}
	if(map.inplane != null){
		ctx.drawImage(map.inplane, 0,0, 800,400);
	}
	ctx.setTransform(...transform);
	if(running){
		for(let i = 0; i < substeps; i++){
			mapinst.world.step(1/fps/substeps);
			mapinst.world.swap();
			if(block != null){
				block.b.drag_to(block.l, ptr, 1/fps/substeps, ctx);
			}
		}
		mapinst.draw(ctx);
	}else{
		map.draw_map_objects(ctx);
		if(tool_mode_add.checked){
			// draw preview pre-place item
			object_definitions[tool_add_object.value].draw(ctx, ptr[0], ptr[1], tool_add_rotation.value*Math.PI/180);
		}else if(tool_mode_delete.checked){
			let closest = map.closest_object(ptr[0], ptr[1]);
			if(closest != null) map.draw_highlight_object(ctx, closest);
		}
	}
	ctx.resetTransform();
	if(map.foreground != null){
		ctx.drawImage(map.foreground, 0,0, 800,400);
	}
}, 1000/fps/speedmult);

let block = null;
let ptr = [0,0];
canv.addEventListener('pointermove', (evt) => {
	ptr = canvas_to_game_coords([evt.offsetX, evt.offsetY]);
});
canv.addEventListener('pointerup', (evt) => {
	block = null;
});
canv.addEventListener('pointerleave', (evt) => {
	block = null;
});
canv.addEventListener('pointerout', (evt) => {
	block = null;
});
canv.addEventListener('pointerdown', (evt) => {
	if(running){
		block = mapinst.world.get_block_at(canvas_to_game_coords([evt.offsetX, evt.offsetY]));
		console.log("block:",block);
	}else{
		if(tool_mode_add.checked){
			map.place_object(tool_add_object.value, ptr[0], ptr[1], tool_add_rotation.value*Math.PI/180);
		}else if(tool_mode_delete.checked){
			let closest = map.closest_object(ptr[0], ptr[1]);
			if(closest != null) map.delete_object(closest);
		}
	}
});
