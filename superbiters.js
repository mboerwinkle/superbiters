"use strict";

let canv = document.getElementById("gamecanvas");
let ctx = canv.getContext('2d');

let world = new World(5,5,0.025);
world.add_block(new Block(4.8, 0.05, 1e80, 2.5, 0.05, 0, 0, 0, 0)); // tabletop
world.add_block(new Block(4.8, 0.05, 1e80, 2.5, 3, 0, 0, 0, 0)); // tabletop
world.add_block(new Block(0.05, 2.8, 1e80, 4.9, 1.5, 0, 0, 0, 0)); // tabletop
world.add_block(new Block(0.05, 2.8, 1e80, 0.1, 1.5, 0, 0, 0, 0)); // tabletop
// Big spinner hitting small fast block
//world.add_block(new Block(0.1, 0.1, 0.25, 0.25, 1, 0, 1, 0, 1, 9.8));
//world.add_block(new Block(0.2, 0.2, 2, 1.5, 1, 0, -0.4, 0, 6, 9.8));
// Axis separation test
world.add_block(new Block(0.5, 0.5, 0.25, 0.5, 1.5, 0, 10, 0.2, 0, 9.8));
world.add_block(new Block(0.5, 0.5, 0.25, 2.5, 1.5, 0, -10, 0.2, 0, 9.8));
// Stacking
//world.add_block(new Block(0.5, 0.5, 0.25, 2.5, 2.0, 0, 0, 0.2, 0, 9.8));
//world.add_block(new Block(0.5, 0.5, 0.25, 2.5, 0.8, 0, 0, 0.2, 0, 9.8));
// Block hitting wall
//world.add_block(new Block(0.5, 0.5, 0.25, 0.5, 1.5, 0, -5, 0, 0, 9.8));
// Stationary swinging lever
//world.add_block(new Block(0.2, 1, 0.25, 0.5, 2.1, 0, 0, 0, 3, 9.8));
//world.add_block(new Block(0.2, 1, 0.25, 0.5, 1, 0, 0, 0, -3, 9.8));
// Rotating into each other
//world.add_block(new Block(0.5, 0.5, 0.25, 1, 1.5, 0, 0, 0, -1, 9.8));
//world.add_block(new Block(0.5, 0.5, 0.25, 1.6, 1.5, 0, 0, 0, 1, 9.8));


window.setInterval(function () {
	world.step(1/60);
	ctx.resetTransform();
	ctx.clearRect(0, 0, canv.width, canv.height);
	world.draw(ctx, canv.width/world.width);
	world.swap();
}, 1000/60); 
