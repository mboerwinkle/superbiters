"use strict";

let canv = document.getElementById("gamecanvas");
let ctx = canv.getContext('2d');

let world = new World(5,5, 0.04);
world.add_block(new Block(4.8, 0.05, 1e25, 2.5, 0.05, 0, 0, 0, 0)); // tabletop
world.add_block(new Block(4.8, 0.05, 1e25, 2.5, 3, 0, 0, 0, 0)); // tabletop
world.add_block(new Block(0.05, 2.8, 1e25, 4.9, 1.5, 0, 0, 0, 0)); // tabletop
world.add_block(new Block(0.05, 2.8, 1e25, 0.1, 1.5, 0, 0, 0, 0)); // tabletop
// Big spinner hitting small fast block
//world.add_block(new Block(0.1, 0.1, 0.25, 0.25, 1, 0, 4, 1, 1, 9.8));
world.add_block(new Block(0.2, 0.2, 2, 1.5, 1, 0, -0.4, 1, 6, 9.8));
// Axis separation test
//world.add_block(new Block(0.5, 0.5, 1.25, 0.5, 1.5, 0, 8, 1, 0, 9.8));
//world.add_block(new Block(0.5, 0.5, 2, 4.5, 1.6, 0, -3, 1, 0, 9.8));
// Stacking
world.add_block(new Block(0.5, 0.1, 0.25, 2.5, 3.2, 0, 0, 0.2, 0, 9.8));
world.add_block(new Block(0.5, 0.1, 0.25, 2.5, 3.4, 0, 0, 0.2, 0, 9.8));
world.add_block(new Block(0.7, 0.2, 0.25, 3, 3.8, 0, 0, 0.2, 0, 9.8));
world.add_block(new Block(0.5, 0.1, 0.25, 2.5, 3.6, 0, 0, 0.2, 0, 9.8));
// Block hitting wall
//world.add_block(new Block(0.5, 0.5, 0.25, 0.5, 1.5, 0, -5, 0, 0, 9.8));
// Stationary swinging lever
world.add_block(new Block(0.2, 1, 0.25, 0.5, 2.1, 0, 0, 0, 3, 9.8));
//world.add_block(new Block(0.2, 1, 0.25, 0.5, 1, 0, 0, 0, -3, 0));
// Rotating into each other
//world.add_block(new Block(0.5, 0.5, 0.25, 1, 1.5, 0, 0, 0, -1, 9.8));
//world.add_block(new Block(0.5, 0.5, 0.25, 1.6, 1.5, 0, 0, 0, 1, 9.8));
// Triangle stack
world.add_block(new Block(0.5, 0.5, 0.1, 3.35, 2, 0, 0, 0, 0, 9.8));
world.add_block(new Block(0.5, 0.5, 0.1, 3.7, 0.4, 0, 0, 0, 0, 9.8));
world.add_block(new Block(0.5, 0.5, 0.1, 3, 0.4, 0, 0, 0, 0, 9.8));
world.add_block(new Block(0.5, 0.5, 0.1, 3.35, 1.3, 0.2, 0, 0, 0, 9.8));



let substeps = 1;
let fps = 60;
let speedmult = 1;
window.setInterval(function () {
	for(let i = 0; i < substeps; i++){
		world.step(1/fps/substeps);
		ctx.resetTransform();
		ctx.clearRect(0, 0, canv.width, canv.height);
		world.draw(ctx, canv.width/world.width);
		world.swap();
		if(block != null){
			block.b.drag_to(block.l, ptr, 1/fps/substeps, ctx);
		}
	}
}, 1000/fps/speedmult);

let block = null;
let ptr = [0,0];
canv.addEventListener('pointermove', (evt) => {
	ptr = world.canvas_to_game_coords([evt.offsetX, evt.offsetY]);
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
	block = world.get_block_at(world.canvas_to_game_coords([evt.offsetX, evt.offsetY]));
	console.log(block);
});
