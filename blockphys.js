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
function solve_2x2_linear(c1, c2) {
	// c1 / c2 are coefficients for Ax + By + C = 0
	// Maybe there's a better way! Or maybe not. Who cares.

	let tmp;
	// Swap top and bottom rows. We want c2[0] to be non-zero if possible.
	if (c2[0] == 0) { tmp = c2; c2 = c1; c1 = tmp; }
	// It's still 0, how frustrating.
	if (c2[0] == 0) {
		// Hopefully this case never comes up, but that means we've got no coefficient for the first variable...
		// Well, we want c2[1] to be non-zero then.
		if (c2[1] == 0) { tmp = c2; c2 = c1; c1 = tmp; }
		// No coefficients for either variable! Dang.
		if (c2[1] == 0) return [0, 0];
		return [0, -c2[2] / c2[1]];
	}
	// Okay, outside of that case, we know c2[0] is well-defined, and can produce this:
	let ratio = -c1[0] / c2[0];
	// Make a new eqn that has c3[0] == 0, to solve for y.
	let c3 = [];
	for (let i = 0; i < 3; i++) c3[i] = c1[i] + ratio*c2[i];
	let y = c3[1] ? -c3[2]/c3[1] : 0;
	// Can plug that in and use c2 to solve for x
	let x = (c2[2] + y*c2[1]) / -c2[0];
	return [x,y];
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
		this.fixedpoints = [];
	}
	add_block(block){
		this.blocks.push(block);
		block.cgridsize = this.cgridsize;
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
	cdrawline(pen, x0,y0,x1,y1, pointfunc = this.cdrawpoint.bind(this)){
		let dx = Math.abs(x1 - x0);
		let dy = -Math.abs(y1 - y0);
		let sx = (x0 < x1) ? 1 : -1;
		let sy = (y0 < y1) ? 1 : -1;
		let err = dx + dy;
		if(!pointfunc(pen,x0,y0)) return;
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
				if(!pointfunc(pen,x0,y0)) return;
			}
			if (e2 <= dx) {
				if(y0 == y1) break;
				err += dx;
				y0 += sy;
				if(!pointfunc(pen,x0,y0)) return;
			}
		}
		pointfunc(pen, x0, y0);
	}
	cdrawpoint(pen, x,y){
		if(x < 0 || y < 0 || x >= this.cgridx || y >= this.cgridy) return true;
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
				return true;
			}
			let otheridx = (v >> 1)-1;
			let rollotherback = (1 == (1&v));
			if((!rollmeback) && rollotherback){
				// promote as 'more real', 'less rollback'
				// collisions with existing locations are preferable to collisions between two new positions, because only one rollback occurs (instead of two) preventing lockup.
				// Therefore, when we get the chance to mark something for asymmetric rollback, we take it.
				// In practice, subtley, this actually doesn't typically end up overriding my own rollback points (since those are drawn second). Instead, this overwrites the other object's rollback points so that my rollback points won't see them if they happen to overlap here too.
				this.cgrid[c] = pen;
			}
			if(otheridx == myidx){
				// this is the same object
				return true;
			}
			if(!(rollmeback || rollotherback)){
				// we are different, but neither person has to rollback
				throw new Error('Unreachable - rollback location collision');
				return true;
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
		return true;
	}
	step(time){
		let cgridbuf = new ArrayBuffer(this.cgridx*this.cgridy);
		this.cgrid = new Uint8Array(cgridbuf);
		this.fixedpoints.forEach((p) => this.cgrid[p] = 1);
		this.collisions = {};
		this.blocks.forEach((b, idx) => {
			b.step(time);
			// Draw the current/rollback location. Touching this causes other folks to rollback, but not us.
			this.cdrawpoly(idx*2+2, b.points());
			// The new position touching anything causes me to rollback, but not (necessarily) other people.
			// The anti-tunnel tail follows the same rules as the new position
			// We draw the anti-tunnel tail first to hopefully get an accurate 'first collision' point (especially for small, fast, objects).
			let p1 = this.to_cgrid_coords([b.cx,b.cy]);
			let p2 = this.to_cgrid_coords([b.ncx,b.ncy]);
			this.cdrawline(idx*2+3, p1[0],p1[1],p2[0],p2[1]);
			this.cdrawpoly(idx*2+3, b.npoints());
		});
		// Process constraints
/*
previous_error := 0
integral := 0
loop:
   error := setpoint − measured_value
   proportional := error;
   integral := integral + error × dt
   derivative := (error − previous_error) / dt
   output := Kp × proportional + Ki × integral + Kd × derivative
   previous_error := error
   wait(dt)
   goto loop*/
		this.blocks.forEach((b, idx) => {
			b.constraints.forEach((c) => {
				if(c[0] == 1){
					// rotation constraint
					let pid = c[2];
					let delta = b.rot - c[1];
					if(delta < -Math.PI) delta += 2*Math.PI;
					if(delta > Math.PI) delta -= 2*Math.PI;
					pid[4] += delta*time;
					let derivative = (delta-pid[3])/time;
					b.vr -= (pid[0]*delta + pid[1]*pid[4] + pid[2]*derivative)/time;
					pid[3] = delta;
				}else if(c[0] == 2){
					// repulsor
					let cos = Math.cos(b.rot);
					let sin = Math.sin(b.rot);
					let sx = c[1][0]*cos - c[1][1]*sin;
					let sy = c[1][0]*sin + c[1][1]*cos;
					let cstart = this.to_cgrid_coords([sx+b.cx, sy+b.cy]);
					let ex = c[2][0]*cos - c[2][1]*sin;
					let ey = c[2][0]*sin + c[2][1]*cos;
					let cend = this.to_cgrid_coords([ex+b.cx, ey+b.cy]);
					let ccoll = null;
					this.cdrawline(idx, ...cstart, ...cend, (myidx, x, y) => {
						if(x < 0 || y < 0 || x >= this.cgridx || y >= this.cgridy) return true;
						let c = x+y*this.cgridx;
						let v = this.cgrid[c];
						if(v != 0){
							let otheridx = (v >> 1)-1;
							if(otheridx != myidx){
								ccoll = [x, y];
								return false;
							}
						}
						return true;
					});
					if(ccoll != null){
						ccoll[0] = (ccoll[0]+0.5)*this.cgridsize;
						ccoll[1] = (ccoll[1]+0.5)*this.cgridsize;
						// our ray collided with something, so we can possibly push.
						let pid = c[4];
						let colldist = Math.sqrt(Math.pow(ccoll[0]-b.cx, 2) + Math.pow(ccoll[1]-b.cy, 2));
						let delta = colldist - c[3];
						pid[4] += delta*time;
						let derivative = (delta-pid[3])/time;
						let dv = (pid[0]*delta + pid[1]*pid[4] + pid[2]*derivative)/time;
						let pushdir = norm([ex-sx, ey-sy]);
						pid[3] = delta;
						if(dv < 0){
							// The controller needs to know about things beyond its set distance. But also, it can't pull.
							b.vx += pushdir[0]*dv;
							b.vy += pushdir[1]*dv;
						}
					}
				}
			});
		});
		for(let k in this.collisions){
			let o1idx = k & 255;
			let o2idx = k >> 8;
			let o1 = this.blocks[o1idx];
			let o2 = this.blocks[o2idx];
			let coll = this.collisions[k];
			let contact = [(coll[0]+0.5)*this.cgridsize, (coll[1]+0.5)*this.cgridsize];
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
			let s1 = o1.get_point_speed(contact);
			let s2 = null;
			if(o2idx == 255){
				// The map is stationary
				s2 = [0,0];
			}else{
				s2 = o2.get_point_speed(contact);
			}
			let vdelta = [s2[0]-s1[0],s2[1]-s1[1]];
			if(vdelta[0] == 0 && vdelta[1] == 0){
				//console.log('not moving',s1,s2);
				continue;
			}
			let impulse_dir = norm(vdelta);
			let o1pointsinside = o1.surface_vec_points_in(contact, impulse_dir);
			let o2pointsinside = (o2idx == 255) ? true : !o2.surface_vec_points_in(contact, impulse_dir);
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
			}

			// Now we just need to construct a system of linear equations for how
			// a unit of impulse affects the vdelta, and we'll be golden.
			// Impulse has units kg*m/s, and we want acceleration velocity per unit of impulse,
			// so these items have units 1/kg.
			let o1effects = o1.impulse_response_matrix(contact);
			let o2effects;
			if(o2idx == 255) {
				o2effects = [0, 0, 0, 0];
			} else {
				o2effects = o2.impulse_response_matrix(contact);
			}
			// coeffecients for a couple matrices we need to solve...
			// Variables are X/Y components of impulse.
			// c1 is X component of velocity, c2 is Y.
			// o2 is going to receive the negation of the impulse, so no need to flip o2effects here.
			let c1 = [o1effects[0]+o2effects[0], o1effects[2]+o2effects[2], -vdelta[0]];
			let c2 = [o1effects[1]+o2effects[1], o1effects[3]+o2effects[3], -vdelta[1]];
			let soln = solve_2x2_linear(c1, c2);
			let mult = 1+restitution;
			soln[0] *= mult; soln[1] *= mult;
			o1.apply_impulse(contact, soln);
			if (o2idx != 255) {
				soln[0] *= -1; soln[1] *= -1;
				o2.apply_impulse(contact, soln);
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
		this.cgridsize = 0.1;
		this.constraints = [];
	}
	add_constraint(data){
		//May wish to reference https://pidexplained.com/how-to-tune-a-pid-controller/ for tuning instructions
		//Rotational: [1, angle, [kp, ki, kd, 0(previous error), 0(integral accumulator)]]
		//Repulsor: [2, [raystartx, raystarty], [rayendx, rayendy], desireddistance, [kp,ki,kd,0,0]]
		this.constraints.push(data);
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
		if(xr >= this.width/2-this.cgridsize*0.707 && yr >= this.height/2-this.cgridsize*0.707){
			return vx < 0 || vy < 0;
		}else if(xr/this.width > yr/this.height){
			// we are on the high-x wall. Use the x vector
			return vx < 0;
		}else{
			// we are on the high-y wall. Use the y vector
			return vy < 0;
		}
	}
	get_point_speed(l){
		return [
			this.vx-(l[1]-this.cy)*this.vr,
			this.vy+(l[0]-this.cx)*this.vr
		];
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
		this.apply_impulse([xr, yr], [dx, dy]);
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
	apply_impulse(aloc, impulse) {
		let loc = [aloc[0]-this.cx, aloc[1]-this.cy];
		this.vx += impulse[0] / this.mass;
		this.vy += impulse[1] / this.mass;
		this.vr += (impulse[1] * loc[0] - impulse[0] * loc[1]) / this.i_moment;
	}
	impulse_response_matrix(aloc) {
		let loc = [aloc[0]-this.cx, aloc[1]-this.cy];
		// Impulses have units kg*m/s.
		// `w` is angular velocity (little omega), and has units 1/s.
		// i_moment is kg*m*m.
		// angular velocity per impulse should come out to be 1/kg/m...
		// m/(kg*m*m) works out appropriately, we have the right units.
		let w_response_x = -loc[1] / this.i_moment;
		let w_response_y = loc[0] / this.i_moment;
		let linear_response = 1 / this.mass;
		// All returned values are in units of 1/kg,
		// which is speed (m/s) per impulse (kg*m/s)
		return [
			linear_response - w_response_x*loc[1],
			-w_response_y*loc[1],
			w_response_x*loc[0],
			linear_response + w_response_y*loc[0]
		];
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
