// app.js - CasaTrack: a 3D progress tracker for a house construction in Costa Rica.
// Orbit view, character walk-through, Meta Quest 3 VR and AR, photo pins, progress report,
// and a copilot mode (copilot.js): a second device (for example a MacBook) sees along and changes the view.
import * as THREE from 'three';
import { OrbitControls } from './OrbitControls.js';
import { TYPES, PHASES, demoProject, isoDay, todayNum, dayNum } from './model.js';
import { prep, elAt, range, slip as calcSlip, valueAt } from './progress.js';
import { M, W, makeMaterials, buildWorld, buildElements, applyView, lights, STATUS_COL, PHASE_COL, floorAt } from './scene.js';
import { createWalker, makeCharacter } from './walk.js';
import { createXR } from './xr.js';
import * as store from './store.js';
import { metrics, reportHTML, drawCurve, printHTML, fmtDay, money, esc } from './report.js';

const $ = id => document.getElementById(id);
const Copilot = window.Copilot;

const S = {
	project: null, els: [], byId: {}, today: todayNum(), day: 0, mode: 'actual', color: 'real', show: 'all', xray: false,
	sel: new Set(), point: null, view: 'orbit', tab: 'report', role: 'pilot', photos: new Map(), slip: 0, r: null,
	playing: false, pv: 0, filter: '', ro: false
};
window.S = S;

// ---------- three.js ----------

const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.xr.enabled = true;

const scene = new THREE.Scene();
const SKY = new THREE.Color(0xcfe0ee);
scene.background = SKY;
scene.fog = new THREE.Fog(0xcfe0ee, 120, 520);
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.05, 2000);
const rig = new THREE.Group();
rig.add(camera);
scene.add(rig);
camera.position.set(13, 9.5, -12);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 2.5, 4.5);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 2;
controls.maxDistance = 120;

makeMaterials();
const L = lights(scene);

// ---------- photo pins and the pilot avatar ----------

let pins = null;
const pinTex = (() => {
	const c = document.createElement('canvas');
	c.width = c.height = 128;
	const g = c.getContext('2d');
	g.fillStyle = '#1f2933';
	g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();
	g.fillStyle = '#fff';
	g.fillRect(30, 46, 68, 44);
	g.fillRect(50, 36, 26, 12);
	g.fillStyle = '#1f2933';
	g.beginPath(); g.arc(64, 68, 15, 0, Math.PI * 2); g.fill();
	g.fillStyle = '#5ad1ff';
	g.beginPath(); g.arc(64, 68, 9, 0, Math.PI * 2); g.fill();
	const t = new THREE.CanvasTexture(c);
	t.colorSpace = THREE.SRGBColorSpace;
	return t;
})();
const pinMat = new THREE.SpriteMaterial({ map: pinTex, depthTest: false, transparent: true });

function buildPins() {
	if (pins) W.world.remove(pins);
	pins = new THREE.Group();
	pins.renderOrder = 5;
	(S.project.photos || []).forEach(p => {
		const s = new THREE.Sprite(pinMat);
		s.position.fromArray(p.pos);
		s.scale.setScalar(0.55);
		s.userData.photo = p;
		s.renderOrder = 5;
		pins.add(s);
	});
	W.world.add(pins);
}

const pilotChar = makeCharacter();
pilotChar.g.visible = false;
const pilotHead = new THREE.Group();
{
	const hat = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffd21f }));
	const face = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), new THREE.MeshStandardMaterial({ color: 0xc68e64 }));
	const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.06), new THREE.MeshStandardMaterial({ color: 0x111111 }));
	hat.position.y = 0.05;
	visor.position.set(0, 0, -0.11);
	const cone = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 4, 1, true), new THREE.MeshBasicMaterial({ color: 0xb0168a, wireframe: true, transparent: true, opacity: 0.6 }));
	cone.rotation.x = Math.PI / 2;
	cone.rotation.y = Math.PI / 4;
	cone.position.z = -0.7;
	pilotHead.add(hat, face, visor, cone);
	pilotHead.visible = false;
}

// ---------- walker and XR ----------

const walker = createWalker(camera, canvas, { pickCenter: () => pickAt(0, 0, false) });

const xr = createXR(renderer, scene, camera, rig, {
	drawPanel, drawCard, press: (id, X) => act(id, X),
	pick: ray => {
		ray.camera = camera;
		const hit = hitTest(ray);
		if (!hit) return null;
		if (hit.photo) return { kind: 'photo', p: hit.photo };
		selectOnly(hit.el.id, true);
		return { kind: 'el', el: hit.el };
	},
	changed: () => { refresh(); sendStateSoon(); },
	started: X => {
		// start where the walker is, or in the front garden
		if (S.view === 'walk') { rig.position.set(walker.x, walker.y, walker.z); rig.rotation.y = walker.yaw; setView('orbit', true); }
		else { rig.position.set(-2.2, -0.15, -6); rig.rotation.y = Math.PI; }
		camera.position.set(0, 0, 0);
		camera.rotation.set(0, 0, 0);
		L.sun.castShadow = false;
		$('vr').textContent = 'Exit';
		toast('VR: right stick forward = teleport, left / right = turn. Menu on your left hand.');
	},
	ended: () => {
		L.sun.castShadow = true;
		scene.background = SKY;
		W.context.visible = true;
		camera.position.set(13, 9.5, -12);
		controls.target.set(0, 2.5, 4.5);
		controls.update();
		$('vr').textContent = 'VR';
		refresh();
	},
	error: e => toast('Could not start VR: ' + (e && e.message ? e.message : e))
});

// ---------- the project ----------

function strip(p) {
	return JSON.stringify(p, (k, v) => (k[0] === '_' ? undefined : v));
}

function setProject(p) {
	S.project = p;
	S.els = p.elements;
	S.byId = {};
	S.els.forEach(e => { prep(e); S.byId[e.id] = e; });
	S.r = range(S.els);
	S.slip = calcSlip(S.els, S.today);
	S.sel.clear();
	S.point = null;
	buildElements(S.els);
	buildPins();
	$('pname').textContent = p.name || '';
	setupTimeline();
	S.day = Math.max(S.r.start, Math.min(S.today, S.r.end + S.slip));
	refreshAll();
}

let saveTimer = 0;
function save() {
	if (S.role === 'copilot') return;
	S.pv++;
	S.slip = calcSlip(S.els, S.today);
	clearTimeout(saveTimer);
	saveTimer = setTimeout(() => {
		store.put('kv', 'project', strip(S.project));
		if (Copilot && Copilot.copilots) sendProject(false);
	}, 500);
}

function edited(el) {
	if (el) prep(el);
	save();
	S.r = range(S.els);
	setupTimeline();
	refreshAll();
}

async function loadPhotoBlobs() {
	for (const p of S.project.photos || []) {
		if (S.photos.has(p.id)) continue;
		const b = await store.get('photos', p.id);
		if (b) setPhotoBlob(p.id, b);
	}
}

function setPhotoBlob(id, blob) {
	const old = S.photos.get(id);
	if (old) URL.revokeObjectURL(old.url);
	const url = URL.createObjectURL(blob), img = new Image();
	img.onload = () => xr.redraw();
	img.src = url;
	S.photos.set(id, { blob, url, img });
	if (S.tab === 'photos') { clearTimeout(setPhotoBlob.t); setPhotoBlob.t = setTimeout(drawPhotos, 150); }
}

// ---------- the view ----------

