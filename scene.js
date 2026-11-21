// scene.js - materials, the meshes of the elements, the site around the house, and the view of a date.
import * as THREE from 'three';
import { mergeGeometries } from './BufferGeometryUtils.js';
import { TYPES, WALKABLE, PHASES, ROOMS } from './model.js';
import { elAt } from './progress.js';

// ---------- procedural textures ----------

function tex(size, draw, metres) {
	const c = document.createElement('canvas');
	c.width = c.height = size;
	const g = c.getContext('2d');
	draw(g, size);
	const t = new THREE.CanvasTexture(c);
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.colorSpace = THREE.SRGBColorSpace;
	t.anisotropy = 4;
	t.repeat.set(1 / metres, 1 / metres);
	return t;
}

function rnd(seed) {
	let s = seed;
	return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function noise(g, n, base, vary, count, r, seed) {
	const R = rnd(seed || 1);
	g.fillStyle = base;
	g.fillRect(0, 0, n, n);
	for (let i = 0; i < count; i++) {
		const v = (R() - 0.5) * vary;
		g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
		g.fillRect(R() * n, R() * n, r * (0.5 + R()), r * (0.5 + R()));
	}
}

const TEX = {
	block: () => tex(256, (g, n) => {
		noise(g, n, '#9a9a95', 0.12, 2500, 2, 3);
		g.fillStyle = '#6f6e69';
		for (let row = 0; row < 4; row++) {
			const y = row * n / 4;
			g.fillRect(0, y, n, 3);
			const off = row % 2 ? n / 4 : 0;
			for (let k = 0; k < 3; k++) g.fillRect((off + k * n / 2) % n, y, 3, n / 4);
		}
	}, 0.8),
	concrete: () => tex(256, (g, n) => noise(g, n, '#a9a8a2', 0.09, 4000, 2, 5), 2),
	plaster: () => tex(256, (g, n) => noise(g, n, '#c9c7c0', 0.05, 3000, 2, 7), 2),
	paintExt: () => tex(128, (g, n) => noise(g, n, '#efe3c9', 0.03, 800, 2, 9), 2),
	paintInt: () => tex(128, (g, n) => noise(g, n, '#f3f1ec', 0.02, 600, 2, 11), 2),
	dirt: () => tex(256, (g, n) => noise(g, n, '#7a5a3c', 0.18, 5000, 3, 13), 3),
	grass: () => tex(256, (g, n) => noise(g, n, '#5f8f3e', 0.16, 6000, 2, 15), 3),
	lawn: () => tex(256, (g, n) => noise(g, n, '#6aa144', 0.14, 6000, 2, 16), 3),
	gravel: () => tex(256, (g, n) => noise(g, n, '#8c867b', 0.35, 7000, 3, 17), 1.5),
	plywood: () => tex(256, (g, n) => {
		noise(g, n, '#b98b52', 0.08, 1500, 2, 19);
		g.strokeStyle = 'rgba(90,55,20,.25)';
		for (let y = 4; y < n; y += 9) { g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(n / 3, y + 4, n * 2 / 3, y - 4, n, y); g.stroke(); }
		g.fillStyle = 'rgba(60,40,15,.6)';
		g.fillRect(0, 0, n, 2);
		g.fillRect(0, 0, 2, n);
	}, 1.22),
	rebar: () => tex(256, (g, n) => {
		noise(g, n, '#7d7a73', 0.1, 1500, 2, 21);
		g.strokeStyle = '#7a3d1a';
		g.lineWidth = 5;
		for (let k = 0; k <= n; k += n / 5) {
			g.beginPath(); g.moveTo(k, 0); g.lineTo(k, n); g.stroke();
			g.beginPath(); g.moveTo(0, k); g.lineTo(n, k); g.stroke();
		}
	}, 1),
	tile: () => tex(256, (g, n) => {
		noise(g, n, '#d9cdb5', 0.05, 1500, 2, 23);
		g.fillStyle = '#b5a88f';
		for (let k = 0; k < n; k += n / 2) { g.fillRect(k, 0, 2, n); g.fillRect(0, k, n, 2); }
	}, 1.2),
	lamina: () => tex(128, (g, n) => {
		for (let x = 0; x < n; x++) {
			const v = 0.72 + 0.28 * Math.sin(x / n * Math.PI * 2 * 8);
			g.fillStyle = `rgb(${Math.round(150 * v)},${Math.round(52 * v)},${Math.round(40 * v)})`;
			g.fillRect(x, 0, 1, n);
		}
	}, 1.6),
	grid: () => tex(128, (g, n) => {
		g.fillStyle = '#9da3a8';
		g.fillRect(0, 0, n, n);
		g.clearRect(6, 6, n - 12, n - 12);
		g.fillStyle = 'rgba(40,40,40,.35)';
		g.fillRect(6, 6, n - 12, n - 12);
	}, 0.61),
	ceiling: () => tex(128, (g, n) => {
		noise(g, n, '#f4f3ef', 0.02, 300, 2, 27);
		g.fillStyle = '#dedbd3';
		g.fillRect(0, 0, n, 2);
		g.fillRect(0, 0, 2, n);
	}, 1.22),
	asphalt: () => tex(256, (g, n) => noise(g, n, '#45474a', 0.12, 6000, 2, 29), 3),
	sidewalk: () => tex(256, (g, n) => {
		noise(g, n, '#b4b1aa', 0.06, 2000, 2, 31);
		g.fillStyle = '#8f8c86';
		g.fillRect(0, 0, n, 3);
	}, 1.5)
};

const COLORS = {
	steel: [0x6d7378, 0.6, 0.45], steelDark: [0x2f3336, 0.5, 0.5], fascia: [0xf0ede6, 0, 0.7], gutter: [0xe8e6e0, 0.1, 0.5],
	alu: [0x3a3d40, 0.6, 0.4], wood: [0x7a4e2c, 0, 0.7], door: [0x8a5a34, 0, 0.6], conduit: [0xe07a24, 0, 0.7],
	wire: [0xb87333, 0.6, 0.4], device: [0xf5f5f2, 0, 0.5], pvc: [0xf2f2ee, 0, 0.6], cpvc: [0xe8dca8, 0, 0.6],
	ceramic: [0xfbfbf8, 0.05, 0.2], cabinet: [0x5c4632, 0, 0.6], granite: [0x2b2b2d, 0.1, 0.3], plant: [0x3f7a2e, 0, 0.9],
	bark: [0x5a4030, 0, 0.9], neighbor: [0xe9dfca, 0, 0.9], nroof: [0x8f3a2c, 0.2, 0.6], hill: [0x5c8a45, 0, 1],
	sign: [0xffffff, 0, 0.8], post: [0x5a5a5a, 0.3, 0.6]
};

export const STATUS_COL = { done: 0x34a853, prog: 0xf2a33a, late: 0xe0473b, part: 0x3fa7b5, none: 0x8fb4d9 };
export const PHASE_COL = [0x8d6e63, 0x795548, 0x607d8b, 0xc0392b, 0xf39c12, 0x9e9d24, 0x3498db, 0x8e44ad, 0x27ae60];

export const M = {};
const HL = {};
let GHOST, GHOST_PH;

export function makeMaterials() {
	for (const k in TEX) {
		const t = TEX[k]();
		M[k] = new THREE.MeshStandardMaterial({ map: t, roughness: k === 'lamina' ? 0.45 : 0.9, metalness: k === 'lamina' ? 0.3 : 0 });
	}
	for (const k in COLORS) {
		const [c, met, rough] = COLORS[k];
		M[k] = new THREE.MeshStandardMaterial({ color: c, metalness: met, roughness: rough });
	}
	M.glass = new THREE.MeshStandardMaterial({ color: 0x9cc7d9, transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide });
	M.lamina.side = THREE.DoubleSide;
	for (const k in STATUS_COL) M['st_' + k] = new THREE.MeshStandardMaterial({ color: STATUS_COL[k], roughness: 0.8 });
	M.st_none.transparent = true;
	M.st_none.opacity = 0.16;
	M.st_none.depthWrite = false;
	PHASE_COL.forEach((c, i) => {
		M['ph' + i] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
	});
	M.phDone = new THREE.MeshStandardMaterial({ color: 0xd8d8d4, roughness: 0.9 });
	GHOST = new THREE.MeshBasicMaterial({ color: 0x5b8fc9, transparent: true, opacity: 0.1, depthWrite: false });
	GHOST_PH = PHASE_COL.map(c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.18, depthWrite: false }));
	M.none = GHOST;
}

