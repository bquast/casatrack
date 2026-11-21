// model.js - element types, stages, phases, dates, and the demo project:
// a two-storey free-standing house in a Costa Rican condominio (lot 12 x 22 m, house 9 x 11 m, about 190 m2).
//
// Coordinates: metres. x = to the right when you look at the house from the street, y = up,
// z = from the street to the back. The front wall is at z = 0, the ground floor level is y = 0.
//
// An element has parts (geometry) and stages. A stage has planned dates (ps, pe) and actual dates (as, ae).
// Parts:
//   { b: [x0,y0,z0,x1,y1,z1] }     box on the axes
//   { s: [x0,y0,z0,x1,y1,z1], d: [w,h] }   beam between two points (width, height)
//   { p: [[x,y,z], ...], u: 'x'|'z' }      flat convex polygon (roof sheet); u = direction of the corrugation
//   { t: [x0,y0,z0,x1,y1,z1], rad }  tube between two points
//   { o: [x,y,z,r] }                ball
//   Options on a part: r = role (the part shows only when this stage is done), m = own material,
//   nc = 1 no collision.

export const PHASES = [
	{ k: 'site', n: 'Site work' },
	{ k: 'found', n: 'Foundations' },
	{ k: 'struct', n: 'Structure (obra gris)' },
	{ k: 'roof', n: 'Roof' },
	{ k: 'mep', n: 'Electrical & plumbing' },
	{ k: 'plaster', n: 'Plaster & ceilings' },
	{ k: 'open', n: 'Windows & doors' },
	{ k: 'finish', n: 'Finishes' },
	{ k: 'ext', n: 'Exterior works' }
];

// stage: [key, label, phase, material, weight]
const RAW = {
	earth: ['Earthworks', 0, [['clear', 'Clear & level', 'site', 'dirt', .25], ['excavate', 'Excavate', 'site', 'none', .55], ['backfill', 'Backfill', 'found', 'none', .2]]],
	footing: ['Footing', 0, [['rebar', 'Rebar', 'found', 'rebar', .4], ['pour', 'Pour concrete', 'found', 'concrete', .6]]],
	fbeam: ['Foundation beam', 0, [['form', 'Form & rebar', 'found', 'plywood', .45], ['pour', 'Pour concrete', 'found', 'concrete', .55]]],
	pipe: ['Underground pipes', 0, [['lay', 'Lay & test pipes', 'mep', 'pvc', 1]]],
	slab: ['Ground floor slab', 0, [['fill', 'Fill & compact', 'struct', 'gravel', .15], ['mesh', 'Mesh & vapour barrier', 'struct', 'rebar', .15], ['pour', 'Pour concrete', 'struct', 'concrete', .3], ['tile', 'Floor tile', 'finish', 'tile', .4]]],
	column: ['Column', 1, [['rebar', 'Rebar', 'struct', 'rebar', .4], ['pour', 'Form & pour', 'struct', 'concrete', .6]]],
	wall: ['Block wall', 1, [['block', 'Block masonry', 'struct', 'block', .55], ['plaster', 'Plaster (repello)', 'plaster', 'plaster', .3], ['paint', 'Paint', 'finish', 'paint', .15]]],
	beam: ['Beam', 0, [['form', 'Form & rebar', 'struct', 'plywood', .4], ['pour', 'Pour concrete', 'struct', 'concrete', .6]]],
	slab2: ['Second floor slab', 0, [['form', 'Formwork & shoring', 'struct', 'plywood', .15], ['rebar', 'Joists & rebar', 'struct', 'rebar', .25], ['pour', 'Pour concrete', 'struct', 'concrete', .25], ['tile', 'Floor tile', 'finish', 'tile', .35]]],
	stair: ['Stair', 0, [['pour', 'Form & pour', 'struct', 'concrete', .7], ['finish', 'Tile', 'finish', 'tile', .3]]],
	truss: ['Roof structure', 0, [['install', 'Steel structure', 'roof', 'steel', 1]]],
	roof: ['Roof sheets', 0, [['install', 'Install sheets', 'roof', 'lamina', 1]]],
	fascia: ['Fascia & gutters', 0, [['install', 'Install', 'roof', 'fascia', 1]]],
	ceiling: ['Ceiling', 0, [['frame', 'Frame', 'plaster', 'grid', .4], ['board', 'Boards', 'plaster', 'ceiling', .6]]],
	window: ['Window', 0, [['frame', 'Aluminium frame', 'open', 'alu', .6], ['glass', 'Glass', 'open', 'glass', .4]]],
	door: ['Door', 0, [['frame', 'Frame', 'open', 'wood', .3], ['leaf', 'Door leaf & lock', 'open', 'door', .7]]],
	elec: ['Electrical', 0, [['conduit', 'Conduit & boxes', 'mep', 'conduit', .4], ['wire', 'Wiring', 'mep', 'wire', .3], ['devices', 'Outlets & lights', 'finish', 'device', .3]]],
	plumb: ['Plumbing rough-in', 0, [['rough', 'Pipes in walls', 'mep', 'pvc', 1]]],
	panel: ['Electrical panel', 0, [['install', 'Install & connect', 'mep', 'device', 1]]],
	fixture: ['Bathroom fixtures', 0, [['install', 'Install', 'finish', 'ceramic', 1]]],
	cabinet: ['Kitchen', 0, [['install', 'Cabinets & counter', 'finish', 'cabinet', 1]]],
	railing: ['Railing', 0, [['install', 'Install', 'finish', 'steelDark', 1]]],
	paving: ['Paving', 0, [['base', 'Base', 'ext', 'gravel', .3], ['pour', 'Pour concrete', 'ext', 'concrete', .7]]],
	tapia: ['Perimeter wall (tapia)', 1, [['block', 'Block masonry', 'ext', 'block', .6], ['plaster', 'Plaster', 'ext', 'plaster', .25], ['paint', 'Paint', 'ext', 'paint', .15]]],
	garden: ['Garden', 0, [['plant', 'Plant', 'ext', 'plant', 1]]],
	pila: ['Laundry sink (pila)', 0, [['install', 'Install', 'ext', 'concrete', 1]]]
};

