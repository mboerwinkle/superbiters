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
		this.fixedpoints = [];
	}
	add_block(block){
		this.blocks.push(block);
		block.world = this;
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
		let rollmeback = (1 == (1&pen));
		let myidx = (pen >> 1)-1;
		let c = x+y*this.cgridx;
		let v = this.cgrid[c];
		if(v == 0){
			// Nothing at all is in this spot yet.
			this.cgrid[c] = pen;
		}else{
			if(v == 1){
				// You've collided with the fixed map
				let cid = (255 << 8) | myidx;
				if(rollmeback && !(cid in this.collisions)){
					this.collisions[cid] = [x,y,false,true];
				}
				return;
			}
			let otheridx = (v >> 1)-1;
			let rollotherback = (1 == (1&v));
			if(rollmeback && !rollotherback){
				// promote as rollback
				this.cgrid[c] = pen;
			}
			if(otheridx == myidx){
				// this is the same object
				return;
			}
			if(!(rollmeback || rollotherback)){
				// we are different, but neither person has to rollback
				return;
			}
			let cid = null;
			let rollfirstback = null;
			let rollsecondback = null;
			if(otheridx < myidx){
				cid = (otheridx << 8) | myidx;
				rollfirstback = rollotherback;
				rollsecondback = rollmeback;
			}else{
				cid = (myidx << 8) | otheridx;
				rollfirstback = rollmeback;
				rollsecondback = rollotherback;
			}
			if(cid in this.collisions){
				let coll = this.collisions[cid];
				// attempt to promote rollback status
				coll[2] = coll[2] || rollfirstback;
				coll[3] = coll[3] || rollsecondback;
			}else{
				this.collisions[cid] = [x,y,rollfirstback,rollsecondback];
			}
		}
	}
	step(time){
		let cgridbuf = new ArrayBuffer(this.cgridx*this.cgridy);
		this.cgrid = new Uint8Array(cgridbuf);
		this.fixedpoints.forEach((p) => this.cgrid[p] = 1);
		this.collisions = {};
		this.blocks.forEach((b, idx) => {
			b.step(time);
			// draw on the collision map the convex hull of the current block and the stepped block
			// The hull causes other people to rollback, but not me.
			this.cdrawpoly(idx*2+2, hull(b.points().concat(b.npoints())));
			// The new position (which is inside the hull) causes me to rollback, but not (necessarily) other people.
			// The anti-tunnel tail follows the same rules as the new position
			// We draw the anti-tunnel tail first to hopefully get an accurate 'first collision' point (especially for small, fast, objects).
			let p1 = this.to_cgrid_coords([b.cx,b.cy]);
			let p2 = this.to_cgrid_coords([b.ncx,b.ncy]);
			this.cdrawline(idx*2+3, p1[0],p1[1],p2[0],p2[1]);
			this.cdrawpoly(idx*2+3, b.npoints());
			//this.cdrawpoly(idx+1, b.npoints());
		});
		for(let k in this.collisions){
			let o1idx = k & 255;
			let o2idx = k >> 8;
			let o1 = this.blocks[o1idx];
			let o2 = this.blocks[o2idx];
			let coll = this.collisions[k];
			let lx = (coll[0]+0.5)*this.cgridsize;
			let ly = (coll[1]+0.5)*this.cgridsize;
			let rollback1 = coll[3];
			let rollback2 = coll[2];
//			console.log('collisioninfo ids:', o1idx+'('+rollback1+')', o2idx+'('+rollback2+')', 'location: ('+lx+','+ly+')');
			
			//rollback movement
			if(rollback1 && !(o1.has_rollback)){
				// haven't already rolled-back
				o1.rollback_count += 1;
				o1.has_rollback = true;
			}
			if(rollback2 && !(o2.has_rollback)){
				// haven't already rolled-back
				o2.rollback_count += 1;
				o2.has_rollback = true;
			}
			// 1 for elastic, 0 for inelastic
			let restitution = 0.5;
//			if(o1.rollback_count > 1 && o2.rollback_count > 1){
				// energy is lost once per collision, not after
//				restitution = 1.0;
//			}
			let s1 = o1.get_point_speed(lx,ly);
			let s2 = null;
			if(o2idx == 255){
				// The map is stationary
				s2 = [0,0];
			}else{
				s2 = o2.get_point_speed(lx,ly);
			}
			let vdelta = [s2[0]-s1[0],s2[1]-s1[1]];
			if(vdelta[0] == 0 && vdelta[1] == 0){
				//console.log('not moving',s1,s2);
				continue;
			}
			let impulse_dir = norm(vdelta);
//			console.log('points into block:',o1.surface_vec_points_in([lx,ly], impulse_dir), !o2.surface_vec_points_in([lx, ly], impulse_dir));
			let o1pointsinside = o1.surface_vec_points_in([lx,ly], impulse_dir);
			let o2pointsinside = false;
			if(o2idx != 255){
				o2pointsinside = !o2.surface_vec_points_in([lx,ly], impulse_dir);
			}
			if(!o1pointsinside || !o2pointsinside){
				// These items may actually be colliding while moving away from each other.
				if(o1pointsinside || o2pointsinside){
//					console.log("points-inside disagreement");
				}else{
//					ctx.strokeStyle = '#ff0000';
//					ctx.beginPath();
//					ctx.moveTo(lx, ly);
//					ctx.lineTo(lx+impulse_dir[0]*0.5, ly+impulse_dir[1]*0.5);
//					ctx.stroke();
					continue;
//					console.log("points-outside collision");
				}
//			}
			}
			let vdeltamag = Math.sqrt(vdelta[0]*vdelta[0]+vdelta[1]*vdelta[1]);
			let m1 = o1.get_effective_mass(lx,ly,impulse_dir);
			if(o2idx == 255){
				// Collided with the map
				o1.apply_impulse([lx,ly], impulse_dir, m1*(1+restitution)*vdeltamag);
			}else{
				let m2 = o2.get_effective_mass(lx,ly,impulse_dir);
				//https://en.wikipedia.org/wiki/Inelastic_collision
				let impulse_mag = (m1*m2)/(m1+m2)*(1+restitution)*vdeltamag;
				o1.apply_impulse([lx,ly], impulse_dir, impulse_mag);
				o2.apply_impulse([lx,ly], impulse_dir, -impulse_mag);
			}
		}
		let rollback_max = 30;
		for(let oidx = 0; oidx < this.blocks.length; oidx++){
			let o = this.blocks[oidx];
			if(o.rollback_count > rollback_max){
				o.rollback_count = 0;
				// Excessive rollbacks triggers removing all velocity
				o.vx = 0;
				o.vy = 0;
				o.vr = 0;
			}
		}
	}
	swap(){
		this.blocks.forEach((b) => b.swap());
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
	// meters*scale = pixel
	draw(ctx, scale){
		ctx.lineWidth = 1/16; // approx 1 px
//		ctx.fillStyle = '#FFFFFF';
//		ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);
//		ctx.transform(scale,0,0,-scale,0,ctx.canvas.height);
		//ctx.scale(scale, scale);
		ctx.lineJoin = "round";
	//	this.blocks.forEach((b) => {
	//		this.drawpoly('#000000', b.points(), ctx);
		//	this.drawpoly('#303030', b.npoints(), ctx);
			//this.drawpoly('#ff0000', hull(b.points().concat(b.npoints())), ctx);
		//});
		// Draw Text
/*			ctx.fillStyle = '#000000';
			ctx.font = '0.1px monospace';
			let t = ctx.getTransform();
			ctx.transform(1, 0, 0, -1, 0, world.height);
			//Rotation
			this.blocks.forEach((b) => ctx.fillText(b.vr, b.cx, world.height-b.cy));
			ctx.setTransform(t);
	*/	// Draw collision grid
	/*		ctx.fillStyle = '#0000ff50';
			for(let x = 0; x < this.cgridx; x++){
				for(let y = 0; y < this.cgridy; y++){
					if(0 != this.cgrid[x+y*this.cgridx]){
						ctx.fillRect(x*this.cgridsize, y*this.cgridsize, this.cgridsize, this.cgridsize);
					}
				}
			}*/
		//
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
	constructor(width, height, mass, i_moment, cx, cy, rot, vx, vy, vr, gravity = 0){
		this.width = width;
		this.height = height;
		this.radius2 = Math.pow(width/2, 2)+Math.pow(height/2, 2);
		this.radius = Math.sqrt(this.radius2);
		this.mass = mass;
		this.cx = cx;
		this.cy = cy;
		this.rot = rot;
		this.ncx = cx;
		this.ncy = cy;
		this.nrot = rot;
		this.vx = vx;
		this.vy = vy;
		this.vr = vr;
		this.i_moment = i_moment;
		this.gravity = gravity;
		this.rollback_count = 0;
		this.has_rollback = false;
		this.world = null;
	}
	swap(){
		if(this.has_rollback){
			// Needs to rollback
			this.has_rollback = false;
		}else{
			// Doesn't need to rollback, so advance to the new position.
			this.cx = this.ncx;
			this.cy = this.ncy;
			this.rot = this.nrot;
			this.rollback_count = 0;
		}
	}
	step(time){
		//limit speeds
		let speed = Math.sqrt(this.vx*this.vx+this.vy*this.vy);
		if(speed > 2400){
			this.vx *= 2400/speed;
			this.vy *= 2400/speed;
		}
		if(Math.abs(this.vr) > 10*Math.PI){
			this.vr *= 10*Math.PI/this.vr;
		}
		this.nrot = this.rot+this.vr*time;
		while(this.nrot >= 2*Math.PI) this.nrot -= 2*Math.PI;
		while(this.nrot < 0) this.nrot += 2*Math.PI;
		this.vy -= this.gravity*time;
		this.ncx = this.cx+this.vx*time;
		this.ncy = this.cy+this.vy*time;
		// this drag formula is not accurate at all, TODO
		this.vx *= (1-0.1*time);
		this.vy *= (1-0.1*time);
		this.vr *= (1-0.1*time);
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
	surface_vec_points_in(l, v){
		l = [l[0] - this.cx, l[1] - this.cy];
		// unrotate point and vec
		let rot = -this.rot;
		let xr = l[0]*Math.cos(rot) - l[1]*Math.sin(rot);
		let yr = l[0]*Math.sin(rot) + l[1]*Math.cos(rot);
		let vx = v[0]*Math.cos(rot) - v[1]*Math.sin(rot);
		let vy = v[0]*Math.sin(rot) + v[1]*Math.cos(rot);
		// scale point and vec to 'squarify' the scenario
//		let aspect = this.width/this.height;
//		yr *= aspect;
//		vy *= aspect;
		if(xr < 0){
			xr *= -1;
			vx *= -1;
		}
		if(yr < 0){
			yr *= -1;
			vy *= -1;
		}
		let vec = null;
		if(xr >= this.width/2-this.world.cgridsize*0.707 && yr >= this.height/2-this.world.cgridsize*0.707){
			return vx < 0 || vy < 0;
		}else if(xr/this.width > yr/this.height){
			// we are on the high-x wall. Use the x vector
			return vx < 0;
		}else{
			// we are on the high-y wall. Use the y vector
			return vy < 0;
		}
	}
/*	get_point_momentum(x, y){
		//relative
		let rx = x-this.cx;
		let ry = y-this.cy;
		let dist2 = rx*rx+ry*ry;
		let dist = Math.sqrt(dist2);
		let vx = this.vx*this.mass;
		let vy = this.vy*this.mass;
		if(dist != 0){
			let vr = this.vr*this.i_moment;
			vx += (-ry/dist)*vr;
			vy += (rx/dist)*vr;
		}
		//determine the radial and linear components of vx and vy to determine the proportion of rmass vs mass
		return [vx,vy];
	}*/
	get_point_speed(x, y){
		//relative
		let rx = x-this.cx;
		let ry = y-this.cy;
		//let dist = Math.sqrt(rx*rx+ry*ry);
		//let vr = this.vr*dist;
		//let vx = this.vx+(-ry/dist)*vr;
		//let vy = this.vy+(rx/dist)*vr;
		let vx = this.vx-ry*this.vr;
		let vy = this.vy+rx*this.vr;
		return [vx,vy];
	}
	drag_to(internal_loc, worldloc, time, ctx){
		let x = internal_loc[0];
		let y = internal_loc[1];
		let rot = this.rot;
		let xr = x*Math.cos(rot) - y*Math.sin(rot);
		let yr = x*Math.sin(rot) + y*Math.cos(rot);
		xr += this.cx;
		yr += this.cy;
		let current_v = this.get_point_speed(xr, yr);
		let dx = worldloc[0] - xr;
		let dy = worldloc[1] - yr;
		dx = dx*time*this.mass*100;
		dy = dy*time*this.mass*100;
//		dx = (dx-current_v[0])*time*this.mass*100;
//		dy = (dy-current_v[1])*time*this.mass*100;
		let dist = Math.sqrt(dx*dx+dy*dy);
		if(dist == 0) return;
//		console.log('dragging, dist:', dist, dx, dy);
		let dir = [dx/dist, dy/dist];
		let mag = dist;
		this.apply_impulse([xr, yr], dir, mag, ctx);
	}
	get_effective_mass(x,y,dir){
		if(this.i_moment == Infinity) return this.mass;
		let loc = [x-this.cx, y-this.cy];
		let lnorm = norm(loc);
		let purely_linear_component = lnorm[0]*dir[0] + lnorm[1]*dir[1];
		let ret = Math.abs(purely_linear_component)*this.mass;
		let mixed_vecx = dir[0] - purely_linear_component*lnorm[0];
		let mixed_vecy = dir[1] - purely_linear_component*lnorm[1];
		let mixed_vec_mag = Math.sqrt(mixed_vecx*mixed_vecx+mixed_vecy*mixed_vecy);
		let offset = Math.sqrt(loc[0]*loc[0]+loc[1]*loc[1]);
		let rmass = this.i_moment/(offset*offset);
		let mixed_linear = rmass/(rmass+this.mass);
		ret += mixed_linear*this.mass*mixed_vec_mag;
		ret += (1-mixed_linear)*(rmass)*mixed_vec_mag;
		return ret;
	}
	apply_impulse(aloc, dir, mag){
		let loc = [aloc[0]-this.cx, aloc[1]-this.cy];
		let normloc = norm(loc);
		// Handle purely-linear component
		let purely_linear_component = normloc[0]*dir[0] + normloc[1]*dir[1];
		this.vx += mag*purely_linear_component/this.mass * normloc[0];
		this.vy += mag*purely_linear_component/this.mass * normloc[1];
		let mixed_vecx = dir[0] - purely_linear_component*normloc[0];
		let mixed_vecy = dir[1] - purely_linear_component*normloc[1];
		let mixed_vec_mag = Math.sqrt(mixed_vecx*mixed_vecx+mixed_vecy*mixed_vecy);
		// this can be done without a square root, using cross product
		let offset2 = (loc[0]*mixed_vecy - loc[1]*mixed_vecx);
		let offset = Math.sqrt(loc[0]*loc[0]+loc[1]*loc[1]);
//		console.log('2 offsets should be same',offset, offset2);
		let mixed_linear = 1;
		if(this.i_moment != Infinity){
			let rmass = this.i_moment/(offset*offset);
			mixed_linear = rmass / (rmass+this.mass);
			let dr = mag*(1-mixed_linear)*mixed_vec_mag/(rmass*offset);
			if(offset2 < 0){
				this.vr -= dr;
			}else{
				this.vr += dr;
			}
		}
		this.vx += mag*mixed_vecx*mixed_linear/this.mass;
		this.vy += mag*mixed_vecy*mixed_linear/this.mass;
	}
	points(){
		let width2 = this.width/2;
		let height2 = this.height/2;
		let cos = Math.cos(this.rot);
		let sin = Math.sin(this.rot);
		let cx = this.cx;
		let cy = this.cy;
		let o1x = width2*cos - height2*sin;
		let o1y = width2*sin + height2*cos;
		let o2x = width2*cos + height2*sin;
		let o2y = width2*sin - height2*cos;
		return [
			[cx+o1x, cy+o1y],
			[cx+o2x, cy+o2y],
			[cx-o1x, cy-o1y],
			[cx-o2x, cy-o2y],
		];
	}
	npoints(){
		let width2 = this.width/2;
		let height2 = this.height/2;
		let cos = Math.cos(this.nrot);
		let sin = Math.sin(this.nrot);
		let cx = this.ncx;
		let cy = this.ncy;
		let o1x = width2*cos - height2*sin;
		let o1y = width2*sin + height2*cos;
		let o2x = width2*cos + height2*sin;
		let o2y = width2*sin - height2*cos;
		return [
			[cx+o1x, cy+o1y],
			[cx+o2x, cy+o2y],
			[cx-o1x, cy-o1y],
			[cx-o2x, cy-o2y],
		];
	}
}