// a highlighted copy of a material (selection = blue, pointed by the copilot = magenta)
function hl(m, kind) {
	const key = m.uuid + kind;
	if (!HL[key]) {
		const h = m.clone();
		h.emissive = new THREE.Color(kind === 'p' ? 0xd0208a : 0x2a6fdb);
		h.emissiveIntensity = kind === 'p' ? 0.55 : 0.45;
		if (h.transparent && h.opacity < 0.3) h.opacity = 0.45;
		HL[key] = h;
	}
	return HL[key];
}

// ---------- geometry ----------

// texture coordinates in metres, from the face direction
function worldUV(g) {
	const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
	for (let i = 0; i < p.count; i++) {
		const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
		let u, v;
		if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); }
		else if (ax >= az) { u = p.getZ(i); v = p.getY(i); }
		else { u = p.getX(i); v = p.getY(i); }
		uv[i * 2] = u;
		uv[i * 2 + 1] = v;
	}
	g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
	return g;
}

const V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

function partGeo(p) {
	let g;
	if (p.b) {
		const [x0, y0, z0, x1, y1, z1] = p.b;
		g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).toNonIndexed();
		g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
		return worldUV(g);
	}
	if (p.s || p.t) {
		const q = p.s || p.t;
		V1.set(q[0], q[1], q[2]);
		V2.set(q[3], q[4], q[5]);
		const len = V1.distanceTo(V2), dir = V2.clone().sub(V1).normalize();
		if (p.s) {
			g = new THREE.BoxGeometry(p.d[0], p.d[1], len).toNonIndexed();
			const up = Math.abs(dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : UP;
			const m = new THREE.Matrix4().lookAt(V2, V1, up);
			g.applyMatrix4(m);
		} else {
			g = new THREE.CylinderGeometry(p.rad, p.rad, len, 8, 1, true).toNonIndexed();
			g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir));
		}
		g.translate((V1.x + V2.x) / 2, (V1.y + V2.y) / 2, (V1.z + V2.z) / 2);
		return worldUV(g);
	}
	if (p.o) {
		g = new THREE.IcosahedronGeometry(p.o[3], 1);
		g.translate(p.o[0], p.o[1], p.o[2]);
		return worldUV(g);
	}
	if (p.p) {
		const pts = p.p.map(a => new THREE.Vector3(a[0], a[1], a[2]));
		const n = new THREE.Vector3().subVectors(pts[1], pts[0]).cross(new THREE.Vector3().subVectors(pts[2], pts[0]));
		if (n.y < 0) pts.reverse();
		const pos = [], uv = [];
		for (let i = 1; i < pts.length - 1; i++) {
			[pts[0], pts[i], pts[i + 1]].forEach(v => {
				pos.push(v.x, v.y, v.z);
				uv.push(p.u === 'z' ? v.z : v.x, p.u === 'z' ? v.x : v.z);
			});
		}
		g = new THREE.BufferGeometry();
		g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
		g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
		g.computeVertexNormals();
		return g;
	}
	return null;
}

