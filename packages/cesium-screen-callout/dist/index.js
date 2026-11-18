import { a as e, c as t, i as n, l as r, n as i, o as a, r as o, s, t as c } from "./glyphBatch-CSrkfaGR.js";
import * as l from "cesium";
import { Cartesian2 as u, Color as d } from "cesium";
import { fromLonLat as f, getUserProjection as p, transform as m } from "ol/proj.js";
//#region src/interactionHost.ts
function h(e) {
	return {
		element: e.canvas,
		requestRender: () => e.requestRender(),
		onBeforeRender: (t) => e.preUpdate.addEventListener(t),
		ownsEventTarget: (t) => t === e.canvas,
		suspendInputs: () => {
			let t = e.screenSpaceCameraController, n = t.enableInputs, r = !1;
			return t.enableInputs = !1, () => {
				r || (r = !0, t.enableInputs = n);
			};
		}
	};
}
function g(e) {
	return "element" in e ? e : h(e);
}
//#endregion
//#region src/drag.ts
var _ = class {
	host;
	getCallouts;
	onSelect;
	onDragEnd;
	active;
	pointerId;
	pointer = new l.Cartesian2();
	grab = new l.Cartesian2();
	downPoint = new l.Cartesian2();
	dragStarted = !1;
	scratch = new l.Cartesian2();
	restoreInputs;
	previousCursor = "";
	removeUpdate;
	constructor(e, t, n, r) {
		this.host = g(e), this.getCallouts = t, this.onSelect = n, this.onDragEnd = r;
		let i = this.host.element;
		i.addEventListener("pointerdown", this.down, !0), i.addEventListener("pointermove", this.move, !0), i.addEventListener("pointerup", this.up, !0), i.addEventListener("pointercancel", this.up, !0), i.addEventListener("lostpointercapture", this.cancel), window.addEventListener("blur", this.cancel), this.removeUpdate = this.host.onBeforeRender(() => this.updateDrag());
	}
	locate(e) {
		let t = this.host.element, n = t.getBoundingClientRect();
		return n.width <= 0 || n.height <= 0 || t.clientWidth <= 0 || t.clientHeight <= 0 ? !1 : (this.pointer.x = (e.clientX - n.left) * t.clientWidth / n.width, this.pointer.y = (e.clientY - n.top) * t.clientHeight / n.height, !0);
	}
	down = (e) => {
		if (e.button !== 0 || this.active || this.host.ownsEventTarget && !this.host.ownsEventTarget(e.target) || !this.locate(e)) return;
		let t = this.getCallouts(), n;
		for (let e = t.length - 1; e >= 0; e--) if (t[e].hitTest(this.pointer)) {
			n = t[e];
			break;
		}
		if (!n) return;
		let r = n.getTargetScreenPosition(this.scratch);
		if (!r) return;
		let i = n.getOffset();
		this.grab.x = this.pointer.x - r.x - i.x, this.grab.y = this.pointer.y - r.y - i.y, this.active = n, l.Cartesian2.clone(this.pointer, this.downPoint), this.dragStarted = !1, this.pointerId = e.pointerId;
		let a = this.host.element;
		this.previousCursor = a.style.cursor, this.restoreInputs = this.host.suspendInputs(), a.style.cursor = "grabbing";
		try {
			a.setPointerCapture(e.pointerId);
		} catch {
			this.finish(!1);
			return;
		}
		e.preventDefault(), e.stopImmediatePropagation(), this.onSelect?.(n);
	};
	updateDrag() {
		if (!this.active || !this.dragStarted) return;
		if (this.host.requestRender(), this.active.setDragScreenPosition) {
			this.active.setDragScreenPosition(l.Cartesian2.fromElements(this.pointer.x - this.grab.x, this.pointer.y - this.grab.y, this.scratch));
			return;
		}
		let e = this.active.getTargetScreenPosition(this.scratch);
		e && this.active.setOffset(new l.Cartesian2(this.pointer.x - e.x - this.grab.x, this.pointer.y - e.y - this.grab.y));
	}
	move = (e) => {
		!this.active || e.pointerId !== this.pointerId || this.locate(e) && (!this.dragStarted && l.Cartesian2.distance(this.pointer, this.downPoint) >= 3 && (this.dragStarted = !0), this.updateDrag(), e.preventDefault(), e.stopImmediatePropagation());
	};
	up = (e) => {
		!this.active || e.pointerId !== this.pointerId || (this.locate(e) && this.updateDrag(), e.preventDefault(), e.stopImmediatePropagation(), this.cancel());
	};
	cancel = () => {
		this.finish(!0);
	};
	finish(e) {
		if (!this.active) return;
		let t = this.active, n = this.dragStarted;
		n && t.setDragScreenPosition?.(void 0);
		let r = this.pointerId;
		this.active = void 0, this.dragStarted = !1, this.pointerId = void 0, this.restoreInputs?.(), this.restoreInputs = void 0;
		let i = this.host.element;
		i.style.cursor = this.previousCursor, r !== void 0 && i.hasPointerCapture(r) && i.releasePointerCapture(r), n && this.host.requestRender(), e && n && this.onDragEnd?.(t);
	}
	destroy() {
		this.finish(!1), this.removeUpdate();
		let e = this.host.element;
		e.removeEventListener("pointerdown", this.down, !0), e.removeEventListener("pointermove", this.move, !0), e.removeEventListener("pointerup", this.up, !0), e.removeEventListener("pointercancel", this.up, !0), e.removeEventListener("lostpointercapture", this.cancel), window.removeEventListener("blur", this.cancel);
	}
}, v = Object.freeze({
	leaderColor: "#ff0000",
	borderColor: "#ff0000",
	textColor: "#ff0000",
	backgroundColor: "rgba(255, 255, 255, 0.1)",
	fontSize: 14,
	fontFamily: "sans-serif",
	badgeColor: "#ff0000",
	badgeTextColor: "#ffffff",
	fontStyle: "normal",
	fontWeight: 400,
	showBorder: !0,
	showLeader: !0,
	lineGap: 1,
	paddingTop: 10,
	paddingRight: 10,
	paddingBottom: 10,
	paddingLeft: 5
}), y = /* @__PURE__ */ new WeakMap();
function b(e) {
	let t = y.get(e);
	if (!t) {
		let n = document.createElement("canvas");
		n.width = n.height = 64;
		let r = n.getContext("2d");
		if (!r) throw Error("无法创建标牌纹理");
		r.fillStyle = "white", r.fillRect(0, 0, n.width, n.height), t = {
			backgrounds: e.primitives.add(new l.BillboardCollection({
				scene: e,
				blendOption: l.BlendOption.TRANSLUCENT
			})),
			labels: e.primitives.add(new l.LabelCollection({
				scene: e,
				blendOption: l.BlendOption.TRANSLUCENT
			})),
			pixel: n,
			users: 0
		}, y.set(e, t);
	}
	return t.users++, t;
}
var x = class {
	scene;
	pool;
	panel;
	line;
	borders;
	rows;
	position = new l.Cartesian3();
	screen = new l.Cartesian2();
	direction = new l.Cartesian3();
	ray = new l.Ray();
	offset = new l.Cartesian2();
	leaderEndpoint = new l.Cartesian2();
	leaderCorner = "bottom-left";
	removeUpdate;
	measure = document.createElement("canvas").getContext("2d");
	style;
	width = 260;
	height = 150;
	lineCount = 1;
	enabled = !0;
	visible = !1;
	destroyed = !1;
	externalVisibility;
	textDirty = !0;
	measuredWidth = 1;
	maxOffsetDistance = Infinity;
	constructor(e, t, n = {}, r = {}) {
		let i = typeof n == "number" ? n : n.distance ?? 100, a = typeof n == "number" ? r : n.style, o = typeof n == "number" ? void 0 : n.offset;
		if (this.maxOffsetDistance = typeof n == "number" ? Infinity : this.validateMaxOffsetDistance(n.maxOffsetDistance), this.validateDistance(i), o && (!Number.isFinite(o.x) || !Number.isFinite(o.y))) throw RangeError("偏移必须是有限数");
		this.style = this.validateStyle({
			...v,
			...a
		}), this.scene = e, this.externalVisibility = typeof n != "number" && n.externalVisibility === !0, this.pool = b(e);
		let s = {
			position: t,
			disableDepthTestDistance: Infinity,
			id: this
		}, c = () => this.pool.backgrounds.add({
			...s,
			image: this.pool.pixel,
			sizeInMeters: !1
		});
		this.line = c(), this.panel = c(), this.panel.horizontalOrigin = l.HorizontalOrigin.LEFT, this.panel.verticalOrigin = l.VerticalOrigin.BOTTOM, this.borders = Array.from({ length: 4 }, c), this.rows = Array.from({ length: 6 }, () => this.pool.labels.add({
			...s,
			text: "",
			horizontalOrigin: l.HorizontalOrigin.LEFT,
			verticalOrigin: l.VerticalOrigin.TOP
		})), this.setPosition(t), this.setStyle(this.style), o ? this.setOffset(o) : this.setDistance(i), this.removeUpdate = this.externalVisibility ? () => {} : e.preUpdate.addEventListener(() => this.updateVisibility());
	}
	setPosition(e) {
		l.Cartesian3.clone(e, this.position);
		for (let t of [
			this.panel,
			this.line,
			...this.borders,
			...this.rows
		]) t.position = e;
	}
	setLines(e) {
		if (e.length > 6) throw RangeError("标牌最多支持六行文字");
		this.lineCount === Math.max(1, e.length) && this.rows.every((t, n) => t.text === (e[n] ?? "")) || (this.lineCount = Math.max(1, e.length), this.rows.forEach((t, n) => {
			t.text = e[n] ?? "";
		}), this.textDirty = !0, this.layout(), this.applyShow());
	}
	validateDistance(e) {
		if (!Number.isFinite(e) || e < 0) throw RangeError("距离必须是非负有限数");
	}
	validateMaxOffsetDistance(e) {
		let t = e ?? Infinity;
		if (t !== Infinity && (!Number.isFinite(t) || t < 0)) throw RangeError("最大偏移距离必须是非负有限数或 Infinity");
		return t;
	}
	validateStyle(e) {
		for (let t of [
			e.leaderColor,
			e.borderColor,
			e.textColor,
			e.backgroundColor
		]) if (!l.Color.fromCssColorString(t)) throw RangeError("无效颜色：" + t);
		if (!Number.isFinite(e.fontSize) || e.fontSize < 8 || e.fontSize > 48) throw RangeError("文字大小须为 8–48px");
		for (let t of [
			e.lineGap,
			e.paddingTop,
			e.paddingRight,
			e.paddingBottom,
			e.paddingLeft
		]) if (!Number.isFinite(t) || t < 0 || t > 200) throw RangeError("行间距和内边距须为 0–200px");
		if (![
			"normal",
			"bold",
			"italic",
			"bold italic"
		].includes(e.fontStyle) || !e.fontFamily.trim()) throw RangeError("无效文字样式");
		if (![
			100,
			200,
			300,
			400,
			500,
			600,
			700,
			800,
			900
		].includes(e.fontWeight)) throw RangeError("文字粗细须为 100–900 的整百数");
		return e;
	}
	getStyle() {
		return { ...this.style };
	}
	setStyle(e) {
		this.style = this.validateStyle({
			...this.style,
			...e
		}), this.line.color = l.Color.fromCssColorString(this.style.leaderColor), this.panel.color = l.Color.fromCssColorString(this.style.backgroundColor);
		for (let e of this.borders) e.color = l.Color.fromCssColorString(this.style.borderColor);
		for (let e of this.rows) e.font = r(this.style), e.fillColor = l.Color.fromCssColorString(this.style.textColor);
		this.textDirty = !0, this.layout(), this.applyShow();
	}
	setDistance(e) {
		this.validateDistance(e), this.setOffset(new l.Cartesian2(e / Math.SQRT2, -e / Math.SQRT2));
	}
	getOffset(e = new l.Cartesian2()) {
		return l.Cartesian2.clone(this.offset, e);
	}
	getMaxOffsetDistance() {
		return this.maxOffsetDistance;
	}
	setMaxOffsetDistance(e = Infinity) {
		let t = this.validateMaxOffsetDistance(e);
		t !== this.maxOffsetDistance && (this.maxOffsetDistance = t, this.setOffset(l.Cartesian2.clone(this.offset)));
	}
	getLeaderEndpoint(e = new l.Cartesian2()) {
		return l.Cartesian2.clone(this.leaderEndpoint, e);
	}
	getLeaderCorner() {
		return this.leaderCorner;
	}
	setOffset(e) {
		if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) throw RangeError("偏移必须是有限数");
		l.Cartesian2.clone(e, this.offset), this.clampOffsetToMaxDistance(), this.layout(), this.applyShow();
	}
	clampOffsetToMaxDistance() {
		let e = this.offset.x + this.width / 2, t = this.offset.y - this.height / 2, n = Math.hypot(e, t);
		if (n > this.maxOffsetDistance && n > 0) {
			let r = this.maxOffsetDistance / n;
			this.offset.x = e * r - this.width / 2, this.offset.y = t * r + this.height / 2;
		}
	}
	layout() {
		this.measure.font = this.rows[0].font;
		let { fontSize: e, lineGap: t, paddingTop: n, paddingRight: r, paddingBottom: i, paddingLeft: a } = this.style;
		this.textDirty && (this.measuredWidth = Math.max(1, ...this.rows.map((e) => {
			let t = this.measure.measureText(e.text);
			return Math.max(t.width, t.actualBoundingBoxLeft + t.actualBoundingBoxRight);
		}))), this.textDirty = !1;
		let o = this.measuredWidth, s = e + t;
		this.width = Math.ceil(o + a + r + 4), this.height = Math.ceil(this.lineCount * e + (this.lineCount - 1) * t + n + i + 4), this.clampOffsetToMaxDistance();
		let { x: c, y: u } = this.offset;
		this.panel.width = this.width, this.panel.height = this.height, this.panel.pixelOffset = this.offset;
		let d = [
			[
				"bottom-left",
				c,
				u
			],
			[
				"top-left",
				c,
				u - this.height
			],
			[
				"top-right",
				c + this.width,
				u - this.height
			],
			[
				"bottom-right",
				c + this.width,
				u
			]
		], f = d[0];
		for (let e of d.slice(1)) e[1] ** 2 + e[2] ** 2 < f[1] ** 2 + f[2] ** 2 && (f = e);
		this.leaderCorner = f[0], l.Cartesian2.fromElements(f[1], f[2], this.leaderEndpoint), this.line.pixelOffset = new l.Cartesian2(f[1] / 2, f[2] / 2), this.line.width = l.Cartesian2.magnitude(this.leaderEndpoint), this.line.height = 2, this.line.rotation = Math.atan2(-f[2], f[1]);
		let p = [
			[
				c + this.width / 2,
				u - 1,
				this.width,
				2
			],
			[
				c + this.width / 2,
				u - this.height + 1,
				this.width,
				2
			],
			[
				c + 1,
				u - this.height / 2,
				2,
				this.height
			],
			[
				c + this.width - 1,
				u - this.height / 2,
				2,
				this.height
			]
		];
		this.borders.forEach((e, t) => {
			let n = p[t];
			e.pixelOffset = new l.Cartesian2(n[0], n[1]), e.width = n[2], e.height = n[3];
		}), this.rows.forEach((e, t) => {
			e.pixelOffset = new l.Cartesian2(c + 2 + a, u - this.height + 2 + n + t * s);
		});
	}
	getTargetScreenPosition(e = new l.Cartesian2()) {
		return l.SceneTransforms.worldToWindowCoordinates(this.scene, this.position, e);
	}
	hitTest(e) {
		if (this.destroyed || !this.visible) return !1;
		let t = this.getTargetScreenPosition(this.screen);
		if (!t) return !1;
		let n = t.x + this.offset.x, r = t.y + this.offset.y;
		return e.x >= n && e.x <= n + this.width && e.y >= r - this.height && e.y <= r;
	}
	setShow(e) {
		this.enabled = e, this.externalVisibility ? (this.visible = e, this.applyShow()) : this.updateVisibility();
	}
	applyShow() {
		this.panel.show = this.visible, this.line.show = this.visible && this.style.showLeader && l.Cartesian2.magnitudeSquared(this.leaderEndpoint) > 0;
		for (let e of this.borders) e.show = this.visible && this.style.showBorder;
		for (let e of this.rows) e.show = this.visible;
	}
	updateVisibility() {
		let e = this.scene.camera;
		l.Cartesian3.subtract(this.position, e.positionWC, this.direction);
		let t = l.Cartesian3.magnitude(this.direction);
		l.Cartesian3.clone(e.positionWC, this.ray.origin), t > 0 && l.Cartesian3.divideByScalar(this.direction, t, this.ray.direction);
		let n = t > 0 ? l.IntersectionTests.rayEllipsoid(this.ray, this.scene.ellipsoid) : void 0, r = this.getTargetScreenPosition(this.screen);
		this.visible = this.enabled && this.scene.mode === l.SceneMode.SCENE3D && !!r && l.Cartesian3.dot(this.direction, e.directionWC) > 0 && !(n && n.start < t - .1) && r.x >= 0 && r.y >= 0 && r.x <= this.scene.canvas.clientWidth && r.y <= this.scene.canvas.clientHeight, this.applyShow();
	}
	destroy() {
		if (!this.destroyed && (this.destroyed = !0, this.visible = !1, this.removeUpdate(), !this.scene.isDestroyed())) {
			for (let e of [
				this.panel,
				this.line,
				...this.borders
			]) this.pool.backgrounds.remove(e);
			for (let e of this.rows) this.pool.labels.remove(e);
			--this.pool.users === 0 && (this.scene.primitives.remove(this.pool.backgrounds), this.scene.primitives.remove(this.pool.labels), y.delete(this.scene));
		}
	}
}, S = Object.freeze({
	enabled: !1,
	gap: 6,
	maxCandidates: 96,
	maxIterations: 32,
	maxDisplacement: 160,
	distanceWeight: .25
});
function C(e, t = S) {
	let n = {
		...t,
		...typeof e == "boolean" ? { enabled: e } : e
	};
	if (typeof n.enabled != "boolean") throw TypeError("避让 enabled 必须是布尔值");
	if (!Number.isFinite(n.gap) || n.gap < 0 || n.gap > 200) throw RangeError("避让间距须为 0–200px");
	if (!Number.isInteger(n.maxCandidates) || n.maxCandidates < 8 || n.maxCandidates > 512) throw RangeError("避让搜索次数须为 8–512 的整数");
	if (!Number.isInteger(n.maxIterations) || n.maxIterations < 1 || n.maxIterations > 128) throw RangeError("避让迭代次数须为 1–128 的整数");
	if (n.maxDisplacement !== Infinity && (!Number.isFinite(n.maxDisplacement) || n.maxDisplacement < 0)) throw RangeError("自动避让半径须为非负数或 Infinity");
	if (!Number.isFinite(n.distanceWeight) || n.distanceWeight < 0 || n.distanceWeight > 10) throw RangeError("避让距离权重须为 0–10");
	return n;
}
var w = 128, T = .01, E = .05, D = 1, O = class {
	previous = /* @__PURE__ */ new Map();
	cells = /* @__PURE__ */ new Map();
	stamps = /* @__PURE__ */ new Map();
	queryId = 0;
	bodies = [];
	dragged = [];
	viewportWidth = 0;
	viewportHeight = 0;
	configuration = "";
	stats = {
		unresolved: 0,
		moved: 0,
		candidateChecks: 0
	};
	gap = 0;
	maxDisplacement = 160;
	distanceWeight = .25;
	settledInputs = /* @__PURE__ */ new Map();
	deferred = !1;
	clear() {
		this.previous.clear(), this.cells.clear(), this.bodies.length = 0, this.dragged.length = 0, this.stamps.clear(), this.settledInputs.clear(), this.deferred = !1;
	}
	layout(e, t, n, r, i = !1) {
		let a = i || e.some((e) => e.dragging), o = this.deferred && !a, s = `${r.gap}/${r.maxCandidates}/${r.maxIterations}/${r.maxDisplacement}/${r.distanceWeight}`, c = !o && this.deferred === a && this.viewportWidth === t && this.viewportHeight === n && this.configuration === s && this.previous.size === e.length, l = e.map((e) => [
			+e.visible,
			e.preferredLeft,
			e.preferredTop,
			e.anchorX,
			e.anchorY,
			e.width,
			e.height,
			e.maxDistance,
			+e.dragging,
			e.priority
		]);
		if (this.deferred = a, a) {
			let t = /* @__PURE__ */ new Map(), n = 0;
			return e.forEach((e, r) => {
				let i = this.previous.get(e.index), a = i && !e.dragging && i.input[9] === e.priority;
				e.left = a ? i.left + (e.preferredLeft - i.input[1]) : e.preferredLeft, e.top = a ? i.top + (e.preferredTop - i.input[2]) : e.preferredTop, (Math.abs(e.left - e.preferredLeft) > T || Math.abs(e.top - e.preferredTop) > T) && n++, t.set(e.index, {
					input: l[r],
					left: e.left,
					top: e.top,
					conflicted: i?.conflicted ?? !1,
					settled: i?.settled ?? !1
				});
			}), this.previous = t, this.settledInputs.clear(), {
				unresolved: this.stats.unresolved,
				moved: n,
				candidateChecks: 0
			};
		}
		for (let t = 0; t < e.length && c; t++) {
			let n = this.previous.get(e[t].index);
			c = !!n && l[t].every((e, t) => e === n.input[t]);
		}
		if (c) {
			for (let t of e) {
				let e = this.previous.get(t.index);
				t.left = e.left, t.top = e.top;
			}
			return {
				...this.stats,
				candidateChecks: 0
			};
		}
		let u = this.viewportWidth === t && this.viewportHeight === n && this.configuration === s, d = e.length < this.previous.size || e.some((e) => !e.visible && this.previous.get(e.index)?.input[0]);
		this.viewportWidth = t, this.viewportHeight = n, this.configuration = s, this.gap = r.gap, this.maxDisplacement = r.maxDisplacement, this.distanceWeight = r.distanceWeight, this.cells.clear(), this.stamps.clear(), this.bodies.length = 0, this.dragged.length = 0;
		let f = {
			unresolved: 0,
			moved: 0,
			candidateChecks: 0
		}, p = /* @__PURE__ */ new Set();
		for (let r of e) {
			let e = this.previous.get(r.index), i = !!e?.input[8], a = e && (e.settled || i) && !r.dragging && (i || e.input[9] === r.priority), o = a ? e.left + (r.preferredLeft - e.input[1]) : r.preferredLeft, s = a ? e.top + (r.preferredTop - e.input[2]) : r.preferredTop;
			if (r.left = o, r.top = s, !r.visible) continue;
			let c = {
				item: r,
				x: o,
				y: s,
				startX: o,
				startY: s,
				homeX: r.preferredLeft,
				homeY: r.preferredTop,
				cells: [],
				constrained: !1,
				keepInViewport: !1,
				fixed: i,
				dragDepth: i ? 0 : Infinity,
				mobility: i ? 0 : r.priority > 1 ? .05 : r.priority ? .25 : 1
			}, l = c.homeX + r.width / 2 - r.anchorX, u = c.homeY + r.height / 2 - r.anchorY, d = Math.hypot(l, u);
			d > r.maxDistance && (c.homeX = r.anchorX - r.width / 2 + l / d * r.maxDistance, c.homeY = r.anchorY - r.height / 2 + u / d * r.maxDistance), a || (p.add(c), r.dragging || (c.x = c.homeX, c.y = c.homeY)), this.constrain(c), c.constrained = Math.hypot(c.x - o, c.y - s) > 1e-6, c.startX = c.x, c.startY = c.y, c.keepInViewport = c.x >= 0 && c.y >= 0 && c.x + r.width <= t && c.y + r.height <= n, this.bodies.push(c), i && this.dragged.push(c);
		}
		if (this.bodies.sort((e, t) => Number(t.item.dragging) - Number(e.item.dragging) || t.item.priority - e.item.priority || e.item.index - t.item.index), !o && u && !d && !p.size && !this.dragged.length && this.canReusePlacement(e, l)) {
			for (let e of this.bodies) this.insert(e);
			if (!this.bodies.some((e) => !this.previous.get(e.item.index)?.conflicted && this.query(e.x, e.y, e.item.width, e.item.height).some((t) => t !== e && this.overlap(e, t, 0) > 0))) return this.finish(e, l, f);
			this.cells.clear();
			for (let e of this.bodies) e.cells.length = 0;
		}
		this.settledInputs.clear(), e.forEach((e, t) => this.settledInputs.set(e.index, l[t]));
		let m = this.bodies.reduce((e, t) => e + (t.item.width + this.gap) * (t.item.height + this.gap), 0) > t * n;
		if (this.bodies.length > 64 && m) {
			for (let e of this.bodies) this.insert(e);
			let t = new Map(this.bodies.map((e) => [e, r.maxCandidates]));
			return f.candidateChecks += this.repairSparse(t), f.candidateChecks += this.layoutSaturated(t, p), f.candidateChecks += this.repairSparse(t), this.finish(e, l, f);
		}
		let h = m ? Math.min(r.maxCandidates, Math.max(8, Math.floor(4096 / Math.max(1, this.bodies.length)))) : r.maxCandidates, g = new Map(this.bodies.map((e) => [e, h])), _ = (e, t, n = !1) => {
			let r = this.repair(e, Math.min(g.get(e) ?? 0, t), n);
			g.set(e, (g.get(e) ?? 0) - r), f.candidateChecks += r;
		};
		for (let e of this.bodies) (!p.has(e) || e.fixed) && this.insert(e);
		for (let e of this.bodies) p.has(e) && !e.fixed && (_(e, Math.ceil(h / 2)), this.insert(e));
		for (let e of this.bodies) !e.fixed && this.dragged.some((t) => this.overlap(e, t)) && (this.remove(e), this.protectDrag(e), this.insert(e));
		let v = this.bodies.filter((e) => !e.fixed).map((e) => ({
			body: e,
			contacts: this.query(e.x, e.y, e.item.width, e.item.height).filter((t) => t !== e && this.overlap(e, t)).length
		})).filter((e) => e.contacts > 0).sort((e, t) => e.body.item.priority - t.body.item.priority || t.contacts - e.contacts || t.body.item.index - e.body.item.index);
		for (let { body: e } of v) p.has(e) || !this.localScore(e).overlap || (this.remove(e), _(e, Math.ceil(h / 2)), this.insert(e));
		let y = this.measure(), b = this.bodies.map((e) => [e.x, e.y]), x = Math.min(r.maxIterations, Math.max(2, Math.floor(8192 / Math.max(1, this.bodies.length)))), S = 0, C = Math.max(16384, this.bodies.length * 32);
		for (let e = 0; e < x && y.overlap > 0 && S < C; e++) {
			let t = 0;
			this.propagateDragPriority();
			let n = e % 2 ? [...this.bodies].reverse() : this.bodies;
			for (let e of n) {
				for (let n of this.query(e.x, e.y, e.item.width, e.item.height)) if (!(n.item.index <= e.item.index || !this.overlap(e, n))) {
					if (++S > C) break;
					this.separate(e, n) && t++;
				}
				if (S > C) break;
			}
			let r = this.measure();
			if (this.better(r, y) && (y = r, b = this.bodies.map((e) => [e.x, e.y])), !t || r.overlap === 0) break;
		}
		this.cells.clear(), this.bodies.forEach((e, t) => {
			[e.x, e.y] = b[t], e.cells = [], this.insert(e);
		});
		for (let e of this.bodies) !e.fixed && this.localScore(e).overlap > 0 && (this.remove(e), _(e, h, p.has(e)), this.insert(e));
		for (let e of this.bodies) !e.fixed && this.dragged.some((t) => this.overlap(e, t)) && (this.remove(e), this.protectDrag(e), this.insert(e));
		return this.finish(e, l, f);
	}
	canReusePlacement(e, t) {
		if (this.settledInputs.size !== e.length || this.bodies.some((e) => e.constrained)) return !1;
		let n = this.bodies[0];
		if (!n) return !0;
		let r = this.settledInputs.get(n.item.index);
		if (!r) return !1;
		let i = n.item.preferredLeft - r[1], a = n.item.preferredTop - r[2];
		for (let n = 0; n < e.length; n++) {
			let r = e[n], o = t[n], s = this.settledInputs.get(r.index);
			if (!s || o[0] !== s[0]) return !1;
			if (r.visible) {
				for (let e of [
					5,
					6,
					7,
					8,
					9
				]) if (o[e] !== s[e]) return !1;
				for (let e of [
					1,
					2,
					3,
					4
				]) if (Math.abs(o[e] - s[e] - (e % 2 ? i : a)) > D) return !1;
			}
		}
		return !0;
	}
	finish(e, t, n) {
		let r = /* @__PURE__ */ new Set();
		for (let e of this.bodies) {
			let t = !1, i = !1;
			this.visitCells(e.x - this.gap, e.y - this.gap, e.item.width + this.gap * 2, e.item.height + this.gap * 2, (n) => {
				if (!i) {
					for (let r of this.cells.get(n) ?? []) if (r !== e && this.overlap(e, r) && (t = !0, this.overlap(e, r, 0))) {
						i = !0;
						break;
					}
				}
			}), t && n.unresolved++, i && r.add(e.item.index);
		}
		for (let e of this.bodies) {
			let t = e.item;
			t.left = e.x, t.top = e.y, (Math.abs(e.x - t.preferredLeft) > T || Math.abs(e.y - t.preferredTop) > T) && n.moved++;
		}
		this.previous.clear();
		for (let n = 0; n < e.length; n++) {
			let i = e[n];
			this.previous.set(i.index, {
				input: t[n],
				left: i.left,
				top: i.top,
				conflicted: r.has(i.index),
				settled: !0
			});
		}
		return this.stats = n, { ...n };
	}
	layoutSaturated(e, t) {
		let n = Math.max(64, Math.sqrt(this.viewportWidth * this.viewportHeight / 8192)), r = Math.ceil(this.viewportWidth / n) + 2, i = Math.ceil(this.viewportHeight / n) + 2, a = new Float64Array(r * i), o = r + 1, s = new Float64Array(o * (i + 1)), c = (e, t) => {
			let a = e.x - this.gap / 2, o = e.y - this.gap / 2, s = e.x + e.item.width + this.gap / 2, c = e.y + e.item.height + this.gap / 2;
			for (let e = Math.max(-1, Math.floor(o / n)); e <= Math.min(i - 2, Math.floor(c / n)); e++) for (let i = Math.max(-1, Math.floor(a / n)); i <= Math.min(r - 2, Math.floor(s / n)); i++) {
				let l = Math.max(0, Math.min(s, (i + 1) * n) - Math.max(a, i * n)) * Math.max(0, Math.min(c, (e + 1) * n) - Math.max(o, e * n)) / (n * n);
				t((e + 1) * r + i + 1, l);
			}
		}, l = (e, t) => c(e, (e, n) => {
			a[e] += t * n;
		}), u = () => {
			for (let e = 0; e < i; e++) {
				let t = 0;
				for (let n = 0; n < r; n++) t += Math.max(0, a[e * r + n]), s[(e + 1) * o + n + 1] = s[e * o + n + 1] + t;
			}
		}, d = (e, t) => {
			let a = Math.min(r - 1e-6, Math.max(0, e / n + 1)), c = Math.min(i - 1e-6, Math.max(0, t / n + 1)), l = Math.floor(a), u = Math.floor(c), d = a - l, f = c - u, p = u * o + l;
			return s[p] * (1 - d) * (1 - f) + s[p + 1] * d * (1 - f) + s[p + o] * (1 - d) * f + s[p + o + 1] * d * f;
		}, f = (e) => {
			let t = e.x - this.gap / 2, r = e.y - this.gap / 2, i = e.x + e.item.width + this.gap / 2, a = e.y + e.item.height + this.gap / 2, o = Math.max(0, d(i, a) - d(t, a) - d(i, r) + d(t, r));
			return {
				drag: this.dragged.reduce((t, n) => t + this.overlap(e, n), 0),
				overlap: o,
				movement: this.displacementCost(e) / (n * n),
				changed: this.changed(e)
			};
		};
		for (let e of this.bodies) l(e, 1);
		let p = 0;
		for (let n of [...this.bodies].reverse()) {
			let r = Math.min(e.get(n) ?? 0, 32);
			if (!r || n.fixed || !this.hasOverlap(n)) continue;
			this.remove(n), l(n, -1), u();
			let i = f(n), a = n.x, o = n.y, s = [];
			Number.isFinite(this.maxDisplacement) && s.push([n.homeX, n.homeY]);
			for (let e of this.dragged) {
				if (!t.has(n) && !this.overlap(n, e)) continue;
				let r = this.gap + E;
				s.push([e.x - n.item.width - r, o], [e.x + e.item.width + r, o], [a, e.y - n.item.height - r], [a, e.y + e.item.height + r]);
			}
			let c = r - s.length, d = Math.max(2, Math.ceil(Math.sqrt(c * this.viewportWidth / this.viewportHeight))), m = Math.max(2, Math.ceil(c / d)), h = n.item.index * .61803398875 % 1, g = n.item.index * .41421356237 % 1;
			for (let e = 0; e < c; e++) {
				let t = (e % d + h) / d * Math.max(0, this.viewportWidth - n.item.width), r = (Math.floor(e / d) + g) / m * Math.max(0, this.viewportHeight - n.item.height);
				Number.isFinite(this.maxDisplacement) && (t = n.homeX + ((e % d + h) / d * 2 - 1) * this.maxDisplacement, r = n.homeY + ((Math.floor(e / d) + g) / m * 2 - 1) * this.maxDisplacement), s.push([t, r]);
			}
			let _ = s.slice(0, r);
			e.set(n, (e.get(n) ?? 0) - _.length);
			for (let [e, t] of _) {
				n.x = e, n.y = t, this.constrain(n), p++;
				let r = f(n);
				this.betterDensity(r, i) && (i = r, a = n.x, o = n.y);
			}
			n.x = a, n.y = o, l(n, 1), this.insert(n);
		}
		return p;
	}
	interval(e, t) {
		let n = e.item, r = t === "x", i = (r ? n.width : n.height) / 2, a = r ? n.anchorX : n.anchorY, o = r ? e.y + n.height / 2 - n.anchorY : e.x + n.width / 2 - n.anchorX, s = Number.isFinite(n.maxDistance) ? Math.sqrt(Math.max(0, n.maxDistance ** 2 - o ** 2)) : Infinity, c = r ? e.y - e.homeY : e.x - e.homeX, l = Number.isFinite(this.maxDisplacement) ? Math.sqrt(Math.max(0, this.maxDisplacement ** 2 - c ** 2)) : Infinity, u = r ? e.homeX : e.homeY, d = Math.max(a - s - i, u - l), f = Math.min(a + s - i, u + l);
		if (d > f) return [e[t], e[t]];
		if (!e.keepInViewport) return [d, f];
		let p = Math.max(0, d), m = Math.min(Math.max(0, (r ? this.viewportWidth : this.viewportHeight) - 2 * i), f);
		return p <= m ? [p, m] : [e[t], e[t]];
	}
	constrain(e) {
		if (e.fixed) return;
		let t = e.x, n = e.y, r = e.item, i = Math.max(0, this.viewportWidth - r.width), a = Math.max(0, this.viewportHeight - r.height), o = [{
			x: r.anchorX - r.width / 2,
			y: r.anchorY - r.height / 2,
			r: r.maxDistance
		}, {
			x: e.homeX,
			y: e.homeY,
			r: this.maxDisplacement
		}].filter((e) => Number.isFinite(e.r)), s = (e) => {
			let r = (t, n) => (!e || t >= -1e-7 && n >= -1e-7 && t <= i + 1e-7 && n <= a + 1e-7) && o.every((e) => Math.hypot(t - e.x, n - e.y) <= e.r + 1e-7);
			if (r(t, n)) return e ? [Math.max(0, Math.min(i, t)), Math.max(0, Math.min(a, n))] : [t, n];
			let s, c = Infinity, l = (o, l) => {
				if (e && (o = Math.max(0, Math.min(i, o)), l = Math.max(0, Math.min(a, l))), !r(o, l)) return;
				let u = (o - t) ** 2 + (l - n) ** 2;
				u < c && (c = u, s = [o, l]);
			};
			if (e) {
				l(Math.max(0, Math.min(i, t)), Math.max(0, Math.min(a, n)));
				for (let e of [0, i]) for (let t of [0, a]) l(e, t);
			}
			for (let r of o) {
				let o = t - r.x, s = n - r.y, c = Math.hypot(o, s);
				if (l(r.x, r.y), c && l(r.x + o / c * r.r, r.y + s / c * r.r), e) {
					for (let e of [0, i]) {
						let t = r.r ** 2 - (e - r.x) ** 2;
						if (t >= 0) {
							let n = Math.sqrt(t);
							l(e, r.y - n), l(e, r.y + n);
						}
					}
					for (let e of [0, a]) {
						let t = r.r ** 2 - (e - r.y) ** 2;
						if (t >= 0) {
							let n = Math.sqrt(t);
							l(r.x - n, e), l(r.x + n, e);
						}
					}
				}
			}
			if (o.length === 2) {
				let e = o[0], t = o[1], n = t.x - e.x, r = t.y - e.y, i = Math.hypot(n, r);
				if (i > 0 && i <= e.r + t.r && i >= Math.abs(e.r - t.r)) {
					let a = (e.r ** 2 - t.r ** 2 + i ** 2) / (2 * i), o = Math.sqrt(Math.max(0, e.r ** 2 - a ** 2)), s = e.x + n / i * a, c = e.y + r / i * a;
					l(s - r / i * o, c + n / i * o), l(s + r / i * o, c - n / i * o);
				}
			}
			return s;
		};
		[e.x, e.y] = e.keepInViewport ? s(!0) ?? [e.startX, e.startY] : s(!1) ?? [e.homeX, e.homeY];
	}
	overlap(e, t, n = this.gap) {
		let r = Math.min(e.x + e.item.width + n, t.x + t.item.width + n) - Math.max(e.x, t.x), i = Math.min(e.y + e.item.height + n, t.y + t.item.height + n) - Math.max(e.y, t.y);
		return r > T && i > T ? r * i : 0;
	}
	hasOverlap(e) {
		let t = !1;
		return this.visitCells(e.x - this.gap, e.y - this.gap, e.item.width + this.gap * 2, e.item.height + this.gap * 2, (n) => {
			if (!t) {
				for (let r of this.cells.get(n) ?? []) if (r !== e && this.overlap(e, r)) {
					t = !0;
					break;
				}
			}
		}), t;
	}
	propagateDragPriority() {
		for (let e of this.bodies) e.dragDepth = e.fixed ? 0 : Infinity;
		let e = [...this.dragged];
		for (let t = 0; t < e.length; t++) {
			let n = e[t];
			for (let t of this.query(n.x - .5, n.y - .5, n.item.width + 1, n.item.height + 1)) {
				if (t.dragDepth <= n.dragDepth + 1) continue;
				let r = n.x < t.x + t.item.width + this.gap + .5 && t.x < n.x + n.item.width + this.gap + .5, i = n.y < t.y + t.item.height + this.gap + .5 && t.y < n.y + n.item.height + this.gap + .5;
				r && i && (t.dragDepth = n.dragDepth + 1, e.push(t));
			}
		}
	}
	separate(e, t) {
		if (!e.mobility && !t.mobility) return !1;
		let n = Infinity, r = Infinity, i = Infinity, a = "x", o = 0, s = 0;
		for (let c of ["x", "y"]) {
			let l = c === "x" ? e.item.width : e.item.height, u = c === "x" ? t.item.width : t.item.height, [d, f] = this.interval(e, c), [p, m] = this.interval(t, c);
			for (let h of [-1, 1]) {
				let g = (h === -1 ? e[c] + l + this.gap - t[c] : t[c] + u + this.gap - e[c]) + E, _ = e.mobility ? Math.max(0, h === -1 ? e[c] - d : f - e[c]) : 0, v = t.mobility ? Math.max(0, h === -1 ? m - t[c] : t[c] - p) : 0;
				if (_ + v < g) continue;
				let y = e.dragDepth < t.dragDepth ? 0 : e.mobility, b = t.dragDepth < e.dragDepth ? 0 : t.mobility;
				for (let l of [
					g,
					0,
					g * y / (y + b)
				]) {
					let u = Math.min(_, l), d = Math.min(v, g - u);
					u = Math.min(_, g - d);
					let f = c === "x" ? e.homeX : e.homeY, p = c === "x" ? t.homeX : t.homeY, m = Number(this.changed(e) || u > T) + Number(this.changed(t) || d > T), y = Number(e.dragDepth < t.dragDepth && u > T || t.dragDepth < e.dragDepth && d > T), b = u * u / (e.mobility || 1) + d * d / (t.mobility || 1) + this.distanceWeight * (((e[c] + h * u - f) ** 2 - (e[c] - f) ** 2) / (e.mobility || 1) + ((t[c] - h * d - p) ** 2 - (t[c] - p) ** 2) / (t.mobility || 1));
					(y < i || y === i && (m < r || m === r && b < n)) && (i = y, r = m, n = b, a = c, o = h * u, s = -h * d);
				}
			}
		}
		return Number.isFinite(n) ? (this.remove(e), this.remove(t), e[a] += o, t[a] += s, this.constrain(e), this.constrain(t), this.insert(e), this.insert(t), Math.abs(o) + Math.abs(s) > T) : !1;
	}
	better(e, t) {
		return e.drag === t.drag ? e.overlap === t.overlap ? e.changed === t.changed ? e.movement < t.movement - .001 : e.changed < t.changed : e.overlap < t.overlap : e.drag < t.drag;
	}
	betterDensity(e, t) {
		if (e.drag !== t.drag) return e.drag < t.drag;
		let n = e.overlap + e.movement - t.overlap - t.movement;
		return Math.abs(n) > .001 ? n < 0 : e.changed === t.changed ? e.movement < t.movement - .001 : e.changed < t.changed;
	}
	changed(e) {
		return Number(Math.abs(e.x - e.startX) > T || Math.abs(e.y - e.startY) > T);
	}
	displacementCost(e) {
		return (this.distanceWeight * ((e.x - e.homeX) ** 2 + (e.y - e.homeY) ** 2) + .15 * ((e.x - e.startX) ** 2 + (e.y - e.startY) ** 2)) / (e.mobility || 1);
	}
	localScore(e) {
		let t = {
			drag: 0,
			overlap: 0,
			movement: this.displacementCost(e),
			changed: this.changed(e)
		};
		for (let n of this.query(e.x, e.y, e.item.width, e.item.height)) if (n !== e) {
			let r = this.overlap(e, n);
			t.overlap += r, n.fixed && (t.drag += r);
		}
		return t;
	}
	measure() {
		let e = {
			drag: 0,
			overlap: 0,
			movement: 0,
			changed: 0
		};
		for (let t of this.bodies) {
			e.movement += this.displacementCost(t), e.changed += this.changed(t);
			for (let n of this.query(t.x, t.y, t.item.width, t.item.height)) if (t.item.index < n.item.index) {
				let r = this.overlap(t, n);
				e.overlap += r, (t.fixed || n.fixed) && (e.drag += r);
			}
		}
		return e;
	}
	repairSparse(e) {
		let t = 0;
		for (let n of [...this.bodies].reverse()) {
			let r = Math.min(e.get(n) ?? 0, 16);
			if (!r || n.fixed || !this.hasOverlap(n) || this.query(n.x, n.y, n.item.width, n.item.height, 32).length > 32) continue;
			this.remove(n);
			let i = this.repair(n, r, !1, 32);
			e.set(n, (e.get(n) ?? 0) - i), t += i, this.insert(n);
		}
		return t;
	}
	repair(e, t, n = !1, r = Infinity) {
		if (!t) return 0;
		let i = this.localScore(e), a = e.x, o = e.y;
		if (i.overlap === 0) return 0;
		let s = [], c = /* @__PURE__ */ new Set(), l = (n, i) => {
			if (c.size >= t * 8) return;
			let a = e.x, o = e.y;
			e.x = n, e.y = i, this.constrain(e), n = e.x, i = e.y;
			let l = `${Math.round(n * 100)}/${Math.round(i * 100)}`;
			if (c.has(l)) {
				e.x = a, e.y = o;
				return;
			}
			if (c.add(l), r !== Infinity && this.query(n, i, e.item.width, e.item.height, r).length > r) {
				e.x = a, e.y = o;
				return;
			}
			let u = this.localScore(e);
			e.x = a, e.y = o;
			let d = [
				n,
				i,
				u
			], f = s.length;
			for (s.push(d); f > 0;) {
				let e = f - 1 >> 1;
				if (!this.better(d[2], s[e][2])) break;
				s[f] = s[e], f = e;
			}
			s[f] = d;
		};
		l(e.x, e.y), l(e.item.preferredLeft, e.item.preferredTop);
		let u = 0, d = n ? Math.max(1, t - 24) : t;
		for (; s.length && u < d;) {
			let t = s[0], n = s.pop();
			if (s.length) {
				let e = 0;
				for (; e * 2 + 1 < s.length;) {
					let t = e * 2 + 1;
					if (t + 1 < s.length && this.better(s[t + 1][2], s[t][2]) && t++, !this.better(s[t][2], n[2])) break;
					s[e] = s[t], e = t;
				}
				s[e] = n;
			}
			e.x = t[0], e.y = t[1], u++;
			let r = this.localScore(e);
			if (this.better(r, i) && (i = r, a = e.x, o = e.y), r.overlap === 0) break;
			for (let t of this.query(e.x, e.y, e.item.width, e.item.height)) if (t !== e && this.overlap(e, t)) {
				let n = this.gap + E;
				l(t.x - e.item.width - n, e.y), l(t.x + t.item.width + n, e.y), l(e.x, t.y - e.item.height - n), l(e.x, t.y + t.item.height + n);
			}
		}
		if (n && i.overlap > 0) {
			let n = [];
			for (let t = 0; t <= 4; t++) for (let r = 0; r <= 4; r++) (r !== 2 || t !== 2) && n.push(Number.isFinite(this.maxDisplacement) ? [e.homeX + (r / 2 - 1) * this.maxDisplacement, e.homeY + (t / 2 - 1) * this.maxDisplacement] : [r / 4 * Math.max(0, this.viewportWidth - e.item.width), t / 4 * Math.max(0, this.viewportHeight - e.item.height)]);
			n.sort((t, n) => (t[0] - e.startX) ** 2 + (t[1] - e.startY) ** 2 - (n[0] - e.startX) ** 2 - (n[1] - e.startY) ** 2);
			for (let [r, s] of n) {
				if (u >= t) break;
				e.x = r, e.y = s, this.constrain(e), u++;
				let n = this.localScore(e);
				this.better(n, i) && (i = n, a = e.x, o = e.y);
			}
		}
		return e.x = a, e.y = o, u;
	}
	protectDrag(e) {
		let t = this.localScore(e), n = e.x, r = e.y;
		for (let i of this.dragged) {
			let a = this.gap + E;
			for (let [o, s] of [
				[i.x - e.item.width - a, r],
				[i.x + i.item.width + a, r],
				[n, i.y - e.item.height - a],
				[n, i.y + i.item.height + a]
			]) {
				e.x = o, e.y = s, this.constrain(e);
				let i = this.localScore(e);
				this.better(i, t) && (t = i, n = e.x, r = e.y);
			}
		}
		e.x = n, e.y = r;
	}
	remove(e) {
		for (let t of e.cells) this.cells.get(t)?.delete(e);
		e.cells.length = 0;
	}
	insert(e) {
		this.visitCells(e.x, e.y, e.item.width, e.item.height, (t) => {
			let n = this.cells.get(t);
			n || (n = /* @__PURE__ */ new Set(), this.cells.set(t, n)), n.add(e), e.cells.push(t);
		});
	}
	query(e, t, n, r, i = Infinity) {
		this.queryId++;
		let a = [], o = this.gap;
		return this.visitCells(e - o, t - o, n + o * 2, r + o * 2, (e) => {
			if (a.length > i) return;
			let t = this.cells.get(e);
			if (t) {
				for (let e of t) if (this.stamps.get(e) !== this.queryId && (this.stamps.set(e, this.queryId), a.push(e), a.length > i)) break;
			}
		}), a;
	}
	visitCells(e, t, n, r, i) {
		let a = Math.ceil(this.viewportWidth / w), o = Math.ceil(this.viewportHeight / w), s = Math.min(a, Math.max(-1, Math.floor(e / w))), c = Math.min(o, Math.max(-1, Math.floor(t / w))), l = Math.max(-1, Math.min(a, Math.floor((e + n) / w))), u = Math.max(-1, Math.min(o, Math.floor((t + r) / w))), d = Math.ceil(this.viewportWidth / w) + 2;
		for (let e = c; e <= u; e++) for (let t = s; t <= l; t++) i((e + 1) * d + t + 1);
	}
}, k = Object.freeze({
	...v,
	fontSize: 12,
	lineGap: 0,
	paddingTop: 4,
	paddingRight: 6,
	paddingBottom: 4,
	paddingLeft: 6
}), A = Object.freeze({
	...v,
	fontSize: 14,
	fontWeight: 700,
	lineGap: 0,
	paddingTop: 4,
	paddingRight: 6,
	paddingBottom: 4,
	paddingLeft: 6,
	showLeader: !1
});
function j(e) {
	e !== "title" && N(e);
}
function M(e) {
	let t = e.find((e) => e.key === "title");
	return t ? String(t.value ?? "").replace(/\s+/g, " ").trim() : void 0;
}
function N(e) {
	if (e !== "detailed" && e !== "compact") throw RangeError("标牌模式必须为 detailed 或 compact");
}
function P(e) {
	if (!Array.isArray(e)) throw TypeError("简标字段必须是数组");
	return e.map((e) => {
		if (!e || typeof e.key != "string" || !e.key.trim() || e.value !== null && ![
			"string",
			"number",
			"boolean"
		].includes(typeof e.value) || typeof e.value == "number" && !Number.isFinite(e.value)) throw TypeError("简标字段须包含 key 和字符串、有限数、布尔值或 null 的 value");
		return {
			key: e.key,
			value: e.value
		};
	});
}
function F(e, t, n, r = []) {
	if (t !== void 0 && typeof t != "function") throw TypeError("简标字段处理函数必须是函数");
	let i = (e.length ? e.map((e, r) => t ? t(Object.freeze({ ...e }), r, n) : e.value === null ? "—" : String(e.value)) : r).map((e) => {
		if (typeof e != "string") throw TypeError("简标字段处理函数必须返回字符串");
		return e.replace(/\s+/g, " ").trim();
	}).filter(Boolean).join(" ");
	return i ? [i] : [];
}
//#endregion
//#region src/hover.ts
var I = [
	"pointerdown",
	"pointermove",
	"pointerup",
	"pointercancel",
	"click",
	"dblclick",
	"wheel",
	"contextmenu"
], L = class {
	active;
	pointer = new l.Cartesian2();
	inside = !1;
	overToolbar = !1;
	dragging = !1;
	listeners = /* @__PURE__ */ new Map();
	element = document.createElement("div");
	pin = document.createElement("button");
	close = document.createElement("button");
	container;
	canvas;
	getCallouts;
	ownsEventTarget;
	constructor(e, t, n, r) {
		this.container = e, this.canvas = t, this.getCallouts = n, this.ownsEventTarget = r ?? ((e) => e === t), this.element.className = "target-callout-actions", this.element.setAttribute("role", "toolbar"), this.element.setAttribute("aria-label", "标牌操作"), this.element.style.cssText = "position:absolute;display:none;gap:4px;z-index:1;pointer-events:auto;align-items:center;width:36px;height:16px;transform-origin:0 0;transition:none;animation:none";
		for (let e of [this.pin, this.close]) e.type = "button", e.style.cssText = "box-sizing:border-box;flex:0 0 16px;width:16px;height:16px;padding:0;border:1px solid #8c9caf;border-radius:50%;color:white;background:#253347;cursor:pointer;font:12px/12px sans-serif;transition:none;animation:none", this.element.appendChild(e);
		this.close.textContent = "×", this.close.title = "关闭当前标牌", this.close.setAttribute("aria-label", this.close.title), this.pin.addEventListener("click", this.togglePin), this.close.addEventListener("click", this.hide);
		for (let e of I) this.element.addEventListener(e, this.stopToolbarPropagation);
		this.container.appendChild(this.element), e.addEventListener("pointermove", this.move, !0), e.addEventListener("pointerleave", this.leave), e.addEventListener("pointerdown", this.down, !0), window.addEventListener("pointerup", this.up, !0), window.addEventListener("pointercancel", this.up, !0), e.addEventListener("lostpointercapture", this.up, !0), window.addEventListener("blur", this.leave);
	}
	on(e, t) {
		let n = this.listeners.get(e);
		return n || (n = /* @__PURE__ */ new Set(), this.listeners.set(e, n)), n.add(t), () => {
			n.delete(t);
		};
	}
	emit(e, t, n) {
		let r = {
			type: e,
			callout: t,
			properties: t.getProperties(),
			originalEvent: n
		};
		this.listeners.get(e)?.forEach((t) => {
			try {
				t(r);
			} catch (t) {
				console.error(`TargetCalloutHoverController ${e}:`, t);
			}
		});
	}
	stopToolbarPropagation = (e) => {
		e.stopPropagation();
	};
	select(e, t) {
		if (e === this.active) return;
		let n = this.active;
		this.active = e, n && this.emit("mouseleave", n, t), e && this.emit("mouseenter", e, t);
	}
	move = (e) => {
		this.overToolbar = this.element.contains(e.target), this.inside = this.ownsEventTarget(e.target) || this.overToolbar;
		let t = this.canvas.getBoundingClientRect();
		if (t.width <= 0 || t.height <= 0 || this.canvas.clientWidth <= 0 || this.canvas.clientHeight <= 0) {
			this.leave();
			return;
		}
		this.pointer.x = (e.clientX - t.left) * this.canvas.clientWidth / t.width, this.pointer.y = (e.clientY - t.top) * this.canvas.clientHeight / t.height, this.update(e), this.active && this.emit("mousemove", this.active, e);
	};
	down = (e) => {
		!this.element.contains(e.target) && this.ownsEventTarget(e.target) && (this.dragging = !0, this.update(e));
	};
	up = () => {
		this.dragging = !1, this.update();
	};
	leave = () => {
		this.inside = !1, this.overToolbar = !1, this.dragging = !1, this.select(void 0), this.element.style.display = "none";
	};
	hasActions(e) {
		return e?.getDisplayMode() === "detailed" && e.getRenderedDisplayMode() === "detailed" && e.getScreenBounds().visible;
	}
	hide = (e) => {
		let t = this.active;
		if (!this.hasActions(t)) {
			this.update();
			return;
		}
		t.setShow(!1), this.emit("close", t, e), this.leave();
	};
	togglePin = (e) => {
		let t = this.active;
		this.hasActions(t) && t.setScreenFixed(!t.isScreenFixed()) && this.emit("fixedchange", t, e), this.update();
	};
	update(e) {
		let t;
		if (this.inside && !this.dragging) {
			let e = this.getCallouts();
			if (!e.some((e) => e.isDragging())) {
				if (this.overToolbar && this.hasActions(this.active)) t = this.active;
				else for (let n = e.length - 1; n >= 0; n--) if (e[n].hitTest(this.pointer)) {
					t = e[n];
					break;
				}
			}
		}
		if (this.select(t, e), !this.hasActions(t)) {
			this.element.style.display = "none", this.overToolbar = !1;
			return;
		}
		this.element.style.display = "flex";
		let n = t.getActionBounds();
		if (!n.visible || n.width <= 0 || n.height <= 0) {
			this.element.style.display = "none", this.overToolbar = !1;
			return;
		}
		let r = this.canvas.getBoundingClientRect(), i = this.element.offsetParent, a = i?.getBoundingClientRect(), o = this.canvas.clientWidth ? r.width / this.canvas.clientWidth : 1, s = this.canvas.clientHeight ? r.height / this.canvas.clientHeight : 1, c = i?.offsetWidth && a ? a.width / i.offsetWidth : 1, l = i?.offsetHeight && a ? a.height / i.offsetHeight : 1;
		this.element.style.transform = `scale(${o / c},${s / l})`, this.element.style.left = `${(r.left - (a?.left ?? 0) + n.left * o) / c - (i?.clientLeft ?? 0) + (i?.scrollLeft ?? window.scrollX)}px`, this.element.style.top = `${(r.top - (a?.top ?? 0) + n.top * s) / l - (i?.clientTop ?? 0) + (i?.scrollTop ?? window.scrollY)}px`, this.pin.textContent = t.isScreenFixed() ? "◇" : "◆", this.pin.title = t.isScreenFixed() ? "取消固定" : "固定到屏幕", this.pin.setAttribute("aria-label", this.pin.title), this.pin.setAttribute("aria-pressed", String(t.isScreenFixed()));
	}
	destroy() {
		this.container.removeEventListener("pointermove", this.move, !0), this.container.removeEventListener("pointerleave", this.leave), this.container.removeEventListener("pointerdown", this.down, !0), window.removeEventListener("pointerup", this.up, !0), window.removeEventListener("pointercancel", this.up, !0), this.container.removeEventListener("lostpointercapture", this.up, !0), window.removeEventListener("blur", this.leave), this.pin.removeEventListener("click", this.togglePin), this.close.removeEventListener("click", this.hide);
		for (let e of I) this.element.removeEventListener(e, this.stopToolbarPropagation);
		this.element.remove(), this.listeners.clear(), this.active = void 0;
	}
}, R = "\nprecision highp float;\nin vec2 aCorner;\nin vec2 aTargetKind;\nin vec2 aOffset;\nin vec2 aAxisX;\nin vec2 aAxisY;\nin vec4 aUV;\nin vec4 aColor;\nuniform sampler2D uTargets;\nuniform vec2 uViewport;\nuniform vec3 uTextRendering;\nout vec2 vUV;\nout vec4 vColor;\nflat out float vGlyph;\nflat out float vLeader;\nvoid main(){\n  vec2 q=aCorner;\n  int id=int(aTargetKind.x);\n  vec4 target=texelFetch(uTargets,ivec2(id,0),0);\n  vec4 panel=texelFetch(uTargets,ivec2(id,1),0);\n  vec2 pixel;\n  if(aTargetKind.y>.5 && aTargetKind.y<1.5){\n    vec2 end=panel.xy;\n    vec2 c=panel.xy-vec2(0.,panel.w);\n    if(dot(c,c)<dot(end,end))end=c;\n    c=panel.xy+vec2(panel.z,-panel.w); if(dot(c,c)<dot(end,end))end=c;\n    c=panel.xy+vec2(panel.z,0.); if(dot(c,c)<dot(end,end))end=c;\n    vec2 n=vec2(-end.y,end.x)/max(length(end),.0001);\n    pixel=target.xy+end*q.x+n*(2.*q.y-1.);\n  }else{\n    vec2 origin=target.xy+panel.xy-vec2(0.,panel.w)+aOffset;\n    if(aTargetKind.y>1.5 && uTextRendering.z>.5){\n      vec2 ratio=czm_viewport.zw/uViewport;\n      vec2 snappedOrigin=floor(origin*ratio+.5)/ratio;\n      vec2 snappedX=floor((origin+aAxisX)*ratio+.5)/ratio-snappedOrigin;\n      vec2 snappedY=floor((origin+aAxisY)*ratio+.5)/ratio-snappedOrigin;\n      pixel=snappedOrigin+snappedX*q.x+snappedY*q.y;\n    }else{\n      pixel=origin+aAxisX*q.x+aAxisY*q.y;\n    }\n  }\n  // Reconstruct depth with the projection for Cesium's current frustum.\n  vec4 clip=czm_projection*vec4(0.,0.,-max(target.w,.001),1.);\n  clip.xy=vec2(pixel.x/uViewport.x*2.-1.,1.-pixel.y/uViewport.y*2.)*clip.w;\n  gl_Position=target.z>.5 ? clip : vec4(2.*clip.w,2.*clip.w,clip.z,clip.w);\n  czm_vertexLogDepth();\n  vUV=aUV.xy+aUV.zw*q; vColor=aColor; vGlyph=step(1.5,aTargetKind.y);\n  vLeader=aTargetKind.y>.5 && aTargetKind.y<1.5 ? 1. : 0.;\n}", ee = "\nprecision highp float;\nuniform sampler2D uAtlas;\nuniform vec3 uTextRendering;\nin vec2 vUV;\nin vec4 vColor;\nflat in float vGlyph;\nflat in float vLeader;\nuniform float uLeaderPass;\n\nvoid main(){\n  if(abs(vLeader-uLeaderPass)>.5)discard;\n  vec4 sampleValue=texture(uAtlas,vUV);\n  float coverage=sampleValue.a;\n  if(vGlyph>.5){\n    float gradient=max(fwidth(sampleValue.r),1./255.);\n    float edge=max(gradient*uTextRendering.x,.00001);\n    // A small subpixel coverage correction preserves thin strokes at small sizes.\n    float contour=.5-gradient*uTextRendering.y;\n    coverage=smoothstep(contour-edge,contour+edge,sampleValue.r);\n  }\n  float alpha=vColor.a*coverage;\n  if(alpha<.003)discard;\n  out_FragColor=vec4(vColor.rgb,alpha);czm_writeLogDepth();\n}", te = l, z = Object.freeze({
	smoothing: .18,
	weight: .06,
	pixelSnap: !0
}), B = te, V = B.Pass.CESIUM_3D_TILE_EDGES_DIRECT;
function H() {
	return {
		options: { ...S },
		layout: new O(),
		items: [],
		stats: {
			unresolved: 0,
			moved: 0,
			candidateChecks: 0
		}
	};
}
var U = class {
	context;
	program;
	leaderCommand;
	buffer;
	vao;
	panelVao;
	panelStart = -1;
	corners;
	atlas;
	targets;
	targetData;
	capacity = 0;
	count = 0;
	targetCount;
	vp = new l.Matrix4();
	matrix = Array(16);
	camera = [
		0,
		0,
		0
	];
	offset = new l.Cartesian2();
	previousOffset = new l.Cartesian2();
	previousPreference = new l.Cartesian2();
	viewport = new l.Cartesian2();
	textRendering = new l.Cartesian3(z.smoothing, z.weight, 1);
	sizes = /* @__PURE__ */ new Float32Array();
	enabled = /* @__PURE__ */ new Uint8Array();
	pendingPresentation;
	boundsDirty = !0;
	positionsVersion;
	avoidanceGroups = {
		detailed: H(),
		compact: H()
	};
	avoidanceItems = [];
	command;
	destroyed = !1;
	scene;
	primitive;
	visibleCount = 0;
	setAvoidance(e, t) {
		t !== void 0 && N(t);
		let n = (t ? [t] : ["detailed", "compact"]).map((t) => ({
			group: this.avoidanceGroups[t],
			next: C(e, this.avoidanceGroups[t].options)
		}));
		for (let { group: e, next: t } of n) Object.keys(t).every((n) => t[n] === e.options[n]) || (t.enabled !== e.options.enabled && e.layout.clear(), e.options = t, e.stats = {
			unresolved: 0,
			moved: 0,
			candidateChecks: 0
		}, this.scene.requestRender());
	}
	getAvoidance(e = "detailed") {
		return N(e), { ...this.avoidanceGroups[e].options };
	}
	getAvoidanceStats(e) {
		if (e !== void 0) return N(e), { ...this.avoidanceGroups[e].stats };
		let t = this.avoidanceGroups.detailed.stats, n = this.avoidanceGroups.compact.stats;
		return {
			unresolved: t.unresolved + n.unresolved,
			moved: t.moved + n.moved,
			candidateChecks: t.candidateChecks + n.candidateChecks
		};
	}
	setTextRendering(e) {
		e.smoothing !== void 0 && Number.isFinite(e.smoothing) && (this.textRendering.x = l.Math.clamp(e.smoothing, 0, 1.5)), e.weight !== void 0 && Number.isFinite(e.weight) && (this.textRendering.y = l.Math.clamp(e.weight, -.5, .5)), e.pixelSnap !== void 0 && (this.textRendering.z = +!!e.pixelSnap);
	}
	getTextRendering() {
		return {
			smoothing: this.textRendering.x,
			weight: this.textRendering.y,
			pixelSnap: this.textRendering.z === 1
		};
	}
	constructor(e, t, n, r) {
		if (V === void 0) throw Error("当前 Cesium 缺少标牌需要的有序绘制阶段");
		let i = e.context;
		if (!i.webgl2) throw Error("批量标牌需要 WebGL2");
		if (!Number.isInteger(t) || t < 1 || t > i._gl.getParameter(i._gl.MAX_TEXTURE_SIZE)) throw RangeError("目标数量必须在 1 与当前 GPU 最大纹理宽度之间");
		this.scene = e, this.context = e.context, this.targetCount = t, this.targetData = new Float32Array(t * 8);
		try {
			this.corners = B.Buffer.createVertexBuffer({
				context: this.context,
				typedArray: new Float32Array([
					0,
					0,
					1,
					0,
					0,
					1,
					1,
					1
				]),
				usage: B.BufferUsage.STATIC_DRAW
			}), this.corners.vertexArrayDestroyable = !1, this.program = B.ShaderProgram.fromCache({
				context: this.context,
				vertexShaderSource: new B.ShaderSource({ sources: [R] }),
				fragmentShaderSource: new B.ShaderSource({ sources: [ee] }),
				attributeLocations: {
					aTargetKind: 1,
					aOffset: 2,
					aAxisX: 3,
					aAxisY: 4,
					aUV: 5,
					aColor: 6,
					aCorner: 0
				}
			}), this.atlas = new B.Texture({
				context: this.context,
				flipY: !1,
				source: {
					width: 1,
					height: 1,
					arrayBufferView: new Uint8Array([
						255,
						255,
						255,
						255
					])
				}
			}), this.targets = new B.Texture({
				context: this.context,
				pixelFormat: l.PixelFormat.RGBA,
				pixelDatatype: l.PixelDatatype.FLOAT,
				flipY: !1,
				sampler: new B.Sampler({
					minificationFilter: l.TextureMinificationFilter.NEAREST,
					magnificationFilter: l.TextureMagnificationFilter.NEAREST
				}),
				source: {
					width: t,
					height: 2,
					arrayBufferView: this.targetData
				}
			}), this.primitive = {
				update: (t) => {
					!t.passes.render || this.destroyed || !this.sizes.length || (this.visibleCount = this.draw(e, n(), r()), this.visibleCount && this.count && this.command && this.leaderCommand && (this.leaderCommand.instanceCount && t.commandList.push(this.leaderCommand), this.command.instanceCount && t.commandList.push(this.command)));
				},
				isDestroyed: () => this.destroyed,
				destroy: () => this.release()
			}, e.primitives.add(this.primitive);
		} catch (e) {
			throw this.release(), e;
		}
	}
	update(e, t, n) {
		if (this.boundsDirty = !0, e.unchanged) {
			this.enabled = t;
			return;
		}
		let r = e.count * 64, i = e.leaderCount ?? e.count, a = e.leaderCount === void 0 ? e.count : e.count - i, o = a && e.leaderCount !== void 0 ? i : 0;
		if (r > this.capacity && (this.vao?.destroy(), this.vao = void 0, this.panelVao?.destroy(), this.panelVao = void 0, this.buffer?.destroy(), this.buffer = void 0, this.panelStart = -1, this.capacity = 2 ** Math.ceil(Math.log2(Math.max(64, r))), this.buffer = B.Buffer.createVertexBuffer({
			context: this.context,
			sizeInBytes: this.capacity,
			usage: B.BufferUsage.DYNAMIC_DRAW
		}), this.buffer.vertexArrayDestroyable = !1, this.vao = this.createVertexArray(0), this.command = new B.DrawCommand({
			owner: this,
			vertexArray: this.vao,
			shaderProgram: this.program,
			renderState: B.RenderState.fromCache({
				depthTest: { enabled: !0 },
				depthMask: !1,
				cull: { enabled: !1 },
				blending: l.BlendingState.ALPHA_BLEND
			}),
			primitiveType: l.PrimitiveType.TRIANGLE_STRIP,
			pass: V,
			count: 4,
			instanceCount: e.count,
			boundingVolume: new l.BoundingSphere(),
			modelMatrix: l.Matrix4.IDENTITY,
			uniformMap: {
				uAtlas: () => this.atlas,
				uTargets: () => this.targets,
				uViewport: () => this.viewport,
				uTextRendering: () => this.textRendering,
				uLeaderPass: () => 0
			}
		}), this.command.cull = !1, this.leaderCommand = new B.DrawCommand({
			owner: this,
			vertexArray: this.vao,
			shaderProgram: this.program,
			renderState: B.RenderState.fromCache({
				depthTest: { enabled: !0 },
				depthMask: !1,
				cull: { enabled: !1 },
				blending: l.BlendingState.ALPHA_BLEND
			}),
			primitiveType: l.PrimitiveType.TRIANGLE_STRIP,
			pass: V,
			count: 4,
			instanceCount: e.count,
			boundingVolume: this.command.boundingVolume,
			modelMatrix: l.Matrix4.IDENTITY,
			uniformMap: {
				uAtlas: () => this.atlas,
				uTargets: () => this.targets,
				uViewport: () => this.viewport,
				uTextRendering: () => this.textRendering,
				uLeaderPass: () => 1
			}
		}), this.leaderCommand.cull = !1), this.command && o !== this.panelStart && (this.panelVao?.destroy(), this.panelVao = void 0, this.panelVao = this.createVertexArray(o), this.panelStart = o, this.command.vertexArray = this.panelVao), r && this.buffer.copyFromArrayView(e.instances.subarray(0, e.count * 16)), e.atlas) try {
			let t = new B.Texture({
				context: this.context,
				flipY: !1,
				source: e.atlas
			});
			this.atlas.destroy(), this.atlas = t;
		} finally {
			e.atlas.close();
		}
		this.count = e.count, this.sizes = e.sizes, this.enabled = t, this.pendingPresentation = {
			displayModes: n,
			actionRects: e.actionRects
		}, this.command && (this.command.instanceCount = a), this.leaderCommand && (this.leaderCommand.instanceCount = i);
	}
	createVertexArray(e) {
		let t = e * 16, n = [
			2,
			2,
			2,
			2,
			4,
			4
		].map((e, n) => {
			let r = {
				index: n + 1,
				vertexBuffer: this.buffer,
				componentsPerAttribute: e,
				componentDatatype: l.ComponentDatatype.FLOAT,
				offsetInBytes: t * 4,
				strideInBytes: 64,
				instanceDivisor: 1
			};
			return t += e, r;
		});
		return new B.VertexArray({
			context: this.context,
			attributes: [...n, {
				index: 0,
				vertexBuffer: this.corners,
				componentsPerAttribute: 2,
				componentDatatype: l.ComponentDatatype.FLOAT
			}]
		});
	}
	draw(t, r, i) {
		let a = t.canvas.clientWidth, o = t.canvas.clientHeight;
		if (this.viewport.x = a, this.viewport.y = o, !this.sizes.length || !a || !o) return 0;
		this.pendingPresentation &&= (r.displayModes = this.pendingPresentation.displayModes, r.actionRects = this.pendingPresentation.actionRects, void 0), l.Matrix4.multiply(t.camera.frustum.projectionMatrix, t.camera.viewMatrix, this.vp), l.Matrix4.toArray(this.vp, this.matrix);
		let s = t.camera.positionWC;
		this.camera[0] = s.x, this.camera[1] = s.y, this.camera[2] = s.z;
		let c = this.matrix, u = r.positions, d = r.bounds, f = this.targetData, p = t.camera.viewMatrix, m = this.avoidanceGroups ? Object.values(this.avoidanceGroups) : [];
		for (let e of m) e.items.length = 0;
		let h = i.some((e) => e.isDragging()), g = 0;
		for (let r = 0; r < this.targetCount; r++) {
			let s = u[r * 3], m = u[r * 3 + 1], h = u[r * 3 + 2], g = r * 4, _ = r * 5, v = c[3] * s + c[7] * m + c[11] * h + c[15], y = v === 0 ? 0 : ((c[0] * s + c[4] * m + c[8] * h + c[12]) / v + 1) * a / 2, b = v === 0 ? 0 : (1 - (c[1] * s + c[5] * m + c[9] * h + c[13]) / v) * o / 2, x = i[r].getShow() && !!this.enabled[r] && t.mode === l.SceneMode.SCENE3D && Number.isFinite(y) && Number.isFinite(b) && e(s, m, h, c, this.camera, !1);
			f[g] = y, f[g + 1] = b, f[g + 2] = Number(x), f[g + 3] = -(p[2] * s + p[6] * m + p[10] * h + p[14]), d[_] = y, d[_ + 1] = b, d[_ + 2] = this.sizes[r * 2], d[_ + 3] = this.sizes[r * 2 + 1], i[r].getOffset(this.previousOffset), i[r].getPreferredOffset(this.previousPreference);
			let S = this.previousOffset.x - this.previousPreference.x, C = this.previousOffset.y - this.previousPreference.y;
			i[r].resolveScreenOffset(y, b, this.offset);
			let w = x && (n(y, b, y + this.offset.x + S, b + this.offset.y + C - d[_ + 3], d[_ + 2], d[_ + 3], a, o) || n(y, b, y + this.offset.x, b + this.offset.y - d[_ + 3], d[_ + 2], d[_ + 3], a, o));
			d[_ + 4] = Number(w);
			let T = this.targetCount * 4 + g;
			f[T] = this.offset.x, f[T + 1] = this.offset.y, f[T + 2] = d[_ + 2], f[T + 3] = d[_ + 3];
			let E = this.avoidanceGroups?.[i[r].getRenderedDisplayMode()];
			if (E?.options.enabled) {
				let e = this.avoidanceItems[r] ??= {};
				e.index = r, e.visible = w, e.anchorX = y, e.anchorY = b, e.width = d[_ + 2], e.height = d[_ + 3], e.preferredLeft = y + this.offset.x, e.preferredTop = b + this.offset.y - e.height, e.maxDistance = i[r].getMaxOffsetDistance(), e.dragging = i[r].isDragging(), e.priority = i[r].getAvoidancePriority(), E.items.push(e);
			}
		}
		for (let e of m) if (e.options.enabled) {
			e.stats = e.layout.layout(e.items, a, o, e.options, h);
			for (let t of e.items) {
				let e = t.left - t.anchorX, n = t.top + t.height - t.anchorY;
				i[t.index].applyAvoidanceOffset(e, n);
				let r = this.targetCount * 4 + t.index * 4;
				f[r] = e, f[r + 1] = n;
			}
		}
		for (let e = 0; e < this.targetCount; e++) {
			let t = e * 4, r = e * 5, i = this.targetCount * 4 + t, s = !!f[t + 2] && n(f[t], f[t + 1], f[t] + f[i], f[t + 1] + f[i + 1] - f[i + 3], f[i + 2], f[i + 3], a, o);
			f[t + 2] = d[r + 4] = Number(s), s && g++;
		}
		return this.command && (this.boundsDirty || r.positionsVersion === void 0 || r.positionsVersion !== this.positionsVersion) && (l.BoundingSphere.fromVertices(u, l.Cartesian3.ZERO, 3, this.command.boundingVolume), this.boundsDirty = !1, this.positionsVersion = r.positionsVersion), this.targets.copyFrom({ source: {
			width: this.targetCount,
			height: 2,
			arrayBufferView: f
		} }), g;
	}
	isDestroyed() {
		return this.destroyed;
	}
	destroy() {
		this.destroyed || (this.scene.primitives.contains(this.primitive) && this.scene.primitives.remove(this.primitive), this.release());
	}
	release() {
		if (!this.destroyed) {
			this.destroyed = !0, this.vao?.destroy(), this.panelVao?.destroy(), this.buffer && !this.buffer.isDestroyed() && this.buffer.destroy(), this.corners?.destroy(), this.atlas?.destroy(), this.targets?.destroy(), this.program?.destroy(), this.targetData = /* @__PURE__ */ new Float32Array(), this.sizes = /* @__PURE__ */ new Float32Array(), this.enabled = /* @__PURE__ */ new Uint8Array(), this.count = 0, this.pendingPresentation = void 0, this.visibleCount = 0;
			for (let e of Object.values(this.avoidanceGroups)) e.layout.clear(), e.items.length = 0;
			this.avoidanceItems.length = 0;
		}
	}
};
//#endregion
//#region src/validation.ts
function W(e) {
	if (![
		e.x,
		e.y,
		e.z
	].every(Number.isFinite)) throw RangeError("目标 ECEF 坐标必须是有限数");
}
function G(e) {
	if (!Array.isArray(e) || e.length > 6 || e.some((e) => typeof e != "string")) throw RangeError("标牌最多支持六行字符串");
}
function K(e) {
	if (typeof e != "string") throw TypeError("标牌 title 必须是字符串");
	return e.replace(/\s+/g, " ").trim();
}
function q(e) {
	if (typeof e != "string" || !/^[a-z]$/i.test(e.trim())) throw RangeError("标牌字母须为单个英文字母 A–Z");
	return e.trim().toUpperCase();
}
function J(e = Infinity) {
	if (e !== Infinity && (!Number.isFinite(e) || e < 0)) throw RangeError("最大偏移距离必须是非负有限数或 Infinity");
	return e;
}
function Y(e) {
	for (let t of [
		e.leaderColor,
		e.borderColor,
		e.textColor,
		e.backgroundColor,
		e.badgeColor,
		e.badgeTextColor
	]) if (typeof t != "string" || !d.fromCssColorString(t)) throw RangeError("无效颜色：" + t);
	if (!Number.isFinite(e.fontSize) || e.fontSize < 8 || e.fontSize > 48) throw RangeError("文字大小须为 8–48px");
	for (let t of [
		e.lineGap,
		e.paddingTop,
		e.paddingRight,
		e.paddingBottom,
		e.paddingLeft
	]) if (!Number.isFinite(t) || t < 0 || t > 200) throw RangeError("行间距和内边距须为 0–200px");
	if (![
		"normal",
		"bold",
		"italic",
		"bold italic"
	].includes(e.fontStyle) || typeof e.fontFamily != "string" || !e.fontFamily.trim()) throw RangeError("无效文字样式");
	if (![
		100,
		200,
		300,
		400,
		500,
		600,
		700,
		800,
		900
	].includes(e.fontWeight)) throw RangeError("文字粗细须为 100–900 的整百数");
	if (typeof e.showBorder != "boolean" || typeof e.showLeader != "boolean") throw TypeError("显隐配置必须是布尔值");
	return e;
}
//#endregion
//#region src/workerHandle.ts
var X = class e {
	static dragSequence = 0;
	index;
	id;
	frame;
	change;
	styles = {
		detailed: { ...v },
		compact: { ...k },
		title: { ...A }
	};
	title = "";
	badgeText = "A";
	displayMode = "detailed";
	fields = [];
	sourceLines = [];
	compactLines = [];
	compactFieldFormatter;
	offset = new l.Cartesian2(80, -80);
	displayOffset = new l.Cartesian2(80, -80);
	dragOrder = 0;
	maxOffsetDistance = Infinity;
	fixedScreenPosition;
	dragScreenPosition;
	show = !0;
	options;
	constructor(e, t, n, r = {}) {
		this.index = e, this.frame = t, this.change = n, this.id = r.id ?? e, this.options = r, this.compactFieldFormatter = r.compactFieldFormatter;
	}
	getStyle(e = this.displayMode) {
		return j(e), { ...this.styles[e] };
	}
	setStyle(e, t = this.displayMode) {
		this.options.ensureAlive?.(), j(t);
		let n = Y({
			...this.styles[t],
			...e
		});
		Object.keys(n).every((e) => n[e] === this.styles[t][e]) || (this.styles[t] = n, t === "title" ? this.change({
			index: this.index,
			titleStyle: { ...n }
		}) : t === this.displayMode && this.change({
			index: this.index,
			style: { ...n }
		}));
	}
	getTitle() {
		return this.title;
	}
	setTitle(e) {
		this.options.ensureAlive?.();
		let t = K(e);
		t !== this.title && (this.title = t, this.change({
			index: this.index,
			title: t
		}));
	}
	getBadgeText() {
		return this.badgeText;
	}
	setBadgeText(e) {
		this.options.ensureAlive?.();
		let t = q(e);
		t !== this.badgeText && (this.badgeText = t, this.change({
			index: this.index,
			badgeText: t
		}));
	}
	getDisplayMode() {
		return this.displayMode;
	}
	getRenderedDisplayMode() {
		return this.frame().displayModes?.[this.index] === 1 ? "compact" : "detailed";
	}
	setDisplayMode(e) {
		this.options.ensureAlive?.(), N(e), e !== this.displayMode && (this.displayMode = e, this.change({
			index: this.index,
			displayMode: e,
			style: this.getStyle()
		}), this.options.onDisplayModeChange?.(this));
	}
	toggleDisplayMode() {
		this.setDisplayMode(this.displayMode === "detailed" ? "compact" : "detailed");
	}
	getFields() {
		return this.fields.map((e) => ({ ...e }));
	}
	prepareContent(e, t = this.sourceLines) {
		G(t);
		let n = P(e ?? this.fields);
		return {
			fields: n,
			sourceLines: [...t],
			compactLines: F(n, this.compactFieldFormatter, this.id, t),
			title: e === void 0 ? void 0 : M(n)
		};
	}
	applyContent(e) {
		this.fields = e.fields, this.sourceLines = e.sourceLines, e.title !== void 0 && this.setTitle(e.title);
		let t = e.compactLines.length !== this.compactLines.length || e.compactLines.some((e, t) => e !== this.compactLines[t]);
		this.compactLines = e.compactLines, t && this.change({
			index: this.index,
			compactLines: [...this.compactLines]
		});
	}
	setFields(e) {
		this.options.ensureAlive?.(), this.applyContent(this.prepareContent(e));
	}
	setCompactFieldFormatter(e) {
		this.options.ensureAlive?.();
		let t = F(this.fields, e, this.id, this.sourceLines);
		this.compactFieldFormatter = e, this.applyContent({
			fields: this.fields,
			sourceLines: this.sourceLines,
			compactLines: t
		});
	}
	getOffset(e = new l.Cartesian2()) {
		return l.Cartesian2.clone(this.displayOffset, e);
	}
	getPreferredOffset(e = new l.Cartesian2()) {
		return l.Cartesian2.clone(this.offset, e);
	}
	isDragging() {
		return this.dragScreenPosition !== void 0;
	}
	getAvoidancePriority() {
		return this.dragOrder ? this.dragOrder + 1 : Number(this.isScreenFixed());
	}
	applyAvoidanceOffset(e, t) {
		this.displayOffset.x = e, this.displayOffset.y = t;
	}
	getMaxOffsetDistance() {
		return this.maxOffsetDistance;
	}
	setMaxOffsetDistance(e = Infinity) {
		this.options.ensureAlive?.(), J(e), e !== this.maxOffsetDistance && (this.maxOffsetDistance = e, this.setOffset(l.Cartesian2.clone(this.offset)), this.options.requestRender?.());
	}
	isScreenFixed() {
		return this.fixedScreenPosition !== void 0;
	}
	setScreenFixed(e) {
		if (this.options.ensureAlive?.(), e === this.isScreenFixed()) return !0;
		let t = this.frame().bounds, n = this.index * 5;
		if (e) {
			if (!this.show || !t[n + 4]) return !1;
			this.fixedScreenPosition = new l.Cartesian2(t[n] + this.displayOffset.x, t[n + 1] + this.displayOffset.y), l.Cartesian2.clone(this.displayOffset, this.offset);
		} else l.Cartesian2.clone(this.displayOffset, this.offset), this.fixedScreenPosition = void 0;
		return this.options.requestRender?.(), !0;
	}
	resolveScreenOffset(e, t, n = this.offset) {
		let r = this.dragScreenPosition ?? this.fixedScreenPosition;
		return r && (this.offset.x = r.x - e, this.offset.y = r.y - t), this.clampOffset(this.offset), l.Cartesian2.clone(this.offset, this.displayOffset), l.Cartesian2.clone(this.offset, n);
	}
	setDragScreenPosition(t) {
		if (t) this.dragScreenPosition || (this.dragOrder = ++e.dragSequence), this.dragScreenPosition = l.Cartesian2.clone(t, this.dragScreenPosition);
		else if (this.dragScreenPosition) {
			let e = this.frame().bounds, t = this.index * 5;
			this.resolveScreenOffset(e[t], e[t + 1]), this.fixedScreenPosition && (this.fixedScreenPosition.x = e[t] + this.offset.x, this.fixedScreenPosition.y = e[t + 1] + this.offset.y), this.dragScreenPosition = void 0;
		}
		this.options.requestRender?.();
	}
	setOffset(e) {
		if (this.options.ensureAlive?.(), !Number.isFinite(e.x) || !Number.isFinite(e.y)) throw RangeError("偏移必须是有限数");
		let t = l.Cartesian2.clone(e);
		this.clampOffset(t);
		let n = t.x, r = t.y;
		if (!(n === this.offset.x && r === this.offset.y && n === this.displayOffset.x && r === this.displayOffset.y)) {
			if (this.offset.x = n, this.offset.y = r, l.Cartesian2.clone(this.offset, this.displayOffset), this.fixedScreenPosition) {
				let e = this.frame().bounds, t = this.index * 5;
				this.fixedScreenPosition.x = e[t] + n, this.fixedScreenPosition.y = e[t + 1] + r;
			}
			this.change({
				index: this.index,
				x: n,
				y: r
			});
		}
	}
	setDistance(e) {
		if (!Number.isFinite(e) || e < 0) throw RangeError("距离必须是非负有限数");
		this.setOffset(new l.Cartesian2(e / Math.SQRT2, -e / Math.SQRT2));
	}
	setPosition(e) {
		this.options.ensureAlive?.(), W(e), this.change({
			index: this.index,
			position: [
				e.x,
				e.y,
				e.z
			]
		});
	}
	setLines(e) {
		this.options.ensureAlive?.(), G(e), this.change({
			index: this.index,
			lines: [...e]
		});
	}
	resetOverrides(e = ["position", "lines"]) {
		if (this.options.ensureAlive?.(), e.some((e) => e !== "position" && e !== "lines")) throw RangeError("无效覆写字段");
		if (!e.length) return;
		let t = { index: this.index };
		for (let n of e) t[n] = null;
		this.change(t);
	}
	setShow(e) {
		if (this.options.ensureAlive?.(), typeof e != "boolean") throw TypeError("show 必须是布尔值");
		e !== this.show && (this.show = e, this.change({
			index: this.index,
			show: e
		}));
	}
	getShow() {
		return this.show;
	}
	getScreenBounds() {
		let e = this.frame().bounds, t = this.index * 5;
		return {
			left: e[t] + this.displayOffset.x,
			top: e[t + 1] + this.displayOffset.y - e[t + 3],
			width: e[t + 2],
			height: e[t + 3],
			visible: this.show && !!e[t + 4]
		};
	}
	getActionBounds() {
		let e = this.getScreenBounds(), t = this.frame().actionRects, n = this.index * 4, r = t ? t[n + 2] : 36, i = t ? t[n + 3] : 16;
		return {
			left: e.left + (t ? t[n] : Math.max(0, e.width - r)),
			top: e.top + (t ? t[n + 1] : 0),
			width: r,
			height: i,
			visible: e.visible && this.getRenderedDisplayMode() === "detailed" && r > 0 && i > 0
		};
	}
	getProperties() {
		return {
			id: this.id,
			index: this.index,
			position: this.getPosition(),
			offset: this.getOffset(),
			maxOffsetDistance: this.maxOffsetDistance,
			style: this.getStyle(),
			titleStyle: this.getStyle("title"),
			title: this.title,
			badgeText: this.badgeText,
			displayMode: this.displayMode,
			fields: this.getFields(),
			screenFixed: this.isScreenFixed(),
			show: this.show,
			bounds: this.getScreenBounds()
		};
	}
	getPosition(e = new l.Cartesian3()) {
		let t = this.frame().positions, n = this.index * 3;
		return l.Cartesian3.fromElements(t[n], t[n + 1], t[n + 2], e);
	}
	getTargetScreenPosition(e = new l.Cartesian2()) {
		let t = this.frame().bounds, n = this.index * 5;
		return t[n + 4] ? l.Cartesian2.fromElements(t[n], t[n + 1], e) : void 0;
	}
	hitTest(e) {
		let t = this.frame().bounds, n = this.index * 5, r = t[n] + this.displayOffset.x, i = t[n + 1] + this.displayOffset.y;
		return this.show && !!t[n + 4] && e.x >= r && e.x <= r + t[n + 2] && e.y >= i - t[n + 3] && e.y <= i;
	}
	clampOffset(e) {
		if (this.maxOffsetDistance === Infinity) return;
		let t = this.frame().bounds, n = this.index * 5, r = t[n + 2] / 2, i = t[n + 3] / 2, a = e.x + r, o = e.y - i, s = Math.hypot(a, o);
		if (s > this.maxOffsetDistance && s > 0) {
			let t = this.maxOffsetDistance / s;
			e.x = a * t - r, e.y = o * t + i;
		}
	}
};
//#endregion
//#region src/renderQuality.ts
function ne(e) {
	let t = {
		recommended: e.useBrowserRecommendedResolution,
		scale: e.resolutionScale,
		samples: e.scene.msaaSamples,
		fxaa: e.scene.postProcessStages.fxaa.enabled
	};
	e.useBrowserRecommendedResolution = !1, e.scene.msaaSamples = e.scene.msaaSupported ? 4 : 1, e.scene.postProcessStages.fxaa.enabled = !1;
	let n = () => {
		let t = window.devicePixelRatio || 1, n = Math.max(1, e.canvas.clientWidth), r = Math.max(1, e.canvas.clientHeight), i = Math.min(t, 3, Math.sqrt(12e6 / (n * r)), 8192 / n, 8192 / r) / t;
		Math.abs(e.resolutionScale - i) > .001 && (e.resolutionScale = i);
	};
	n();
	let r = e.scene.preUpdate.addEventListener(n);
	return () => {
		r(), !e.isDestroyed() && (e.useBrowserRecommendedResolution = t.recommended, e.resolutionScale = t.scale, e.scene.msaaSamples = t.samples, e.scene.postProcessStages.fxaa.enabled = t.fxaa);
	};
}
//#endregion
//#region src/layout.worker.ts?worker&inline
var Z = "(function(){function e(e,t,n){let r=Math.max(t,n),i=new Float64Array(r),a=new Float64Array(r),o=new Int32Array(r),s=new Float64Array(r+1),c=e=>{let t=0;o[0]=0,s[0]=-1/0,s[1]=1/0;for(let n=1;n<e;n++){let e;do{let r=o[t];if(e=(i[n]+n*n-i[r]-r*r)/(2*(n-r)),e>s[t])break;t--}while(t>=0);t++,o[t]=n,s[t]=e,s[t+1]=1/0}t=0;for(let n=0;n<e;n++){for(;s[t+1]<n;)t++;let e=o[t];a[n]=(n-e)**2+i[e]}};for(let r=0;r<t;r++){for(let a=0;a<n;a++)i[a]=e[a*t+r];c(n);for(let i=0;i<n;i++)e[i*t+r]=a[i]}for(let r=0;r<n;r++){for(let n=0;n<t;n++)i[n]=e[r*t+n];c(t);for(let n=0;n<t;n++)e[r*t+n]=a[n]}}function t(t,n=8){let{width:r,height:i,data:a}=t,o=new Float64Array(r*i),s=new Float64Array(r*i);for(let e=0;e<o.length;e++){let t=a[e*4+3]/255;s[e]=t===1?0:t===0?0xe8d4a51000:Math.max(0,.5-t)**2,o[e]=t===0?0:t===1?0xe8d4a51000:Math.max(0,t-.5)**2}e(o,r,i),e(s,r,i);for(let e=0;e<o.length;e++){let t=Math.sqrt(o[e])-Math.sqrt(s[e]),r=Math.round(255*Math.max(0,Math.min(1,.5+t/(2*n))));a[e*4]=a[e*4+1]=a[e*4+2]=r,a[e*4+3]=255}return t}function n(e,t=e.fontSize){return`${e.fontStyle.includes(`italic`)?`italic`:`normal`} ${e.fontStyle.startsWith(`bold`)?Math.max(700,e.fontWeight):e.fontWeight} ${t}px ${e.fontFamily}`}function r(e){return e.replace(/[\\t\\n\\f\\r]/g,` `)}function i(e,t){let n=e.style,r=e.titleStyle??n,i=e.displayMode!==`compact`&&e.title!==void 0,a=!!e.badgeText,o=a&&!i,s=Math.max(1,e.lines.length),c=s*n.fontSize+(s-1)*n.lineGap,l=o?Math.max(20,c):c,u=l+n.paddingTop+n.paddingBottom+4,d=t.roundWidth===!1?e=>e:Math.ceil,f=d(Math.max(1,t.bodyWidth)+n.paddingLeft+n.paddingRight+4+(o?26:0)),p=Math.max(20,16,r.fontSize),m=i?p+r.paddingTop+r.paddingBottom+4:0,h=i?d(Math.max(0,t.titleWidth??0)+r.paddingLeft+r.paddingRight+4+(a?26:0)+36+6):0,g=Math.max(f,h),_={width:g,height:m+u,body:{x:0,y:m,width:g,height:u},bodyText:{x:2+n.paddingLeft+(o?26:0),y:m+2+n.paddingTop+(l-c)/2},bodyLineHeight:n.fontSize+n.lineGap};if(i){let e=2+r.paddingTop;_.header={x:0,y:0,width:g,height:m},_.titleText={x:2+r.paddingLeft+(a?26:0),y:e+(p-r.fontSize)/2},_.actions={x:g-2-r.paddingRight-36,y:e+(p-16)/2,width:36,height:16},a&&(_.badge={x:2+r.paddingLeft,y:e+(p-20)/2,width:20,height:20})}else o&&(_.badge={x:2+n.paddingLeft,y:2+n.paddingTop+(l-20)/2,width:20,height:20});return _}let a=4096,o=a;var s=class{canvas=new OffscreenCanvas(o,o);ctx=this.canvas.getContext(`2d`);glyphs=new Map;textCache=new WeakMap;atlasX=8;atlasY=0;atlasRowHeight=4;constructor(){this.resetAtlas()}resetAtlas(){this.glyphs.clear(),this.textCache=new WeakMap,this.ctx.clearRect(0,0,o,o),this.ctx.fillStyle=`white`,this.ctx.fillRect(0,0,4,4),this.atlasX=8,this.atlasY=0,this.atlasRowHeight=4}prepare(e){let i=new Map,a=e.map(e=>({font:n(e.style,64),lines:e.lines.map(r),title:e.displayMode!==`compact`&&e.title!==void 0?r(e.title):void 0,titleFont:n(e.titleStyle??e.style,64),badge:e.badgeText?r(e.badgeText):void 0,badgeFont:`normal 700 64px sans-serif`})),s=(e,t,n)=>{if(!(n?.font===e&&n.text===t))for(let n of t){let t=e+`\n`+n;!this.glyphs.has(t)&&!i.has(t)&&i.set(t,{font:e,character:n})}};a.forEach((t,n)=>{let r=this.textCache.get(e[n]);t.lines.forEach((e,n)=>s(t.font,e,r?.rows[n])),t.title!==void 0&&s(t.titleFont,t.title,r?.title),t.badge!==void 0&&s(t.badgeFont,t.badge,r?.badge)});let c=!1;for(let[n,{font:r,character:s}]of i){if(this.glyphs.has(n))continue;this.ctx.font=r,this.ctx.textBaseline=`alphabetic`;let i=this.ctx.measureText(s),l=Math.ceil(i.actualBoundingBoxLeft),u=Math.ceil(i.actualBoundingBoxAscent),d=Math.max(1,Math.ceil(i.actualBoundingBoxLeft+i.actualBoundingBoxRight))+24,f=Math.max(1,Math.ceil(i.actualBoundingBoxAscent+i.actualBoundingBoxDescent))+24;if(this.atlasX+d>o&&(this.atlasX=0,this.atlasY+=this.atlasRowHeight,this.atlasRowHeight=0),this.atlasY+f>o){let t=new Set;if(a.forEach(e=>{for(let n of e.lines)for(let r of n)t.add(e.font+`\n`+r);if(e.title!==void 0)for(let n of e.title)t.add(e.titleFont+`\n`+n);if(e.badge!==void 0)for(let n of e.badge)t.add(e.badgeFont+`\n`+n)}),[...this.glyphs.keys()].some(e=>!t.has(e)))return this.resetAtlas(),this.prepare(e);throw Error(`当前字体/字符组合超出 4096px 字形图集容量`)}let p=this.atlasX,m=this.atlasY;this.ctx.fillText(s,p+12+l,m+12+u),this.ctx.putImageData(t(this.ctx.getImageData(p,m,d,f),10),p,m),this.glyphs.set(n,{uv:[p/o,m/o,d/o,f/o],w:d,h:f,advance:i.width,left:l+12,ascent:u+12}),this.atlasX+=d,this.atlasRowHeight=Math.max(this.atlasRowHeight,f),c=!0}let l=a.reduce((e,t)=>e+6+Number(t.title!==void 0)*5+Number(t.badge!==void 0),0),u=(e,t,n)=>{if(n?.font===e&&n.text===t)return n;let r=[],i=0;for(let n of t){let t=this.glyphs.get(e+`\n`+n);r.push(t),i+=t.advance}return{font:e,text:t,glyphs:r,width:i}};return{texts:e.map((e,t)=>{let n=a[t],r=this.textCache.get(e);return r||(r={rows:[]},this.textCache.set(e,r)),r.rows.length=n.lines.length,n.lines.forEach((e,t)=>{r.rows[t]=u(n.font,e,r.rows[t]),l+=r.rows[t].glyphs.length}),r.title=n.title===void 0?void 0:u(n.titleFont,n.title,r.title),r.badge=n.badge===void 0?void 0:u(n.badgeFont,n.badge,r.badge),l+=(r.title?.glyphs.length??0)+(r.badge?.glyphs.length??0),r}),maximum:l,changed:c}}},c=class{layout=new s;colorCanvas=new OffscreenCanvas(1,1);colorContext=this.colorCanvas.getContext(`2d`,{willReadFrequently:!0});colors=new Map;color(e){let t=this.colors.get(e);if(!t){this.colors.size>=256&&this.colors.clear();let n=this.colorContext;n.clearRect(0,0,1,1),n.fillStyle=e,n.fillRect(0,0,1,1),t=Array.from(n.getImageData(0,0,1,1).data,e=>e/255),this.colors.set(e,t)}return t}async build(e,t){let{texts:n,maximum:r,changed:o}=this.layout.prepare(e),s=r*16,c=t&&t.length>=s?t:new Float32Array(s),l=new Float32Array(e.length*2),u=new Float32Array(e.length*4),d=0,f=(e,t,n,r,i,a,o,s)=>{if(s[3]===0||i===0||a===0)return;let l=d++*16;c[l]=e,c[l+1]=t,c[l+2]=n,c[l+3]=r,c[l+4]=i,c[l+5]=0,c[l+6]=0,c[l+7]=a;for(let e=0;e<4;e++)c[l+8+e]=o[e],c[l+12+e]=s[e]},p=[1/a,1/a,2/a,2/a];e.forEach((e,t)=>{e.style.showLeader&&f(t,1,0,0,1,1,p,this.color(e.style.leaderColor))});let m=d;return e.forEach((e,t)=>{let r=e.style,a=e.titleStyle??r,o=r.fontSize/64,s=n[t],c=s.rows,d=1;for(let e of c)d=Math.max(d,e.width*o);let m=i(e,{bodyWidth:d,titleWidth:(s.title?.width??0)*a.fontSize/64});if(l[t*2]=m.width,l[t*2+1]=m.height,m.actions){let e=m.actions;u.set([e.x,e.y,e.width,e.height],t*4)}let h=(e,n,r=!0,i=!0)=>{if(f(t,0,e.x,e.y,e.width,e.height,p,this.color(n.backgroundColor)),!n.showBorder)return;let a=this.color(n.borderColor);r&&f(t,0,e.x,e.y,e.width,2,p,a),i&&f(t,0,e.x,e.y+e.height-2,e.width,2,p,a),f(t,0,e.x,e.y,2,e.height,p,a),f(t,0,e.x+e.width-2,e.y,2,e.height,p,a)};h(m.body,r,!m.header),m.header&&h(m.header,a,!0,!1);let g=(e,n,r,i,a)=>{let o=n/64,s=r,c=i+n*.8;for(let n of e.glyphs)f(t,2,s-n.left*o,c-n.ascent*o,n.w*o,n.h*o,n.uv,a),s+=n.advance*o},_=this.color(r.textColor);if(c.forEach((e,t)=>{g(e,r.fontSize,m.bodyText.x,m.bodyText.y+t*m.bodyLineHeight,_)}),s.title&&m.titleText&&g(s.title,a.fontSize,m.titleText.x,m.titleText.y,this.color(a.textColor)),s.badge&&m.badge){let e=m.badge,n=m.header?a:r;f(t,0,e.x,e.y,e.width,e.height,p,this.color(n.badgeColor)),g(s.badge,14,e.x+(e.width-s.badge.width*14/64)/2,e.y+(e.height-14)/2,this.color(n.badgeTextColor))}}),{instances:c,count:d,leaderCount:m,sizes:l,actionRects:u,atlas:o?await createImageBitmap(this.layout.canvas):void 0}}};let l=[],u=new Float64Array,d=[],f=[],p=new Uint8Array,m=new Uint8Array,h=new Map,g=new c,_=!0;function v(e,t){e.lines.length===t.length&&e.lines.every((e,n)=>e===t[n])||(e.lines=t,_=!0)}self.onmessage=async e=>{let t=e.data;if(t.type===`init`){let e=t.targets;_=!0,h.clear(),d=e.map(e=>e.lines),f=e.map(e=>e.compactLines??[]),p=new Uint8Array(e.map(e=>Number(e.displayMode===`compact`))),l=e.map(e=>({style:e.style,titleStyle:e.titleStyle,title:e.title,badgeText:e.badgeText,displayMode:e.displayMode??`detailed`,x:0,y:0,lines:e.displayMode===`compact`?e.compactLines??[]:e.lines})),u=new Float64Array(e.length*3),m=new Uint8Array(e.length),e.forEach((e,t)=>{u.set(e.position,t*3),m[t]=Number(e.show)});return}if(t.type===`layout`)try{let e=performance.now();t.positions&&(u=t.positions);for(let e of t.lines??[])d[e.index]=e.text,!p[e.index]&&!h.get(e.index)?.lines&&l[e.index]&&v(l[e.index],e.text);for(let e of t.patches){let t=l[e.index];if(!t)continue;e.compactLines!==void 0&&(f[e.index]=e.compactLines),e.displayMode!==void 0&&(p[e.index]=Number(e.displayMode===`compact`),t.displayMode!==e.displayMode&&(t.displayMode=e.displayMode,_=!0)),e.title!==void 0&&e.title!==t.title&&(t.title=e.title,t.displayMode!==`compact`&&(_=!0)),e.badgeText!==void 0&&e.badgeText!==t.badgeText&&(t.badgeText=e.badgeText,_=!0),e.titleStyle&&Object.keys(e.titleStyle).some(n=>t.titleStyle?.[n]!==e.titleStyle[n])&&(t.titleStyle=e.titleStyle,t.displayMode!==`compact`&&(_=!0)),e.style&&Object.keys(e.style).some(n=>t.style[n]!==e.style[n])&&(t.style=e.style,_=!0);let n={...h.get(e.index),...e};e.lines===null&&delete n.lines,e.position===null&&delete n.position,(e.lines!==void 0||e.position!==void 0||e.show!==void 0)&&h.set(e.index,n)}for(let[e,t]of h)t.show!==void 0&&(m[e]=Number(t.show));l.forEach((e,t)=>v(e,p[t]?f[t]:h.get(t)?.lines??d[t]));let n=performance.now()-e,r=_?await g.build(l,t.instances):{instances:t.instances,count:0,sizes:new Float32Array,unchanged:!0},i=t.outputPositions?.length===u.length?t.outputPositions:new Float64Array(u.length);i.set(u);for(let[e,t]of h)t.position&&i.set(t.position,e*3);let a=new Uint8Array(m),o=new Uint8Array(p),s=[i.buffer,a.buffer,o.buffer,r.instances.buffer,r.sizes.buffer];r.atlas&&s.push(r.atlas),r.actionRects&&s.push(r.actionRects.buffer),self.postMessage({id:t.id,positions:i,enabled:a,displayModes:o,...r,computeMs:n,layoutMs:performance.now()-e-n},{transfer:s}),_=!1}catch(e){self.postMessage({id:t.id,error:e instanceof Error?e.message:String(e)})}}})();\n//# sourceMappingURL=layout.worker-D8whELQA.js.map", Q = typeof self < "u" && self.Blob && new Blob(["(self.URL || self.webkitURL).revokeObjectURL(self.location.href);", Z], { type: "text/javascript;charset=utf-8" });
function re(e) {
	let t;
	try {
		if (t = Q && (self.URL || self.webkitURL).createObjectURL(Q), !t) throw "";
		let n = new Worker(t, { name: e?.name });
		return n.addEventListener("error", () => {
			(self.URL || self.webkitURL).revokeObjectURL(t);
		}), n;
	} catch {
		return new Worker("data:text/javascript;charset=utf-8," + encodeURIComponent(Z), { name: e?.name });
	}
}
//#endregion
//#region src/click.ts
var ie = class {
	downX = 0;
	downY = 0;
	moved = !1;
	pointerId;
	blockedPointerId;
	point = new u();
	host;
	getCallouts;
	options;
	constructor(e, t, n) {
		this.host = e, this.getCallouts = t, this.options = n;
		let r = e.element;
		r.addEventListener("pointerdown", this.down, !0), r.addEventListener("pointermove", this.move, !0), r.addEventListener("pointerup", this.up, !0), r.addEventListener("pointercancel", this.cancel, !0), r.addEventListener("lostpointercapture", this.lostCapture), r.addEventListener("click", this.click, !0), r.addEventListener("dblclick", this.doubleClick, !0), window.addEventListener("blur", this.cancel);
	}
	owns(e) {
		return this.host.ownsEventTarget?.(e) ?? e === this.host.element;
	}
	down = (e) => {
		if (!(e.button !== 0 || !this.owns(e.target)) && (this.downX = e.clientX, this.downY = e.clientY, this.moved = !1, this.pointerId = e.pointerId, this.options.blockMapGestures && this.pick(e))) {
			this.blockedPointerId = e.pointerId;
			try {
				this.host.element.setPointerCapture(e.pointerId);
			} catch {}
			e.preventDefault(), e.stopImmediatePropagation();
		}
	};
	move = (e) => {
		this.pointerId === e.pointerId && Math.hypot(e.clientX - this.downX, e.clientY - this.downY) >= 3 && (this.moved = !0), e.pointerId === this.blockedPointerId && (e.preventDefault(), e.stopImmediatePropagation());
	};
	up = (e) => {
		e.pointerId === this.blockedPointerId && (e.preventDefault(), e.stopImmediatePropagation(), this.releaseBlockedPointer());
	};
	releaseBlockedPointer() {
		let e = this.blockedPointerId;
		this.blockedPointerId = void 0, e !== void 0 && this.host.element.hasPointerCapture(e) && this.host.element.releasePointerCapture(e);
	}
	cancel = (e) => {
		this.blockedPointerId !== void 0 && e?.type === "pointercancel" && (e.preventDefault(), e.stopImmediatePropagation()), this.releaseBlockedPointer(), this.moved = !0, this.pointerId = void 0;
	};
	lostCapture = (e) => {
		e.pointerId === this.blockedPointerId && this.cancel(e);
	};
	pick(e) {
		if (e.button !== 0 || this.moved || !this.owns(e.target)) return;
		let t = this.host.element, n = t.getBoundingClientRect();
		if (!n.width || !n.height) return;
		this.point.x = (e.clientX - n.left) * t.clientWidth / n.width, this.point.y = (e.clientY - n.top) * t.clientHeight / n.height;
		let r = this.getCallouts();
		if (!r.some((e) => e.isDragging())) {
			for (let e = r.length - 1; e >= 0; e--) if (r[e].hitTest(this.point)) return r[e];
		}
	}
	click = (e) => {
		let t = this.pick(e);
		this.pointerId = void 0, t && (e.preventDefault(), e.stopImmediatePropagation(), this.options.onSelect?.(t), this.options.onClick?.(t, e));
	};
	doubleClick = (e) => {
		let t = this.pick(e);
		t && (e.preventDefault(), e.stopImmediatePropagation(), t.toggleDisplayMode(), this.options.onDoubleClick?.(t, e));
	};
	destroy() {
		let e = this.host.element;
		e.removeEventListener("pointerdown", this.down, !0), e.removeEventListener("pointermove", this.move, !0), e.removeEventListener("pointerup", this.up, !0), e.removeEventListener("pointercancel", this.cancel, !0), e.removeEventListener("lostpointercapture", this.lostCapture), e.removeEventListener("click", this.click, !0), e.removeEventListener("dblclick", this.doubleClick, !0), window.removeEventListener("blur", this.cancel), this.releaseBlockedPointer();
	}
};
//#endregion
//#region src/domRenderer.ts
function $() {
	return {
		options: { ...S },
		layout: new O(),
		items: [],
		stats: {
			unresolved: 0,
			moved: 0,
			candidateChecks: 0
		}
	};
}
var ae = (e, t) => e.length === t.length && e.every((e, n) => e === t[n]), oe = class {
	overlay;
	visibleCount = 0;
	map;
	viewport;
	getFrame;
	getHandles;
	items;
	sourcePositions;
	projected;
	offset = new l.Cartesian2();
	previousOffset = new l.Cartesian2();
	previousPreference = new l.Cartesian2();
	cartesian = new l.Cartesian3();
	cartographic = new l.Cartographic();
	projection;
	projectedVersion;
	avoidanceGroups = {
		detailed: $(),
		compact: $()
	};
	avoidanceItems = [];
	textRendering = { ...z };
	beforeRenderListeners = /* @__PURE__ */ new Set();
	postRenderListeners = /* @__PURE__ */ new Set();
	destroyed = !1;
	rendering = !1;
	errorHandler;
	constructor(e, t, n, r) {
		this.map = e, this.getFrame = t, this.getHandles = n, this.sourcePositions = new Float64Array(r.length * 3), this.projected = new Float64Array(r.length * 2);
		let i = e.getViewport();
		if (!i) throw Error("二维标牌需要具有 DOM 容器的 OpenLayers 地图");
		this.viewport = i;
		let a = i.ownerDocument;
		this.overlay = a.createElement("div"), this.overlay.className = "target-callout-dom-overlay", this.overlay.style.cssText = "position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:2;isolation:isolate";
		let o = a.createElement("div"), s = a.createElement("div");
		o.style.cssText = s.style.cssText = "position:absolute;inset:0;pointer-events:none", this.overlay.append(o, s), this.items = r.map((e, t) => {
			this.sourcePositions.set(e.position, t * 3);
			let n = a.createElement("div");
			n.className = "target-callout-dom-panel", n.dataset.calloutIndex = String(t), n.style.cssText = "position:absolute;left:0;top:0;width:1px;height:1px;box-sizing:border-box;white-space:pre;pointer-events:none;user-select:none;visibility:hidden;transition:none;animation:none";
			let r = a.createElement("div");
			r.className = "target-callout-dom-leader", r.style.cssText = "position:absolute;left:0;top:0;height:2px;transform-origin:0 50%;pointer-events:none;visibility:hidden;transition:none;animation:none";
			let i = a.createElement("div");
			return i.className = "target-callout-dom-anchor", i.style.cssText = "position:absolute;left:0;top:0;width:6px;height:6px;border-radius:50%;pointer-events:none;visibility:hidden;transition:none;animation:none", o.append(r, i), s.appendChild(n), {
				panel: n,
				leader: r,
				anchor: i,
				style: { ...e.style },
				sourceLines: [...e.lines],
				title: e.title,
				badgeText: e.badgeText,
				titleStyle: e.titleStyle && { ...e.titleStyle },
				rowNodes: [],
				compactLines: [...e.compactLines ?? []],
				lines: [],
				mode: e.displayMode ?? "detailed",
				enabled: e.show,
				dirty: !0,
				width: 0,
				height: 0,
				transform: "",
				visible: !1,
				projectable: !1
			};
		});
		try {
			i.appendChild(this.overlay), e.on("postrender", this.handleMapRender), a.fonts?.addEventListener("loadingdone", this.fontsChanged), this.update({ patches: [] });
		} catch (e) {
			throw this.destroy(), e;
		}
	}
	update(e) {
		if (this.destroyed) return {
			computeMs: 0,
			layoutMs: 0,
			applyMs: 0
		};
		let t = performance.now(), n = e.positions !== void 0;
		e.positions && this.sourcePositions.set(e.positions);
		for (let t of e.lines ?? []) this.items[t.index].sourceLines = [...t.text];
		for (let t of e.patches) {
			let e = this.items[t.index];
			t.compactLines !== void 0 && (e.compactLines = [...t.compactLines]), t.displayMode !== void 0 && t.displayMode !== e.mode && (e.mode = t.displayMode, e.dirty = !0), t.style && Object.keys(t.style).some((n) => e.style[n] !== t.style[n]) && (e.style = { ...t.style }, e.dirty = !0), t.title !== void 0 && t.title !== e.title && (e.title = t.title, e.dirty = !0), t.badgeText !== void 0 && t.badgeText !== e.badgeText && (e.badgeText = t.badgeText, e.dirty = !0), t.titleStyle && Object.keys(t.titleStyle).some((n) => e.titleStyle?.[n] !== t.titleStyle[n]) && (e.titleStyle = { ...t.titleStyle }, e.dirty = !0), t.lines !== void 0 && (e.lineOverride = t.lines === null ? void 0 : [...t.lines]), t.position !== void 0 && (e.positionOverride = t.position === null ? void 0 : [...t.position], n = !0), t.show !== void 0 && (e.enabled = t.show);
		}
		let r = this.getFrame();
		(!r.displayModes || r.displayModes.length !== this.items.length) && (r.displayModes = new Uint8Array(this.items.length)), (n || this.projectedVersion === void 0) && (r.positions.set(this.sourcePositions), this.items.forEach((e, t) => {
			e.positionOverride && r.positions.set(e.positionOverride, t * 3);
		}), r.positionsVersion = (r.positionsVersion ?? 0) + 1), this.items.forEach((e, t) => {
			let n = e.mode === "compact" ? e.compactLines : e.lineOverride ?? e.sourceLines;
			ae(e.lines, n) || (e.lines = n, e.dirty = !0), r.displayModes[t] = Number(e.mode === "compact");
		});
		let i = performance.now() - t, a = performance.now();
		this.measureDirtyItems();
		let o = performance.now() - a, s = performance.now();
		return this.render(), this.map.render(), {
			computeMs: i,
			layoutMs: o,
			applyMs: performance.now() - s
		};
	}
	measureDirtyItems() {
		let e = (e, t, n) => {
			e.style.cssText = "position:absolute;box-sizing:border-box;pointer-events:none", e.style.font = r(t), e.style.lineHeight = `${t.fontSize}px`, e.style.color = t.textColor, e.style.backgroundColor = t.backgroundColor, e.style.boxShadow = t.showBorder ? n ? `inset 2px 0 0 ${t.borderColor}, inset -2px 0 0 ${t.borderColor}, inset 0 ${n === "top" ? -2 : 2}px 0 ${t.borderColor}` : `inset 0 0 0 2px ${t.borderColor}` : "none";
		};
		for (let n of this.items) if (n.dirty) {
			let i = n.style, o = n.titleStyle ?? i, s = n.panel, c = s.ownerDocument, l = n.mode !== "compact" && n.title !== void 0;
			s.style.font = r(i), s.style.lineHeight = `${i.fontSize}px`, s.style.color = i.textColor;
			let u = c.createElement("div");
			u.className = "target-callout-dom-body", e(u, i, l ? "top" : void 0), n.bodyNode = u, n.rowNodes = n.lines.map((e) => {
				let n = c.createElement("div");
				return n.className = "target-callout-dom-row", n.style.cssText = `position:absolute;width:max-content;height:${i.fontSize}px`, n.textContent = t(e), n;
			}), u.append(...n.rowNodes), n.headerNode = n.titleNode = n.badgeNode = void 0;
			let d = [];
			if (l) {
				let r = c.createElement("div"), i = c.createElement("div");
				r.className = "target-callout-dom-header", e(r, o, "bottom"), i.className = "target-callout-dom-title", i.style.cssText = `position:absolute;width:max-content;height:${o.fontSize}px`, i.textContent = t(n.title), r.appendChild(i), n.headerNode = r, n.titleNode = i, d.push(r);
			}
			if (n.badgeText) {
				let e = c.createElement("div"), r = l ? o : i;
				e.className = "target-callout-dom-badge", e.style.cssText = `position:absolute;display:flex;align-items:center;justify-content:center;box-sizing:border-box;font:700 14px ${a};line-height:14px`, e.style.backgroundColor = r.badgeColor, e.style.color = r.badgeTextColor, e.textContent = t(n.badgeText), (n.headerNode ?? u).appendChild(e), n.badgeNode = e;
			}
			d.push(u), s.replaceChildren(...d), s.dataset.displayMode = n.mode, n.leader.style.backgroundColor = n.anchor.style.backgroundColor = i.leaderColor;
		}
		let n = [];
		this.items.forEach((e, t) => {
			if (!e.dirty || e.panel.offsetWidth <= 0 || e.panel.offsetHeight <= 0) return;
			let r = e.panel.ownerDocument.defaultView, i = (e) => {
				let t = Number.parseFloat(r?.getComputedStyle(e).width ?? "");
				return Number.isFinite(t) ? t : e.offsetWidth;
			}, a = s({
				style: e.style,
				titleStyle: e.titleStyle,
				title: e.title,
				badgeText: e.badgeText,
				displayMode: e.mode,
				lines: e.lines
			}, {
				bodyWidth: Math.max(0, ...e.rowNodes.map(i)),
				titleWidth: e.titleNode ? i(e.titleNode) : 0,
				roundWidth: !1
			});
			n.push({
				item: e,
				index: t,
				layout: a
			});
		});
		let i = (e, t, n = {
			x: 0,
			y: 0
		}) => {
			e.style.left = `${t.x - n.x}px`, e.style.top = `${t.y - n.y}px`, e.style.width = `${t.width}px`, e.style.height = `${t.height}px`;
		};
		for (let { item: e, layout: t } of n) e.panel.style.width = `${t.width}px`, e.panel.style.height = `${t.height}px`, i(e.bodyNode, t.body), e.headerNode && t.header && i(e.headerNode, t.header), e.titleNode && t.titleText && (e.titleNode.style.left = `${t.titleText.x}px`, e.titleNode.style.top = `${t.titleText.y}px`), e.badgeNode && t.badge && i(e.badgeNode, t.badge, t.header ?? t.body), e.rowNodes.forEach((e, n) => {
			e.style.left = `${t.bodyText.x - t.body.x}px`, e.style.top = `${t.bodyText.y - t.body.y + n * t.bodyLineHeight}px`;
		});
		let o = this.getFrame(), c = o.bounds;
		(!o.actionRects || o.actionRects.length !== this.items.length * 4) && (o.actionRects = new Float32Array(this.items.length * 4));
		for (let { item: e, index: t, layout: r } of n) {
			let n = e.panel.ownerDocument.defaultView?.getComputedStyle(e.panel), i = Number.parseFloat(n?.width ?? ""), a = Number.parseFloat(n?.height ?? "");
			e.width = Number.isFinite(i) && i > 0 ? i : e.panel.offsetWidth, e.height = Number.isFinite(a) && a > 0 ? a : e.panel.offsetHeight, c[t * 5 + 2] = e.width, c[t * 5 + 3] = e.height;
			let s = r.actions;
			o.actionRects.set(s ? [
				s.x,
				s.y,
				s.width,
				s.height
			] : [
				0,
				0,
				0,
				0
			], t * 4), e.dirty = !1;
		}
	}
	render = () => {
		if (!(this.destroyed || this.rendering)) {
			this.rendering = !0;
			try {
				for (let e of this.beforeRenderListeners) e();
				this.measureDirtyItems(), this.draw();
				for (let e of this.postRenderListeners) e();
			} finally {
				this.rendering = !1;
			}
		}
	};
	setErrorHandler(e) {
		this.errorHandler = e;
	}
	handleMapRender = () => {
		try {
			this.render();
		} catch (e) {
			if (!this.errorHandler) throw e;
			this.errorHandler(e instanceof Error ? e : Error(String(e)));
		}
	};
	draw() {
		let e = this.getFrame(), t = this.getHandles(), r = e.bounds, i = this.map.getSize(), a = i?.[0] ?? 0, o = i?.[1] ?? 0, s = this.map.getView(), c = s.getProjection(), l = p(), u = s.getCenter(), d = u && l ? m(u, l, c) : u, f = c.getExtent(), h = c.canWrapX() && f ? f[2] - f[0] : 0;
		(c !== this.projection || this.projectedVersion !== e.positionsVersion || e.positionsVersion === void 0) && (this.projectTargets(c, e.positions), this.projection = c, this.projectedVersion = e.positionsVersion);
		let g = Object.values(this.avoidanceGroups);
		for (let e of g) e.items.length = 0;
		let _ = t.some((e) => e.isDragging());
		this.visibleCount = 0;
		for (let e = 0; e < this.items.length; e++) {
			let i = this.items[e], s = t[e], u = e * 5, f = this.projected[e * 2], p = this.projected[e * 2 + 1];
			h > 0 && d && Number.isFinite(f) && (f += Math.round((d[0] - f) / h) * h);
			let g = l ? m([f, p], c, l) : [f, p], _ = Number.isFinite(f) && Number.isFinite(p) ? this.map.getPixelFromCoordinate(g) : null;
			f = _?.[0] ?? 0, p = _?.[1] ?? 0, i.projectable = i.enabled && s.getShow() && a > 0 && o > 0 && !!_ && Number.isFinite(f) && Number.isFinite(p), r[u] = f, r[u + 1] = p, r[u + 2] = i.width, r[u + 3] = i.height, f = r[u], p = r[u + 1], s.getOffset(this.previousOffset), s.getPreferredOffset(this.previousPreference);
			let v = this.previousOffset.x - this.previousPreference.x, y = this.previousOffset.y - this.previousPreference.y;
			s.resolveScreenOffset(f, p, this.offset);
			let b = i.projectable && (n(f, p, f + this.offset.x + v, p + this.offset.y + y - i.height, i.width, i.height, a, o) || n(f, p, f + this.offset.x, p + this.offset.y - i.height, i.width, i.height, a, o));
			r[u + 4] = Number(b);
			let x = this.avoidanceGroups[i.mode];
			if (x.options.enabled) {
				let t = this.avoidanceItems[e] ??= {};
				t.index = e, t.visible = b, t.anchorX = f, t.anchorY = p, t.width = i.width, t.height = i.height, t.preferredLeft = f + this.offset.x, t.preferredTop = p + this.offset.y - i.height, t.maxDistance = s.getMaxOffsetDistance(), t.dragging = s.isDragging(), t.priority = s.getAvoidancePriority(), x.items.push(t);
			}
			i.visible = b;
		}
		for (let e of g) if (e.options.enabled) {
			e.stats = e.layout.layout(e.items, a, o, e.options, _);
			for (let n of e.items) t[n.index].applyAvoidanceOffset(n.left - n.anchorX, n.top + n.height - n.anchorY);
		}
		this.items.forEach((e, i) => {
			let s = i * 5, c = r[s], l = r[s + 1], u = t[i].getOffset(this.offset), d = c + u.x, f = l + u.y - e.height;
			e.visible = e.projectable && n(c, l, d, f, e.width, e.height, a, o), r[s + 4] = Number(e.visible);
			let p = e.visible ? "visible" : "hidden";
			if (e.panel.style.visibility = e.anchor.style.visibility = p, e.leader.style.visibility = e.visible && e.style.showLeader ? "visible" : "hidden", !e.visible) return;
			this.visibleCount++;
			let m = t[i], h = this.avoidanceGroups[e.mode];
			this.textRendering.pixelSnap && !m.isDragging() && m.getMaxOffsetDistance() === Infinity && (!h.options.enabled || h.options.maxDisplacement === Infinity) && (d = Math.round(d), f = Math.round(f), t[i].applyAvoidanceOffset(d - c, f + e.height - l));
			let g = `translate(${d}px,${f}px)`;
			g !== e.transform && (e.panel.style.transform = g, e.transform = g), e.anchor.style.transform = `translate(${c - 3}px,${l - 3}px)`, e.style.showLeader && this.placeLeader(e, c, l, d, f);
		});
	}
	projectTargets(e, t) {
		for (let n = 0; n < this.items.length; n++) {
			l.Cartesian3.fromElements(t[n * 3], t[n * 3 + 1], t[n * 3 + 2], this.cartesian);
			let r = l.Ellipsoid.WGS84.cartesianToCartographic(this.cartesian, this.cartographic), i = r ? f([l.Math.toDegrees(r.longitude), l.Math.toDegrees(r.latitude)], e) : [NaN, NaN];
			this.projected[n * 2] = i[0], this.projected[n * 2 + 1] = i[1];
		}
	}
	placeLeader(e, t, n, r, i) {
		let a = r + e.width, o = i + e.height, s = (Math.abs(r - t) <= Math.abs(a - t) ? r : a) - t, c = (Math.abs(o - n) <= Math.abs(i - n) ? o : i) - n;
		e.leader.style.width = `${Math.hypot(s, c)}px`, e.leader.style.transform = `translate(${t}px,${n - 1}px) rotate(${Math.atan2(c, s)}rad)`;
	}
	onBeforeRender(e) {
		return this.beforeRenderListeners.add(e), () => {
			this.beforeRenderListeners.delete(e);
		};
	}
	onPostRender(e) {
		return this.postRenderListeners.add(e), () => {
			this.postRenderListeners.delete(e);
		};
	}
	ownsEventTarget(e) {
		if (!(e instanceof Node)) return !1;
		let t = this.viewport;
		return e === t || this.overlay.contains(e) ? !0 : e instanceof HTMLElement && e.tagName === "CANVAS" && t.contains(e) && !e.closest(".ol-control,.ol-overlaycontainer-stopevent");
	}
	setAvoidance(e, t) {
		t !== void 0 && N(t);
		let n = (t ? [t] : ["detailed", "compact"]).map((t) => ({
			group: this.avoidanceGroups[t],
			next: C(e, this.avoidanceGroups[t].options)
		}));
		for (let { group: e, next: t } of n) Object.keys(t).every((n) => t[n] === e.options[n]) || (t.enabled !== e.options.enabled && e.layout.clear(), e.options = t, e.stats = {
			unresolved: 0,
			moved: 0,
			candidateChecks: 0
		}, this.map.render());
	}
	getAvoidance(e = "detailed") {
		return N(e), { ...this.avoidanceGroups[e].options };
	}
	getAvoidanceStats(e) {
		if (e !== void 0) return N(e), { ...this.avoidanceGroups[e].stats };
		let t = this.avoidanceGroups.detailed.stats, n = this.avoidanceGroups.compact.stats;
		return {
			unresolved: t.unresolved + n.unresolved,
			moved: t.moved + n.moved,
			candidateChecks: t.candidateChecks + n.candidateChecks
		};
	}
	setTextRendering(e) {
		e.smoothing !== void 0 && Number.isFinite(e.smoothing) && (this.textRendering.smoothing = l.Math.clamp(e.smoothing, 0, 1.5)), e.weight !== void 0 && Number.isFinite(e.weight) && (this.textRendering.weight = l.Math.clamp(e.weight, -.5, .5)), e.pixelSnap !== void 0 && (this.textRendering.pixelSnap = e.pixelSnap), this.map.render();
	}
	getTextRendering() {
		return { ...this.textRendering };
	}
	fontsChanged = () => {
		for (let e of this.items) e.dirty = !0;
		this.map.render();
	};
	isDestroyed() {
		return this.destroyed;
	}
	destroy() {
		if (this.destroyed) return;
		this.destroyed = !0, this.map.un("postrender", this.handleMapRender), this.overlay.ownerDocument.fonts?.removeEventListener("loadingdone", this.fontsChanged), this.overlay.remove(), this.beforeRenderListeners.clear(), this.postRenderListeners.clear(), this.errorHandler = void 0;
		for (let e of Object.values(this.avoidanceGroups)) e.layout.clear(), e.items.length = 0;
		this.avoidanceItems.length = 0, this.visibleCount = 0;
		let e = this.getFrame().bounds;
		for (let t = 0; t < this.items.length; t++) e[t * 5 + 4] = 0;
		this.items.length = 0;
	}
}, se = class {
	callouts;
	ready;
	hover;
	options;
	preservePositionOnAvoidanceDisable;
	renderer;
	gpuRenderer;
	domRenderer;
	worker;
	drag;
	removePostRender;
	clicks;
	byId = /* @__PURE__ */ new Map();
	pendingLines = /* @__PURE__ */ new Map();
	waiters = /* @__PURE__ */ new Set();
	pendingPatches = /* @__PURE__ */ new Map();
	frame;
	pendingBulk;
	recycledPositions = /* @__PURE__ */ new Float64Array();
	recycledInstances = /* @__PURE__ */ new Float32Array();
	requestId = 0;
	sentAt = 0;
	busy = !1;
	scheduled = !1;
	destroyed = !1;
	resolveReady;
	rejectReady;
	readySettled = !1;
	failure;
	stats = {
		computeMs: 0,
		layoutMs: 0,
		applyMs: 0,
		latencyMs: 0,
		visibleCount: 0
	};
	constructor(e) {
		if (this.options = e, !!e.scene == !!e.map) throw TypeError("必须且只能传入 scene 或 map");
		if (e.preservePositionOnAvoidanceDisable !== void 0 && typeof e.preservePositionOnAvoidanceDisable != "boolean") throw TypeError("preservePositionOnAvoidanceDisable 必须是布尔值");
		if (this.preservePositionOnAvoidanceDisable = e.preservePositionOnAvoidanceDisable ?? !0, !e.targets.length) throw RangeError("targets 至少需要一个目标");
		let t = Y({
			...v,
			...e.defaultStyle
		}), n = Y({
			...k,
			...e.defaultCompactStyle
		}), r = Y({
			...A,
			...e.defaultTitleStyle
		});
		J(e.maxOffsetDistance);
		let i = C(e.avoidance ?? !1), a = /* @__PURE__ */ new Set();
		this.frame = {
			positions: new Float64Array(e.targets.length * 3),
			bounds: new Float32Array(e.targets.length * 5),
			positionsVersion: 0
		};
		let o = e.targets.map((i, o) => {
			let s = i.id ?? o;
			if (typeof s != "string" && typeof s != "number" || typeof s == "number" && !Number.isFinite(s)) throw TypeError("目标 id 必须是字符串或有限数");
			if (a.has(s)) throw RangeError(`重复目标 id：${s}`);
			a.add(s), W(i.position), G(i.lines ?? []);
			let c = i.displayMode ?? "detailed";
			N(c);
			let l = P(i.fields ?? []), u = F(l, i.compactFieldFormatter ?? e.compactFieldFormatter, s, i.lines), d = Y({
				...t,
				...i.style
			}), f = Y({
				...n,
				...i.compactStyle
			}), p = Y({
				...r,
				...i.titleStyle
			}), m = K(i.title ?? M(l) ?? ""), h = q(i.badgeText ?? "A");
			if (J(i.maxOffsetDistance), i.offset && (!Number.isFinite(i.offset.x) || !Number.isFinite(i.offset.y))) throw RangeError("偏移必须是有限数");
			if (i.show !== void 0 && typeof i.show != "boolean") throw TypeError("show 必须是布尔值");
			return this.frame.positions.set([
				i.position.x,
				i.position.y,
				i.position.z
			], o * 3), {
				position: [
					i.position.x,
					i.position.y,
					i.position.z
				],
				lines: [...i.lines ?? []],
				fields: l,
				compactLines: u,
				displayMode: c,
				title: m,
				badgeText: h,
				titleStyle: p,
				style: c === "compact" ? f : d,
				show: i.show !== !1
			};
		}), s = !1, c = e.targets.map((i, a) => {
			let c = new X(a, () => this.frame, (e) => this.queuePatch(e), {
				id: i.id ?? a,
				ensureAlive: () => this.ensureAlive(),
				requestRender: () => this.requestRender(),
				compactFieldFormatter: i.compactFieldFormatter ?? e.compactFieldFormatter,
				onDisplayModeChange: (e) => {
					if (s) try {
						this.options.onDisplayModeChange?.(e);
					} catch (e) {
						this.notifyError(e instanceof Error ? e : Error(String(e)));
					}
				}
			});
			c.setStyle({
				...t,
				...i.style
			}), c.setStyle({
				...n,
				...i.compactStyle
			}, "compact"), c.setStyle({
				...r,
				...i.titleStyle
			}, "title");
			let l = o[a];
			return c.applyContent({
				fields: l.fields,
				sourceLines: l.lines,
				compactLines: l.compactLines
			}), c.setTitle(l.title), c.setBadgeText(l.badgeText), c.setDisplayMode(l.displayMode), c.setMaxOffsetDistance(i.maxOffsetDistance ?? e.maxOffsetDistance), i.offset && c.setOffset(i.offset), i.show === !1 && c.setShow(!1), this.byId.set(c.id, c), c;
		});
		this.callouts = Object.freeze(c), s = !0, this.ready = new Promise((e, t) => {
			this.resolveReady = e, this.rejectReady = t;
		}), this.ready.catch(() => {});
		try {
			let t, n;
			if (e.map) {
				let r = e.map, i = new oe(r, () => this.frame, () => c, o);
				this.domRenderer = i, this.renderer = i, i.setErrorHandler((e) => this.fail(e)), t = {
					element: r.getViewport(),
					requestRender: () => r.render(),
					onBeforeRender: (e) => i.onBeforeRender(e),
					ownsEventTarget: (e) => i.ownsEventTarget(e),
					suspendInputs: () => {
						let e = r.getInteractions().getArray().filter((e) => e.getActive());
						e.forEach((e) => e.setActive(!1));
						let t = !1;
						return () => {
							if (t) return;
							t = !0;
							let n = r.getInteractions().getArray();
							for (let t of e) n.includes(t) && t.setActive(!0);
						};
					}
				}, n = (e) => i.onPostRender(e);
			} else {
				let r = e.scene;
				this.gpuRenderer = new U(r, c.length, () => this.frame, () => c), this.renderer = this.gpuRenderer, t = h(r), n = (e) => r.postRender.addEventListener(e), this.worker = new re(), this.worker.onmessage = (e) => this.receive(e.data), this.worker.onerror = (e) => this.fail(/* @__PURE__ */ Error(`标牌 Worker 出错：${e.message}`)), this.worker.onmessageerror = () => this.fail(/* @__PURE__ */ Error("无法解码标牌 Worker 消息")), this.worker.postMessage({
					type: "init",
					targets: o
				});
			}
			this.renderer.setTextRendering({
				...z,
				...e.textRendering
			}), e.avoidance !== void 0 && this.renderer.setAvoidance(i), t.element && (this.clicks = new ie(t, () => c, {
				blockMapGestures: e.draggable === !1,
				onSelect: e.draggable === !1 ? (t) => this.invoke(() => e.onSelect?.(t)) : void 0,
				onClick: (t, n) => this.invoke(() => e.onClick?.(t, n)),
				onDoubleClick: (t, n) => this.invoke(() => e.onDoubleClick?.(t, n))
			})), this.drag = e.draggable === !1 ? void 0 : new _(t, () => c, (t) => this.invoke(() => e.onSelect?.(t)), (t) => this.invoke(() => e.onDragEnd?.(t)));
			let r = e.map ? e.map.getViewport() : e.container;
			this.hover = r && e.hoverActions !== !1 ? new L(r, t.element, () => c, t.ownsEventTarget) : void 0, e.map && this.hover && (this.hover.element.style.zIndex = "3"), this.removePostRender = n(() => {
				this.stats.visibleCount = this.renderer.visibleCount, this.hover?.update();
			}), this.schedule();
		} catch (e) {
			let t = e instanceof Error ? e : Error(String(e));
			throw this.failure = t, this.destroy(), t;
		}
	}
	get count() {
		return this.callouts.length;
	}
	get visibleCount() {
		return this.renderer.visibleCount;
	}
	getStats() {
		return {
			...this.stats,
			visibleCount: this.renderer.visibleCount
		};
	}
	get(e) {
		return this.callouts[e];
	}
	getById(e) {
		return this.byId.get(e);
	}
	isDestroyed() {
		return this.destroyed;
	}
	getTextRendering() {
		return this.renderer.getTextRendering();
	}
	setAvoidance(e, t) {
		this.ensureAlive();
		let n = t === void 0 ? ["detailed", "compact"] : [t], r = this.preservePositionOnAvoidanceDisable ? n.filter((e) => this.renderer.getAvoidance(e).enabled) : [];
		this.renderer.setAvoidance(e, t);
		let i = new Set(r.filter((e) => !this.renderer.getAvoidance(e).enabled));
		if (i.size) for (let e of this.callouts) i.has(e.getRenderedDisplayMode()) && e.setOffset(e.getOffset());
	}
	getAvoidance(e = "detailed") {
		return this.renderer.getAvoidance(e);
	}
	getAvoidanceStats(e) {
		return this.renderer.getAvoidanceStats(e);
	}
	flush() {
		return this.destroyed ? Promise.reject(this.failure ?? /* @__PURE__ */ Error("TargetCalloutManager 已销毁")) : this.readySettled && !this.busy && !this.scheduled && !this.hasPending() ? Promise.resolve() : new Promise((e, t) => {
			this.waiters.add({
				resolve: e,
				reject: t
			});
		});
	}
	setTextRendering(e) {
		this.ensureAlive(), this.renderer.setTextRendering(e), this.requestRender();
	}
	onHover(e, t) {
		return this.ensureAlive(), this.hover?.on(e, t) ?? (() => {});
	}
	updateTargets(e, t = !1) {
		if (this.ensureAlive(), e.positions && (!(e.positions instanceof Float64Array) || e.positions.length !== this.count * 3)) throw RangeError(`positions 长度必须是 ${this.count * 3}`);
		if (e.positions && !e.positions.every(Number.isFinite)) throw RangeError("positions 必须只包含有限数");
		if (t && e.positions && !(e.positions.buffer instanceof ArrayBuffer)) throw TypeError("transfer=true 需要可转移的 ArrayBuffer");
		for (let t of e.lines ?? []) {
			if (!Number.isInteger(t.index) || t.index < 0 || t.index >= this.count) throw RangeError("文字更新包含无效目标索引");
			G(t.text);
		}
		for (let t of e.fields ?? []) {
			if (!Number.isInteger(t.index) || t.index < 0 || t.index >= this.count) throw RangeError("字段更新包含无效目标索引");
			P(t.fields);
		}
		let n = (e.titles ?? []).map((e) => {
			if (!Number.isInteger(e.index) || e.index < 0 || e.index >= this.count) throw RangeError("标题更新包含无效目标索引");
			return {
				index: e.index,
				title: K(e.title)
			};
		}), r = (e.badges ?? []).map((e) => {
			if (!Number.isInteger(e.index) || e.index < 0 || e.index >= this.count) throw RangeError("字母更新包含无效目标索引");
			return {
				index: e.index,
				badgeText: q(e.badgeText)
			};
		});
		if (!e.positions && !e.lines?.length && !e.fields?.length && !n.length && !r.length) return;
		let i = new Map((e.lines ?? []).map((e) => [e.index, e.text])), a = new Map((e.fields ?? []).map((e) => [e.index, e.fields])), o = /* @__PURE__ */ new Map();
		for (let e of /* @__PURE__ */ new Set([...i.keys(), ...a.keys()])) o.set(e, this.callouts[e].prepareContent(a.get(e), i.get(e)));
		this.pendingBulk = { positions: e.positions ? t ? e.positions : new Float64Array(e.positions) : this.pendingBulk?.positions };
		for (let t of e.lines ?? []) this.pendingLines.set(t.index, {
			index: t.index,
			text: [...t.text]
		});
		for (let [e, t] of o) this.callouts[e].applyContent(t);
		for (let e of n) this.callouts[e.index].setTitle(e.title);
		for (let e of r) this.callouts[e.index].setBadgeText(e.badgeText);
		this.schedule();
	}
	destroy() {
		if (this.destroyed) return;
		this.worker && (this.worker.onmessage = null, this.worker.onerror = null, this.worker.onmessageerror = null, this.worker.terminate()), this.destroyed = !0, this.drag?.destroy(), this.clicks?.destroy(), this.hover?.destroy(), this.removePostRender?.(), this.renderer?.destroy(), this.pendingPatches.clear(), this.pendingBulk = void 0, this.pendingLines.clear(), this.byId.clear(), this.recycledPositions = /* @__PURE__ */ new Float64Array(), this.recycledInstances = /* @__PURE__ */ new Float32Array();
		let e = this.failure ?? /* @__PURE__ */ Error("TargetCalloutManager 已销毁");
		this.readySettled || (this.readySettled = !0, this.rejectReady(e));
		for (let t of this.waiters) t.reject(e);
		this.waiters.clear(), this.frame = {
			positions: /* @__PURE__ */ new Float64Array(),
			bounds: /* @__PURE__ */ new Float32Array()
		};
	}
	queuePatch(e) {
		if (this.destroyed || (this.requestRender(), e.style === void 0 && e.position === void 0 && e.lines === void 0 && e.show === void 0 && e.displayMode === void 0 && e.compactLines === void 0 && e.titleStyle === void 0 && e.title === void 0 && e.badgeText === void 0)) return;
		let t = this.pendingPatches.get(e.index);
		this.pendingPatches.set(e.index, {
			...t,
			...e
		}), this.schedule();
	}
	requestRender() {
		this.destroyed || (this.options.map ? this.options.map.render() : this.options.scene.isDestroyed() || this.options.scene.requestRender());
	}
	hasPending() {
		return !!this.pendingBulk || this.pendingLines.size > 0 || this.pendingPatches.size > 0;
	}
	schedule() {
		this.destroyed || this.busy || this.scheduled || (this.scheduled = !0, queueMicrotask(() => {
			this.scheduled = !1, this.dispatch();
		}));
	}
	dispatch() {
		if (this.destroyed || this.busy) return;
		let e = this.pendingBulk;
		this.pendingBulk = void 0;
		let t = [...this.pendingLines.values()];
		this.pendingLines.clear();
		let n = [...this.pendingPatches.values()];
		if (this.pendingPatches.clear(), this.busy = !0, this.sentAt = performance.now(), this.domRenderer) {
			try {
				let r = e?.positions ? structuredClone(e.positions, { transfer: [e.positions.buffer] }) : void 0, i = this.domRenderer.update({
					positions: r,
					lines: t,
					patches: n
				});
				this.busy = !1, this.completeUpdate(i.computeMs, i.layoutMs, i.applyMs);
			} catch (e) {
				this.fail(e instanceof Error ? e : Error(String(e)));
			}
			return;
		}
		let r = [];
		e?.positions && r.push(e.positions.buffer), this.recycledPositions.byteLength && r.push(this.recycledPositions.buffer), this.recycledInstances.byteLength && r.push(this.recycledInstances.buffer);
		try {
			this.worker.postMessage({
				type: "layout",
				id: ++this.requestId,
				patches: n,
				positions: e?.positions,
				lines: t,
				outputPositions: this.recycledPositions,
				instances: this.recycledInstances
			}, r), this.recycledPositions = /* @__PURE__ */ new Float64Array(), this.recycledInstances = /* @__PURE__ */ new Float32Array();
		} catch (e) {
			this.fail(e instanceof Error ? e : Error(String(e)));
		}
	}
	receive(e) {
		if (this.destroyed || !this.busy || e.id !== this.requestId) {
			e.atlas?.close();
			return;
		}
		if (this.busy = !1, e.error) {
			e.atlas?.close(), this.fail(Error(e.error));
			return;
		}
		let t = performance.now();
		this.recycledPositions = this.frame.positions, this.recycledInstances = e.instances, this.frame.positions = e.positions, this.frame.positionsVersion = (this.frame.positionsVersion ?? 0) + 1;
		try {
			this.gpuRenderer.update(e, e.enabled, e.displayModes);
		} catch (t) {
			e.atlas?.close(), this.fail(t instanceof Error ? t : Error(String(t)));
			return;
		}
		this.completeUpdate(e.computeMs, e.layoutMs, performance.now() - t);
	}
	completeUpdate(e, t, n) {
		if (this.stats = {
			computeMs: e,
			layoutMs: t,
			applyMs: n,
			latencyMs: performance.now() - this.sentAt,
			visibleCount: this.renderer.visibleCount
		}, this.requestRender(), this.readySettled || (this.readySettled = !0, this.resolveReady()), this.hasPending()) this.schedule();
		else {
			for (let e of this.waiters) e.resolve();
			this.waiters.clear();
		}
		try {
			this.options.onStats?.(this.getStats());
		} catch (e) {
			this.notifyError(e instanceof Error ? e : Error(String(e)));
		}
	}
	fail(e) {
		this.destroyed || (this.busy = !1, this.failure = e, this.destroy(), this.notifyError(e));
	}
	notifyError(e) {
		try {
			this.options.onError?.(e);
		} catch (e) {
			console.error("TargetCalloutManager onError:", e);
		}
	}
	invoke(e) {
		try {
			e();
		} catch (e) {
			this.notifyError(e instanceof Error ? e : Error(String(e)));
		}
	}
	ensureAlive() {
		if (this.destroyed) throw this.failure ?? /* @__PURE__ */ Error("TargetCalloutManager 已销毁");
	}
};
//#endregion
export { S as DEFAULT_CALLOUT_AVOIDANCE, v as DEFAULT_CALLOUT_STYLE, k as DEFAULT_COMPACT_CALLOUT_STYLE, z as DEFAULT_TEXT_RENDERING, A as DEFAULT_TITLE_CALLOUT_STYLE, c as GlyphBatchBuilder, U as ScreenBatchRenderer, x as TargetCallout, _ as TargetCalloutDragController, L as TargetCalloutHoverController, se as TargetCalloutManager, X as WorkerCalloutHandle, o as WorkerCalloutRenderer, ne as applyCalloutRenderQuality, r as createCalloutFont, i as encodeGlyphDistanceField, e as isTargetVisible };

//# sourceMappingURL=index.js.map