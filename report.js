// report.js - the progress report: numbers, S-curve, phases, lists, and the print version.
import { TYPES, isoDay } from './model.js';
import { valueAt, phaseStats, lists, range } from './progress.js';

export function money(v, cur) {
	return (cur || '₡') + (v / 1e6).toFixed(1) + ' M';
}

const pct = v => (v * 100).toFixed(1) + ' %';

export function fmtDay(d) {
	const t = new Date(d * 86400000);
	return t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// the numbers at the status date sd (not after today)
export function metrics(els, today, sd, slipDays) {
	const A = { mode: 'actual', today, slip: slipDays }, P = { mode: 'planned' };
	const r = range(els);
	const bac = els.reduce((s, e) => s + e.cost, 0);
	const ev = valueAt(els, sd, A), pv = valueAt(els, sd, P);
	return {
		bac, ev, pv, pct: ev / bac, ppct: pv / bac, spi: pv > 0 ? ev / pv : 1,
		slip: slipDays, start: r.start, end: r.end, forecast: r.end + slipDays,
		day: sd - r.start
	};
}

// S-curve: planned value, earned value up to today, forecast after today
export function drawCurve(cv, els, today, slipDays, viewDay, dpr) {
	const w = cv.clientWidth || 320, h = cv.clientHeight || 170;
	cv.width = w * dpr;
	cv.height = h * dpr;
	const g = cv.getContext('2d');
	g.scale(dpr, dpr);
	g.clearRect(0, 0, w, h);
	const r = range(els), t0 = r.start, t1 = Math.max(r.end + slipDays, today) + 5, bac = els.reduce((s, e) => s + e.cost, 0);
	const L = 34, R = 8, T = 10, B = 22;
	const X = d => L + (d - t0) / (t1 - t0) * (w - L - R), Y = v => h - B - v * (h - T - B);
	g.font = '10px system-ui, sans-serif';
	g.fillStyle = '#7b8794';
	g.strokeStyle = 'rgba(120,135,150,.25)';
	g.lineWidth = 1;
	for (let k = 0; k <= 4; k++) {
		const y = Y(k / 4);
		g.beginPath(); g.moveTo(L, y); g.lineTo(w - R, y); g.stroke();
		g.fillText(k * 25 + '%', 4, y + 3);
	}
	// month labels
	for (let d = t0; d <= t1; d++) {
		const t = new Date(d * 86400000);
		if (t.getUTCDate() === 1) {
			g.fillText(t.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }), X(d) - 8, h - 6);
			g.beginPath(); g.moveTo(X(d), h - B); g.lineTo(X(d), h - B + 4); g.stroke();
		}
	}
	const step = Math.max(1, Math.round((t1 - t0) / 90));
	const line = (from, to, ctx, color, dash, width) => {
		g.beginPath();
		g.setLineDash(dash || []);
		g.strokeStyle = color;
		g.lineWidth = width || 2;
		for (let d = from; d <= to; d += step) {
			const v = valueAt(els, Math.min(d, to), ctx) / bac;
			if (d === from) g.moveTo(X(d), Y(v));
			else g.lineTo(X(d), Y(v));
		}
		const v = valueAt(els, to, ctx) / bac;
		g.lineTo(X(to), Y(v));
		g.stroke();
		g.setLineDash([]);
	};
	const A = { mode: 'actual', today, slip: slipDays };
	line(t0, r.end + 3, { mode: 'planned' }, '#9aa5b1', [4, 3], 2);
	line(t0, today, A, '#2a6fdb', null, 2.5);
	line(today, r.end + slipDays + 2, A, '#2a6fdb', [2, 3], 1.5);
	// today and the view date
	g.strokeStyle = '#e0473b';
	g.lineWidth = 1;
	g.beginPath(); g.moveTo(X(today), T); g.lineTo(X(today), h - B); g.stroke();
	g.fillStyle = '#e0473b';
	g.fillText('today', X(today) + 3, T + 8);
	if (viewDay !== today) {
		g.strokeStyle = '#f2a33a';
		g.beginPath(); g.moveTo(X(viewDay), T); g.lineTo(X(viewDay), h - B); g.stroke();
	}
}

function rowsHTML(list, max, fn) {
	if (!list.length) return '<div class="empty">None</div>';
	return list.slice(0, max).map(fn).join('') + (list.length > max ? `<div class="more">and ${list.length - max} more</div>` : '');
}