// ---------- the elements ----------

export const W = {
	world: null,      // everything that moves together in tabletop mode
	site: null,       // the elements
	context: null,    // street, neighbours, hills (hidden in tabletop mode)
	lot: null,
	solids: [],       // collision boxes { b, el, mesh }
	walkMeshes: [],   // meshes for teleport
	pick: []          // meshes for the pointer
};

export function buildElements(els) {
	if (W.site) {
		W.site.traverse(o => { if (o.geometry) o.geometry.dispose(); });
		W.world.remove(W.site);
	}
	W.site = new THREE.Group();
	W.world.add(W.site);
	W.solids = [];
	W.pick = [];
	W.walkMeshes = W.walkMeshes.filter(m => m.userData.ctx);
	els.forEach(el => {
		const type = TYPES[el.t], g = new THREE.Group(), groups = {};
		const y0 = type.grow ? (el.y0 || 0) : 0;
		el.parts.forEach(p => {
			const geo = partGeo(p);
			if (!geo) return;
			const key = (p.r || '') + '|' + (p.m || '');
			(groups[key] = groups[key] || { r: p.r || '', m: p.m || '', geos: [], boxes: [] }).geos.push(geo);
			if (p.b && !p.nc && p.m !== 'glass') groups[key].boxes.push(p.b);
		});
		el._meshes = [];
		for (const key in groups) {
			const q = groups[key];
			const geo = q.geos.length > 1 ? mergeGeometries(q.geos) : q.geos[0];
			q.geos.forEach(x => { if (x !== geo) x.dispose(); });
			if (y0) geo.translate(0, -y0, 0);
			geo.computeBoundingSphere();
			const mesh = new THREE.Mesh(geo, GHOST);
			mesh.userData = { el, r: q.r, m: q.m };
			mesh.castShadow = mesh.receiveShadow = true;
			g.add(mesh);
			el._meshes.push(mesh);
			W.pick.push(mesh);
			if (WALKABLE[el.t]) W.walkMeshes.push(mesh);
			q.boxes.forEach(b => W.solids.push({ b, el, mesh, walk: !!WALKABLE[el.t] }));
		}
		g.position.y = y0;
		el._g = g;
		el._y0 = y0;
		W.site.add(g);
	});
}

