// walk.js - the character walk-through on the desktop: a site worker with a hard hat.
// Keys: W A S D or arrows to walk, Shift to run, Space to jump, V = first / third person, R = back to the street.
// Mouse: click the view to look with the mouse (pointer lock). Esc gives the pointer back.
import * as THREE from 'three';
import { W, floorAt, blocked } from './scene.js';

const STEP = 0.45, RADIUS = 0.25, HEIGHT = 1.75, EYE = 1.62;
export const SPAWN = { x: -2.2, z: -11, yaw: Math.PI };

export function makeCharacter() {
	const m = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
	const skin = m(0xc68e64), vest = m(0xff7a1a), shirt = m(0x2f4b7c), jeans = m(0x2b3a55), boot = m(0x3a2a1c), hat = m(0xffd21f), band = m(0xdedede);
	const box = (w, h, d, mat, x, y, z) => {
		const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
		b.position.set(x, y, z);
		b.castShadow = true;
		return b;
	};
	const g = new THREE.Group();
	const limb = (x, y, parts) => {
		const p = new THREE.Group();
		p.position.set(x, y, 0);
		parts.forEach(q => p.add(q));
		g.add(p);
		return p;
	};
	const legL = limb(-0.1, 0.9, [box(0.15, 0.82, 0.17, jeans, 0, -0.41, 0), box(0.16, 0.1, 0.26, boot, 0, -0.85, -0.04)]);
	const legR = limb(0.1, 0.9, [box(0.15, 0.82, 0.17, jeans, 0, -0.41, 0), box(0.16, 0.1, 0.26, boot, 0, -0.85, -0.04)]);
	g.add(box(0.42, 0.62, 0.25, vest, 0, 1.2, 0), box(0.43, 0.05, 0.26, band, 0, 1.08, 0), box(0.43, 0.05, 0.26, band, 0, 1.28, 0));
	const armL = limb(-0.27, 1.47, [box(0.11, 0.6, 0.12, shirt, 0, -0.3, 0), box(0.09, 0.1, 0.1, skin, 0, -0.64, 0)]);
	const armR = limb(0.27, 1.47, [box(0.11, 0.6, 0.12, shirt, 0, -0.3, 0), box(0.09, 0.1, 0.1, skin, 0, -0.64, 0)]);
	const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 12), skin);
	head.position.y = 1.62;
	const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.135, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hat);
	helmet.position.y = 1.66;
	const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.015, 20), hat);
	brim.position.set(0, 1.665, -0.03);
	g.add(head, helmet, brim);
	g.traverse(o => { if (o.isMesh) o.castShadow = true; });
	return { g, legL, legR, armL, armR };
}