export const TYPES = {};
for (const k in RAW) {
	const [n, grow, st] = RAW[k];
	TYPES[k] = { n, grow: !!grow, st: st.map(([k, n, ph, m, w]) => ({ k, n, ph, m, w })) };
}
TYPES.earth.base = 'grass';          // the ground shows before the work starts
export const WALKABLE = { slab: 1, slab2: 1, stair: 1, paving: 1, earth: 1 };

// ---------- dates: whole days, as numbers (days from 1970-01-01, UTC) ----------

export function dayNum(iso) {
	if (!iso) return null;
	const p = iso.split('-');
	return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000);
}

export function isoDay(n) {
	return new Date(n * 86400000).toISOString().slice(0, 10);
}

export function todayNum() {
	const d = new Date();
	return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

// ---------- geometry helpers ----------

const T = 0.15;              // block wall thickness (12 cm block and plaster)
const H = 2.6;               // wall height up to the beam
const F2 = 3.0;              // level of the second floor
const TOP = 5.9;             // top of the bond beam (viga corona)

const r3 = v => Math.round(v * 1000) / 1000;

function bx(x0, y0, z0, x1, y1, z1, o) {
	const p = { b: [r3(Math.min(x0, x1)), r3(Math.min(y0, y1)), r3(Math.min(z0, z1)), r3(Math.max(x0, x1)), r3(Math.max(y0, y1)), r3(Math.max(z0, z1))] };
	return o ? Object.assign(p, o) : p;
}

function sg(x0, y0, z0, x1, y1, z1, w, h, o) {
	const p = { s: [x0, y0, z0, x1, y1, z1].map(r3), d: [w, h] };
	return o ? Object.assign(p, o) : p;
}

// a frame for a wall line: local u (along the wall from a), v (height from y0), d (to the side, + = +z or +x)
function frame(a, b, y0) {
	const alongX = a[1] === b[1];
	return (u0, u1, v0, v1, d0, d1, o) => alongX
		? bx(a[0] + u0, y0 + v0, a[1] + d0, a[0] + u1, y0 + v1, a[1] + d1, o)
		: bx(a[0] + d0, y0 + v0, a[1] + u0, a[0] + d1, y0 + v1, a[1] + u1, o);
}

function wlen(a, b) {
	return Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
}

// the boxes of a wall, with holes for the openings
function wallParts(a, b, y0, h, ops) {
	const f = frame(a, b, y0), len = wlen(a, b), out = [];
	const piece = (u0, u1, v0, v1) => {
		if (u1 - u0 > 0.005 && v1 - v0 > 0.005) out.push(f(u0, u1, v0, v1, -T / 2, T / 2));
	};
	let u = -T / 2;
	for (const o of ops.slice().sort((p, q) => p.c - q.c)) {
		const o0 = o.c - o.w / 2, o1 = o.c + o.w / 2;
		piece(u, o0, 0, h);
		if (o.s > 0) piece(o0, o1, 0, o.s);
		if (o.h < h) piece(o0, o1, o.h, h);
		u = o1;
	}
	piece(u, len + T / 2, 0, h);
	return out;
}

function windowParts(a, b, y0, o) {
	const f = frame(a, b, y0), o0 = o.c - o.w / 2, o1 = o.c + o.w / 2, ft = 0.05, d = 0.04;
	return [
		f(o0, o1, o.h - ft, o.h, -d, d, { r: 'frame' }),
		f(o0, o1, o.s, o.s + ft, -d, d, { r: 'frame' }),
		f(o0, o0 + ft, o.s, o.h, -d, d, { r: 'frame' }),
		f(o1 - ft, o1, o.s, o.h, -d, d, { r: 'frame' }),
		f(o.c - 0.015, o.c + 0.015, o.s, o.h, -d, d, { r: 'frame' }),
		f(o0 + ft, o1 - ft, o.s + ft, o.h - ft, -0.006, 0.006, { r: 'glass', m: 'glass' })
	];
}

// door: frame and an open leaf (90 degrees, to the side sw = +1 or -1)
function doorParts(a, b, y0, o) {
	const f = frame(a, b, y0), o0 = o.c - o.w / 2, o1 = o.c + o.w / 2, ft = 0.05, d = T / 2 + 0.02;
	const sw = o.sw || 1, l0 = sw * T / 2, l1 = sw * (T / 2 + o.w - 2 * ft);
	return [
		f(o0, o0 + ft, 0, o.h, -d, d, { r: 'frame', nc: 1 }),
		f(o1 - ft, o1, 0, o.h, -d, d, { r: 'frame', nc: 1 }),
		f(o0, o1, o.h - ft, o.h, -d, d, { r: 'frame', nc: 1 }),
		f(o0 + ft, o0 + ft + 0.04, 0.01, o.h - ft, Math.min(l0, l1), Math.max(l0, l1), { r: 'leaf', nc: 1 })
	];
}

const win = (c, w, s, h, n) => ({ k: 'win', c, w, s, h, n });
const door = (c, w, n, sw) => ({ k: 'door', c, w, s: 0, h: 2.1, n, sw: sw || 1 });

// ---------- the floor plans ----------

// [id, name, a, b, exterior, openings]
const GF_WALLS = [
	['front', 'front', [-4.5, 0], [4.5, 0], 1, [door(2.3, 1.0, 'Main door', 1), win(6.5, 3.0, 0.5, 2.1, 'Living room window')]],
	['right', 'right side', [4.5, 0], [4.5, 11], 1, [win(3, 2, 0.9, 2.1, 'Living room side window'), win(8.75, 1.5, 1.1, 2.1, 'Kitchen side window')]],
	['back', 'back', [-4.5, 11], [4.5, 11], 1, [door(3.35, 0.9, 'Back door', -1), win(7.25, 1.5, 1.1, 2.1, 'Kitchen window')]],
	['left', 'left side', [-4.5, 0], [-4.5, 11], 1, [win(3.5, 1.0, 1.2, 2.1, 'Stair window'), win(8.0, 0.6, 1.6, 2.1, 'Half bath window')]],
	['bathE', 'half bath / storage', [-2.5, 7], [-2.5, 11], 0, [door(1.0, 0.8, 'Half bath door', -1), door(3.0, 0.8, 'Storage door', -1)]],
	['bathS', 'half bath / stair', [-4.5, 7], [-2.5, 7], 0, []],
	['bathN', 'half bath / storage', [-4.5, 9], [-2.5, 9], 0, []]
];

const UF_WALLS = [
	['front', 'front', [-4.5, 0], [4.5, 0], 1, [win(1.9, 1.6, 0.9, 2.1, 'Family room window'), win(6.6, 2.6, 0.9, 2.1, 'Master bedroom window')]],
	['right', 'right side', [4.5, 0], [4.5, 11], 1, [win(2.25, 1.5, 0.9, 2.1, 'Master bedroom side window'), win(5.8, 0.8, 1.6, 2.1, 'Master bath window'), win(9.1, 1.4, 0.9, 2.1, 'Bedroom 2 side window')]],
	['back', 'back', [-4.5, 11], [4.5, 11], 1, [win(1.6, 1.4, 0.9, 2.1, 'Bedroom 3 window'), win(4.5, 0.8, 1.6, 2.1, 'Bath 2 window'), win(7.4, 1.4, 0.9, 2.1, 'Bedroom 2 window')]],
	['left', 'left side', [-4.5, 0], [-4.5, 11], 1, [win(2.5, 1.0, 0.9, 2.1, 'Stairwell window'), win(9.0, 1.4, 0.9, 2.1, 'Bedroom 3 side window')]],
	['famE', 'family room / master', [-1, 0], [-1, 4.5], 0, []],
	['mastS', 'master / hall', [-1, 4.5], [4.5, 4.5], 0, [door(1.0, 0.9, 'Master bedroom door', -1), door(4.25, 0.8, 'Master bath door', 1)]],
	['mbW', 'hall / master bath', [2, 4.5], [2, 7], 0, []],
	['hallN', 'hall / bedrooms', [-4.5, 7], [4.5, 7], 0, [door(2.5, 0.9, 'Bedroom 3 door', 1), door(4.5, 0.8, 'Bath 2 door', 1), door(6.0, 0.8, 'Bedroom 2 door', 1)]],
	['b3E', 'bedroom 3 / bath 2', [-1, 7], [-1, 11], 0, []],
	['b2W', 'bath 2 / bedroom 2', [1, 7], [1, 11], 0, []]
];

const ROOMS = [
	[1, 'Living room', 1.5, 2.5], [1, 'Dining', 0, 6], [1, 'Kitchen', 2.5, 9], [1, 'Half bath', -3.5, 8],
	[1, 'Storage', -3.5, 10], [1, 'Entry', -2.2, 1.5],
	[2, 'Family room', -2.4, 2.2], [2, 'Master bedroom', 1.8, 2.2], [2, 'Master bath', 3.25, 5.75], [2, 'Hall', -1.5, 5.75],
	[2, 'Bedroom 3', -2.75, 9], [2, 'Bath 2', 0, 8.5], [2, 'Bedroom 2', 2.75, 9]
];
export { ROOMS };

// ---------- the roof (hip roof, 30 % slope, 0.8 m overhang) ----------

const SL = 0.3, OV = 0.8, RX = 4.5 + OV, Z0 = -OV, Z1 = 11 + OV;
const YE = TOP - OV * SL;                       // eave
const YR = TOP + 4.5 * SL;                      // ridge
const RZ0 = Z0 + RX, RZ1 = Z1 - RX;             // ridge ends
const A = [-RX, YE, Z0], B = [RX, YE, Z0], C = [RX, YE, Z1], D = [-RX, YE, Z1], R1 = [0, YR, RZ0], R2 = [0, YR, RZ1];

function roofY(s) {                             // height of the roof plane at s metres in from the eave
	return YE + s * SL;
}

function slopeStructure(side) {
	// purlins (clavadores) each 0.9 m and rafters each 1.2 m, 0.1 m under the sheets
	const parts = [], dy = -0.08;
	for (let s = 0.15; s < RX - 0.2; s += 0.9) {
		const y = roofY(s) + dy;
		if (side === 'W') parts.push(sg(-RX + s, y, Z0 + s, -RX + s, y, Z1 - s, 0.05, 0.1));
		if (side === 'E') parts.push(sg(RX - s, y, Z0 + s, RX - s, y, Z1 - s, 0.05, 0.1));
		if (side === 'F') parts.push(sg(-RX + s, y, Z0 + s, RX - s, y, Z0 + s, 0.05, 0.1));
		if (side === 'K') parts.push(sg(-RX + s, y, Z1 - s, RX - s, y, Z1 - s, 0.05, 0.1));
	}
	const ry = dy - 0.1;
	if (side === 'W' || side === 'E') {
		const sx = side === 'W' ? -1 : 1;
		for (let z = Z0 + 0.6; z < Z1 - 0.3; z += 1.2) {
			const run = Math.min(RX, z - Z0, Z1 - z);       // to the ridge or to a hip
			parts.push(sg(sx * RX, YE + ry, z, sx * (RX - run), roofY(run) + ry, z, 0.05, 0.1));
		}
	} else {
		const z0 = side === 'F' ? Z0 : Z1, sz = side === 'F' ? 1 : -1;
		for (let x = -RX + 0.6; x < RX - 0.3; x += 1.2) {
			const run = RX - Math.abs(x);
			parts.push(sg(x, YE + ry, z0, x, roofY(run) + ry, z0 + sz * run, 0.05, 0.1));
		}
	}
	return parts;
}

// ---------- building the demo project ----------

export function demoProject(today) {
	const els = [];
	const add = (id, n, t, f, parts, o) => {
		const e = Object.assign({ id, n, t, f, parts, note: '' }, o || {});
		els.push(e);
		return e;
	};

	// site
	add('earth', 'Earthworks: clear, excavate, backfill', 'earth', 0, [
		bx(-4.9, -1.0, -0.4, 4.9, -0.15, 11.4),
		bx(-4.9, -1.0, -0.4, 4.9, -0.15, -0.075, { r: 'backfill', m: 'dirt' }),
		bx(-4.9, -1.0, 11.075, 4.9, -0.15, 11.4, { r: 'backfill', m: 'dirt' }),
		bx(-4.9, -1.0, -0.075, -4.575, -0.15, 11.075, { r: 'backfill', m: 'dirt' }),
		bx(4.575, -1.0, -0.075, 4.9, -0.15, 11.075, { r: 'backfill', m: 'dirt' })
	]);

	// columns from the wall ends, plus some on long walls
	const colPoints = (walls, extra) => {
		const seen = {}, pts = [];
		const put = p => {
			const k = p[0] + ',' + p[1];
			if (!seen[k]) { seen[k] = 1; pts.push(p); }
		};
		walls.forEach(w => { put(w[2]); put(w[3]); });
		extra.forEach(put);
		return pts.sort((p, q) => p[1] - q[1] || p[0] - q[0]);
	};
	const cols1 = colPoints(GF_WALLS, [[-1, 0], [4.5, 5.5], [0, 11], [-4.5, 5]]);
	const cols2 = colPoints(UF_WALLS, []);

	// foundations
	GF_WALLS.forEach(([id, n, a, b]) => {
		const f = frame(a, b, -0.95), len = wlen(a, b);
		add('ftg-' + id, 'Strip footing: ' + n, 'footing', 0, [f(-0.25, len + 0.25, 0, 0.2, -0.25, 0.25)]);
	});
	cols1.forEach((p, i) => {
		add('pad-' + (i + 1), 'Pad footing P' + (i + 1), 'footing', 0, [bx(p[0] - 0.4, -1.0, p[1] - 0.4, p[0] + 0.4, -0.75, p[1] + 0.4)]);
	});
	GF_WALLS.forEach(([id, n, a, b]) => {
		const f = frame(a, b, -0.75), len = wlen(a, b);
		add('fb-' + id, 'Foundation beam: ' + n, 'fbeam', 0, [f(-0.1, len + 0.1, 0, 0.7, -0.1, 0.1)]);
	});

	// underground pipes
	add('pipe-san', 'Sanitary lines (to the street)', 'pipe', 0, [
		{ t: [-1.5, -0.45, 11.0, -1.5, -0.45, -0.6], rad: 0.05, m: 'pvc' },
		{ t: [-3.6, -0.4, 8.0, -1.5, -0.45, 8.0], rad: 0.05, m: 'pvc' },
		{ t: [2.5, -0.4, 10.6, -1.5, -0.45, 10.6], rad: 0.05, m: 'pvc' },
		{ t: [3.8, -0.4, 6.4, -1.5, -0.45, 6.4], rad: 0.05, m: 'pvc' },
		{ t: [0, -0.4, 9.8, -1.5, -0.45, 9.8], rad: 0.05, m: 'pvc' }
	]);
	add('pipe-water', 'Water supply lines', 'pipe', 0, [
		{ t: [1.2, -0.3, -0.6, 1.2, -0.3, 10.4], rad: 0.02, m: 'cpvc' },
		{ t: [1.2, -0.3, 10.4, 3.4, -0.3, 10.4], rad: 0.02, m: 'cpvc' },
		{ t: [1.2, -0.3, 7.6, -3.6, -0.3, 7.6], rad: 0.02, m: 'cpvc' },
		{ t: [1.2, -0.3, 6.2, 3.9, -0.3, 6.2], rad: 0.02, m: 'cpvc' }
	]);

	// ground floor slab
	add('slab1', 'Ground floor slab', 'slab', 1, [bx(-4.575, -0.6, -0.075, 4.575, 0, 11.075)]);

	// walls, columns, windows, doors of one floor
	const floor = (walls, cols, y0, f) => {
		const L = f + 'F';
		cols.forEach((p, i) => {
			add('c' + f + '-' + (i + 1), L + ' column C' + (i + 1), 'column', f,
				[bx(p[0] - 0.1, y0, p[1] - 0.1, p[0] + 0.1, y0 + H, p[1] + 0.1)], { y0 });
		});
		walls.forEach(([id, n, a, b, ext, ops]) => {
			add('w' + f + '-' + id, L + ' wall: ' + n + (ext ? ' (exterior)' : ''), 'wall', f,
				wallParts(a, b, y0, H, ops), { y0, paint: ext ? 'paintExt' : 'paintInt' });
		});
		walls.forEach(([id, n, a, b, ext, ops]) => {
			ops.forEach((o, i) => {
				if (o.k === 'win') add('win' + f + '-' + id + i, L + ' ' + o.n, 'window', f, windowParts(a, b, y0, o));
				else add('door' + f + '-' + id + i, L + ' ' + o.n, 'door', f, doorParts(a, b, y0, o), { ext: ext });
			});
		});
	};

	floor(GF_WALLS, cols1, 0, 1);

	// beams under the second floor slab, and the slab
	GF_WALLS.forEach(([id, n, a, b]) => {
		const f = frame(a, b, H), len = wlen(a, b);
		add('b1-' + id, 'Beam (entrepiso): ' + n, 'beam', 1, [f(-0.1, len + 0.1, 0, F2 - H, -0.1, 0.1)]);
	});
	add('slab2', 'Second floor slab (entrepiso)', 'slab2', 2, [
		bx(-3.5, 2.85, -0.075, 4.575, F2, 11.075),
		bx(-4.575, 2.85, -0.075, -3.5, F2, 1.0),
		bx(-4.575, 2.85, 5.5, -3.5, F2, 11.075)
	]);

	// stair: 17 steps from z 1.0 to z 5.5 along the left wall
	const steps = [], n = 17, rise = F2 / n, run = 4.5 / n;
	for (let i = 0; i < n; i++) steps.push(bx(-4.425, 0, 1.0 + i * run, -3.5, (i + 1) * rise, 1.0 + (i + 1) * run));
	add('stair', 'Stair', 'stair', 1, steps);

	floor(UF_WALLS, cols2, F2, 2);

	UF_WALLS.forEach(([id, n, a, b]) => {
		const f = frame(a, b, F2 + H), len = wlen(a, b);
		add('b2-' + id, 'Bond beam (viga corona): ' + n, 'beam', 2, [f(-0.1, len + 0.1, 0, TOP - F2 - H, -0.1, 0.1)]);
	});

	// roof
	add('truss-ridge', 'Roof structure: ridge and hips', 'truss', 3, [
		sg(R1[0], R1[1] - 0.18, R1[2], R2[0], R2[1] - 0.18, R2[2], 0.1, 0.15),
		sg(A[0], A[1] - 0.18, A[2], R1[0], R1[1] - 0.18, R1[2], 0.1, 0.15),
		sg(B[0], B[1] - 0.18, B[2], R1[0], R1[1] - 0.18, R1[2], 0.1, 0.15),
		sg(C[0], C[1] - 0.18, C[2], R2[0], R2[1] - 0.18, R2[2], 0.1, 0.15),
		sg(D[0], D[1] - 0.18, D[2], R2[0], R2[1] - 0.18, R2[2], 0.1, 0.15)
	]);
	const SLOPES = [['W', 'left', [A, D, R2, R1], 'z'], ['E', 'right', [B, R1, R2, C], 'z'], ['F', 'front', [A, R1, B], 'x'], ['K', 'back', [D, C, R2], 'x']];
	SLOPES.forEach(([k, n]) => add('truss-' + k, 'Roof structure: ' + n + ' slope', 'truss', 3, slopeStructure(k)));
	SLOPES.forEach(([k, n, p, u]) => add('roof-' + k, 'Roof sheets: ' + n + ' slope', 'roof', 3, [{ p, u }]));
	[['F', 'front', A, B], ['E', 'right', B, C], ['K', 'back', C, D], ['W', 'left', D, A]].forEach(([k, n, p, q]) => {
		const parts = [];
		const out = 0.02;
		if (p[2] === q[2]) {
			const z = p[2] + (k === 'F' ? -out : out);
			parts.push(bx(-RX - 0.03, YE - 0.2, z - 0.015, RX + 0.03, YE + 0.02, z + 0.015));
			parts.push(bx(-RX, YE - 0.2, z + (k === 'F' ? -0.14 : 0.02), RX, YE - 0.08, z + (k === 'F' ? -0.02 : 0.14), { m: 'gutter' }));
		} else {
			const x = p[0] + (k === 'W' ? -out : out);
			parts.push(bx(x - 0.015, YE - 0.2, Z0 - 0.03, x + 0.015, YE + 0.02, Z1 + 0.03));
			parts.push(bx(x + (k === 'W' ? -0.14 : 0.02), YE - 0.2, Z0, x + (k === 'W' ? -0.02 : 0.14), YE - 0.08, Z1, { m: 'gutter' }));
		}
		// downpipe (bajante) at one corner of each side
		const dx = k === 'E' ? RX + 0.08 : k === 'W' ? -RX - 0.08 : k === 'F' ? -RX + 0.3 : RX - 0.3;
		const dz = k === 'F' ? Z0 - 0.08 : k === 'K' ? Z1 + 0.08 : k === 'E' ? Z0 + 0.3 : Z1 - 0.3;
		parts.push({ t: [dx, YE - 0.15, dz, dx, -0.1, dz], rad: 0.04, m: 'gutter' });
		add('fascia-' + k, 'Fascia & gutter: ' + n, 'fascia', 3, parts);
	});
	add('soffit', 'Eave soffit (cielo de aleros)', 'ceiling', 3, [
		bx(-RX, YE - 0.02, Z0, RX, YE, -0.075),
		bx(-RX, YE - 0.02, 11.075, RX, YE, Z1),
		bx(-RX, YE - 0.02, -0.075, -4.575, YE, 11.075),
		bx(4.575, YE - 0.02, -0.075, RX, YE, 11.075)
	]);

	// ceilings
	add('ceil1', '1F ceiling (gypsum)', 'ceiling', 1, [
		bx(-3.5, 2.8, 0.075, 4.425, 2.83, 10.925, { nc: 1 }),
		bx(-4.425, 2.8, 5.5, -3.5, 2.83, 10.925, { nc: 1 })
	]);
	add('ceil2', '2F ceiling (fibre cement)', 'ceiling', 2, [bx(-4.425, 5.55, 0.075, 4.425, 5.58, 10.925, { nc: 1 })]);

	// electrical: outlet boxes, switches, light points
	[[1, GF_WALLS, 0, 2.77], [2, UF_WALLS, F2, 5.53]].forEach(([f, walls, y0, yc]) => {
		const parts = [];
		walls.forEach(([id, n, a, b, ext, ops]) => {
			const fr = frame(a, b, y0), len = wlen(a, b);
			const free = u => ops.every(o => Math.abs(u - o.c) > o.w / 2 + 0.2);
			const u = [0.6, len / 2, len - 0.6].find(free);
			if (u !== undefined) parts.push(fr(u - 0.05, u + 0.05, 0.3, 0.42, T / 2, T / 2 + 0.015, { nc: 1 }));
			ops.filter(o => o.k === 'door').forEach(o => {
				const us = o.c + o.w / 2 + 0.15, side = (o.sw || 1);
				parts.push(fr(us - 0.04, us + 0.04, 1.1, 1.22, side * T / 2, side * (T / 2 + 0.015), { nc: 1 }));
			});
		});
		ROOMS.filter(r => r[0] === f).forEach(r => parts.push(bx(r[2] - 0.12, yc - 0.03, r[3] - 0.12, r[2] + 0.12, yc, r[3] + 0.12, { nc: 1, r: 'devices', m: 'device' })));
		add('elec' + f, f + 'F electrical', 'elec', f, parts);
	});
	add('panel', 'Electrical panel (storage room)', 'panel', 1, [bx(-4.425, 1.3, 9.9, -4.36, 1.8, 10.3, { nc: 1 })]);

	// plumbing rough-in and fixtures, per wet room
	const stub = (x, y, z) => ({ t: [x, y, z, x, y + 0.5, z], rad: 0.03, m: 'pvc' });
	add('plumb-hb', '1F half bath plumbing', 'plumb', 1, [stub(-4.3, 0, 8.6), stub(-3.1, 0, 7.15)]);
	add('plumb-k', 'Kitchen plumbing', 'plumb', 1, [stub(2.75, 0, 10.85), stub(4.3, 0, 7.8)]);
	add('plumb-mb', 'Master bath plumbing', 'plumb', 2, [stub(4.3, F2, 5.2), stub(2.2, F2, 5.7), stub(3.8, F2, 6.5)]);
	add('plumb-b2', 'Bath 2 plumbing', 'plumb', 2, [stub(0.8, F2, 8.85), stub(-0.8, F2, 8.7), stub(0, F2, 10.5)]);

	const toilet = (x, y, z, dir) => {       // dir: the side of the wall: 'x-' 'x+' 'z+'
		if (dir === 'x-') return [bx(x, y + 0.4, z - 0.2, x + 0.18, y + 0.8, z + 0.2), bx(x + 0.18, y, z - 0.18, x + 0.68, y + 0.42, z + 0.18)];
		if (dir === 'x+') return [bx(x - 0.18, y + 0.4, z - 0.2, x, y + 0.8, z + 0.2), bx(x - 0.68, y, z - 0.18, x - 0.18, y + 0.42, z + 0.18)];
		return [bx(x - 0.2, y + 0.4, z - 0.18, x + 0.2, y + 0.8, z), bx(x - 0.18, y, z - 0.68, x + 0.18, y + 0.42, z - 0.18)];
	};
	add('fix-hb', '1F half bath fixtures', 'fixture', 1, [
		...toilet(-4.425, 0, 8.55, 'x-'),
		bx(-3.35, 0.8, 7.075, -2.85, 0.9, 7.5), bx(-3.18, 0, 7.1, -3.02, 0.8, 7.25)
	]);
	add('fix-mb', 'Master bath fixtures', 'fixture', 2, [
		...toilet(4.425, F2, 5.15, 'x+'),
		bx(2.075, F2, 5.3, 2.6, F2 + 0.85, 6.1, { m: 'cabinet' }), bx(2.075, F2 + 0.85, 5.3, 2.62, F2 + 0.9, 6.1, { m: 'granite' }),
		bx(3.2, F2, 6.05, 4.425, F2 + 0.06, 6.925), bx(3.19, F2 + 0.06, 6.05, 3.2, F2 + 2.0, 6.925, { m: 'glass', nc: 1 })
	]);
	add('fix-b2', 'Bath 2 fixtures', 'fixture', 2, [
		...toilet(0.925, F2, 8.85, 'x+'),
		bx(-0.925, F2, 8.3, -0.4, F2 + 0.85, 9.1, { m: 'cabinet' }), bx(-0.925, F2 + 0.85, 8.3, -0.38, F2 + 0.9, 9.1, { m: 'granite' }),
		bx(-0.925, F2, 10.0, 0.925, F2 + 0.06, 10.925), bx(-0.925, F2 + 0.06, 9.99, 0.925, F2 + 2.0, 10.0, { m: 'glass', nc: 1 })
	]);
	add('kitchen', 'Kitchen cabinets & counter', 'cabinet', 1, [
		bx(0.3, 0, 10.3, 4.425, 0.86, 10.925), bx(0.28, 0.86, 10.28, 4.425, 0.9, 10.925, { m: 'granite' }),
		bx(3.8, 0, 7.4, 4.425, 0.86, 10.3), bx(3.78, 0.86, 7.4, 4.425, 0.9, 10.3, { m: 'granite' }),
		bx(1.2, 0, 8.4, 3.0, 0.86, 9.2), bx(1.15, 0.86, 8.35, 3.05, 0.9, 9.25, { m: 'granite' }),
		bx(0.3, 1.5, 10.575, 1.9, 2.2, 10.925), bx(3.6, 1.5, 10.575, 4.425, 2.2, 10.925)
	]);

	// railings
	const rail = [];
	for (let i = 1; i < n; i += 3) {
		const z = 1.0 + (i + 0.5) * run, y = (i + 1) * rise;
		rail.push(bx(-3.56, y, z - 0.02, -3.52, y + 0.9, z + 0.02));
	}
	rail.push(sg(-3.54, 0.9 + rise, 1.0 + 0.5 * run, -3.54, F2 + 0.9, 5.5, 0.05, 0.05));
	add('rail1', 'Stair railing', 'railing', 1, rail);
	const guard = [bx(-3.53, F2 + 0.95, 1.0, -3.47, F2 + 1.0, 5.5), bx(-4.425, F2 + 0.95, 0.97, -3.47, F2 + 1.0, 1.03),
		bx(-3.53, F2 + 0.05, 1.0, -3.47, F2 + 0.1, 5.5)];
	for (let z = 1.1; z < 5.5; z += 0.12) guard.push(bx(-3.515, F2 + 0.1, z - 0.01, -3.485, F2 + 0.95, z + 0.01));
	for (let x = -4.35; x < -3.5; x += 0.12) guard.push(bx(x - 0.01, F2, 0.985, x + 0.01, F2 + 0.95, 1.015));
	add('rail2', '2F stairwell guard', 'railing', 2, guard);

	// exterior works
	add('tapia-L', 'Perimeter wall: left', 'tapia', 4, wallParts([-6, -2], [-6, 14], -0.15, 2.2, []), { y0: -0.15, paint: 'paintExt' });
	add('tapia-K', 'Perimeter wall: back', 'tapia', 4, wallParts([-6, 14], [6, 14], -0.15, 2.2, []), { y0: -0.15, paint: 'paintExt' });
	add('tapia-R', 'Perimeter wall: right', 'tapia', 4, wallParts([6, -2], [6, 14], -0.15, 2.2, []), { y0: -0.15, paint: 'paintExt' });
	add('drive', 'Driveway & entry path', 'paving', 4, [bx(0.4, -0.15, -8, 5.6, -0.05, -0.4), bx(-2.75, -0.15, -8, -1.65, -0.05, -0.4)]);
	add('patio', 'Back patio', 'paving', 4, [bx(-4.9, -0.15, 11.4, 4.9, -0.05, 13.925)]);
	add('pila', 'Laundry sink (pila)', 'pila', 4, [bx(3.0, -0.05, 13.3, 4.2, 0.75, 13.925), bx(3.0, 0.75, 13.2, 4.2, 0.9, 13.925)]);
	add('garden', 'Front garden', 'garden', 4, [
		{ o: [-5.2, 0.25, -6.5, 0.45] }, { o: [-4.3, 0.3, -5.6, 0.5] }, { o: [-5.3, 0.2, -3.0, 0.4] }, { o: [-4.6, 0.25, -1.4, 0.45] },
		{ o: [5.8, 0.3, -7.2, 0.4] }, { t: [-3.6, -0.15, -7.0, -3.6, 1.6, -7.0], rad: 0.09, m: 'bark' }, { o: [-3.6, 2.2, -7.0, 1.1] },
		bx(-5.9, -0.15, -7.9, -2.9, -0.1, -0.5, { m: 'lawn', nc: 1 })
	]);

	// costs (colones) from the quantities
	const area = e => e.parts.reduce((s, p) => {
		if (!p.b) return s;
		const [x0, y0, z0, x1, y1, z1] = p.b;
		return s + Math.max(x1 - x0, z1 - z0) * (y1 - y0);
	}, 0);
	const plan = e => e.parts.reduce((s, p) => p.b ? s + (p.b[3] - p.b[0]) * (p.b[5] - p.b[2]) : s, 0);
	const polyArea = p => {
		let a = 0;
		for (let i = 0; i < p.length; i++) {
			const q = p[i], r = p[(i + 1) % p.length];
			a += q[0] * r[2] - r[0] * q[2];
		}
		return Math.abs(a / 2) / Math.cos(Math.atan(SL));
	};
	const RATES = {
		earth: () => 2.4e6, footing: e => plan(e) * 0.22 * 290000, fbeam: e => area(e) / 0.7 * 42000,
		pipe: () => 700000, slab: e => plan(e) * 48000, column: e => area(e) / 0.2 * 36000, wall: e => area(e) * 38000,
		beam: e => area(e) / 0.3 * 46000, slab2: e => plan(e) * 88000, stair: () => 1.8e6,
		truss: e => e.id === 'truss-ridge' ? 900000 : 0, roof: e => polyArea(e.parts[0].p) * 14000, fascia: () => 300000,
		ceiling: e => plan(e) * 17000, window: e => {
			const p = e.parts[5].b;
			return Math.max(p[3] - p[0], p[5] - p[2]) * (p[4] - p[1]) * 98000;
		},
		door: e => e.ext ? 480000 : 190000, elec: () => 3.4e6, plumb: () => 420000, panel: () => 380000,
		fixture: () => 950000, cabinet: () => 3.6e6, railing: e => e.id === 'rail1' ? 650000 : 750000,
		paving: e => plan(e) * 27000, tapia: e => area(e) * 42000, garden: () => 950000, pila: () => 190000
	};
	els.forEach(e => { e.cost = RATES[e.t](e); });
	// the structure of each slope costs as much as its roof sheets times 1.6
	SLOPES.forEach(([k]) => {
		els.find(e => e.id === 'truss-' + k).cost = els.find(e => e.id === 'roof-' + k).cost * 1.6;
	});
	// scale the direct costs to a demo budget of 95 million colones
	const sum = els.reduce((s, e) => s + e.cost, 0);
	els.forEach(e => { e.cost = Math.round(e.cost * 95e6 / sum / 1000) * 1000; });

	schedule(els, today);

	const start = today - DAY_TODAY;
	return {
		v: 1,
		name: 'Casa Demo, Condominio Vista Verde, Lote 14',
		place: 'Santa Ana, San José',
		start: isoDay(start),
		currency: '₡',
		usd: 505,                // colones for 1 US dollar (you can change it)
		elements: els,
		photos: demoPhotos(start),
		demo: 1
	};
}

// ---------- the demo schedule ----------

const DAY_TODAY = 120;      // the demo is 120 days after the start

// [group, planned start day, duration]
const GROUPS = {
	site: [0, 4], excav: [4, 7], ftgReb: [11, 8], ftgPour: [16, 6], fbForm: [20, 7], fbPour: [25, 5], backfill: [30, 3],
	ugPipe: [29, 5], slabFill: [33, 4], slabMesh: [37, 3], slabPour: [40, 2],
	c1Reb: [42, 6], w1block: [44, 20], c1Pour: [50, 16], el1Conduit: [46, 18],
	b1Form: [64, 8], s2Form: [66, 8], s2Reb: [72, 6], s2Pour: [79, 1], stairPour: [80, 6],
	c2Reb: [88, 5], w2block: [89, 18], c2Pour: [95, 14], el2Conduit: [91, 16], b2Form: [107, 7], b2Pour: [114, 1],
	tapiaBlock: [60, 10], roofStruct: [116, 9], roofSheet: [125, 5], fascia: [129, 5], plumbRough: [118, 6],
	w1plaster: [120, 16], w2plaster: [134, 16], tapiaPlaster: [150, 6], ceilFrame: [142, 8], ceilBoard: [150, 8],
	winFrame: [146, 6], doorFrame: [148, 5], wiring: [152, 10], panel: [154, 2],
	tile1: [158, 10], tile2: [168, 10], stairFinish: [176, 4], winGlass: [172, 4],
	cabinets: [178, 6], fixtures: [184, 6], railing: [186, 3], doorLeaf: [188, 5], devices: [192, 4],
	paint: [194, 12], tapiaPaint: [196, 4], pavBase: [196, 4], pavPour: [200, 2], garden: [202, 5], pila: [199, 1]
};

function groupOf(e, k) {
	const f = e.f;
	switch (e.t) {
	case 'earth': return { clear: 'site', excavate: 'excav', backfill: 'backfill' }[k];
	case 'footing': return k === 'rebar' ? 'ftgReb' : 'ftgPour';
	case 'fbeam': return k === 'form' ? 'fbForm' : 'fbPour';
	case 'pipe': return 'ugPipe';
	case 'slab': return { fill: 'slabFill', mesh: 'slabMesh', pour: 'slabPour', tile: 'tile1' }[k];
	case 'column': return 'c' + f + (k === 'rebar' ? 'Reb' : 'Pour');
	case 'wall': return k === 'paint' ? 'paint' : 'w' + f + k;
	case 'beam': return f === 1 ? (k === 'form' ? 'b1Form' : 's2Pour') : (k === 'form' ? 'b2Form' : 'b2Pour');
	case 'slab2': return { form: 's2Form', rebar: 's2Reb', pour: 's2Pour', tile: 'tile2' }[k];
	case 'stair': return k === 'pour' ? 'stairPour' : 'stairFinish';
	case 'truss': return 'roofStruct';
	case 'roof': return 'roofSheet';
	case 'fascia': return 'fascia';
	case 'ceiling': return k === 'frame' ? 'ceilFrame' : 'ceilBoard';
	case 'window': return k === 'frame' ? 'winFrame' : 'winGlass';
	case 'door': return k === 'frame' ? 'doorFrame' : 'doorLeaf';
	case 'elec': return k === 'conduit' ? 'el' + f + 'Conduit' : k === 'wire' ? 'wiring' : 'devices';
	case 'plumb': return 'plumbRough';
	case 'panel': return 'panel';
	case 'fixture': return 'fixtures';
	case 'cabinet': return 'cabinets';
	case 'railing': return 'railing';
	case 'paving': return k === 'base' ? 'pavBase' : 'pavPour';
	case 'tapia': return { block: 'tapiaBlock', plaster: 'tapiaPlaster', paint: 'tapiaPaint' }[k];
	case 'garden': return 'garden';
	case 'pila': return 'pila';
	}
	return 'site';
}

// rain in September and October: the work is late by up to 17 days
function delay(d) {
	return d < 58 ? 0 : Math.min(17, (d - 58) * 0.3);
}

function jitter(s) {
	let h = 7;
	for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000003;
	return (h % 4) - 1;            // -1 .. 2 days
}

function schedule(els, today) {
	const start = today - DAY_TODAY, lists = {};
	els.forEach(e => {
		e.st = TYPES[e.t].st.map(s => ({ k: s.k }));
		e.st.forEach((s, i) => {
			const g = groupOf(e, s.k);
			(lists[g] = lists[g] || []).push(s);
		});
	});
	for (const g in lists) {
		const [g0, dur] = GROUPS[g], list = lists[g], n = list.length;
		list.forEach((s, i) => {
			const ps = g0 + Math.floor(dur * i / n);
			const pe = Math.min(g0 + dur, ps + Math.max(1, Math.ceil(dur / n * 1.5)));
			s.ps = isoDay(start + ps);
			s.pe = isoDay(start + pe);
			s._p = [ps, pe];
		});
	}
	els.forEach(e => e.st.forEach(s => {
		const [ps, pe] = s._p, j = jitter(e.id + s.k);
		delete s._p;
		const as = Math.round(ps + delay(ps)) + j, ae = Math.max(as + 1, Math.round(pe + delay(pe)) + j);
		if (ae <= DAY_TODAY - 1) {
			s.as = isoDay(start + as);
			s.ae = isoDay(start + ae);
		} else if (as <= DAY_TODAY) {
			s.as = isoDay(start + as);
		}
	}));
}

function demoPhotos(start) {
	const P = (d, pos, tgt, note) => ({ id: 'demo' + d, d: isoDay(start + d), pos, tgt, note, demo: 1 });
	return [
		P(11, [9, 6, -9], [0, -0.5, 5], 'Excavation finished, layout strings in place.'),
		P(41, [-8, 5, -6], [0, 0, 5], 'Ground floor slab poured.'),
		P(81, [10, 7, 18], [0, 2, 5], 'Second floor slab (entrepiso) poured. Shoring stays for 3 weeks.'),
		P(112, [-9, 4, -10], [0, 3, 4], 'Second floor walls. Rain slowed the work in October.'),
		P(119, [1.5, 1.6, 3], [-3, 1.5, 9], 'Inside the ground floor: walls ready for plaster.')
	];
}