// show the elements at day d
// v = { c: progress context, color: 'real'|'status'|'phase', show: 'all'|'noroof'|'gf'|'found', xray, sel: Set, point: id }
export function applyView(els, d, v) {
	const maxF = { all: 9, noroof: 2, gf: 1, found: 0 }[v.show];
	els.forEach(el => {
		const type = TYPES[el.t], s = elAt(el, d, v.c);
		el._s = s;
		const inFloor = el.f <= maxF || el.f === 4;
		el._g.visible = inFloor;
		el._g.scale.y = 1;
		if (!inFloor) return;
		const hk = v.point === el.id ? 'p' : v.sel.has(el.id) ? 's' : '';
		const started = s.last >= 0 || s.cur >= 0;
		el._meshes.forEach(mesh => {
			const r = mesh.userData.r;
			let mat = null;
			if (v.color === 'real') {
				if (r) {
					const i = el.st.findIndex(x => x.k === r);
					if (i >= 0 && s.sts[i].st === 2) mat = M[mesh.userData.m] || M[type.st[i].m];
				} else if (s.last >= 0) {
					mat = mesh.userData.m ? M[mesh.userData.m] : M[matKey(el, type.st[s.last].m)];
					if (type.st[s.last].m === 'none') mat = null;
				} else if (s.cur === 0) {
					mat = mesh.userData.m ? M[mesh.userData.m] : M[matKey(el, type.st[0].m)];
					if (type.grow) el._g.scale.y = Math.max(0.04, s.sts[0].f);
				} else if (type.base) {
					mat = M[type.base];
				}
				if (!mat && v.xray && !(type.base && started)) mat = GHOST;
			} else if (v.color === 'status') {
				mat = M['st_' + s.status];
				if (el.t === 'earth' && s.status === 'done' && !r) mat = null;
			} else {
				const pi = s.next >= 0 ? PHASES.findIndex(p => p.k === type.st[s.next].ph) : -1;
				mat = pi < 0 ? M.phDone : started ? M['ph' + pi] : GHOST_PH[pi];
				if (el.t === 'earth' && s.status === 'done' && !r) mat = null;
			}
			mesh.visible = !!mat;
			if (mat) mesh.material = hk ? hl(mat, hk) : mat;
		});
	});
}

function matKey(el, m) {
	return m === 'paint' ? (el.paint || 'paintInt') : m;
}

// ---------- collision and floors (for the walk and VR) ----------

function solidOn(q) {
	return q.mesh.visible && q.el._g.visible;
}

function topOf(q) {
	const el = q.el;
	return el._y0 + (q.b[4] - el._y0) * el._g.scale.y;
}

// ground of the site: terrain at -0.15, the pit of the excavation at -1.0
export function groundAt(x, z) {
	return (x > -4.9 && x < 4.9 && z > -0.4 && z < 11.4) ? -1.0 : -0.15;
}

// the highest walkable surface under (x, z) that is not higher than y + step
export function floorAt(x, z, y, step) {
	let f = groundAt(x, z);
	for (const q of W.solids) {
		const b = q.b;
		if (x < b[0] || x > b[3] || z < b[2] || z > b[5] || !solidOn(q)) continue;
		const t = topOf(q);
		if (t <= y + step && t > f) f = t;
	}
	return f;
}

// true if a body (radius r, from feet y to y + h) at x, z hits a wall
export function blocked(x, z, y, r, h, step) {
	for (const q of W.solids) {
		const b = q.b;
		if (x + r < b[0] || x - r > b[3] || z + r < b[2] || z - r > b[5]) continue;
		if (!solidOn(q)) continue;
		const t = topOf(q);
		if (t > y + step && b[1] < y + h) return true;
	}
	return false;
}

// ---------- the site: terrain, street, neighbours, hills, sky, sign ----------

