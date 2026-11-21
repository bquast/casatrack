// store.js - browser storage (IndexedDB): the project as JSON, and the photos as blobs.
// If IndexedDB is not available (private mode on some browsers), the data stays in memory only.

let db = null;
const mem = { kv: {}, photos: {} };

export function open() {
	return new Promise(ok => {
		let r;
		try {
			r = indexedDB.open('casatrack', 1);
		} catch (e) {
			ok(false);
			return;
		}
		r.onupgradeneeded = () => {
			r.result.createObjectStore('kv');
			r.result.createObjectStore('photos');
		};
		r.onsuccess = () => { db = r.result; ok(true); };
		r.onerror = () => ok(false);
	});
}

function tx(store, mode, fn) {
	if (!db) return Promise.resolve(fn(null));
	return new Promise((ok, fail) => {
		const t = db.transaction(store, mode), s = t.objectStore(store);
		const r = fn(s);
		t.oncomplete = () => ok(r && r.result !== undefined ? r.result : undefined);
		t.onerror = () => fail(t.error);
	});
}

export function get(store, key) {
	if (!db) return Promise.resolve(mem[store][key]);
	return tx(store, 'readonly', s => s.get(key));
}

export function put(store, key, value) {
	if (!db) { mem[store][key] = value; return Promise.resolve(); }
	return tx(store, 'readwrite', s => { s.put(value, key); });
}

export function del(store, key) {
	if (!db) { delete mem[store][key]; return Promise.resolve(); }
	return tx(store, 'readwrite', s => { s.delete(key); });
}

export function clear(store) {
	if (!db) { mem[store] = {}; return Promise.resolve(); }
	return tx(store, 'readwrite', s => { s.clear(); });
}

export function persistent() {
	return !!db;
}

// ---------- blobs and data URLs (for the export file) ----------

export function blobToURL(b) {
	return new Promise(ok => {
		const r = new FileReader();
		r.onload = () => ok(r.result);
		r.readAsDataURL(b);
	});
}

export async function urlToBlob(u) {
	const r = await fetch(u);
	return r.blob();
}

// make an image smaller (long side max px) and JPEG
export function shrink(blob, max) {
	return new Promise(ok => {
		const img = new Image(), u = URL.createObjectURL(blob);
		img.onload = () => {
			const k = Math.min(1, max / Math.max(img.width, img.height));
			const c = document.createElement('canvas');
			c.width = Math.round(img.width * k);
			c.height = Math.round(img.height * k);
			c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
			URL.revokeObjectURL(u);
			c.toBlob(b => ok(b || blob), 'image/jpeg', 0.85);
		};
		img.onerror = () => { URL.revokeObjectURL(u); ok(blob); };
		img.src = u;
	});
}