function ctx() {
	return { mode: S.mode, today: S.today, slip: S.slip };
}

function refresh() {
	applyView(S.els, S.day, { c: ctx(), color: S.color, show: S.show, xray: S.xray, sel: S.sel, point: S.point });
	if (pins) pins.children.forEach(s => { s.visible = dayNum(s.userData.photo.d) <= S.day; });
	drawDate();
	drawLegend();
	syncButtons();
	reportSoon();
	if (S.tab === 'element' && S.sel.size === 1) elementsSoon();
	xr.redraw();
}

function refreshAll() {
	refresh();
	drawElements();
	drawPhotos();
	drawProject();
}

let reportT = 0, elT = 0;
function elementsSoon() {
	const a = document.activeElement;
	if (a && a.closest && a.closest('#tab-element')) return;      // do not disturb an input
	clearTimeout(elT);
	elT = setTimeout(drawElements, 120);
}

function reportSoon() {
	if (S.tab !== 'report') return;
	clearTimeout(reportT);
	reportT = setTimeout(drawReport, S.playing ? 400 : 80);
}

function setupTimeline() {
	const sl = $('day'), a = S.r.start - 7, b = Math.max(S.r.end + S.slip, S.today) + 21;
	sl.min = a;
	sl.max = b;
	let h = '';
	for (let d = a; d <= b; d++) {
		const t = new Date(d * 86400000);
		if (t.getUTCDate() === 1) h += `<span style="left:${(d - a) / (b - a) * 100}%">${t.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}</span>`;
	}
	h += `<span class="now" style="left:${(S.today - a) / (b - a) * 100}%"> </span>`;
	$('ticks').innerHTML = h;
}

function drawDate() {
	$('day').value = S.day;
	const dd = S.day - S.today;
	let tag = dd === 0 ? 'today' : dd < 0 ? -dd + ' days ago' : 'in ' + dd + ' days';
	if (dd > 0 && S.mode === 'actual') tag += ', forecast';
	if (S.mode === 'planned') tag += ', planned';
	$('date').innerHTML = `<b>${fmtDay(S.day)}</b><br><span class="sub">${tag}</span>`;
}

function drawLegend() {
	const lg = $('legend');
	let h = '';
	if (S.color === 'status') {
		h = [['done', 'Done'], ['prog', 'In progress'], ['late', 'Late'], ['part', 'Partly done, waiting'], ['none', 'Not started']]
			.map(([k, n]) => `<div><i class="dot" style="background:#${STATUS_COL[k].toString(16).padStart(6, '0')}"></i>${n}</div>`).join('');
	} else if (S.color === 'phase') {
		h = PHASES.map((p, i) => `<div><i class="dot" style="background:#${PHASE_COL[i].toString(16).padStart(6, '0')}"></i>${p.n}</div>`).join('') +
			'<div><i class="dot" style="background:#d8d8d4"></i>All stages done</div>';
	}
	lg.innerHTML = h;
	lg.style.display = h ? 'block' : 'none';
}

function syncButtons() {
	document.querySelectorAll('#views [data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === S.view && !xr.vr));
	document.querySelectorAll('#colors button').forEach(b => b.classList.toggle('on', b.dataset.color === S.color));
	document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === S.mode));
	$('show').value = S.show;
	$('xray').checked = S.xray;
	$('play').textContent = S.playing ? '❚❚' : '▶';
	$('badge').textContent = S.role === 'copilot' ? (cop.has ? 'COPILOT VIEW' + (cop.follow ? ' · view of the pilot (C)' : ' · free view (C)') : 'COPILOT: WAIT FOR THE PROJECT') : '';
}

function setDay(d) {
	const sl = $('day');
	S.day = Math.max(+sl.min, Math.min(+sl.max, Math.round(d)));
	refresh();
	sendStateSoon();
}

// one function for the buttons of the page, the VR menu and the copilot
function act(id, X) {
	switch (id) {
	case 'm-30': setDay(S.day - 30); break;
	case 'w-7': setDay(S.day - 7); break;
	case 'today': setDay(S.today); break;
	case 'w7': setDay(S.day + 7); break;
	case 'm30': setDay(S.day + 30); break;
	case 'play': togglePlay(); break;
	case 'color': S.color = { real: 'status', status: 'phase', phase: 'real' }[S.color]; refresh(); break;
	case 'mode': S.mode = S.mode === 'actual' ? 'planned' : 'actual'; refresh(); break;
	case 'show': S.show = { all: 'noroof', noroof: 'gf', gf: 'found', found: 'all' }[S.show]; refresh(); break;
	case 'xray': S.xray = !S.xray; refresh(); break;
	case 'tt': if (xr.vr) xr.setTabletop(!xr.tabletop); break;
	case 'smooth': xr.smooth = !xr.smooth; break;
	case 'exitvr': xr.exit(); break;
	case 'card-close': xr.showCard(null); break;
	case 'card-done': if (xr.card && xr.card.el) stageDoneToday(xr.card.el); break;
	case 'card-go': if (xr.card && xr.card.p) goToPhoto(xr.card.p); xr.showCard(null); break;
	case 'send': sendProject(true); break;
	}
	sendStateSoon();
	if (X) X.redraw();
}

function togglePlay() {
	S.playing = !S.playing;
	if (S.playing && S.day >= +$('day').max - 1) S.day = +$('day').min;
	syncButtons();
}

// mark the current (or next) stage of an element as done today
function stageDoneToday(el) {
	if (S.role === 'copilot') return;
	const s = el._s || elAt(el, S.day, ctx());
	const i = s.cur >= 0 ? s.cur : s.next;
	if (i < 0) return;
	const st = el.st[i];
	if (!st.as) st.as = isoDay(S.today);
	st.ae = isoDay(S.today);
	edited(el);
	toast(el.n + ': ' + TYPES[el.t].st[i].n + ' done today');
}

// ---------- picking ----------

const raycaster = new THREE.Raycaster();
function hitTest(ray) {
	const objs = [];
	if (pins) pins.children.forEach(s => { if (s.visible) objs.push(s); });
	W.pick.forEach(m => { if (m.visible && m.parent.visible) objs.push(m); });
	const hits = ray.intersectObjects(objs, false);
	for (const h of hits) {
		if (h.object.isSprite) return { photo: h.object.userData.photo };
		const el = h.object.userData.el;
		if (el.t === 'earth' && S.color === 'real' && h.object.material === M.none) continue;
		return { el };
	}
	return null;
}

function pickAt(nx, ny, add) {
	raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
	const hit = hitTest(raycaster);
	if (hit && hit.photo) { openPhoto(hit.photo); return; }
	if (!hit) {
		if (!add) { S.sel.clear(); pointAt(null); }
	} else if (add) {
		if (S.sel.has(hit.el.id)) S.sel.delete(hit.el.id);
		else S.sel.add(hit.el.id);
	} else {
		S.sel.clear();
		S.sel.add(hit.el.id);
	}
	if (hit && hit.el && S.role === 'copilot') pointAt(hit.el.id);
	if (S.sel.size) setTab('element');
	refresh();
	drawElements();
}

function selectOnly(id, quiet) {
	S.sel.clear();
	if (id) S.sel.add(id);
	if (S.role === 'copilot') pointAt(id);
	refresh();
	drawElements();
	if (!quiet) setTab('element');
}