function boxMesh(x0, y0, z0, x1, y1, z1, mat) {
	const g = worldUV(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).toNonIndexed().translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
	const m = new THREE.Mesh(g, mat);
	m.castShadow = m.receiveShadow = true;
	return m;
}

function ringShape(ox0, oz0, ox1, oz1, ix0, iz0, ix1, iz1) {
	const s = new THREE.Shape();
	s.moveTo(ox0, -oz0); s.lineTo(ox1, -oz0); s.lineTo(ox1, -oz1); s.lineTo(ox0, -oz1); s.lineTo(ox0, -oz0);
	const h = new THREE.Path();
	h.moveTo(ix0, -iz0); h.lineTo(ix0, -iz1); h.lineTo(ix1, -iz1); h.lineTo(ix1, -iz0); h.lineTo(ix0, -iz0);
	s.holes.push(h);
	const g = new THREE.ShapeGeometry(s);
	g.rotateX(-Math.PI / 2);
	return worldUV(g.toNonIndexed());
}

function hipRoofMesh(x0, z0, x1, z1, y, mat) {
	const w = x1 - x0, l = z1 - z0, rh = Math.min(w, l) / 2 * 0.3, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
	const r0 = [cx, y + rh, z0 + w / 2], r1 = [cx, y + rh, z1 - w / 2];
	const A = [x0, y, z0], B = [x1, y, z0], C = [x1, y, z1], D = [x0, y, z1];
	const faces = [[A, D, r1, r0], [B, r0, r1, C], [A, r0, B], [D, C, r1]];
	const geos = faces.map(f => partGeo({ p: f, u: 'x' }));
	return new THREE.Mesh(mergeGeometries(geos), mat);
}

function neighbour(ox, oz, flip) {
	const g = new THREE.Group();
	g.add(boxMesh(-4.5, -0.15, 0, 4.5, 5.9, 11, M.neighbor));
	for (let k = 0; k < 2; k++) {
		const y = k ? 3.9 : 0.9;
		g.add(boxMesh(-3.4, y, -0.02, -1.8, y + 1.2, 0, M.alu), boxMesh(0.8, y, -0.02, 3.4, y + 1.2, 0, M.alu));
	}
	g.add(hipRoofMesh(-5.3, -0.8, 5.3, 11.8, 5.66, M.nroof));
	g.add(boxMesh(-6, -0.15, -2, -5.85, 2.05, 14, M.neighbor), boxMesh(-6, -0.15, 13.85, 6, 2.05, 14, M.neighbor));
	g.add(boxMesh(0.4, -0.15, -8, 5.6, -0.05, -0.4, M.concrete));
	g.position.set(ox, 0, oz);
	if (flip) g.rotation.y = Math.PI;
	g.traverse(o => { if (o.isMesh) o.userData.ctx = 1; });
	return g;
}

function signTexture(p) {
	const c = document.createElement('canvas');
	c.width = 512;
	c.height = 320;
	const g = c.getContext('2d');
	g.fillStyle = '#fff';
	g.fillRect(0, 0, 512, 320);
	g.fillStyle = '#0d4f8b';
	g.fillRect(0, 0, 512, 70);
	g.fillStyle = '#fff';
	g.font = 'bold 34px sans-serif';
	g.fillText('OBRA EN CONSTRUCCIÓN', 24, 48);
	g.fillStyle = '#222';
	g.font = 'bold 26px sans-serif';
	g.fillText('Casa Demo, Lote 14', 24, 115);
	g.font = '22px sans-serif';
	['Condominio Vista Verde, Santa Ana', 'Permit: demo (not a real number)', 'Engineer: demo', 'Builder: demo'].forEach((s, i) => g.fillText(s, 24, 160 + i * 36));
	const t = new THREE.CanvasTexture(c);
	t.colorSpace = THREE.SRGBColorSpace;
	return t;
}