// the report panel
export function reportHTML(S, m) {
	const els = S.els, cur = S.project.currency, sd = Math.min(S.day, S.today);
	const ph = phaseStats(els, sd, { mode: 'actual', today: S.today, slip: S.slip });
	const L = lists(els, S.today);
	const late = m.slip > 0;
	const usd = S.project.usd ? ` <span class="sub">≈ US$ ${Math.round(m.bac / S.project.usd / 1000)} k</span>` : '';
	const item = (x, extra) => `<div class="li" data-el="${x.el.id}"><span>${esc(x.el.n)}</span><span class="sub">${esc(x.label)}${extra || ''}</span></div>`;
	return `
	<div class="kpis">
		<div class="kpi"><b>${pct(m.pct)}</b><span>complete (actual)</span></div>
		<div class="kpi"><b>${pct(m.ppct)}</b><span>planned at this date</span></div>
		<div class="kpi ${late ? 'bad' : 'good'}"><b>${late ? m.slip + ' d late' : 'on time'}</b><span>schedule (earned schedule)</span></div>
		<div class="kpi ${m.spi < 0.95 ? 'bad' : 'good'}"><b>${m.spi.toFixed(2)}</b><span>SPI (EV / PV)</span></div>
	</div>
	<div class="facts">
		<div>Status date <b>${fmtDay(sd)}</b> (day ${m.day + 1} of ${m.end - m.start})</div>
		<div>Planned finish <b>${fmtDay(m.end)}</b>, forecast <b class="${late ? 'badt' : ''}">${fmtDay(m.forecast)}</b></div>
		<div>Budget <b>${money(m.bac, cur)}</b>${usd}, earned <b>${money(m.ev, cur)}</b>, planned <b>${money(m.pv, cur)}</b></div>
	</div>
	<canvas id="curve" class="curve"></canvas>
	<div class="legend"><i class="l1"></i>planned <i class="l2"></i>actual <i class="l3"></i>forecast</div>
	<h4>Phases</h4>
	<table class="phases">
		<tr><th>Phase</th><th>Budget</th><th>Plan</th><th>Actual</th></tr>
		${ph.filter(p => p.bac > 0).map(p => {
			const a = p.ev / p.bac, b = p.pv / p.bac, bad = a < b - 0.02;
			return `<tr><td>${esc(p.n)}</td><td>${money(p.bac, cur)}</td><td>${Math.round(b * 100)}%</td>
			<td><div class="bar"><div class="pv" style="width:${b * 100}%"></div><div class="ev ${bad ? 'bad' : ''}" style="width:${a * 100}%"></div></div>${Math.round(a * 100)}%</td></tr>`;
		}).join('')}
	</table>
	<h4>Late <span class="count">${L.late.length}</span></h4>
	<div class="list">${rowsHTML(L.late, 10, x => item(x, `, ${x.days} d late`))}</div>
	<h4>In progress <span class="count">${L.prog.length}</span></h4>
	<div class="list">${rowsHTML(L.prog, 10, x => item(x, ', since ' + fmtDay(x.s._as)))}</div>
	<h4>Planned to start in the next 14 days <span class="count">${L.next.length}</span></h4>
	<div class="list">${rowsHTML(L.next, 10, x => item(x, ', ' + fmtDay(x.s._ps)))}</div>
	<h4>Done in the last 14 days <span class="count">${L.recent.length}</span></h4>
	<div class="list">${rowsHTML(L.recent, 10, x => item(x, ', ' + fmtDay(x.s._ae)))}</div>
	<button id="print" class="wide">Print / save the report as PDF</button>`;
}

export function esc(s) {
	return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// the print version: a page with a 3D view, the curve, the tables and the newest photos
export function printHTML(S, m, view, curve, photos) {
	const sd = Math.min(S.day, S.today), cur = S.project.currency;
	const ph = phaseStats(S.els, sd, { mode: 'actual', today: S.today, slip: S.slip });
	const L = lists(S.els, S.today);
	const tr = (x, extra) => `<tr><td>${esc(x.el.n)}</td><td>${esc(x.label)}</td><td>${extra}</td></tr>`;
	return `
	<h1>Construction progress report</h1>
	<div class="ph">${esc(S.project.name)}, ${esc(S.project.place || '')}<br>Status date: ${fmtDay(sd)}. Printed: ${fmtDay(S.today)}.</div>
	<div class="row">
		<div class="pk"><b>${pct(m.pct)}</b>complete</div><div class="pk"><b>${pct(m.ppct)}</b>planned</div>
		<div class="pk"><b>${m.slip ? m.slip + ' days late' : 'on time'}</b>schedule</div><div class="pk"><b>${m.spi.toFixed(2)}</b>SPI</div>
	</div>
	<p>Budget ${money(m.bac, cur)}. Earned value ${money(m.ev, cur)}. Planned value ${money(m.pv, cur)}.
	Planned finish ${fmtDay(m.end)}. Forecast finish ${fmtDay(m.forecast)}.</p>
	<img class="pv3d" src="${view}"><img class="pcurve" src="${curve}">
	<h2>Phases</h2>
	<table><tr><th>Phase</th><th>Budget</th><th>Planned</th><th>Actual</th></tr>
	${ph.filter(p => p.bac > 0).map(p => `<tr><td>${esc(p.n)}</td><td>${money(p.bac, cur)}</td><td>${Math.round(p.pv / p.bac * 100)} %</td><td>${Math.round(p.ev / p.bac * 100)} %</td></tr>`).join('')}
	</table>
	<h2>Late (${L.late.length})</h2>
	<table><tr><th>Element</th><th>Stage</th><th>Late</th></tr>${L.late.map(x => tr(x, x.days + ' days')).join('') || '<tr><td colspan=3>None</td></tr>'}</table>
	<h2>In progress (${L.prog.length})</h2>
	<table><tr><th>Element</th><th>Stage</th><th>Started</th></tr>${L.prog.map(x => tr(x, fmtDay(x.s._as))).join('') || '<tr><td colspan=3>None</td></tr>'}</table>
	<h2>Next 14 days (${L.next.length})</h2>
	<table><tr><th>Element</th><th>Stage</th><th>Planned start</th></tr>${L.next.map(x => tr(x, fmtDay(x.s._ps))).join('') || '<tr><td colspan=3>None</td></tr>'}</table>
	${photos.length ? '<h2>Photos</h2><div class="pphotos">' + photos.map(p => `<figure><img src="${p.url}"><figcaption>${fmtDay(p.day)}: ${esc(p.note)}</figcaption></figure>`).join('') + '</div>' : ''}`;
}

export { TYPES, isoDay };