let down = null;
canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', e => {
	if (!down || S.view !== 'orbit' || xr.vr) return;
	if (Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 5) return;
	pickAt(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1, e.shiftKey || e.metaKey);
});

// ---------- views ----------

function setView(v, quiet) {
	if (v === 'walk' && S.role === 'copilot') { toast('The copilot follows the pilot. Press C for a free view.'); return; }
	S.view = v;
	if (v === 'walk') {
		walker.enter();
		controls.enabled = false;
		$('hint').innerHTML = 'W A S D walk · Shift run · Space jump · V first / third person · click the view to look with the mouse (Esc gives it back) · click = select · R street · Q exit';
		$('hint').classList.add('on');
	} else {
		if (walker.on) {
			walker.exit();
			if (!quiet) {
				controls.target.set(walker.x, walker.y + 1.2, walker.z);
				camera.position.set(walker.x + 8, walker.y + 7, walker.z - 8);
			}
		}
		controls.enabled = true;
		$('hint').classList.remove('on');
	}
	syncButtons();
	sendStateSoon();
}

function goToPhoto(p) {
	if (xr.vr) {
		const head = new THREE.Vector3();
		camera.getWorldPosition(head);
		rig.position.x += p.pos[0] - head.x;
		rig.position.z += p.pos[2] - head.z;
		rig.position.y = floorAt(p.pos[0], p.pos[2], p.pos[1], 0.2);
		return;
	}
	if (S.view === 'walk') setView('orbit', true);
	camera.position.fromArray(p.pos);
	controls.target.fromArray(p.tgt);
	controls.update();
	S.day = Math.max(S.day, dayNum(p.d));
	refresh();
}

// ---------- the side panel ----------

