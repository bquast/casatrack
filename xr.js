// xr.js - VR and AR on the Meta Quest 3.
// Life size: right stick forward = aim the teleport arc, release = teleport. Right stick left/right = snap turn 30 degrees.
//   Left stick = smooth walk (only when SMOOTH WALK is on in the menu; it is off for comfort).
// Menu: a tablet on the left hand. Point with the right hand and pull the trigger.
// Trigger on an element or a photo pin: an info card. Right B: tabletop model on/off. Left Y: menu on/off. Left X: today.
// AR (passthrough): the house is a tabletop model in your room.
import * as THREE from 'three';
import { W, floorAt, blocked } from './scene.js';

const PANEL_W = 1024, PANEL_H = 768, CARD_W = 1024, CARD_H = 640;

export function createXR(renderer, scene, camera, rig, hooks) {
	const X = { vr: false, ar: false, tabletop: false, smooth: false, panelOn: true, card: null, session: null };
	const ray = new THREE.Raycaster();
	const M4 = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), D = new THREE.Vector3(), E = new THREE.Vector3();
	const head = new THREE.Vector3();

	// ---------- controllers ----------
	const hands = {};
	const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
	for (let i = 0; i < 2; i++) {
		const c = renderer.xr.getController(i), grip = renderer.xr.getControllerGrip(i);
		const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
		line.scale.z = 4;
		c.add(line);
		const body = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.03, 0.12), new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.6 }));
		body.position.z = 0.02;
		grip.add(body);
		rig.add(c, grip);
		const h = { c, grip, line, src: null, side: '', turnReady: true, aiming: false, prevBtn: [] };
		c.addEventListener('connected', e => { h.src = e.data; h.side = e.data.handedness; hands[h.side] = h; placePanel(); });
		c.addEventListener('disconnected', () => { if (hands[h.side] === h) delete hands[h.side]; h.src = null; });
		c.addEventListener('selectstart', () => trigger(h));
	}

	// ---------- the menu tablet and the info card ----------
	function canvasPlane(w, h, mw) {
		const cv = document.createElement('canvas');
		cv.width = w;
		cv.height = h;
		const t = new THREE.CanvasTexture(cv);
		t.colorSpace = THREE.SRGBColorSpace;
		const m = new THREE.Mesh(new THREE.PlaneGeometry(mw, mw * h / w), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthTest: true }));
		m.renderOrder = 10;
		return { cv, g: cv.getContext('2d'), t, m, rects: [] };
	}
	const panel = canvasPlane(PANEL_W, PANEL_H, 0.30);
	const card = canvasPlane(CARD_W, CARD_H, 0.62);
	card.m.visible = false;
	scene.add(card.m);

	function placePanel() {
		const h = hands.left;
		if (!h) return;
		h.grip.add(panel.m);
		panel.m.position.set(0, 0.13, -0.05);
		panel.m.rotation.set(-0.75, 0, 0);
		panel.m.visible = X.panelOn;
	}

	X.redraw = () => {
		if (!X.vr) return;
		panel.rects = hooks.drawPanel(panel.g, PANEL_W, PANEL_H, X);
		panel.t.needsUpdate = true;
		if (X.card) {
			card.rects = hooks.drawCard(card.g, CARD_W, CARD_H, X.card);
			card.t.needsUpdate = true;
		}
	};

	X.showCard = item => {
		X.card = item;
		if (!item) { card.m.visible = false; return; }
		camera.getWorldPosition(P);
		camera.getWorldDirection(D);
		D.y = 0;
		D.normalize();
		card.m.position.copy(P).addScaledVector(D, 0.9);
		card.m.position.y = P.y - 0.1;
		card.m.lookAt(P.x, card.m.position.y, P.z);
		card.m.visible = true;
		X.redraw();
	};

	function hitPlane(p, h) {
		if (!p.m.visible) return null;
		const hit = ray.intersectObject(p.m, false)[0];
		if (!hit) return null;
		const x = hit.uv.x * p.cv.width, y = (1 - hit.uv.y) * p.cv.height;
		const r = p.rects.find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
		return { hit, id: r ? r.id : null };
	}

	function aim(h) {
		h.c.updateMatrixWorld();
		M4.identity().extractRotation(h.c.matrixWorld);
		ray.ray.origin.setFromMatrixPosition(h.c.matrixWorld);
		ray.ray.direction.set(0, 0, -1).applyMatrix4(M4);
		ray.far = 60;
	}

	function trigger(h) {
		aim(h);
		const pc = hitPlane(card, h) || (h.side === 'right' ? hitPlane(panel, h) : null);
		if (pc) {
			if (pc.id) hooks.press(pc.id, X);
			X.redraw();
			return;
		}
		const item = hooks.pick(ray);
		X.showCard(item);
	}

	// ---------- teleport ----------
	const arcN = 40, arcPts = new Float32Array(arcN * 3);
	const arcGeo = new THREE.BufferGeometry();
	arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPts, 3));
	const arc = new THREE.Line(arcGeo, new THREE.LineBasicMaterial({ color: 0x5ad1ff }));
	arc.frustumCulled = false;
	arc.visible = false;
	const marker = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.25, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x5ad1ff }));
	marker.visible = false;
	scene.add(arc, marker);
	let target = null;

	function aimArc(h) {
		aim(h);
		const p = ray.ray.origin.clone(), v = ray.ray.direction.clone().multiplyScalar(7.5);
		const a = new THREE.Vector3(), b = new THREE.Vector3(), seg = new THREE.Raycaster();
		target = null;
		let n = 0;
		a.copy(p);
		const meshes = W.walkMeshes.filter(m => m.visible && (!m.parent || m.parent.visible) && (m.userData.ctx || m.parent.parent.visible));
		for (let i = 0; i < arcN; i++) {
			arcPts[i * 3] = a.x; arcPts[i * 3 + 1] = a.y; arcPts[i * 3 + 2] = a.z;
			n = i + 1;
			b.copy(a).addScaledVector(v, 0.04);
			v.y -= 9.8 * 0.04;
			D.subVectors(b, a);
			const len = D.length();
			seg.set(a, D.normalize());
			seg.far = len;
			const hit = seg.intersectObjects(meshes, false).find(x => x.face && x.face.normal.y > 0.5);
			if (hit) {
				target = hit.point.clone();
				arcPts[n * 3] = target.x; arcPts[n * 3 + 1] = target.y; arcPts[n * 3 + 2] = target.z;
				n++;
				break;
			}
			a.copy(b);
		}
		arcGeo.setDrawRange(0, n);
		arcGeo.attributes.position.needsUpdate = true;
		arc.visible = true;
		arc.material.color.set(target ? 0x5ad1ff : 0xff6666);
		marker.visible = !!target;
		if (target) marker.position.copy(target).add(E.set(0, 0.02, 0));
	}

	function teleport() {
		arc.visible = marker.visible = false;
		if (!target) return;
		camera.getWorldPosition(head);
		rig.position.x += target.x - head.x;
		rig.position.z += target.z - head.z;
		rig.position.y = target.y;
		target = null;
	}

	function turn(a) {
		camera.getWorldPosition(head);
		rig.position.sub(head);
		rig.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
		rig.position.add(head);
		rig.rotation.y += a;
	}

	// ---------- tabletop ----------
	let saved = null;
	X.setTabletop = on => {
		if (on === X.tabletop) return;
		X.tabletop = on;
		const w = W.world;
		if (on) {
			saved = { p: rig.position.clone(), r: rig.rotation.y };
			rig.position.set(0, 0, 0);
			rig.rotation.y = 0;
			camera.updateMatrixWorld();
			camera.getWorldPosition(P);
			camera.getWorldDirection(D);
			D.y = 0;
			D.normalize();
			const s = 0.025;
			w.scale.setScalar(s);
			w.rotation.y = Math.atan2(D.x, D.z);
			const c = new THREE.Vector3(0, 0, 3).applyAxisAngle(new THREE.Vector3(0, 1, 0), w.rotation.y).multiplyScalar(s);
			w.position.set(P.x + D.x * 0.75, 0.78, P.z + D.z * 0.75).sub(c);
			X.ttCenter = new THREE.Vector3(P.x + D.x * 0.75, 0.78, P.z + D.z * 0.75);
		} else {
			w.scale.setScalar(1);
			w.position.set(0, 0, 0);
			w.rotation.set(0, 0, 0);
			if (saved) { rig.position.copy(saved.p); rig.rotation.y = saved.r; }
		}
		W.context.visible = !on && !X.ar;
		hooks.changed();
	};

	function spinTable(a, k) {
		const w = W.world, c = X.ttCenter;
		w.position.sub(c).applyAxisAngle(new THREE.Vector3(0, 1, 0), a).multiplyScalar(k).add(c);
		w.rotation.y += a;
		w.scale.multiplyScalar(k);
	}

	// ---------- sessions ----------
	async function start(mode) {
		if (!navigator.xr) return;
		const opts = mode === 'immersive-ar'
			? { requiredFeatures: ['local-floor'], optionalFeatures: ['hand-tracking'] }
			: { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] };
		try {
			const s = await navigator.xr.requestSession(mode, opts);
			X.ar = mode === 'immersive-ar';
			renderer.xr.setReferenceSpaceType('local-floor');
			await renderer.xr.setSession(s);
			X.session = s;
			X.vr = true;
			s.addEventListener('end', ended);
			hooks.started(X);
			if (X.ar) {
				scene.background = null;
				W.context.visible = false;
				setTimeout(() => { if (X.vr) X.setTabletop(true); }, 700);   // wait for the first head pose
			}
			placePanel();
			X.redraw();
		} catch (e) {
			hooks.error(e);
		}
	}

	function ended() {
		X.setTabletop(false);
		X.vr = X.ar = false;
		X.session = null;
		X.showCard(null);
		arc.visible = marker.visible = false;
		rig.position.set(0, 0, 0);
		rig.rotation.set(0, 0, 0);
		hooks.ended(X);
	}

	X.enterVR = () => start('immersive-vr');
	X.enterAR = () => start('immersive-ar');
	X.exit = () => { if (X.session) X.session.end(); };

	X.support = async () => {
		const out = { vr: false, ar: false };
		if (!navigator.xr) return out;
		try { out.vr = await navigator.xr.isSessionSupported('immersive-vr'); } catch (e) { /* no */ }
		try { out.ar = await navigator.xr.isSessionSupported('immersive-ar'); } catch (e) { /* no */ }
		return out;
	};

	// ---------- each frame ----------
	X.update = dt => {
		if (!X.vr) return;
		camera.getWorldPosition(head);
		// floors and stairs follow your head (life size)
		if (!X.tabletop) {
			const f = floorAt(head.x, head.z, rig.position.y, 0.45);
			rig.position.y += (f - rig.position.y) * Math.min(1, dt * 10);
		}
		for (const side in hands) {
			const h = hands[side], gp = h.src && h.src.gamepad;
			if (!gp) continue;
			const ax = gp.axes[2] || 0, ay = gp.axes[3] || 0, b = gp.buttons.map(x => x.pressed);
			const pressed = i => b[i] && !h.prevBtn[i];
			if (side === 'right') {
				if (X.tabletop) {
					if (Math.abs(ax) > 0.2) spinTable(-ax * dt * 1.5, 1);
					if (Math.abs(ay) > 0.2) spinTable(0, 1 - ay * dt * 0.8);
				} else {
					if (h.turnReady && Math.abs(ax) > 0.7) { turn(ax > 0 ? -Math.PI / 6 : Math.PI / 6); h.turnReady = false; }
					if (Math.abs(ax) < 0.3) h.turnReady = true;
					if (ay < -0.6) { h.aiming = true; aimArc(h); }
					else if (h.aiming && Math.abs(ay) < 0.3) { h.aiming = false; teleport(); }
				}
				if (pressed(5)) X.setTabletop(!X.tabletop);
				if (pressed(4)) X.showCard(null);
			} else {
				if (X.smooth && !X.tabletop && Math.hypot(ax, ay) > 0.15) {
					camera.getWorldDirection(D);
					D.y = 0;
					D.normalize();
					const rx = -D.z, rz = D.x, sp = 1.6 * dt;
					const mx = (D.x * -ay + rx * ax) * sp, mz = (D.z * -ay + rz * ax) * sp, y = rig.position.y;
					const ok = (x, z) => floorAt(x, z, y, 0.45) <= y + 0.45 && !blocked(x, z, y, 0.22, 1.7, 0.45);
					if (ok(head.x + mx, head.z)) rig.position.x += mx;
					if (ok(head.x, head.z + mz)) rig.position.z += mz;
				}
				if (pressed(5)) { X.panelOn = !X.panelOn; panel.m.visible = X.panelOn; }
				if (pressed(4)) hooks.press('today', X);
			}
			h.prevBtn = b;
			// the ray stops at the menu or the card
			aim(h);
			const pc = hitPlane(card, h) || (side === 'right' ? hitPlane(panel, h) : null);
			h.line.scale.z = pc ? pc.hit.distance : 4;
		}
	};

	X.headPose = () => {
		camera.getWorldPosition(P);
		camera.getWorldQuaternion(Q);
		W.world.updateMatrixWorld();
		const inv = new THREE.Matrix4().copy(W.world.matrixWorld).invert();
		const lp = P.clone().applyMatrix4(inv);
		const wq = new THREE.Quaternion();
		W.world.getWorldQuaternion(wq);
		const lq = wq.invert().multiply(Q);
		return { p: lp, q: lq };
	};

	return X;
}
