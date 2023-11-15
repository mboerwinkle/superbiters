"use strict";
function norm(v){
	let d = 0;
	for(let idx = 0; idx < v.length; idx++){
		d += v[idx]*v[idx];
	}
	d = Math.sqrt(d);
	return v.map((x) => x/d);
}
function orientation(p,q,r){
	return (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1]);
}
function affine_determinant(m){
	//0 2 4
	//1 3 5
	return m[0]*m[3]-m[2]*m[1];
}
function invert_affine(m){
	let d = affine_determinant(m);
	if(d == 0){
		console.log('non-invertable');
		return 'non-invertable';
	}
	return [
		m[3]/d,
		-m[1]/d,
		-m[2]/d,
		m[0]/d,
		(m[2]*m[5] - m[3]*m[4])/d,
		(m[1]*m[4] - m[0]*m[5])/d
	];
}
function hull(pts){
	//console.log('hull');
	//console.log(pts);
	// Gift-Wrapping/Jarvis
	let leftmostidx = 0;
	let leftmostx = pts[0][0];
	for(let lidx = 1; lidx < pts.length; lidx++){
		if(pts[lidx][0] < leftmostx){
			leftmostx = pts[lidx][0];
			leftmostidx = lidx;
		}
	}
	let ptonhull = leftmostidx;
	let ret = [];
	while(true){
		ret.push(pts[ptonhull]);
		let endpoint = 0;
		if(ptonhull == 0){
			endpoint = 1;
		}
		for(let j = 1; j < pts.length; j++){
			if(j == ptonhull) continue;
			if(orientation(pts[ptonhull], pts[endpoint], pts[j]) < 0){
				endpoint = j;
			}
		}
		ptonhull = endpoint;
		if(ptonhull == leftmostidx){
			break;
		}
	}
	//console.log(ret);
	return ret;
}
class World{
	constructor(width, height, cgridsize){
		this.width = width;
		this.height = height;
		this.cgridsize = cgridsize;
		this.cgridx = width/cgridsize+1;
		this.cgridy = height/cgridsize+1;
		this.cgrid = [];
		this.collisions = [];
		this.blocks = [];
		this.steppedblocks = [];
		this.last_transform = [1,0,0,1,0,0];
	}
	add_block(block){
		this.blocks.push(block);
	}
	to_cgrid_coords(pt){
		return [Math.trunc(pt[0]/this.cgridsize), Math.trunc(pt[1]/this.cgridsize)];
	}
	cdrawpoly(pen, pts){
		let lastp = this.to_cgrid_coords(pts[pts.length-1]);
		for(let pidx = 0; pidx < pts.length; pidx++){
			let p = this.to_cgrid_coords(pts[pidx]);
			this.cdrawline(pen, p[0], p[1], lastp[0], lastp[1]);
			lastp = p;
		}
	}
	cdrawline(pen, x0,y0,x1,y1){
		let dx = Math.abs(x1 - x0);
		let dy = -Math.abs(y1 - y0);
		let sx = (x0 < x1) ? 1 : -1;
		let sy = (y0 < y1) ? 1 : -1;
		let err = dx + dy;
		this.cdrawpoint(pen,x0,y0);
		if(Number.isNaN(x0) ||Number.isNaN(x1)||Number.isNaN(y0)||Number.isNaN(y1)) return;
		while (true) {
			if (x0 == x1 && y0 == y1) {
				break;
			}
        		let e2 = 2 * err;
			if (e2 >= dy) {
				if(x0 == x1) break;
				err += dy;
				x0 += sx;
				this.cdrawpoint(pen,x0,y0);
			}
			if (e2 <= dx) {
				if(y0 == y1) break;
				err += dx;
				y0 += sy;
				this.cdrawpoint(pen,x0,y0);
			}
		}
		this.cdrawpoint(pen, x0, y0);
	}
	cdrawpoint(pen, x,y){
		if(x < 0 || y < 0 || x >= this.cgridx || y >= this.cgridy) return;
		let c = x+y*this.cgridx;
		let v = this.cgrid[c];
		if(v == 0){
			this.cgrid[c] = pen;
		}else{
			if(v == pen) return;
			if(v < pen){
				this.collisions[((v << 8) | pen)] = [x,y];
			}else{
				this.collisions[((pen << 8) | v)] = [x,y];
			}
		}
	}
	step(time){
		this.steppedblocks = this.blocks.map((b) => b.createstepped(time));
		let cgridbuf = new ArrayBuffer(this.cgridx*this.cgridy);
		this.cgrid = new Uint8Array(cgridbuf);
		this.collisions = {};
		for(let idx = 0; idx < this.blocks.length; idx++){
			// draw on the collision map the convex hull of the current block and the stepped block
			this.cdrawpoly(idx+1, hull(this.blocks[idx].points().concat(this.steppedblocks[idx].points())));
		}
		
	}
	swap(){
		this.blocks = this.steppedblocks;
		this.steppedblocks = [];
	}
	get_block_at(c){
		for(let idx = 0; idx < this.blocks.length; idx++){
			let ret = this.blocks[idx].contains_point(c[0],c[1]);
			if(ret != false){
				return {b:this.blocks[idx], l:ret};
			}
		}
		return null;
	}
	canvas_to_game_coords(c){
		let m = invert_affine(this.last_transform);
		let x = c[0];
		let y = c[1];
		return [x*m[0]+y*m[2]+m[4], x*m[1]+y*m[3]+m[5]];
	}
	// meters*scale = pixel
	draw(ctx, scale){
		ctx.lineWidth = 1/scale; // approx 1 px
		ctx.resetTransform();
		ctx.fillStyle = '#FFFFFF';
		ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);
		ctx.transform(scale,0,0,-scale,0,ctx.canvas.height);
		this.last_transform = ((t) => [t.a,t.b,t.c,t.d,t.e,t.f])(ctx.getTransform());
		//ctx.scale(scale, scale);
		ctx.lineJoin = "round";
		this.blocks.forEach((b) => this.drawpoly('#000000', b.points(), ctx));
//		this.steppedblocks.forEach((b) => this.drawpoly('#303030', b.points(), ctx));
		//for(let idx = 0; idx < this.blocks.length; idx++){
		//	this.drawpoly('#ff0000', hull(this.blocks[idx].points().concat(this.steppedblocks[idx].points())), ctx);
		//}
		// Draw Text
		/*
			ctx.fillStyle = '#000000';
			ctx.font = '0.1px monospace';
			let t = ctx.getTransform();
			ctx.transform(1, 0, 0, -1, 0, world.height);
			//Rotation
			this.blocks.forEach((b) => ctx.fillText(b.vr, b.cx, world.height-b.cy));
			ctx.setTransform(t);
		*/
		//
		// Draw collision grid
/*			ctx.fillStyle = '#0000ff50';
			for(let x = 0; x < this.cgridx; x++){
				for(let y = 0; y < this.cgridy; y++){
					if(0 != this.cgrid[x+y*this.cgridx]){
						ctx.fillRect(x*this.cgridsize, y*this.cgridsize, this.cgridsize, this.cgridsize);
					}
				}
			}
		*/ //
		for(let k in this.collisions){
			let o1idx = (k & 255) - 1;
			let o2idx = (k >> 8) - 1;
			//console.log(o1idx, o2idx);
			//rollback movement
			let o1 = this.blocks[o1idx];
			let o2 = this.blocks[o2idx];
			let i1 = this.steppedblocks[o1idx];
			let i2 = this.steppedblocks[o2idx];
			if(o1 !== i1){
				// haven't already rolled-back
				o1.rollback_count += 1;
				o1.vx = i1.vx;
				o1.vy = i1.vy;
				o1.vr = i1.vr;
				this.steppedblocks[o1idx] = o1;
			}
			if(o2 !== i2){
				// haven't already rolled-back
				o2.rollback_count += 1;
				o2.vx = i2.vx;
				o2.vy = i2.vy;
				o2.vr = i2.vr;
				this.steppedblocks[o2idx] = o2;
			}
			let restitution = 0.7;
//			if(o1.rollback_count > 1 && o2.rollback_count > 1){
				// energy is lost once per collision, not after
//				restitution = 1.0;
//			}
			let lx = (this.collisions[k][0]+0.5)*this.cgridsize;
			let ly = (this.collisions[k][1]+0.5)*this.cgridsize;
			ctx.strokeStyle = '#00ff00';
			ctx.beginPath();
			ctx.arc(lx,ly, 0.05, 0, 2*Math.PI);
			ctx.stroke();
			// 1 for elastic, 0 for inelastic
			let s1 = o1.get_point_status(lx,ly);
			let s2 = o2.get_point_status(lx,ly);
			let vdelta = [s2[0]-s1[0],s2[1]-s1[1]];
			if(vdelta[0] == 0 && vdelta[1] == 0){
				//console.log('not moving',s1,s2);
				continue;
			}
			let impulse_dir = norm(vdelta);
			let m1 = o1.get_effective_mass(lx,ly,impulse_dir);
			let m2 = o2.get_effective_mass(lx,ly,impulse_dir);
			let vdeltamag = Math.sqrt(vdelta[0]*vdelta[0]+vdelta[1]*vdelta[1]);
			//https://en.wikipedia.org/wiki/Inelastic_collision
			let impulse_mag = (m1*m2)/(m1+m2)*(1+restitution)*vdeltamag;
			//console.log("impulse mag:",impulse_mag);
			o1.apply_impulse([lx,ly], impulse_dir, impulse_mag);
			o2.apply_impulse([lx,ly], impulse_dir, -impulse_mag);
			ctx.strokeStyle = '#00ff00';
			ctx.beginPath();
			ctx.moveTo(lx,ly);
			ctx.lineTo(lx+impulse_dir[0]*impulse_mag, ly+impulse_dir[1]*impulse_mag);
			ctx.stroke();
			ctx.strokeStyle = '#000000';
			ctx.beginPath();
			ctx.moveTo(lx+s1[0], ly+s1[1]);
			ctx.lineTo(lx, ly);
			ctx.lineTo(lx+s2[0], ly+s2[1]);
			ctx.stroke();
		}
		let momentum_cluster_rollback_targets = [];
		for(let oidx = 0; oidx < this.blocks.length; oidx++){
			let o = this.blocks[oidx];
			let rollback_max = 30;
/*			if(o.rollback_strategy == 0){
				if(o.rollback_count > rollback_max/2){
					o.rollback_strategy += 1;
					o.rollback_count = 0;
					//form sets of chronic rollback blocks.
					//remove all rotation, and distribute linear momentum only to give them all the same linear velocity, and reset their rollback counter
					momentum_cluster_rollback_targets.push(oidx);
				}
			}else{*/
				if(o.rollback_count > rollback_max+o.rollback_strategy*5){
					o.rollback_count = 0;
					//subsequent rollbacks remove all velocity
					//console.log('stopped rollback items');
					o.vx = 0;
					o.vy = 0;
					o.vr = 0;
					o.rollback_strategy = (o.rollback_strategy+1)%6;
				}
//			}
		}
		while(momentum_cluster_rollback_targets.length > 0){
			// build momentum clusters
			let t = momentum_cluster_rollback_targets.pop();
			let mc = [t];
			for(let k in this.collisions){
				let o1idx = (k & 255) - 1;
				let o2idx = (k >> 8) - 1;
				if(o1idx == t){
					// this should be made more efficient by sorting m_c_r_t and doing a single binary search, instead of a linear search
					let mcrtidx = momentum_cluster_rollback_targets.indexOf(o2idx);
					if(mcrtidx != -1){
						// Item exists
						momentum_cluster_rollback_targets.splice(mcrtidx, 1);
					}
					mc.push(o2idx);
				}else if(o2idx == t){
					// this should be made more efficient by sorting m_c_r_t and doing a single binary search, instead of a linear search
					let mcrtidx = momentum_cluster_rollback_targets.indexOf(o1idx);
					if(mcrtidx != -1){
						// Item exists
						momentum_cluster_rollback_targets.splice(mcrtidx, 1);
					}
					mc.push(o1idx);
				}
			}
			// momentum sums
			let sum_mx = 0;
			let sum_my = 0;
			// mass sum
			let sum_mass = 0;
			// convert from a list of indexes to a list of blocks
			mc = mc.map((idx) => this.blocks[idx]);
			for(let b in mc){
				sum_mass += b.mass;
				sum_mx += b.vx*b.mass;
				sum_my += b.vy*b.mass;
			}
			let svx = sum_mx/sum_mass;
			let svy = sum_my/sum_mass;
			for(let b in mc){
				mc.vx = svx;
				mc.vy = svy;
				//mc.vr = 0;
			}
		}
	}
	drawpoly(color, pts, ctx){
		ctx.strokeStyle = color;
		ctx.beginPath();
		ctx.moveTo(pts[0][0], pts[0][1]);
		for(let idx = 0; idx < pts.length; idx++){
			ctx.lineTo(pts[idx][0], pts[idx][1]);
		}
		ctx.closePath();
		ctx.stroke();
	}
}
class Block{
	constructor(width, height, mass, cx, cy, rot, vx, vy, vr, gravity = 0){
		this.width = width;
		this.height = height;
		this.radius2 = Math.pow(width/2, 2)+Math.pow(height/2, 2);
		this.radius = Math.sqrt(this.radius2);
		this.mass = mass;
		this.cx = cx;
		this.cy = cy;
		this.rot = rot;
		this.vx = vx;
		this.vy = vy;
		this.vr = vr;
		this.i_moment = (this.imoment_filled()+this.imoment_hollow())/2;
		this.gravity = gravity;
		this.rollback_count = 0;
		this.rollback_strategy = 0;
	}
	imoment_filled(){
		// Mass evenly distributed inside area
		return this.mass*(this.width*this.width+this.height*this.height)/12;
	}
	imoment_hollow(){
		// Mass concentrated at shell
		return this.mass*(this.width*this.width+this.height*this.height)/3;
	}
	createstepped(time){
		let nrot = this.rot+this.vr*time;
		while(nrot >= 2*Math.PI) nrot -= 2*Math.PI;
		while(nrot < 0) nrot += 2*Math.PI;
		let nvy = this.vy-this.gravity*time;
		return new Block(this.width, this.height, this.mass, this.cx+this.vx*time, this.cy+this.vy*time, nrot, this.vx, nvy, this.vr, this.gravity);
	}
	get_effective_mass(x,y,dir){
//		return this.mass;
		let loc = [x-this.cx, y-this.cy];
		let lnorm = norm(loc);
		let linear = 1-Math.abs(lnorm[0]*dir[1] - lnorm[1]*dir[0]);
		let offset = (loc[0]*dir[1] - loc[1]*dir[0]);
		// effective rotational mass at this point
		let rmass = this.i_moment/Math.abs(offset);
//		let rmass = this.i_moment;
		if(linear < 0.5) linear = 0.5;
		return linear*this.mass + (1-linear)*rmass;
	}
	contains_point(x, y){
		x -= this.cx;
		y -= this.cy;
		if(x*x+y*y > this.radius2) return false;
		let rot = -this.rot;
		let xr = x*Math.cos(rot) - y*Math.sin(rot);
		let yr = x*Math.sin(rot) + y*Math.cos(rot);
		if(Math.abs(xr) < this.width/2 && Math.abs(yr) < this.height/2){
			return [xr, yr];
		}else{
			return false;
		}
	}
	get_point_status(x, y){
		//relative
		let rx = x-this.cx;
		let ry = y-this.cy;
		let dist2 = rx*rx+ry*ry;
		let dist = Math.sqrt(dist2);
		let vr = this.vr*dist;
		let vx = this.vx+(-ry/dist)*vr;
		let vy = this.vy+(rx/dist)*vr;
		//determine the radial and linear components of vx and vy to determine the proportion of rmass vs mass
		return [vx,vy];
	}
	drag_to(internal_loc, worldloc, time){
		let x = internal_loc[0];
		let y = internal_loc[1];
		let rot = this.rot;
		let xr = x*Math.cos(rot) - y*Math.sin(rot);
		let yr = x*Math.sin(rot) + y*Math.cos(rot);
		xr += this.cx;
		yr += this.cy;
		console.log(xr, yr);
		let dx = worldloc[0] - xr;
		let dy = worldloc[1] - yr;
		let dist = Math.sqrt(dx*dx+dy*dy);
		if(dist == 0) return;
		console.log('dragging, dist:', dist, dx, dy);
		let dir = [dx/dist, dy/dist];
		let mag = this.mass*dist;
		this.apply_impulse([dx,dy], dir, mag);
	}
	apply_impulse(loc, dir, mag){
		loc = [loc[0]-this.cx, loc[1]-this.cy];
		let normloc = norm(loc);
		let linear = 1-Math.abs(normloc[0]*dir[1] - normloc[1]*dir[0]);
		if(linear < 0.5) linear = 0.5;
		this.vx += mag/this.mass*linear*dir[0];
		this.vy += mag/this.mass*linear*dir[1];
		let offset = (loc[0]*dir[1] - loc[1]*dir[0]);
		let dr1 = mag*offset/this.i_moment*(1-linear);
		this.vr += dr1;
	}
	points(){
		let rot = this.rot;
		let width = this.width;
		let height = this.height;
		let cx = this.cx;
		let cy = this.cy;
		let o1x = width/2*Math.cos(rot) - height/2*Math.sin(rot);
		let o1y = width/2*Math.sin(rot) + height/2*Math.cos(rot);
		let o2x = width/2*Math.cos(rot) + height/2*Math.sin(rot);
		let o2y = width/2*Math.sin(rot) - height/2*Math.cos(rot);
		return [
			[cx+o1x, cy+o1y],
			[cx+o2x, cy+o2y],
			[cx-o1x, cy-o1y],
			[cx-o2x, cy-o2y],
		];
	}
}