function setTab(t) {
	S.tab = t;
	document.querySelectorAll('.tabs [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
	document.querySelectorAll('.tab').forEach(d => d.classList.toggle('on', d.id === 'tab-' + t));
	if (t === 'report') drawReport();
}

function drawReport() {
	if (!S.project) return;
	const sd = Math.min(S.day, S.today), m = metrics(S.els, S.today, sd, S.slip);
	const tab = $('tab-report'), top = tab.scrollTop;
	tab.innerHTML = reportHTML(S, m);
	tab.scrollTop = top;
	drawCurve($('curve'), S.els, S.today, S.slip, S.day, Math.min(2, window.devicePixelRatio || 1));
	tab.querySelectorAll('[data-el]').forEach(d => { d.onclick = () => { selectOnly(d.dataset.el); zoomTo(S.byId[d.dataset.el]); }; });
	$('print').onclick = printReport;
}

const STATUS_TXT = { done: 'Done', prog: 'In progress', late: 'Late', part: 'Partly done', none: 'Not started' };
const hex = c => '#' + c.toString(16).padStart(6, '0');

function drawElements() {
	const tab = $('tab-element'), c = ctx();
	tab.classList.toggle('ro', S.role === 'copilot');
	const ids = [...S.sel].filter(id => S.byId[id]);
	if (!ids.length) {
		const f = S.filter.toLowerCase();
		const floors = [[0, 'Site & foundations'], [1, 'Ground floor (1F)'], [2, 'Second floor (2F)'], [3, 'Roof'], [4, 'Exterior works']];
		let h = `<div class="search"><input type="text" id="elq" placeholder="Search elements" value="${esc(S.filter)}"></div>
		<div class="sub" style="margin-top:6px">Click an element in the view (Shift-click = more than one), or click a line here.</div><div class="ellist">`;
		floors.forEach(([fl, n]) => {
			const list = S.els.filter(e => e.f === fl && (!f || e.n.toLowerCase().includes(f) || TYPES[e.t].n.toLowerCase().includes(f)));
			if (!list.length) return;
			h += `<div class="grph">${n}</div>`;
			list.forEach(e => {
				const s = elAt(e, S.day, c);
				h += `<div class="row" data-el="${e.id}"><i class="dot" style="background:${hex(STATUS_COL[s.status])}"></i>${esc(e.n)}</div>`;
			});
		});
		tab.innerHTML = h + '</div>';
		const q = $('elq');
		q.oninput = () => {
			S.filter = q.value;
			const pos = q.selectionStart;
			drawElements();
			$('elq').focus();
			$('elq').setSelectionRange(pos, pos);
		};
		tab.querySelectorAll('[data-el]').forEach(d => { d.onclick = () => { selectOnly(d.dataset.el); zoomTo(S.byId[d.dataset.el]); }; });
		return;
	}
	if (ids.length > 1) { drawMulti(tab, ids); return; }
	const el = S.byId[ids[0]], type = TYPES[el.t], s = elAt(el, S.day, c);
	const cur = S.project.currency;
	let h = `<div class="btnrow"><button id="back">‹ All elements</button><button id="zoom">Zoom to</button><button id="similar">Select the same type</button></div>
	<div class="eltitle">${esc(el.n)}</div>
	<div class="sub">${esc(type.n)} · ${['site & foundations', 'ground floor', 'second floor', 'roof', 'exterior'][el.f]} · ${money(el.cost, cur)}
	· at ${fmtDay(S.day)}: <b style="color:${hex(STATUS_COL[s.status])}">${STATUS_TXT[s.status]}</b></div>`;
	el.st.forEach((st, i) => {
		const def = type.st[i], r = s.sts[i];
		const k = r.st === 2 ? 'done' : r.st === 1 ? (r.late ? 'late' : 'prog') : r.late ? 'late' : 'none';
		h += `<div class="stage"><div class="hd"><b>${esc(def.n)}</b>
			<span class="pill" style="background:${hex(STATUS_COL[k])}">${STATUS_TXT[k]}${r.st === 1 ? ' ' + Math.round(r.f * 100) + '%' : ''}</span></div>
			<div class="sub" style="margin-bottom:4px">${esc(PHASES.find(p => p.k === def.ph).n)} · weight ${Math.round(def.w * 100)} %</div>
			<div class="dates">
				<span class="sub">Planned</span><input type="date" data-i="${i}" data-f="ps" value="${st.ps || ''}"><input type="date" data-i="${i}" data-f="pe" value="${st.pe || ''}">
				<span class="sub">Actual</span><input type="date" data-i="${i}" data-f="as" value="${st.as || ''}"><input type="date" data-i="${i}" data-f="ae" value="${st.ae || ''}">
			</div>
			<div class="acts"><button data-i="${i}" data-a="start">Started today</button><button data-i="${i}" data-a="done">Done today</button><button data-i="${i}" data-a="clear">Clear actual</button></div>
		</div>`;
	});
	h += `<label class="field">Notes<textarea id="note" rows="3">${esc(el.note)}</textarea></label>
	<label class="field">Budget (${esc(cur)})<input type="number" id="cost" value="${el.cost}" step="1000"></label>`;
	tab.innerHTML = h;
	$('back').onclick = () => selectOnly(null);
	$('zoom').onclick = () => zoomTo(el);
	$('similar').onclick = () => {
		S.sel.clear();
		S.els.forEach(e => { if (e.t === el.t && e.f === el.f) S.sel.add(e.id); });
		refresh();
		drawElements();
	};
	tab.querySelectorAll('input[type=date]').forEach(inp => {
		inp.onchange = () => {
			el.st[+inp.dataset.i][inp.dataset.f] = inp.value || undefined;
			edited(el);
		};
	});
	tab.querySelectorAll('[data-a]').forEach(b => {
		b.onclick = () => {
			const st = el.st[+b.dataset.i], t = isoDay(S.today);
			if (b.dataset.a === 'start') st.as = t;
			if (b.dataset.a === 'done') { if (!st.as) st.as = t; st.ae = t; }
			if (b.dataset.a === 'clear') { delete st.as; delete st.ae; }
			edited(el);
		};
	});
	$('note').onchange = () => { el.note = $('note').value; save(); };
	$('cost').onchange = () => { el.cost = Math.max(0, +$('cost').value || 0); edited(el); };
}

function drawMulti(tab, ids) {
	const els = ids.map(id => S.byId[id]);
	const keys = [];
	els.forEach(e => TYPES[e.t].st.forEach(d => { if (!keys.find(k => k.k === d.k)) keys.push({ k: d.k, n: d.n }); }));
	let h = `<div class="btnrow"><button id="back">‹ All elements</button></div>
	<div class="eltitle">${els.length} elements</div>
	<div class="sub">${els.slice(0, 8).map(e => esc(e.n)).join(', ')}${els.length > 8 ? ' …' : ''}</div>
	<div class="sub" style="margin:8px 0">Set the actual dates of one stage for all the selected elements that have it.</div>`;
	keys.forEach(k => {
		const n = els.filter(e => e.st.some(s => s.k === k.k)).length;
		h += `<div class="stage"><div class="hd"><b>${esc(k.n)}</b><span class="sub">${n} elements</span></div>
		<div class="dates"><span class="sub">Actual</span><input type="date" data-k="${k.k}" data-f="as"><input type="date" data-k="${k.k}" data-f="ae"></div>
		<div class="acts"><button data-k="${k.k}" data-a="start">Started today</button><button data-k="${k.k}" data-a="done">Done today</button><button data-k="${k.k}" data-a="set">Set these dates</button></div></div>`;
	});
	tab.innerHTML = h;
	$('back').onclick = () => selectOnly(null);
	tab.querySelectorAll('[data-a]').forEach(b => {
		b.onclick = () => {
			const k = b.dataset.k, t = isoDay(S.today);
			const as = tab.querySelector(`input[data-k="${k}"][data-f="as"]`).value, ae = tab.querySelector(`input[data-k="${k}"][data-f="ae"]`).value;
			els.forEach(e => e.st.forEach(st => {
				if (st.k !== k) return;
				if (b.dataset.a === 'start') st.as = t;
				if (b.dataset.a === 'done') { if (!st.as) st.as = t; st.ae = t; }
				if (b.dataset.a === 'set') { if (as) st.as = as; if (ae) st.ae = ae; }
				prep(e);
			}));
			save();
			refreshAll();
		};
	});
}

function zoomTo(el) {
	if (!el || xr.vr) return;
	if (S.view === 'walk') setView('orbit', true);
	const b = new THREE.Box3().setFromObject(el._g);
	if (b.isEmpty()) return;
	const c = b.getCenter(new THREE.Vector3()), r = Math.max(2.5, b.getSize(new THREE.Vector3()).length());
	const dir = camera.position.clone().sub(controls.target).normalize();
	controls.target.copy(c);
	camera.position.copy(c).addScaledVector(dir, r * 1.4);
	controls.update();
}

// ---------- photos ----------

let lbPhoto = null;

function drawPhotos() {
	const tab = $('tab-photos'), list = (S.project.photos || []).slice().sort((a, b) => b.d < a.d ? -1 : 1);
	let h = `<div class="btnrow"><button id="addph">Add photos</button><button id="snap">Snapshot of this view</button></div>
	<div class="sub">A photo gets the position of the 3D view. First move the view to where you took the photo, then add it. Photos after the view date are grey.</div>
	<div class="thumbs">`;
	list.forEach(p => {
		const ph = S.photos.get(p.id);
		h += `<figure data-ph="${p.id}" class="${dayNum(p.d) > S.day ? 'later' : ''}">${ph ? `<img src="${ph.url}" alt="">` : '<img alt="">'}<figcaption><b>${fmtDay(dayNum(p.d))}</b> ${esc(p.note || '')}</figcaption></figure>`;
	});
	tab.innerHTML = h + '</div>' + (list.length ? '' : '<div class="empty">No photos yet.</div>');
	$('addph').onclick = () => $('file-photo').click();
	$('snap').onclick = snapPhoto;
	tab.querySelectorAll('[data-ph]').forEach(f => { f.onclick = () => openPhoto(S.project.photos.find(p => p.id === f.dataset.ph)); });
	$('addph').disabled = $('snap').disabled = S.role === 'copilot';
}

function viewPose() {
	if (S.view === 'walk') {
		const d = new THREE.Vector3();
		camera.getWorldDirection(d);
		return { pos: camera.position.toArray().map(v => +v.toFixed(2)), tgt: camera.position.clone().addScaledVector(d, 4).toArray().map(v => +v.toFixed(2)) };
	}
	return { pos: camera.position.toArray().map(v => +v.toFixed(2)), tgt: controls.target.toArray().map(v => +v.toFixed(2)) };
}

async function addPhoto(blob, day, note) {
	const id = 'ph' + Date.now().toString(36) + Math.floor(Math.random() * 1000);
	const small = await store.shrink(blob, 1600);
	await store.put('photos', id, small);
	setPhotoBlob(id, small);
	const p = Object.assign({ id, d: isoDay(day), note: note || '' }, viewPose());
	S.project.photos = S.project.photos || [];
	S.project.photos.push(p);
	buildPins();
	save();
	refreshAll();
	return p;
}

$('file-photo').onchange = async e => {
	const files = [...e.target.files];
	e.target.value = '';
	for (const f of files) {
		const d = f.lastModified ? Math.min(S.today, Math.floor((f.lastModified - new Date(f.lastModified).getTimezoneOffset() * 60000) / 86400000)) : S.today;
		await addPhoto(f, d, f.name.replace(/\.[^.]+$/, ''));
	}
	setTab('photos');
	toast(files.length + ' photo(s) added at the current view position');
};

function grab(cam) {
	const hide = [pins, pilotHead, pilotChar.g, walker.ch.g];
	const vis = hide.map(o => o && o.visible);
	hide.forEach(o => { if (o) o.visible = false; });
	renderer.render(scene, cam || camera);
	const url = renderer.domElement.toDataURL('image/jpeg', 0.85);
	hide.forEach((o, i) => { if (o) o.visible = vis[i]; });
	return url;
}

async function snapPhoto() {
	if (xr.vr) return;
	const blob = await store.urlToBlob(grab());
	const p = await addPhoto(blob, Math.min(S.day, S.today), 'Snapshot of the 3D view');
	openPhoto(p);
}

function openPhoto(p) {
	if (!p) return;
	lbPhoto = p;
	const ph = S.photos.get(p.id);
	$('lb-img').src = ph ? ph.url : '';
	$('lb-date').value = p.d;
	$('lb-note').value = p.note || '';
	['lb-date', 'lb-note', 'lb-pos', 'lb-del'].forEach(id => { $(id).disabled = S.role === 'copilot'; });
	$('lightbox').classList.add('on');
}

$('lb-close').onclick = () => $('lightbox').classList.remove('on');
$('lightbox').onclick = e => { if (e.target.id === 'lightbox') $('lightbox').classList.remove('on'); };
$('lb-date').onchange = () => { if (lbPhoto && $('lb-date').value) { lbPhoto.d = $('lb-date').value; save(); refreshAll(); } };
$('lb-note').onchange = () => { if (lbPhoto) { lbPhoto.note = $('lb-note').value; save(); drawPhotos(); } };
$('lb-go').onclick = () => { if (lbPhoto) { goToPhoto(lbPhoto); $('lightbox').classList.remove('on'); } };
$('lb-pos').onclick = () => {
	if (!lbPhoto) return;
	$('lightbox').classList.remove('on');
	Object.assign(lbPhoto, viewPose());
	buildPins();
	save();
	refresh();
	toast('The photo has the position of the current view now');
};
$('lb-del').onclick = async () => {
	if (!lbPhoto || !confirm('Delete this photo?')) return;
	S.project.photos = S.project.photos.filter(p => p !== lbPhoto);
	await store.del('photos', lbPhoto.id);
	S.photos.delete(lbPhoto.id);
	$('lightbox').classList.remove('on');
	buildPins();
	save();
	refreshAll();
};

// the demo photos are views of the 3D model at their dates
async function renderDemoPhotos() {
	const todo = (S.project.photos || []).filter(p => p.demo && !S.photos.has(p.id));
	if (!todo.length || xr.vr) return;
	const cam = new THREE.PerspectiveCamera(60, camera.aspect, 0.05, 2000);
	for (const p of todo) {
		if (xr.vr) return;
		applyView(S.els, dayNum(p.d), { c: { mode: 'actual', today: S.today, slip: S.slip }, color: 'real', show: 'all', xray: false, sel: new Set(), point: null });
		cam.position.fromArray(p.pos);
		cam.lookAt(new THREE.Vector3().fromArray(p.tgt));
		const url = grab(cam);
		refresh();                       // back to the view of the user before the next frame
		const blob = await store.shrink(await store.urlToBlob(url), 1280);
		await store.put('photos', p.id, blob);
		setPhotoBlob(p.id, blob);
	}
	drawPhotos();
	if (Copilot && Copilot.copilots) sendProject(false);
}

// ---------- project tab: export, import, demo ----------

function drawProject() {
	const tab = $('tab-project'), p = S.project, ro = S.role === 'copilot';
	const n = S.els.length, ph = (p.photos || []).length;
	tab.innerHTML = `
	<label class="field">Name<input type="text" id="pj-name" value="${esc(p.name)}" ${ro ? 'disabled' : ''}></label>
	<label class="field">Place<input type="text" id="pj-place" value="${esc(p.place || '')}" ${ro ? 'disabled' : ''}></label>
	<label class="field">Colones for 1 US dollar (for the report)<input type="number" id="pj-usd" value="${p.usd || ''}" ${ro ? 'disabled' : ''}></label>
	<div class="sub">${n} elements, ${ph} photos. Start ${fmtDay(S.r.start)}, planned finish ${fmtDay(S.r.end)}.
	${store.persistent() ? 'The data is in the storage of this browser (IndexedDB).' : 'This browser gives no storage: export the file to keep your work.'}</div>
	<div class="btnrow">
		<button id="pj-export">Export project file (JSON, with photos)</button>
		<button id="pj-import" ${ro ? 'disabled' : ''}>Import project file</button>
		<button id="pj-demo" class="danger" ${ro ? 'disabled' : ''}>Start again with the demo</button>
	</div>
	<h4>Copilot</h4>
	<div class="sub">The copilot is a second device (for example your MacBook) that sees along with the pilot (for example the Quest) and changes the date and the view.
	On the copilot: push BE COPILOT in the panel at the top right, then scan the QR code with the Quest.
	The pilot sends its project and photos to the copilot. The copilot does not save them.</div>
	<div class="btnrow"><button id="pj-push" ${S.role === 'copilot' && Copilot && Copilot.status === 'ON' ? '' : 'disabled'}>Send the project of this device to the pilot</button></div>
	<div class="sub">The pilot keeps a backup of its old project. Copilot keys: 1 to 9 = the option lines, C = the view of the pilot or a free view.</div>
	<h4>Keys</h4>
	<div class="sub">Orbit: drag = turn, right drag = move, wheel = zoom, click = select. [ and ] = one week, T = today, Space = play.
	Walk: see the help at the bottom. VR: see the menu on your left hand.</div>`;
	if (!ro) {
		$('pj-name').onchange = () => { p.name = $('pj-name').value; $('pname').textContent = p.name; save(); };
		$('pj-place').onchange = () => { p.place = $('pj-place').value; save(); };
		$('pj-usd').onchange = () => { p.usd = +$('pj-usd').value || 0; save(); reportSoon(); };
		$('pj-import').onclick = () => $('file-json').click();
		$('pj-demo').onclick = async () => {
			if (!confirm('Delete this project and its photos, and load the demo house again?')) return;
			await store.clear('photos');
			S.photos.clear();
			const d = demoProject(S.today);
			await store.put('kv', 'project', strip(d));
			setProject(d);
			renderDemoPhotos();
		};
	}
	$('pj-export').onclick = exportProject;
	$('pj-push').onclick = pushToPilot;
}

async function projectWithPhotos(p) {
	const out = JSON.parse(strip(p));
	for (const ph of out.photos || []) {
		const b = S.photos.get(ph.id);
		if (b) ph.img = await store.blobToURL(b.blob);
	}
	return out;
}

async function exportProject() {
	const data = JSON.stringify(await projectWithPhotos(S.project));
	const a = document.createElement('a');
	a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
	a.download = (S.project.name || 'project').replace(/[^\w-]+/g, '-').slice(0, 40) + '-' + isoDay(S.today) + '.json';
	a.click();
	setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function importProject(p, quiet) {
	if (!p || !Array.isArray(p.elements)) { toast('This is not a CasaTrack project file'); return false; }
	await store.clear('photos');
	S.photos.clear();
	for (const ph of p.photos || []) {
		if (ph.img) {
			const b = await store.urlToBlob(ph.img);
			await store.put('photos', ph.id, b);
			setPhotoBlob(ph.id, b);
			delete ph.img;
		}
	}
	await store.put('kv', 'project', strip(p));
	setProject(p);
	if (!quiet) toast('Project loaded: ' + p.name);
	return true;
}

$('file-json').onchange = async e => {
	const f = e.target.files[0];
	e.target.value = '';
	if (!f) return;
	try {
		const p = JSON.parse(await f.text());
		if (confirm('Replace the current project with "' + (p.name || f.name) + '"?')) await importProject(p);
	} catch (x) {
		toast('Could not read the file: ' + x.message);
	}
};

// ---------- print ----------

function printReport() {
	if (S.view !== 'walk') controls.update();
	const view = grab();
	const cv = document.createElement('canvas');
	cv.style.width = '900px';
	cv.style.height = '260px';
	document.body.appendChild(cv);
	drawCurve(cv, S.els, S.today, S.slip, S.day, 2);
	const curve = cv.toDataURL('image/png');
	cv.remove();
	const sd = Math.min(S.day, S.today), m = metrics(S.els, S.today, sd, S.slip);
	const photos = (S.project.photos || []).filter(p => dayNum(p.d) <= sd && S.photos.has(p.id))
		.sort((a, b) => a.d < b.d ? 1 : -1).slice(0, 6).map(p => ({ url: S.photos.get(p.id).url, day: dayNum(p.d), note: p.note || '' }));
	$('printarea').innerHTML = printHTML(S, m, view, curve, photos);
	setTimeout(() => window.print(), 300);
}

// ---------- the VR menu and the info card ----------

function rr(g, x, y, w, h, r) {
	g.beginPath();
	g.moveTo(x + r, y);
	g.arcTo(x + w, y, x + w, y + h, r);
	g.arcTo(x + w, y + h, x, y + h, r);
	g.arcTo(x, y + h, x, y, r);
	g.arcTo(x, y, x + w, y, r);
	g.closePath();
}

function button(g, rects, id, label, x, y, w, h, on) {
	rr(g, x, y, w, h, 14);
	g.fillStyle = on ? '#2a6fdb' : '#2b3946';
	g.fill();
	g.fillStyle = '#fff';
	g.font = 'bold 30px system-ui, sans-serif';
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	g.fillText(label, x + w / 2, y + h / 2 + 1, w - 16);
	g.textAlign = 'left';
	g.textBaseline = 'alphabetic';
	rects.push({ id, x, y, w, h });
}

function drawPanel(g, w, h, X) {
	const rects = [];
	g.clearRect(0, 0, w, h);
	rr(g, 0, 0, w, h, 34);
	g.fillStyle = 'rgba(16,24,32,.92)';
	g.fill();
	const sd = Math.min(S.day, S.today), m = metrics(S.els, S.today, sd, S.slip);
	g.fillStyle = '#9fb3c8';
	g.font = '26px system-ui, sans-serif';
	g.fillText((S.project.name || '').slice(0, 52), 32, 46);
	g.fillStyle = '#fff';
	g.font = 'bold 54px system-ui, sans-serif';
	g.fillText(fmtDay(S.day), 32, 112);
	g.font = '28px system-ui, sans-serif';
	g.fillStyle = S.day === S.today ? '#7fe0a0' : '#ffd27a';
	const dd = S.day - S.today;
	g.fillText(dd === 0 ? 'TODAY' : dd < 0 ? -dd + ' days ago' : 'in ' + dd + ' days' + (S.mode === 'actual' ? ' (forecast)' : ''), 470, 110);
	g.fillStyle = '#dbe5ee';
	g.fillText(`${(m.pct * 100).toFixed(1)} % done · plan ${(m.ppct * 100).toFixed(1)} % · ${m.slip ? m.slip + ' days late' : 'on time'}`, 32, 160);
	const bw = 182, gap = 12, x0 = 32;
	[['m-30', '−1 MONTH'], ['w-7', '−1 WEEK'], ['today', 'TODAY'], ['w7', '+1 WEEK'], ['m30', '+1 MONTH']].forEach(([id, l], i) => button(g, rects, id, l, x0 + i * (bw + gap), 190, bw, 80, id === 'today' && S.day === S.today));
	const b3 = 308;
	button(g, rects, 'play', S.playing ? 'PAUSE' : 'PLAY', x0, 290, b3, 80, S.playing);
	button(g, rects, 'color', 'COLOR: ' + S.color.toUpperCase(), x0 + b3 + gap, 290, b3, 80, S.color !== 'real');
	button(g, rects, 'mode', 'DATA: ' + S.mode.toUpperCase(), x0 + 2 * (b3 + gap), 290, b3, 80, S.mode !== 'actual');
	button(g, rects, 'show', 'SHOW: ' + { all: 'ALL', noroof: 'NO ROOF', gf: '1F', found: 'FOUND.' }[S.show], x0, 390, b3, 80, S.show !== 'all');
	button(g, rects, 'xray', 'X-RAY: ' + (S.xray ? 'ON' : 'OFF'), x0 + b3 + gap, 390, b3, 80, S.xray);
	button(g, rects, 'tt', 'TABLETOP: ' + (X.tabletop ? 'ON' : 'OFF'), x0 + 2 * (b3 + gap), 390, b3, 80, X.tabletop);
	button(g, rects, 'smooth', 'SMOOTH WALK: ' + (X.smooth ? 'ON' : 'OFF'), x0, 490, b3 * 1.5, 80, X.smooth);
	button(g, rects, 'exitvr', 'EXIT VR', x0 + b3 * 1.5 + gap, 490, b3 * 1.5 - 12 + gap, 80, false);
	g.fillStyle = '#9fb3c8';
	g.font = '26px system-ui, sans-serif';
	const sel = [...S.sel][0], el = sel && S.byId[sel];
	g.fillText(el ? 'Selected: ' + el.n.slice(0, 50) : 'Point at an element or a photo pin and pull the trigger.', 32, 630);
	g.fillText(Copilot ? `Copilot: code ${Copilot.code}  ${Copilot.status}${Copilot.copilots ? '  (' + Copilot.copilots + ' connected)' : ''}` : '', 32, 680);
	g.fillText('Right stick: teleport / turn · B: tabletop · Y: this menu', 32, 730);
	return rects;
}

function drawCard(g, w, h, item) {
	const rects = [];
	g.clearRect(0, 0, w, h);
	rr(g, 0, 0, w, h, 30);
	g.fillStyle = 'rgba(16,24,32,.94)';
	g.fill();
	g.fillStyle = '#fff';
	if (item.kind === 'photo') {
		const p = item.p, ph = S.photos.get(p.id);
		if (ph && ph.img.complete && ph.img.naturalWidth) {
			const iw = ph.img.naturalWidth, ih = ph.img.naturalHeight, k = Math.min((w - 48) / iw, 470 / ih);
			g.drawImage(ph.img, (w - iw * k) / 2, 24, iw * k, ih * k);
		}
		g.font = 'bold 30px system-ui, sans-serif';
		g.fillText(fmtDay(dayNum(p.d)), 32, 535);
		g.font = '26px system-ui, sans-serif';
		g.fillText((p.note || '').slice(0, 60), 250, 535);
		button(g, rects, 'card-go', 'GO THERE', 32, 560, 300, 64, false);
		button(g, rects, 'card-close', 'CLOSE', w - 332, 560, 300, 64, false);
		return rects;
	}
	const el = item.el, type = TYPES[el.t], s = elAt(el, S.day, ctx());
	g.font = 'bold 36px system-ui, sans-serif';
	g.fillText(el.n.slice(0, 44), 32, 62);
	g.font = '26px system-ui, sans-serif';
	g.fillStyle = hex(STATUS_COL[s.status]);
	g.fillText(STATUS_TXT[s.status] + ' at ' + fmtDay(S.day), 32, 104);
	g.fillStyle = '#9fb3c8';
	g.fillText(type.n + ' · ' + money(el.cost, S.project.currency), 520, 104);
	el.st.forEach((st, i) => {
		const r = s.sts[i], y = 160 + i * 66;
		g.fillStyle = r.st === 2 ? '#34a853' : r.st === 1 ? '#f2a33a' : r.late ? '#e0473b' : '#56687a';
		g.beginPath(); g.arc(48, y - 9, 13, 0, Math.PI * 2); g.fill();
		g.fillStyle = '#fff';
		g.font = 'bold 28px system-ui, sans-serif';
		g.fillText(type.st[i].n, 76, y);
		g.font = '24px system-ui, sans-serif';
		g.fillStyle = '#b8c6d3';
		const pl = `plan ${st.ps ? fmtDay(st._ps) : '-'} to ${st.pe ? fmtDay(st._pe) : '-'}`;
		const ac = st.ae ? `done ${fmtDay(st._ae)}` : st.as ? `started ${fmtDay(st._as)}` : '';
		g.fillText(pl + (ac ? ' · ' + ac : ''), 76, y + 28);
	});
	if (S.role !== 'copilot' && s.status !== 'done') button(g, rects, 'card-done', 'NEXT STAGE DONE TODAY', 32, 560, 520, 64, false);
	button(g, rects, 'card-close', 'CLOSE', w - 332, 560, 300, 64, false);
	return rects;
}

// ---------- copilot ----------

const cop = { s: null, follow: true, has: false, lastN: 0, pv: -1, sendT: 0, stateT: 0, files: {} };

function headState() {
	if (xr.vr) {
		const hp = xr.headPose();
		return [...hp.p.toArray(), ...hp.q.toArray()].map(v => +v.toFixed(4));
	}
	return [...camera.position.toArray(), ...camera.quaternion.toArray()].map(v => +v.toFixed(4));
}

function pilotState() {
	return {
		d: S.day, m: S.mode, c: S.color, sh: S.show, x: S.xray ? 1 : 0, sel: [...S.sel].slice(0, 20), pt: S.point,
		pv: S.pv, v: xr.vr ? 1 : 0, tt: xr.tabletop ? 1 : 0, wk: S.view === 'walk' ? 1 : 0, pl: S.playing ? 1 : 0,
		h: headState(), ch: S.view === 'walk' ? [walker.x, walker.y, walker.z, walker.yaw, walker.first ? 1 : 0, walker.moving].map(v => +(+v).toFixed(3)) : null,
		fov: camera.fov
	};
}

function copApply(s) {
	cop.s = s;
	if (!cop.has) return;
	let ch = false;
	if (s.d !== S.day) { S.day = s.d; ch = true; }
	['m:mode', 'c:color', 'sh:show'].forEach(kv => {
		const [k, n] = kv.split(':');
		if (s[k] !== S[n]) { S[n] = s[k]; ch = true; }
	});
	if (!!s.x !== S.xray) { S.xray = !!s.x; ch = true; }
	if (s.pt !== S.point) { S.point = s.pt; ch = true; }
	if (ch) refresh();
}

function copFrame(dt) {
	const s = cop.s;
	if (!s || !cop.has) { pilotHead.visible = pilotChar.g.visible = false; return; }
	const h = s.h;
	if (cop.follow && !s.tt) {
		controls.enabled = false;
		camera.position.set(h[0], h[1], h[2]);
		camera.quaternion.set(h[3], h[4], h[5], h[6]);
		if (s.fov && !s.v) camera.fov = s.fov;
		else camera.fov = 80;
		camera.updateProjectionMatrix();
		pilotHead.visible = false;
	} else {
		controls.enabled = true;
		if (camera.fov !== 55) { camera.fov = 55; camera.updateProjectionMatrix(); }
		pilotHead.visible = !s.tt && !s.wk;
		pilotHead.position.set(h[0], h[1], h[2]);
		pilotHead.quaternion.set(h[3], h[4], h[5], h[6]);
	}
	if (s.wk && s.ch) {
		const c = s.ch, P = pilotChar;
		P.g.visible = !(cop.follow && c[4]) && !(cop.follow && !s.tt && false);
		P.g.position.set(c[0], c[1], c[2]);
		P.g.rotation.y = c[3];
		cop.phase = (cop.phase || 0) + dt * (c[5] > 2 ? 11 : 7) * (c[5] ? 1 : 0);
		const sw = c[5] ? Math.sin(cop.phase) * 0.6 : 0;
		P.legL.rotation.x = sw; P.legR.rotation.x = -sw; P.armL.rotation.x = -sw * 0.8; P.armR.rotation.x = sw * 0.8;
	} else {
		pilotChar.g.visible = false;
	}
}

function copRows() {
	const show = { all: 'ALL', noroof: 'NO ROOF', gf: 'GROUND FLOOR', found: 'FOUNDATIONS' }[S.show];
	return [
		['DATE − 1 WEEK', fmtDay(S.day)], ['DATE + 1 WEEK', ''], ['TODAY', S.day === S.today ? 'NOW' : ''],
		['PLAY', S.playing ? 'ON' : 'OFF'], ['COLOR', S.color.toUpperCase()], ['DATA', S.mode.toUpperCase()],
		['SHOW', show], ['X-RAY', S.xray ? 'ON' : 'OFF'], ['TABLETOP (VR)', xr.tabletop ? 'ON' : 'OFF'],
		['SEND THE PROJECT AGAIN', '']
	];
}

function copSelect(i) {
	act(['w-7', 'w7', 'today', 'play', 'color', 'mode', 'show', 'xray', 'tt', 'send'][i]);
}

function sendStateSoon() {
	// the state goes 20 times each second anyway; this only redraws the panel
	if (Copilot && Copilot.refresh) Copilot.refresh();
}

function sendProject(force) {
	if (!Copilot || S.role !== 'pilot' || !Copilot.copilots) return;
	clearTimeout(cop.sendT);
	cop.sendT = setTimeout(() => {
		const blob = new Blob([strip(S.project)], { type: 'application/json' });
		Copilot.sendFile(blob, { id: 'project-' + S.pv + '-' + Date.now(), kind: 'project', pv: S.pv });
		(S.project.photos || []).forEach(p => {
			const ph = S.photos.get(p.id);
			if (ph && (force || !cop.files[p.id])) {
				Copilot.sendFile(ph.blob, { id: 'photo-' + p.id, kind: 'photo', pid: p.id, type: 'image/jpeg' });
				cop.files[p.id] = 1;
			}
		});
	}, force ? 0 : 600);
}

async function pushToPilot() {
	if (S.role !== 'copilot') return;
	const own = await store.get('kv', 'project');
	if (!own) { toast('This device has no project of its own'); return; }
	const p = JSON.parse(own);
	for (const ph of p.photos || []) {
		const b = await store.get('photos', ph.id);
		if (b) Copilot.sendFile(b, { id: 'push-photo-' + ph.id, kind: 'pushphoto', pid: ph.id, type: 'image/jpeg' });
	}
	Copilot.sendFile(new Blob([own], { type: 'application/json' }), { id: 'push-' + Date.now(), kind: 'push' });
	toast('Project sent to the pilot');
}

const pushPhotos = {};
async function onFile(meta, blob) {
	if (meta.kind === 'project' && S.role === 'copilot') {
		const p = JSON.parse(await blob.text());
		const keep = cop.has ? { day: S.day } : null;
		cop.has = true;
		setProject(p);
		if (keep) S.day = keep.day;
		if (cop.s) copApply(cop.s);
		refreshAll();
		if (!cop.toasted) { toast('Project of the pilot: ' + p.name); cop.toasted = 1; }
	} else if (meta.kind === 'photo' && S.role === 'copilot') {
		setPhotoBlob(meta.pid, blob);
		drawPhotos();
	} else if (meta.kind === 'pushphoto' && S.role === 'pilot') {
		pushPhotos[meta.pid] = blob;
	} else if (meta.kind === 'push' && S.role === 'pilot') {
		const p = JSON.parse(await blob.text());
		await store.put('kv', 'backup', strip(S.project));
		await store.clear('photos');
		S.photos.clear();
		for (const ph of p.photos || []) {
			if (pushPhotos[ph.id]) { await store.put('photos', ph.id, pushPhotos[ph.id]); setPhotoBlob(ph.id, pushPhotos[ph.id]); }
		}
		await store.put('kv', 'project', strip(p));
		setProject(p);
		cop.files = {};
		toast('New project from the copilot (the old one is a backup)');
		sendProject(true);
	}
}

async function setRole(r) {
	S.role = r;
	S.ro = r === 'copilot';
	if (r === 'copilot') {
		if (walker.on) setView('orbit', true);
		S.photos.forEach(p => URL.revokeObjectURL(p.url));
		S.photos.clear();
		drawPhotos();
		cop.has = false;
		cop.toasted = 0;
		cop.follow = true;
		toast('Copilot: wait for the project of the pilot');
	} else {
		cop.has = false;
		pilotHead.visible = pilotChar.g.visible = false;
		controls.enabled = true;
		camera.fov = 55;
		camera.updateProjectionMatrix();
		const own = await store.get('kv', 'project');
		S.photos.clear();
		setProject(own ? JSON.parse(own) : demoProject(S.today));
		await loadPhotoBlobs();
		renderDemoPhotos();
	}
	refreshAll();
}

function startCopilot() {
	if (!Copilot) return;
	Copilot.start({
		name: 'casatrack',
		getState: pilotState,
		setState: copApply,
		rows: copRows,
		select: copSelect,
		role: setRole,
		keys: true,
		onMessage: m => {
			if (S.role !== 'pilot' || !m) return;
			if ('pt' in m) {
				S.point = m.pt && S.byId[m.pt] ? m.pt : null;
				if (S.point) toast('The copilot points at: ' + S.byId[S.point].n);
				refresh();
			}
		},
		onFile,
		onCopilots: n => {
			if (n > cop.lastN) { cop.files = {}; sendProject(true); toast('Copilot connected'); }
			cop.lastN = n;
			refresh();
		}
	});
}

function pointAt(id) {
	if (S.role !== 'copilot' || !Copilot) return;
	Copilot.send({ pt: id || null });
}

// ---------- events ----------

document.querySelectorAll('#views [data-view]').forEach(b => { b.onclick = () => setView(b.dataset.view); });
document.querySelectorAll('#colors button').forEach(b => { b.onclick = () => { if (S.ro) return; S.color = b.dataset.color; refresh(); }; });
document.querySelectorAll('#modes button').forEach(b => { b.onclick = () => { if (S.ro) return; S.mode = b.dataset.mode; refresh(); }; });
$('show').onchange = () => { if (S.ro) { syncButtons(); return; } S.show = $('show').value; refresh(); };
$('xray').onchange = () => { if (S.ro) { syncButtons(); return; } S.xray = $('xray').checked; refresh(); };
$('day').oninput = () => { if (S.ro) { drawDate(); return; } S.playing = false; setDay(+$('day').value); };
$('play').onclick = () => { if (S.ro) Copilot.select(3); else togglePlay(); };
$('wk-').onclick = () => { if (S.ro) Copilot.select(0); else setDay(S.day - 7); };
$('wk+').onclick = () => { if (S.ro) Copilot.select(1); else setDay(S.day + 7); };
$('today').onclick = () => { if (S.ro) Copilot.select(2); else setDay(S.today); };
document.querySelectorAll('.tabs [data-tab]').forEach(b => { b.onclick = () => setTab(b.dataset.tab); });
$('fold').onclick = () => { $('side').classList.add('folded'); document.body.classList.add('folded'); };
$('unfold').onclick = () => { $('side').classList.remove('folded'); document.body.classList.remove('folded'); };
$('vr').onclick = () => { if (xr.vr) xr.exit(); else xr.enterVR(); };
$('ar').onclick = () => xr.enterAR();

window.addEventListener('keydown', e => {
	const t = e.target;
	if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
	if (e.metaKey || e.ctrlKey || e.altKey) return;
	if (S.role === 'copilot') {
		if (e.code === 'KeyC') {
			cop.follow = !cop.follow;
			if (!cop.follow && cop.s) {
				// a free view from above, near the pilot
				const h = cop.s.ch && cop.s.wk ? cop.s.ch : cop.s.h;
				controls.target.set(h[0], h[1] + (cop.s.wk ? 1 : -0.4), h[2]);
				camera.position.set(h[0] + 7, h[1] + 7, h[2] - 7);
				camera.fov = 55;
				camera.updateProjectionMatrix();
				controls.update();
			}
			toast(cop.follow ? 'View of the pilot' : 'Free view');
			syncButtons();
		}
		return;
	}
	if (e.code === 'Escape' && $('lightbox').classList.contains('on')) { $('lightbox').classList.remove('on'); return; }
	if (S.view === 'walk') {
		if (e.code === 'KeyQ') setView('orbit');
		return;
	}
	if (e.code === 'BracketLeft') setDay(S.day - 7);
	else if (e.code === 'BracketRight') setDay(S.day + 7);
	else if (e.code === 'Comma') setDay(S.day - 1);
	else if (e.code === 'Period') setDay(S.day + 1);
	else if (e.code === 'KeyT') setDay(S.today);
	else if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
});

window.addEventListener('resize', () => {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
	reportSoon();
});

let toastT = 0;
function toast(s) {
	const t = $('toast');
	t.textContent = s;
	t.classList.add('on');
	clearTimeout(toastT);
	toastT = setTimeout(() => t.classList.remove('on'), 3200);
}

// ---------- frame loop ----------

let last = performance.now(), playAcc = 0;
function frame(ms) {
	const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000);
	last = now;
	if (Copilot && Copilot.update) Copilot.update();
	if (S.playing && S.role === 'pilot') {
		playAcc += dt * 12;               // 12 days each second
		if (playAcc >= 1) {
			const n = Math.floor(playAcc);
			playAcc -= n;
			if (S.day + n > +$('day').max) { S.playing = false; syncButtons(); }
			else setDay(S.day + n);
		}
	}
	if (xr.vr) xr.update(dt);
	else if (S.role === 'copilot') { copFrame(dt); if (controls.enabled) controls.update(); }
	else if (S.view === 'walk') walker.update(dt);
	else controls.update();
	// pins stay the same size on the screen (desktop)
	if (pins && !xr.vr) pins.children.forEach(s => { s.scale.setScalar(Math.max(0.35, Math.min(1.2, camera.position.distanceTo(s.position) * 0.03))); });
	const cross = S.view === 'walk' && !xr.vr && (walker.first || document.pointerLockElement === canvas);
	if (cross !== frame.cross) { frame.cross = cross; $('cross').classList.toggle('on', cross); }
	renderer.render(scene, camera);
}

// ---------- start ----------

async function init() {
	buildWorld(scene, {});
	W.world.add(walker.ch.g, pilotChar.g, pilotHead);
	await store.open();
	let p = null;
	const raw = await store.get('kv', 'project');
	if (raw) {
		try { p = JSON.parse(raw); } catch (e) { p = null; }
	}
	if (!p) {
		p = demoProject(S.today);
		await store.put('kv', 'project', strip(p));
	}
	setProject(p);
	setTab('report');
	await loadPhotoBlobs();
	renderer.setAnimationLoop(frame);
	setTimeout(renderDemoPhotos, 300);
	const sup = await xr.support();
	$('vr').disabled = !sup.vr;
	$('ar').disabled = !sup.ar;
	if (!sup.vr) $('vr').title = 'VR needs a WebXR browser, for example the Meta Quest Browser';
	startCopilot();
	window.__ready = true;
}

init();

// for tests and the browser console
window.CT = { S, act, setView, walker, xr, camera, controls, drawPanel, drawCard, refresh, setDay, selectOnly, pickAt, cop, W };