export function buildWorld(scene, project) {
	W.world = new THREE.Group();
	scene.add(W.world);
	W.context = new THREE.Group();
	W.lot = new THREE.Group();
	W.world.add(W.context, W.lot);

	// the lot (12 x 22 m) with the pit of the house, and the land around it
	const lot = new THREE.Mesh(ringShape(-6, -8, 6, 14, -4.9, -0.4, 4.9, 11.4), M.grass);
	lot.position.y = -0.15;
	lot.receiveShadow = true;
	lot.userData.ctx = 1;
	W.lot.add(lot);
	W.walkMeshes.push(lot);
	const pit = boxMesh(-4.9, -1.06, -0.4, 4.9, -1.0, 11.4, M.dirt);
	pit.userData.ctx = 1;
	W.walkMeshes.push(pit);
	W.lot.add(pit,
		boxMesh(-4.92, -1.0, -0.42, 4.92, -0.16, -0.4, M.dirt), boxMesh(-4.92, -1.0, 11.4, 4.92, -0.16, 11.42, M.dirt),
		boxMesh(-4.92, -1.0, -0.4, -4.9, -0.16, 11.4, M.dirt), boxMesh(4.9, -1.0, -0.4, 4.92, -0.16, 11.4, M.dirt));
	W.lot.add(boxMesh(-6.05, -1.2, -8.05, 6.05, -0.16, 14.05, M.dirt));      // the base under the lot (for the tabletop view)

	const land = new THREE.Mesh(ringShape(-300, -300, 300, 300, -6, -8, 6, 14), M.grass);
	land.position.y = -0.16;
	land.receiveShadow = true;
	land.userData.ctx = 1;
	W.walkMeshes.push(land);
	W.context.add(land);
	// the street of the condominio, the sidewalks, the neighbours
	W.context.add(boxMesh(-80, -0.2, -15, 80, -0.14, -9, M.asphalt), boxMesh(-80, -0.15, -9, 80, -0.08, -8, M.sidewalk),
		boxMesh(-80, -0.15, -16, 80, -0.08, -15, M.sidewalk));
	W.context.add(neighbour(-14, 0), neighbour(14, 0), neighbour(-14, -23, 1), neighbour(0, -23, 1), neighbour(14, -23, 1), neighbour(28, 0), neighbour(-28, 0));
	// hills of the Central Valley
	const R = rnd(42);
	for (let i = 0; i < 26; i++) {
		const a = i / 26 * Math.PI * 2, d = 230 + R() * 60, h = 25 + R() * 55, r = 60 + R() * 50;
		const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), M.hill);
		m.position.set(Math.cos(a) * d, h / 2 - 2, Math.sin(a) * d);
		W.context.add(m);
	}
	// trees in the condominio
	for (let i = 0; i < 14; i++) {
		const x = -60 + i * 9.5 + R() * 3, z = -19 - R() * 2;
		const t = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 2.4, 6), M.bark);
		t.position.set(x, 1.0, z);
		const c = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4 + R() * 0.8, 1), M.plant);
		c.position.set(x, 3.0, z);
		t.castShadow = c.castShadow = true;
		W.context.add(t, c);
	}
	// construction sign (rótulo de obra)
	const sm = new THREE.MeshStandardMaterial({ map: signTexture(project), roughness: 0.8 });
	const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), sm);
	sign.position.set(-5.0, 1.6, -7.71);
	sign.lookAt(-5.0, 1.6, -20);
	const back = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), M.post);
	back.position.set(-5.0, 1.6, -7.69);
	W.lot.add(sign, back, boxMesh(-5.75, -0.15, -7.73, -5.68, 1.1, -7.67, M.post), boxMesh(-4.32, -0.15, -7.73, -4.25, 1.1, -7.67, M.post));

	// sky
	const sky = new THREE.Mesh(new THREE.SphereGeometry(800, 24, 12), new THREE.ShaderMaterial({
		side: THREE.BackSide, depthWrite: false,
		uniforms: {},
		vertexShader: 'varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
		fragmentShader: 'varying vec3 p; void main(){ float h = max(p.y, 0.0); vec3 c = mix(vec3(0.86,0.9,0.93), vec3(0.36,0.6,0.88), pow(h, 0.6)); gl_FragColor = vec4(c, 1.0); }'
	}));
	sky.userData.ctx = 1;
	W.sky = sky;
	W.context.add(sky);
}

export function lights(scene) {
	const hemi = new THREE.HemisphereLight(0xdfeeff, 0x5a6a3a, 1.4);
	scene.add(hemi);
	const sun = new THREE.DirectionalLight(0xfff3dc, 2.6);
	sun.position.set(18, 30, -14);
	sun.target.position.set(0, 0, 5);
	sun.castShadow = true;
	sun.shadow.mapSize.set(2048, 2048);
	const sc = sun.shadow.camera;
	sc.left = -20; sc.right = 20; sc.top = 20; sc.bottom = -20; sc.near = 1; sc.far = 80;
	sun.shadow.bias = -0.0004;
	sun.shadow.normalBias = 0.03;
	scene.add(sun, sun.target);
	return { hemi, sun };
}

export { ROOMS };
