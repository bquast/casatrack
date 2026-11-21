// progress.js - the state of each stage at a date, earned value, the schedule slip, and the report lists.
// All dates here are day numbers (see model.js).
import { dayNum, TYPES, PHASES } from './model.js';

// make the day numbers of an element (after a load or an edit)
export function prep(el) {
	el.st.forEach(s => {
		s._ps = dayNum(s.ps);
		s._pe = dayNum(s.pe);
		s._as = dayNum(s.as);
		s._ae = dayNum(s.ae);
	});
}

// c = { mode: 'actual' | 'planned', today, slip }
// result: { st: 0 not started, 1 in progress, 2 done, f: fraction, late: 0|1, fc: 1 = forecast }
export function stageAt(s, d, c) {
	let a, e, fc = 0;
	if (c.mode === 'planned') {
		a = s._ps;
		e = s._pe;
	} else if (s._ae != null) {
		a = s._as != null ? s._as : s._ae - 1;
		e = s._ae;
	} else if (d <= c.today) {
		if (s._as != null && s._as <= d) {
			const dur = Math.max(1, (s._pe != null && s._ps != null) ? s._pe - s._ps : 1);
			return { st: 1, f: Math.min(0.95, (d - s._as + 1) / dur), late: s._pe != null && s._pe < d ? 1 : 0 };
		}
		return { st: 0, f: 0, late: s._pe != null && s._pe < d ? 1 : 0 };
	} else {
		// after today: the forecast (planned dates + the slip, not before tomorrow)
		fc = 1;
		if (s._as != null) {
			a = s._as;
			e = Math.max(c.today + 1, s._pe + c.slip);
		} else {
			a = Math.max(c.today + 1, s._ps + c.slip);
			e = Math.max(a + 1, s._pe + c.slip);
		}
	}
	if (a == null || e == null) return { st: 0, f: 0, late: 0 };
	if (d >= e) return { st: 2, f: 1, late: 0, fc };
	if (d >= a) return { st: 1, f: Math.min(0.95, (d - a + 1) / Math.max(1, e - a)), late: 0, fc };
	return { st: 0, f: 0, late: 0, fc };
}

// the state of an element
export function elAt(el, d, c) {
	const sts = el.st.map(s => stageAt(s, d, c));
	let last = -1, cur = -1, late = 0, done = 0;
	sts.forEach((s, i) => {
		if (s.st === 2) { last = i; done++; }
		if (s.st === 1 && cur < 0) cur = i;
		if (s.late) late = 1;
	});
	let status = 'none';
	if (done === sts.length) status = 'done';
	else if (late) status = 'late';
	else if (cur >= 0) status = 'prog';
	else if (done > 0) status = 'part';
	return { sts, last, cur, late, status, next: cur >= 0 ? cur : sts.findIndex(s => s.st !== 2) };
}

// earned value of one element (colones)
export function elValue(el, d, c) {
	const st = TYPES[el.t].st;
	let v = 0;
	el.st.forEach((s, i) => {
		const r = stageAt(s, d, c);
		v += st[i].w * (r.st === 2 ? 1 : r.st === 1 ? r.f : 0);
	});
	return v * el.cost;
}

export function valueAt(els, d, c) {
	return els.reduce((s, e) => s + elValue(e, d, c), 0);
}

export function range(els) {
	let a = Infinity, b = -Infinity;
	els.forEach(e => e.st.forEach(s => {
		if (s._ps != null) a = Math.min(a, s._ps);
		if (s._as != null) a = Math.min(a, s._as);
		if (s._pe != null) b = Math.max(b, s._pe);
	}));
	return { start: a, end: b };
}

// earned schedule: the planned day with the same value as the earned value of today
export function slip(els, today) {
	const r = range(els), ev = valueAt(els, today, { mode: 'actual', today, slip: 0 });
	const P = { mode: 'planned' };
	let lo = r.start, hi = Math.min(today, r.end);
	if (valueAt(els, hi, P) <= ev) return 0;
	while (hi - lo > 1) {
		const m = (lo + hi) >> 1;
		if (valueAt(els, m, P) < ev) lo = m;
		else hi = m;
	}
	return Math.max(0, today - lo);
}

export function phaseStats(els, d, c) {
	const P = { mode: 'planned' };
	const out = PHASES.map(p => ({ k: p.k, n: p.n, bac: 0, ev: 0, pv: 0 }));
	const idx = {};
	out.forEach((p, i) => { idx[p.k] = i; });
	els.forEach(el => {
		const st = TYPES[el.t].st;
		el.st.forEach((s, i) => {
			const o = out[idx[st[i].ph]], w = st[i].w * el.cost;
			const ra = stageAt(s, d, c), rp = stageAt(s, d, P);
			o.bac += w;
			o.ev += w * (ra.st === 2 ? 1 : ra.st === 1 ? ra.f : 0);
			o.pv += w * (rp.st === 2 ? 1 : rp.st === 1 ? rp.f : 0);
		});
	});
	return out;
}

// the lists for the report, at today
export function lists(els, today) {
	const late = [], prog = [], next = [], recent = [];
	els.forEach(el => {
		const st = TYPES[el.t].st;
		el.st.forEach((s, i) => {
			const row = { el, i, label: st[i].n, s };
			if (s._ae != null) {
				if (s._ae > today - 14 && s._ae <= today) recent.push(row);
				return;
			}
			if (s._as != null && s._as <= today) prog.push(row);
			if (s._pe != null && s._pe < today) late.push(Object.assign({ days: today - s._pe }, row));
			else if (s._as == null && s._ps != null && s._ps >= today && s._ps <= today + 14) next.push(row);
		});
	});
	late.sort((a, b) => b.days - a.days);
	next.sort((a, b) => a.s._ps - b.s._ps);
	recent.sort((a, b) => b.s._ae - a.s._ae);
	return { late, prog, next, recent };
}
