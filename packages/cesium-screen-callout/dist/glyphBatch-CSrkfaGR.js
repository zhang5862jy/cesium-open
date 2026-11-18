//#region src/font.ts
function e(e, t = e.fontSize) {
	return `${e.fontStyle.includes("italic") ? "italic" : "normal"} ${e.fontStyle.startsWith("bold") ? Math.max(700, e.fontWeight) : e.fontWeight} ${t}px ${e.fontFamily}`;
}
var t = "sans-serif";
function n(e) {
	return e.replace(/[\t\n\f\r]/g, " ");
}
function r(e, t) {
	let n = e.style, r = e.titleStyle ?? n, i = e.displayMode !== "compact" && e.title !== void 0, a = !!e.badgeText, o = a && !i, s = Math.max(1, e.lines.length), c = s * n.fontSize + (s - 1) * n.lineGap, l = o ? Math.max(20, c) : c, u = l + n.paddingTop + n.paddingBottom + 4, d = t.roundWidth === !1 ? (e) => e : Math.ceil, f = d(Math.max(1, t.bodyWidth) + n.paddingLeft + n.paddingRight + 4 + (o ? 26 : 0)), p = Math.max(20, 16, r.fontSize), m = i ? p + r.paddingTop + r.paddingBottom + 4 : 0, h = i ? d(Math.max(0, t.titleWidth ?? 0) + r.paddingLeft + r.paddingRight + 4 + (a ? 26 : 0) + 36 + 6) : 0, g = Math.max(f, h), _ = {
		width: g,
		height: m + u,
		body: {
			x: 0,
			y: m,
			width: g,
			height: u
		},
		bodyText: {
			x: 2 + n.paddingLeft + (o ? 26 : 0),
			y: m + 2 + n.paddingTop + (l - c) / 2
		},
		bodyLineHeight: n.fontSize + n.lineGap
	};
	if (i) {
		let e = 2 + r.paddingTop;
		_.header = {
			x: 0,
			y: 0,
			width: g,
			height: m
		}, _.titleText = {
			x: 2 + r.paddingLeft + (a ? 26 : 0),
			y: e + (p - r.fontSize) / 2
		}, _.actions = {
			x: g - 2 - r.paddingRight - 36,
			y: e + (p - 16) / 2,
			width: 36,
			height: 16
		}, a && (_.badge = {
			x: 2 + r.paddingLeft,
			y: e + (p - 20) / 2,
			width: 20,
			height: 20
		});
	} else o && (_.badge = {
		x: 2 + n.paddingLeft,
		y: 2 + n.paddingTop + (l - 20) / 2,
		width: 20,
		height: 20
	});
	return _;
}
//#endregion
//#region src/visibility.ts
var i = 6378137, a = 6356752.314245179;
function o(e, t, n, r, o, s = !0) {
	let c = r[3] * e + r[7] * t + r[11] * n + r[15];
	if (c <= 0) return !1;
	let l = r[0] * e + r[4] * t + r[8] * n + r[12], u = r[1] * e + r[5] * t + r[9] * n + r[13];
	if (s && (Math.abs(l) > c || Math.abs(u) > c)) return !1;
	let d = o[0] / i, f = o[1] / i, p = o[2] / a, m = e / i - d, h = t / i - f, g = n / a - p, _ = m * m + h * h + g * g, v = d * m + f * h + p * g, y = d * d + f * f + p * p - 1;
	if (y < 0) return !1;
	let b = v * v - _ * y;
	if (_ > 0 && b >= 0) {
		let e = (-v - Math.sqrt(b)) / _;
		if (e >= 0 && e < .99999999) return !1;
	}
	return !0;
}
function s(e, t, n, r, i, a, o, s) {
	return e >= 0 && e <= o && t >= 0 && t <= s || i > 0 && a > 0 && n < o && n + i > 0 && r < s && r + a > 0;
}
//#endregion
//#region src/workerRenderer.ts
var c = class {
	context;
	canvas;
	constructor(e) {
		this.canvas = e;
		let t = e.getContext("2d", { alpha: !0 });
		if (!t) throw Error("OffscreenCanvas 2D 不可用");
		this.context = t;
	}
	draw(i, a, o, s, c, l, u, d, f) {
		let p = this.context, m = Math.max(1, Math.round(c * u)), h = Math.max(1, Math.round(l * u));
		(this.canvas.width !== m || this.canvas.height !== h) && (this.canvas.width = m, this.canvas.height = h), p.setTransform(u, 0, 0, u, 0, 0), p.clearRect(0, 0, c, l), p.textBaseline = "alphabetic", p.lineWidth = 2;
		let g = 0;
		for (let u = 0; u < i.length; u++) {
			let m = u * 5;
			if (d[m + 4] = 0, f?.fill(0, u * 4, u * 4 + 4), !o[u]) continue;
			g++;
			let h = a[u * 3], _ = a[u * 3 + 1], v = a[u * 3 + 2], y = s[3] * h + s[7] * _ + s[11] * v + s[15], b = ((s[0] * h + s[4] * _ + s[8] * v + s[12]) / y + 1) * c / 2, x = (1 - (s[1] * h + s[5] * _ + s[9] * v + s[13]) / y) * l / 2, S = i[u], C = S.style;
			p.font = e(C);
			let w = 1;
			for (let e of S.lines) {
				let t = p.measureText(n(e));
				w = Math.max(w, t.width, t.actualBoundingBoxLeft + t.actualBoundingBoxRight);
			}
			let T = S.titleStyle ?? C;
			p.font = e(T);
			let E = S.title === void 0 ? 0 : p.measureText(n(S.title)).width, D = r(S, {
				bodyWidth: w,
				titleWidth: E
			}), O = D.width, k = D.height, A = b + S.x, j = x + S.y - k;
			if (d[m] = b, d[m + 1] = x, d[m + 2] = O, d[m + 3] = k, d[m + 4] = 1, D.actions && f) {
				let e = D.actions;
				f.set([
					e.x,
					e.y,
					e.width,
					e.height
				], u * 4);
			}
			if (C.showLeader) {
				let e = S.x, t = S.y;
				for (let [n, r] of [
					[S.x, S.y - k],
					[S.x + O, S.y - k],
					[S.x + O, S.y]
				]) n * n + r * r < e * e + t * t && (e = n, t = r);
				p.strokeStyle = C.leaderColor, p.beginPath(), p.moveTo(b, x), p.lineTo(b + e, x + t), p.stroke();
			}
			let M = (e, t, n = !0, r = !0) => {
				t.backgroundColor !== "transparent" && (p.fillStyle = t.backgroundColor, p.fillRect(A + e.x, j + e.y, e.width, e.height)), t.showBorder && (p.fillStyle = t.borderColor, n && p.fillRect(A + e.x, j + e.y, e.width, 2), r && p.fillRect(A + e.x, j + e.y + e.height - 2, e.width, 2), p.fillRect(A + e.x, j + e.y, 2, e.height), p.fillRect(A + e.x + e.width - 2, j + e.y, 2, e.height));
			};
			if (M(D.body, C, !D.header), D.header && M(D.header, T, !0, !1), p.font = e(C), p.fillStyle = C.textColor, S.lines.forEach((e, t) => p.fillText(n(e), A + D.bodyText.x, j + D.bodyText.y + C.fontSize * .8 + t * D.bodyLineHeight)), D.titleText && (p.font = e(T), p.fillStyle = T.textColor, p.fillText(n(S.title ?? ""), A + D.titleText.x, j + D.titleText.y + T.fontSize * .8)), D.badge) {
				let e = D.badge, r = D.header ? T : C;
				p.fillStyle = r.badgeColor, p.fillRect(A + e.x, j + e.y, e.width, e.height), p.font = `normal 700 14px ${t}`, p.fillStyle = r.badgeTextColor;
				let i = n(S.badgeText ?? ""), a = p.measureText(i).width;
				p.fillText(i, A + e.x + (e.width - a) / 2, j + e.y + (e.height - 14) / 2 + 14 * .8);
			}
		}
		return g;
	}
};
//#endregion
//#region src/glyphDistanceField.ts
function l(e, t, n) {
	let r = Math.max(t, n), i = new Float64Array(r), a = new Float64Array(r), o = new Int32Array(r), s = new Float64Array(r + 1), c = (e) => {
		let t = 0;
		o[0] = 0, s[0] = -Infinity, s[1] = Infinity;
		for (let n = 1; n < e; n++) {
			let e;
			do {
				let r = o[t];
				if (e = (i[n] + n * n - i[r] - r * r) / (2 * (n - r)), e > s[t]) break;
				t--;
			} while (t >= 0);
			t++, o[t] = n, s[t] = e, s[t + 1] = Infinity;
		}
		t = 0;
		for (let n = 0; n < e; n++) {
			for (; s[t + 1] < n;) t++;
			let e = o[t];
			a[n] = (n - e) ** 2 + i[e];
		}
	};
	for (let r = 0; r < t; r++) {
		for (let a = 0; a < n; a++) i[a] = e[a * t + r];
		c(n);
		for (let i = 0; i < n; i++) e[i * t + r] = a[i];
	}
	for (let r = 0; r < n; r++) {
		for (let n = 0; n < t; n++) i[n] = e[r * t + n];
		c(t);
		for (let n = 0; n < t; n++) e[r * t + n] = a[n];
	}
}
function u(e, t = 8) {
	let { width: n, height: r, data: i } = e, a = new Float64Array(n * r), o = new Float64Array(n * r);
	for (let e = 0; e < a.length; e++) {
		let t = i[e * 4 + 3] / 255;
		o[e] = t === 1 ? 0 : t === 0 ? 0xe8d4a51000 : Math.max(0, .5 - t) ** 2, a[e] = t === 0 ? 0 : t === 1 ? 0xe8d4a51000 : Math.max(0, t - .5) ** 2;
	}
	l(a, n, r), l(o, n, r);
	for (let e = 0; e < a.length; e++) {
		let n = Math.sqrt(a[e]) - Math.sqrt(o[e]), r = Math.round(255 * Math.max(0, Math.min(1, .5 + n / (2 * t))));
		i[e * 4] = i[e * 4 + 1] = i[e * 4 + 2] = r, i[e * 4 + 3] = 255;
	}
	return e;
}
//#endregion
//#region src/GlyphLayoutCache.ts
var d = 4096, f = d, p = 64, m = 12, h = class {
	canvas = new OffscreenCanvas(f, f);
	ctx = this.canvas.getContext("2d");
	glyphs = /* @__PURE__ */ new Map();
	textCache = /* @__PURE__ */ new WeakMap();
	atlasX = 8;
	atlasY = 0;
	atlasRowHeight = 4;
	constructor() {
		this.resetAtlas();
	}
	resetAtlas() {
		this.glyphs.clear(), this.textCache = /* @__PURE__ */ new WeakMap(), this.ctx.clearRect(0, 0, f, f), this.ctx.fillStyle = "white", this.ctx.fillRect(0, 0, 4, 4), this.atlasX = 8, this.atlasY = 0, this.atlasRowHeight = 4;
	}
	prepare(r) {
		let i = /* @__PURE__ */ new Map(), a = r.map((r) => ({
			font: e(r.style, p),
			lines: r.lines.map(n),
			title: r.displayMode !== "compact" && r.title !== void 0 ? n(r.title) : void 0,
			titleFont: e(r.titleStyle ?? r.style, p),
			badge: r.badgeText ? n(r.badgeText) : void 0,
			badgeFont: `normal 700 ${p}px ${t}`
		})), o = (e, t, n) => {
			if (!(n?.font === e && n.text === t)) for (let n of t) {
				let t = e + "\n" + n;
				!this.glyphs.has(t) && !i.has(t) && i.set(t, {
					font: e,
					character: n
				});
			}
		};
		a.forEach((e, t) => {
			let n = this.textCache.get(r[t]);
			e.lines.forEach((t, r) => o(e.font, t, n?.rows[r])), e.title !== void 0 && o(e.titleFont, e.title, n?.title), e.badge !== void 0 && o(e.badgeFont, e.badge, n?.badge);
		});
		let s = !1;
		for (let [e, { font: t, character: n }] of i) {
			if (this.glyphs.has(e)) continue;
			this.ctx.font = t, this.ctx.textBaseline = "alphabetic";
			let i = this.ctx.measureText(n), o = Math.ceil(i.actualBoundingBoxLeft), c = Math.ceil(i.actualBoundingBoxAscent), l = Math.max(1, Math.ceil(i.actualBoundingBoxLeft + i.actualBoundingBoxRight)) + m * 2, d = Math.max(1, Math.ceil(i.actualBoundingBoxAscent + i.actualBoundingBoxDescent)) + m * 2;
			if (this.atlasX + l > f && (this.atlasX = 0, this.atlasY += this.atlasRowHeight, this.atlasRowHeight = 0), this.atlasY + d > f) {
				let e = /* @__PURE__ */ new Set();
				if (a.forEach((t) => {
					for (let n of t.lines) for (let r of n) e.add(t.font + "\n" + r);
					if (t.title !== void 0) for (let n of t.title) e.add(t.titleFont + "\n" + n);
					if (t.badge !== void 0) for (let n of t.badge) e.add(t.badgeFont + "\n" + n);
				}), [...this.glyphs.keys()].some((t) => !e.has(t))) return this.resetAtlas(), this.prepare(r);
				throw Error("当前字体/字符组合超出 4096px 字形图集容量");
			}
			let p = this.atlasX, h = this.atlasY;
			this.ctx.fillText(n, p + m + o, h + m + c), this.ctx.putImageData(u(this.ctx.getImageData(p, h, l, d), m - 2), p, h), this.glyphs.set(e, {
				uv: [
					p / f,
					h / f,
					l / f,
					d / f
				],
				w: l,
				h: d,
				advance: i.width,
				left: o + m,
				ascent: c + m
			}), this.atlasX += l, this.atlasRowHeight = Math.max(this.atlasRowHeight, d), s = !0;
		}
		let c = a.reduce((e, t) => e + 6 + Number(t.title !== void 0) * 5 + Number(t.badge !== void 0), 0), l = (e, t, n) => {
			if (n?.font === e && n.text === t) return n;
			let r = [], i = 0;
			for (let n of t) {
				let t = this.glyphs.get(e + "\n" + n);
				r.push(t), i += t.advance;
			}
			return {
				font: e,
				text: t,
				glyphs: r,
				width: i
			};
		};
		return {
			texts: r.map((e, t) => {
				let n = a[t], r = this.textCache.get(e);
				return r || (r = { rows: [] }, this.textCache.set(e, r)), r.rows.length = n.lines.length, n.lines.forEach((e, t) => {
					r.rows[t] = l(n.font, e, r.rows[t]), c += r.rows[t].glyphs.length;
				}), r.title = n.title === void 0 ? void 0 : l(n.titleFont, n.title, r.title), r.badge = n.badge === void 0 ? void 0 : l(n.badgeFont, n.badge, r.badge), c += (r.title?.glyphs.length ?? 0) + (r.badge?.glyphs.length ?? 0), r;
			}),
			maximum: c,
			changed: s
		};
	}
}, g = 16, _ = class {
	layout = new h();
	colorCanvas = new OffscreenCanvas(1, 1);
	colorContext = this.colorCanvas.getContext("2d", { willReadFrequently: !0 });
	colors = /* @__PURE__ */ new Map();
	color(e) {
		let t = this.colors.get(e);
		if (!t) {
			this.colors.size >= 256 && this.colors.clear();
			let n = this.colorContext;
			n.clearRect(0, 0, 1, 1), n.fillStyle = e, n.fillRect(0, 0, 1, 1), t = Array.from(n.getImageData(0, 0, 1, 1).data, (e) => e / 255), this.colors.set(e, t);
		}
		return t;
	}
	async build(e, t) {
		let { texts: n, maximum: i, changed: a } = this.layout.prepare(e), o = i * g, s = t && t.length >= o ? t : new Float32Array(o), c = new Float32Array(e.length * 2), l = new Float32Array(e.length * 4), u = 0, f = (e, t, n, r, i, a, o, c) => {
			if (c[3] === 0 || i === 0 || a === 0) return;
			let l = u++ * g;
			s[l] = e, s[l + 1] = t, s[l + 2] = n, s[l + 3] = r, s[l + 4] = i, s[l + 5] = 0, s[l + 6] = 0, s[l + 7] = a;
			for (let e = 0; e < 4; e++) s[l + 8 + e] = o[e], s[l + 12 + e] = c[e];
		}, p = [
			1 / d,
			1 / d,
			2 / d,
			2 / d
		];
		e.forEach((e, t) => {
			e.style.showLeader && f(t, 1, 0, 0, 1, 1, p, this.color(e.style.leaderColor));
		});
		let m = u;
		return e.forEach((e, t) => {
			let i = e.style, a = e.titleStyle ?? i, o = i.fontSize / 64, s = n[t], u = s.rows, d = 1;
			for (let e of u) d = Math.max(d, e.width * o);
			let m = r(e, {
				bodyWidth: d,
				titleWidth: (s.title?.width ?? 0) * a.fontSize / 64
			});
			if (c[t * 2] = m.width, c[t * 2 + 1] = m.height, m.actions) {
				let e = m.actions;
				l.set([
					e.x,
					e.y,
					e.width,
					e.height
				], t * 4);
			}
			let h = (e, n, r = !0, i = !0) => {
				if (f(t, 0, e.x, e.y, e.width, e.height, p, this.color(n.backgroundColor)), !n.showBorder) return;
				let a = this.color(n.borderColor);
				r && f(t, 0, e.x, e.y, e.width, 2, p, a), i && f(t, 0, e.x, e.y + e.height - 2, e.width, 2, p, a), f(t, 0, e.x, e.y, 2, e.height, p, a), f(t, 0, e.x + e.width - 2, e.y, 2, e.height, p, a);
			};
			h(m.body, i, !m.header), m.header && h(m.header, a, !0, !1);
			let g = (e, n, r, i, a) => {
				let o = n / 64, s = r, c = i + n * .8;
				for (let n of e.glyphs) f(t, 2, s - n.left * o, c - n.ascent * o, n.w * o, n.h * o, n.uv, a), s += n.advance * o;
			}, _ = this.color(i.textColor);
			if (u.forEach((e, t) => {
				g(e, i.fontSize, m.bodyText.x, m.bodyText.y + t * m.bodyLineHeight, _);
			}), s.title && m.titleText && g(s.title, a.fontSize, m.titleText.x, m.titleText.y, this.color(a.textColor)), s.badge && m.badge) {
				let e = m.badge, n = m.header ? a : i;
				f(t, 0, e.x, e.y, e.width, e.height, p, this.color(n.badgeColor)), g(s.badge, 14, e.x + (e.width - s.badge.width * 14 / 64) / 2, e.y + (e.height - 14) / 2, this.color(n.badgeTextColor));
			}
		}), {
			instances: s,
			count: u,
			leaderCount: m,
			sizes: c,
			actionRects: l,
			atlas: a ? await createImageBitmap(this.layout.canvas) : void 0
		};
	}
};
//#endregion
export { o as a, n as c, s as i, e as l, u as n, t as o, c as r, r as s, _ as t };

//# sourceMappingURL=glyphBatch-CSrkfaGR.js.map