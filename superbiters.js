"use strict";
let canv = document.getElementById("gamecanvas");
let pool = null;
let rtcgroup = null;
let round = null;
let rtcname = "";
let clock = new SyncedClock();
let input_character_name = document.getElementById("input_character_name");
let input_character_color = document.getElementById("input_character_color");

function load_character(){
	let name = 'Player';
	let color = '#ffffff';
	document.cookie.split(';').forEach((c) => {
		if(c.length == 0) return;
		let cp = c.split('=');
		if(cp[0] == 'superbiters_character'){
			//split into sequences of two, then convert from hex, then put in a buffer and decode from utf8, then parse as json
			let dat = JSON.parse((new TextDecoder()).decode(new Uint8Array(cp[1].match(/../g).map((s) => parseInt(s, 16)))));
			if('name' in dat){
				name = dat['name'];
			}
			if('color' in dat){
				color = dat['color'];
			}
		}
	});
	
	input_character_name.value = name;
	input_character_color.value = color;
}
load_character();

input_character_name.onchange = update_character;
input_character_color.onchange = update_character;
function update_character(){
	let dat = Array.from((new TextEncoder()).encode(JSON.stringify({
		"name":input_character_name.value,
		"color":input_character_color.value
	}))).map((c)=>c.toString(16).padStart(2, '0')).join('');
	document.cookie = "superbiters_character="+dat+"; path=/superbiters; expires=" + (new Date(Date.now() + (365*24*60*60*1000))).toUTCString() + ";";
}
let peers = {}
function on_gain_peer(who){
	peers[who] = {};
}
function on_lose_peer(who){
	delete peers[who];
}
function on_receive(from, msg){
	if(msg.input){
		if(round){
			round.applyInput(msg.input.name, msg.input.frame, msg.input.c, msg.input.v);
		}
	}else if(msg.start){
		start_round(msg);
	}
}
async function join_room(roomname){
	console.log("Join Room:",roomname);
	if(pool != null) pool.leavePool();
	if(rtcgroup != null) rtcgroup.die();
	rtcname = input_character_name.value;
	for(let idx = 0; idx < 8; idx++){
		rtcname += Math.floor(Math.random() * 16).toString(16);
	}
	pool = new PoolSig("net.boerwi.superbiters."+roomname, rtcname);
	rtcgroup = new PeerRtcGroup(pool);
	rtcgroup.onreceive = on_receive;
	rtcgroup.ongainpeer = on_gain_peer;
	rtcgroup.onlosepeer = on_lose_peer;
	await pool.joinPool();
}
function send_start_round(map){
	let startparams = {'start':true, 'seed':Math.floor(Math.random() * 9000000), 'map':map, 'timestamp':clock.now(), 'players':Array.from(new Set(Object.keys(peers).map((p) => p.substring(0, p.length-8)).concat([input_character_name.value])))};
	if(rtcgroup) rtcgroup.broadcast(startparams);
	start_round(startparams);
}
function start_round(params){
	if(round) round.running = false;
	console.log("Starting Round:",params);
	get_map_def(params['map']).then((mapdef) => {
		round = new SB_Round(mapdef, params['timestamp'], params['seed'], params['players']);
	});
}
function get_map_def(name){
	return fetch('maps/').then((r) => r.text()).then(t => {
		let maplist = t.split('\n').map((mn) => mn.trim());
		if(maplist.includes(name+'.sm.gz')){
			return fetch('maps/'+name+'.sm.gz').then((r) => r.blob()).then((b) => import_map_definition(b));
		}else{
			console.warn("Custom maps not yet supported!");
			return null;
		}
	});
}
let cFrameMS = 2;
// This is a local, non-revertible representation of our current controls. This is used to prevent sending redundant control information to our peers.
let localcontrols = [false,false,false,false,0,0];
class SB_Round{
	constructor(mapdef, torigin, rstate, players){
		this.localname = input_character_name.value;
		this.torigin = torigin;
		this.map = new Map(mapdef);
		this.running = true;
		this.controlqueue = [];
		this.players = {};
		this.state = {
			// random number generator state
			'rstate':rstate,
			// what frame was this state
			'frame':0,
			// a complete deep clone of map.objects. Not populated for active state
			'cqidx':0,
		}
		// circular buffer of states
		this.statearray = Array(300);
		this.statearray[0] = this.state;
		this.statearrayidx = 0;
		players.forEach((p) => {
			this.players[p] = {
				dead : {'rframe':1000/cFrameMS},
				avatar : null,
				jump_hold : 0,
				last_jump : 0,
				// used to detect double-tap sprint
				last_move_frame : 0,
				last_move_dir : 1, //1 or -1
				sprint : false,
				//punch,shoot,grenade,special,left/right,up/down
				controls : [false,false,false,false,0,0]
			};
		});
		document.onkeyup = this.keyup.bind(this);
		document.onkeydown = this.keydown.bind(this);
		window.requestAnimationFrame(this.drawframe.bind(this));
	}
	snapshot(){
		let newidx = (this.statearrayidx+1)%this.statearray.length;
		let prevstate = window.structuredClone(this.state);
		this.statearray[newidx] = this.state;
		this.statearray[this.statearrayidx] = prevstate;
		prevstate.objects = this.map.objects.map((o) => o.clone());
		prevstate.players = {};
		for(let k in this.players){
			let p = this.players[k];
			prevstate.players[k] = {
				dead: window.structuredClone(p.dead),
				avatar : p.avatar,
				jump_hold : p.jump_hold,
				last_jump : p.last_jump,
				last_move_frame : p.last_move_frame,
				last_move_dir : p.last_move_dir,
				sprint : p.sprint,
				controls : Array.from(p.controls)
			}
		}
		prevstate.scriptstorage = window.structuredClone(this.map.scriptstorage);
		this.statearrayidx = newidx;
	}
	rand(){
		this.state.rstate = xorshift32(this.state.rstate);
		return Math.abs(this.state.rstate);
	}
	drawframe(){
		let tframe = Math.trunc((clock.now()-this.torigin)/cFrameMS);
		let captureFrame = Infinity;
		if(this.state.prev == null){
			captureFrame = this.state.frame;
		}else if(tframe - this.state.prev.frame > 100/cFrameMS){ // last was over 100 ms ago
			captureFrame = tframe-Math.trunc(50/cFrameMS); // capture 50 ms ago
		}
		ctx.clearRect(0, 0, canv.width, canv.height);
		if(this.map.def.farbackground != null){
			ctx.drawImage(this.map.def.farbackground, 0,0, 800,400);
		}
		if(this.map.def.background != null){
			ctx.drawImage(this.map.def.background, 0,0, 800,400);
		}
		if(this.map.def.inplane != null){
			ctx.drawImage(this.map.def.inplane, 0,0, 800,400);
		}
		ctx.setTransform(...transform);
		while(this.state.frame < tframe){
			if(captureFrame <= this.state.frame){
				this.snapshot();
				captureFrame = Infinity;
			}
			while(this.state.cqidx < this.controlqueue.length && this.controlqueue[this.state.cqidx].frame == this.state.frame){
				let c = this.controlqueue[this.state.cqidx];
				this.players[c.name].controls[c.control] = c.value;
				this.state.cqidx++;
			}
			for(let pname in this.players){
				let p = this.players[pname];
				if(p.dead && p.dead.rframe == this.state.frame){
					let avatar = this.create_avatar(0, 0, pname);
					let spawn_opts = this.map.playerspawns[0].concat(this.map.playerspawns[1]);
					// `concat` makes a new copy, but eventually we'll pick one by team, so shallow-copy here
					spawn_opts = spawn_opts.slice();
					console.log(spawn_opts.length + " spawn options found");
					while (spawn_opts.length) {
						// Grab element at random position and remove
						let loc = spawn_opts.splice(this.rand() % spawn_opts.length, 1)[0];
						avatar[0].phys.cx = loc[0];
						avatar[0].phys.cy = loc[1];
						if (this.map.world.add_block(avatar[0].phys)) {
							// Success, we found a home!
							p.dead = false;
							p.avatar = avatar;
							this.map.objects.push(avatar[0]);
							break;
						}
					}
					// If we fall out of the loop, uhhhhh
					// I guess we just don't spawn??
				}
				//punch,shoot,grenade,special,left/right,up/down
				if(p.avatar == null) continue;
				let cons = p.avatar[0].phys.constraints;
				let on_ground = cons[1][5] || cons[2][5];
				cons[0][1] = 0;
				cons[3][1] = 0;
				cons[3][3] = (on_ground) ? -6 : -3;
				cons[3][4] = (on_ground) ? 6 : 3;
				let mdir = p.controls[4];
				if(mdir != 0){
					if(p.last_move_frame + 1 < this.state.frame && this.state.frame - p.last_move_frame < 300/cFrameMS && p.last_move_dir == mdir){
						// we were not moving last frame, but we moved recently in this direction
						p.sprint = true;
					}
					p.last_move_frame = this.state.frame;
					p.last_move_dir = mdir;
					if(p.sprint){
						cons[3][1] = mdir * 3.5;
						// lean when sprinting
						cons[0][1] = mdir * 0.2;
					}else{
						cons[3][1] = mdir * 1.5;
					}
					if(mdir < 0){
						cons[3][4] = 0; // we won't decelerate when moving, even if going faster than intended
					}else{
						cons[3][3] = 0;
					}
				}else{
					p.sprint = false;
				}
				if(p.controls[5] == -1){
					if(p.jump_hold < 1){
						if(p.jump_hold == 0){
							// was our last jump long enough ago? and are we touching the ground?
							if((this.state.frame - p.last_jump) > 500/cFrameMS && on_ground){
								// instant jump is already somewhat powerful
								p.last_jump = this.state.frame;
								p.avatar[0].phys.vy -= 4;
								p.jump_hold += cFrameMS/250; // full jump key hold time milliseconds
							}
						}else{
							p.avatar[0].phys.vy -= 4 * (cFrameMS/250);
							p.jump_hold += cFrameMS/250; // full jump key hold time milliseconds
						}
					}
				}else{
					p.jump_hold = 0;
				}
			}
			this.map.world.step(cFrameMS/1000);
			this.map.world.swap();
			this.state.frame += 1;
		}
		this.map.draw(ctx);
		ctx.resetTransform();
		if(this.map.def.foreground != null){
			ctx.drawImage(this.map.def.foreground, 0,0, 800,400);
		}
		if(this.running) window.requestAnimationFrame(this.drawframe.bind(this));
	}
	create_avatar(x, y, name){
		let ava = new Obj(object_definitions['player_body'], x, y, 0);
		ava.label = name;
		ava.phys.add_constraint([1, 0, [15, 0, 10, 0, 0, -10, 10]]);
		ava.phys.add_constraint([2, [0.28,0], [0.28,1.5], 1, [80, 0, 15, 0, 0, -20, 0], false]);
		ava.phys.add_constraint([2, [-0.28,0], [-0.28,1.5], 1, [80, 0, 15, 0, 0, -20, 0], false]);
		ava.phys.add_constraint([3, 0, [1, 0], -6, 6]);
		let ret = [ava];
		ava.add_backref(ret);
		return ret;
	}
	applyInput(name, frame, control, value){
		if(this.state.frame > frame){
			let sidx = (this.statearrayidx-1+this.statearray.length)%this.statearray.length;
			while(this.statearray[sidx].frame > frame){
				sidx = (sidx-1+this.statearray.length)%this.statearray.length;
			}
			this.state = this.statearray[sidx];
			this.statearrayidx = sidx;
			this.map.objects = this.state.objects;
			this.state.objects = null;
			this.players = this.state.players;
			this.state.players = null;
			this.map.scriptstorage = this.state.scriptstorage;
			this.state.scriptstorage = null;
			this.map.world.blocks = this.map.objects.map((o) => o.phys);
			this.map.objects.forEach((o) => o.enforce_backrefs());
		}
		this.snapshot();
		let cq = this.controlqueue;
		let cqidx = cq.length;
		while(cqidx > 0 && cq[cqidx-1].frame > frame){
			cqidx--;
		}
		cq.splice(cqidx, 0, {'name':name, 'frame':frame,'control':control,'value':value});
	}
	keychg(kc, v){
		//punch,shoot,grenade,special,left,right,up,down
		let idx = ({86:0, 67:1, 88:2, 90:3, 37:4, 39:5, 38:6,32:6, 40:7})[kc];
		if(idx !== undefined){
			if(idx >= 4){
				let dv = 1;
				if(idx == 4){
					dv = -1;
				}else if(idx == 5){
					dv = 1;
					idx = 4;
				}else if(idx == 6){
					dv = -1;
					idx = 5;
				}else{
					dv = 1;
					idx = 5;
				}
				if(!v){ // this is a release event
					if(localcontrols[idx] == -dv) return;//we more recently pressed the other direction, and this is a release event
					dv = 0;
				}
				v = dv;
			}
			if(localcontrols[idx] != v){ 
				let frame = Math.trunc((clock.now()-this.torigin)/cFrameMS);
				localcontrols[idx] = v;
				this.applyInput(this.localname, frame, idx, v);
//				(new Promise(r => setTimeout(r, 750))).then((f) => { // simulate latency by delaying informing my peers
				if(rtcgroup != null) rtcgroup.broadcast({"input":{"name":this.localname, "frame":frame, "c":idx, "v":v}});
//				});
			}
		}
	}
	keyup(evt){
		this.keychg(evt.keyCode, false);
	}
	keydown(evt){
		this.keychg(evt.keyCode, true);
	}
}
let object_definitions = null;
get_object_definitions().then((d) => {
	object_definitions = d;
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
function xorshift32(x){
	/* Algorithm "xor" from p. 4 of Marsaglia, "Xorshift RNGs" */
	x ^= x << 13;
	x ^= x >> 17;
	x ^= x << 5;
	return x;
}