export function createWalker(camera, canvas, hooks) {
	const w = {
		on: false, first: false, x: SPAWN.x, y: -0.15, z: SPAWN.z, yaw: SPAWN.yaw, pitch: -0.12, vy: 0,
		keys: {}, phase: 0, moving: 0, ch: makeCharacter()
	};
	w.ch.g.visible = false;
	const ray = new THREE.Raycaster();
	const V = new THREE.Vector3(), H = new THREE.Vector3();
	let dragging = false, downX = 0, downY = 0;

	function typing(e) {
		const t = e.target;
		return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
	}
	window.addEventListener('keydown', e => {
		if (!w.on || typing(e) || e.metaKey || e.ctrlKey) return;
		w.keys[e.code] = true;
		if (e.code === 'KeyV') w.first = !w.first;
		if (e.code === 'KeyR') w.reset();
		if (e.code === 'Space' || e.code.indexOf('Arrow') === 0) e.preventDefault();
	});
	window.addEventListener('keyup', e => { w.keys[e.code] = false; });
	window.addEventListener('blur', () => { w.keys = {}; });

	canvas.addEventListener('mousedown', e => {
		if (!w.on) return;
		dragging = true;
		downX = e.clientX;
		downY = e.clientY;
	});
	window.addEventListener('mouseup', e => {
		if (!w.on || !dragging) return;
		dragging = false;
		if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) < 5) {
			if (document.pointerLockElement === canvas) hooks.pickCenter();
			else if (canvas.requestPointerLock) {
				try { canvas.requestPointerLock(); } catch (x) { /* no pointer lock */ }
			}
		}
	});
	window.addEventListener('mousemove', e => {
		if (!w.on) return;
		const locked = document.pointerLockElement === canvas;
		if (!locked && !dragging) return;
		w.yaw -= e.movementX * 0.0025;
		w.pitch = Math.max(-1.3, Math.min(1.2, w.pitch - e.movementY * 0.0025));
	});

	w.reset = () => {
		w.x = SPAWN.x;
		w.z = SPAWN.z;
		w.y = floorAt(w.x, w.z, 10, 0);
		w.yaw = SPAWN.yaw;
		w.vy = 0;
	};

	w.enter = () => {
		w.on = true;
		w.ch.g.visible = true;
		if (w.y < -5) w.reset();
		w.y = floorAt(w.x, w.z, w.y + 0.5, STEP);
	};

	w.exit = () => {
		w.on = false;
		w.ch.g.visible = false;
		w.keys = {};
		if (document.pointerLockElement === canvas) document.exitPointerLock();
	};

	function free(nx, nz) {
		const f = floorAt(nx, nz, w.y, STEP);
		if (f > w.y + STEP) return false;
		return !blocked(nx, nz, w.y, RADIUS, HEIGHT, STEP);
	}

	w.update = dt => {
		if (!w.on) return;
		const k = w.keys;
		const fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
		const side = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
		const speed = k.ShiftLeft || k.ShiftRight ? 3.4 : 1.5;
		const sy = Math.sin(w.yaw), cy = Math.cos(w.yaw);
		let mx = -sy * fwd + cy * side, mz = -cy * fwd - sy * side;
		const len = Math.hypot(mx, mz);
		w.moving = 0;
		if (len > 0) {
			mx = mx / len * speed * dt;
			mz = mz / len * speed * dt;
			if (free(w.x + mx, w.z)) { w.x += mx; w.moving = speed; }
			if (free(w.x, w.z + mz)) { w.z += mz; w.moving = speed; }
		}
		// gravity, steps, jump
		const f = floorAt(w.x, w.z, w.y, STEP);
		if (k.Space && w.vy === 0 && w.y - f < 0.02) w.vy = 4.2;
		if (w.vy !== 0 || w.y > f + 0.02) {
			w.vy -= 9.8 * dt;
			w.y += w.vy * dt;
			if (w.y <= f) { w.y = f; w.vy = 0; }
		} else {
			w.y += (f - w.y) * Math.min(1, dt * 18);
		}
		if (w.y < -20) w.reset();

		// the character
		const ch = w.ch;
		ch.g.position.set(w.x, w.y, w.z);
		ch.g.rotation.y = w.yaw;
		w.phase += dt * (w.moving > 2 ? 11 : 7) * (w.moving ? 1 : 0);
		const swing = w.moving ? Math.sin(w.phase) * (w.moving > 2 ? 0.8 : 0.5) : 0;
		ch.legL.rotation.x = swing;
		ch.legR.rotation.x = -swing;
		ch.armL.rotation.x = -swing * 0.8;
		ch.armR.rotation.x = swing * 0.8;
		ch.g.visible = !w.first;

		// the camera
		camera.rotation.set(w.pitch, w.yaw, 0, 'YXZ');
		H.set(w.x, w.y + EYE, w.z);
		if (w.first) {
			camera.position.copy(H);
		} else {
			H.y = w.y + 1.55;
			V.set(0, 0, 1).applyEuler(camera.rotation);           // backwards from the view
			let dist = 3.0;
			ray.set(H, V);
			ray.far = dist;
			const hits = ray.intersectObjects(W.pick, false);
			for (const h of hits) {
				if (!h.object.visible || !h.object.parent.visible || h.object.userData.m === 'glass') continue;
				dist = Math.max(0.35, h.distance - 0.2);
				break;
			}
			camera.position.copy(H).addScaledVector(V, dist);
			camera.position.x += Math.cos(w.yaw) * 0.35;           // a bit to the right of the head
			camera.position.z -= Math.sin(w.yaw) * 0.35;
		}
	};

	return w;
}
