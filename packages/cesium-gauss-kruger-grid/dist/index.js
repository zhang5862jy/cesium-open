import * as e from "cesium";
import t from "proj4";
//#region src/shader/gridLineFragmentShaderSource.fs.glsl?raw
var n = "// 片元阶段：根据到线中心的屏幕距离计算边缘覆盖率，输出带平滑边缘的线颜色。\r\n// u_color 为非预乘 RGBA；宿主使用普通 alpha 混合并保留深度测试。\r\nuniform vec4 u_color;\r\n// 顶点阶段传来的 (distance*w, w) 已经过默认透视插值，这里的商恢复屏幕线性距离。\r\nin vec2 v_lineDistanceAndW;\r\nin float v_halfWidth;\r\n\r\nvoid main() {\r\n  // 过渡带约为一个 CSS 像素，最少使用一个 drawing-buffer 像素，避免边缘过硬。\r\n  float feather = max(czm_pixelRatio, 1.0);\r\n  float lineDistance = v_lineDistanceAndW.x / v_lineDistanceAndW.y;\r\n  // abs 使线两侧对称；几何边界 d=halfWidth 处覆盖率为 0.5。\r\n  // 向内/向外各半个 feather 线性过渡到 1/0，外侧扩展区域自然变为透明。\r\n  float coverage = clamp((v_halfWidth - abs(lineDistance)) / feather + 0.5, 0.0, 1.0);\r\n  // 保留原始 RGB，只让 alpha 随覆盖率衰减；最终与底图颜色的混合由渲染状态完成。\r\n  out_FragColor = vec4(u_color.rgb, u_color.a * coverage);\r\n}\r\n", r = "// 顶点阶段：把一个 ECEF 采样线段展开成恒定像素宽度的屏幕四边形。\r\n// 顺序是 high/low 相机相对变换 → 齐次近面裁切 → NDC → 像素法线扩宽 → 回写 clip。\r\n// Cesium 的 czm_* 由 ShaderSource 自动注入，不是本包自行声明的 uniform/function。\r\n\r\n// 六顶点共享模板：x=0/1 选择线段起终点，y=-1/+1 选择四边形两侧。\r\nin vec2 corner;\r\n// 每个实例独有的 ECEF 米制起终点，拆成高/低位以保留大坐标下的局部精度。\r\nin vec3 instanceStartHigh;\r\nin vec3 instanceStartLow;\r\nin vec3 instanceEndHigh;\r\nin vec3 instanceEndLow;\r\n// CPU 存入的是 CSS 像素半宽；实际 drawing buffer 的像素倍率稍后换算。\r\nin float instanceHalfWidth;\r\n\r\n// 同时传递“距离 × w”和 w，片元阶段用它们的商抵消默认透视插值。\r\nout vec2 v_lineDistanceAndW;\r\nout float v_halfWidth;\r\n\r\nvoid main() {\r\n  // 先以 high/low 分别减去相机的编码位置，再使用相对相机的 MVP。\r\n  // 不先把 high+low 合成数百万米的 Float32，避免局部米级细节在相减前就丢失。\r\n  vec4 startClip = czm_modelViewProjectionRelativeToEye *\r\n    czm_translateRelativeToEye(instanceStartHigh, instanceStartLow);\r\n  vec4 endClip = czm_modelViewProjectionRelativeToEye *\r\n    czm_translateRelativeToEye(instanceEndHigh, instanceEndLow);\r\n  // WebGL 齐次裁剪体的近面为 z=-w；z+w 的符号表示端点是否位于近面内侧。\r\n  // 必须在 xy/w 之前裁切，否则跨越相机/近面的线段会投成超长或翻转的四边形。\r\n  float startDistance = startClip.z + startClip.w;\r\n  float endDistance = endClip.z + endClip.w;\r\n  if (startDistance < 0.0 && endDistance < 0.0) {\r\n    // 两端均在近面外：让本实例的六个模板顶点都落在裁剪体外，不产生可见片元。\r\n    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);\r\n    v_lineDistanceAndW = vec2(0.0, 1.0);\r\n    v_halfWidth = 0.0;\r\n    return;\r\n  }\r\n  // 一端在外：利用有符号距离求线性参数 t=d0/(d0-d1)，把该端移到近面交点。\r\n  if (startDistance < 0.0) {\r\n    startClip = mix(startClip, endClip, startDistance / (startDistance - endDistance));\r\n  } else if (endDistance < 0.0) {\r\n    endClip = mix(endClip, startClip, endDistance / (endDistance - startDistance));\r\n  }\r\n  // 透视除法得到 NDC（可见屏幕横纵范围 -1..1）；按视口尺寸恢复正确像素比例。\r\n  // 求方向后还会归一化，所以从 NDC 到像素的公共 1/2 因子可以省略。\r\n  vec2 startNdc = startClip.xy / startClip.w;\r\n  vec2 endNdc = endClip.xy / endClip.w;\r\n  vec2 screenDirection = (endNdc - startNdc) * czm_viewport.zw;\r\n  // 近乎零长度时用小下限防止除零；法线把屏幕方向 (dx,dy) 旋转 90 度。\r\n  float screenLength = max(length(screenDirection), 0.0001);\r\n  vec2 screenNormal = vec2(-screenDirection.y, screenDirection.x) /\r\n    screenLength;\r\n\r\n  vec4 clipPosition = mix(startClip, endClip, corner.x);\r\n  // 半宽由 CSS 像素转为 drawing-buffer 像素，再额外留一个 CSS 像素的抗锯齿带。\r\n  // 额外三角形区域是否可见由片元 shader 的 coverage 决定，不等于实线变粗。\r\n  float halfWidth = instanceHalfWidth * czm_pixelRatio;\r\n  float expandedHalfWidth = halfWidth + czm_pixelRatio;\r\n  vec2 ndcOffset = screenNormal * corner.y * expandedHalfWidth * 2.0 /\r\n    czm_viewport.zw;\r\n  // 一个像素对应 2/viewport 的 NDC 距离；NDC 偏移乘该端点 w 才能回到齐次 clip。\r\n  // 这样最终 xy/w 后保留恒定像素偏移，不随端点深度改变线宽。\r\n  clipPosition.xy += ndcOffset * clipPosition.w;\r\n\r\n  gl_Position = clipPosition;\r\n  // 默认 smooth varying 会按 1/w 做透视校正；线的横向距离却应当在屏幕上线性变化。\r\n  // 分别插值 d*w 与 1*w 后再相除，可消去共同的透视分母，恢复屏幕线性距离 d。\r\n  // 若直接传 d，起终点深度不同时抗锯齿带会扭曲，视觉上表现为宽度不均。\r\n  v_lineDistanceAndW = vec2(corner.y * expandedHalfWidth, 1.0) * clipPosition.w;\r\n  // 同一实例六个顶点的半宽相同，无需做上述抵消；单位是 drawing-buffer 像素。\r\n  v_halfWidth = halfWidth;\r\n}\r\n", i = 13, a = i * Float32Array.BYTES_PER_ELEMENT, o = 6, s = new Float32Array([
	0,
	-1,
	1,
	-1,
	1,
	1,
	0,
	-1,
	1,
	1,
	0,
	1
]), c = e, l = {
	depthTest: { enabled: !0 },
	depthMask: !1,
	cull: { enabled: !1 },
	blending: e.BlendingState.ALPHA_BLEND
};
function u(e) {
	return e >= 0 ? Math.floor(e / 65536) * 65536 : -Math.floor(-e / 65536) * 65536;
}
var d = class {
	show = !0;
	lineColor;
	lineWidth;
	majorLineWidth;
	boundingVolume = new e.BoundingSphere();
	segmentValues;
	capacity;
	segmentCount = 0;
	cornerBuffer;
	instanceBuffer;
	vertexArray;
	shaderProgram;
	renderState;
	command;
	dataDirty = !0;
	destroyed = !1;
	constructor(t) {
		let n = t.initialCapacity ?? 256;
		if (!Number.isSafeInteger(n) || n < 1) throw RangeError("initialCapacity must be a positive safe integer.");
		for (let e of ["lineWidth", "majorLineWidth"]) if (!Number.isFinite(t[e]) || t[e] <= 0) throw RangeError(`${e} must be a positive finite number.`);
		let r = t.lineColor;
		if (!r || [
			r.red,
			r.green,
			r.blue,
			r.alpha
		].some((e) => !Number.isFinite(e) || e < 0 || e > 1)) throw RangeError("lineColor components must be finite values from 0 through 1.");
		this.lineColor = e.Color.clone(t.lineColor), this.lineWidth = t.lineWidth, this.majorLineWidth = t.majorLineWidth, this.capacity = n, this.segmentValues = new Float32Array(this.capacity * i);
	}
	set(t) {
		if (this.destroyed) return;
		let n = 0;
		for (let e of t) n += Math.max(0, e.positions.length - 1);
		this.ensureCapacity(n), this.segmentCount = n;
		let r = [], i = 0;
		for (let e of t) {
			let t = (e.isMajor ? this.majorLineWidth : this.lineWidth) * .5;
			for (let n = 1; n < e.positions.length; n += 1) {
				let a = e.positions[n - 1], o = e.positions[n];
				this.writeSegment(i, a, o, t), n === 1 && r.push(a), r.push(o), i += 1;
			}
		}
		r.length > 0 ? e.BoundingSphere.fromPoints(r, this.boundingVolume) : (e.Cartesian3.clone(e.Cartesian3.ZERO, this.boundingVolume.center), this.boundingVolume.radius = 0), this.dataDirty = !0, this.command && (this.command.instanceCount = this.segmentCount, this.command.boundingVolume = this.boundingVolume);
	}
	update(t) {
		this.destroyed || !this.show || this.segmentCount === 0 || t.mode !== e.SceneMode.SCENE3D || !t.passes.render || (this.command || this.createResources(t.context), this.dataDirty && this.instanceBuffer && (this.instanceBuffer.copyFromArrayView(this.segmentValues.subarray(0, this.segmentCount * i)), this.dataDirty = !1), t.passes.render && this.command && t.commandList.push(this.command));
	}
	isDestroyed() {
		return this.destroyed;
	}
	destroy() {
		this.destroyed || (this.destroyed = !0, this.releaseResources(), this.segmentValues = /* @__PURE__ */ new Float32Array(), this.segmentCount = 0);
	}
	ensureCapacity(e) {
		if (!(e <= this.capacity)) {
			for (; this.capacity < e;) this.capacity *= 2;
			this.segmentValues = new Float32Array(this.capacity * i), this.releaseResources();
		}
	}
	releaseResources() {
		for (let e of [
			this.vertexArray,
			this.cornerBuffer,
			this.instanceBuffer,
			this.shaderProgram
		]) e && !e.isDestroyed() && e.destroy();
		this.renderState && c.RenderState.removeFromCache(l), this.vertexArray = void 0, this.cornerBuffer = void 0, this.shaderProgram = void 0, this.instanceBuffer = void 0, this.renderState = void 0, this.command = void 0;
	}
	writeSegment(e, t, n, r) {
		let a = e * i, o = u(t.x), s = u(t.y), c = u(t.z), l = u(n.x), d = u(n.y), f = u(n.z), p = this.segmentValues;
		p[a] = o, p[a + 1] = s, p[a + 2] = c, p[a + 3] = t.x - o, p[a + 4] = t.y - s, p[a + 5] = t.z - c, p[a + 6] = l, p[a + 7] = d, p[a + 8] = f, p[a + 9] = n.x - l, p[a + 10] = n.y - d, p[a + 11] = n.z - f, p[a + 12] = r;
	}
	createResources(e) {
		try {
			this.initializeResources(e);
		} catch (e) {
			throw this.releaseResources(), e;
		}
	}
	initializeResources(t) {
		this.cornerBuffer = c.Buffer.createVertexBuffer({
			context: t,
			typedArray: s,
			usage: c.BufferUsage.STATIC_DRAW
		}), this.instanceBuffer = c.Buffer.createVertexBuffer({
			context: t,
			sizeInBytes: this.segmentValues.byteLength,
			usage: c.BufferUsage.DYNAMIC_DRAW
		}), this.vertexArray = new c.VertexArray({
			context: t,
			attributes: [{
				index: 0,
				vertexBuffer: this.cornerBuffer,
				componentsPerAttribute: 2
			}, ...f(this.instanceBuffer)]
		}), this.shaderProgram = c.ShaderProgram.fromCache({
			context: t,
			vertexShaderSource: new c.ShaderSource({
				defines: ["CESIUM_RUNTIME"],
				sources: [r]
			}),
			fragmentShaderSource: new c.ShaderSource({
				defines: ["CESIUM_RUNTIME"],
				sources: [n]
			}),
			attributeLocations: {
				corner: 0,
				instanceStartHigh: 1,
				instanceStartLow: 2,
				instanceEndHigh: 3,
				instanceEndLow: 4,
				instanceHalfWidth: 5
			}
		}), this.renderState = c.RenderState.fromCache(l), this.command = new c.DrawCommand({
			owner: this,
			vertexArray: this.vertexArray,
			shaderProgram: this.shaderProgram,
			renderState: this.renderState,
			primitiveType: e.PrimitiveType.TRIANGLES,
			pass: c.Pass.TRANSLUCENT,
			instanceCount: this.segmentCount,
			count: o,
			boundingVolume: this.boundingVolume,
			modelMatrix: e.Matrix4.IDENTITY,
			uniformMap: { u_color: () => this.lineColor }
		});
	}
};
function f(e) {
	return [
		p(1, e, 3, 0),
		p(2, e, 3, 12),
		p(3, e, 3, 24),
		p(4, e, 3, 36),
		p(5, e, 1, 48)
	];
}
function p(e, t, n, r) {
	return {
		index: e,
		vertexBuffer: t,
		componentsPerAttribute: n,
		offsetInBytes: r,
		strideInBytes: a,
		instanceDivisor: 1
	};
}
//#endregion
//#region src/gaussKrugerProjection.ts
var m = "+proj=longlat +ellps=GRS80 +no_defs +type=crs", h = 5e5, g = class {
	zoneNumber;
	centralMeridian;
	westBoundary;
	eastBoundary;
	converter;
	constructor(n, r) {
		v(n, r), this.zoneNumber = n;
		let i = r === 6 ? n * 6 - 3 : n * 3, a = i > 180 ? i - 360 : i;
		this.centralMeridian = e.Math.toRadians(a), this.westBoundary = e.Math.toRadians(a - r * .5), this.eastBoundary = e.Math.toRadians(a + r * .5);
		let o = [
			"+proj=tmerc",
			"+lat_0=0",
			`+lon_0=${a}`,
			"+k=1",
			`+x_0=${h}`,
			"+y_0=0",
			"+ellps=GRS80",
			"+units=m",
			"+no_defs",
			"+type=crs"
		].join(" ");
		this.converter = t(m, o);
	}
	project(t) {
		if (x("longitude", t.longitude), x("latitude", t.latitude), Math.abs(t.latitude) > e.Math.PI_OVER_TWO) throw RangeError("latitude must be between -PI/2 and PI/2 radians.");
		let [n, r] = this.converter.forward([e.Math.toDegrees(b(t.longitude)), e.Math.toDegrees(t.latitude)]);
		return x("projected easting", n), x("projected northing", r), {
			easting: n,
			northing: r
		};
	}
	unproject(t, n, r = 0) {
		x("easting", t), x("northing", n), x("height", r);
		let [i, a] = this.converter.inverse([t, n]);
		if (x("unprojected longitude", i), x("unprojected latitude", a), Math.abs(a) > 90) throw RangeError("Projected coordinates are outside the projection domain.");
		return e.Cartographic.fromDegrees(i, a, r);
	}
};
function _(t, n) {
	y(n), x("longitude", t);
	let r = e.Math.toDegrees(b(t));
	r < 0 && (r += 360);
	let i = n === 6 ? r / 6 : (r + 1.5) / 3, a = Math.round(i), o = Math.floor(Math.abs(i - a) < 1e-12 ? a : i);
	return n === 6 ? o % 60 + 1 : o % 120;
}
function v(e, t) {
	y(t);
	let n = +(t === 6), r = t === 6 ? 60 : 119;
	if (!Number.isInteger(e) || e < n || e > r) throw RangeError(`zoneNumber must be an integer from ${n} through ${r}.`);
}
function y(e) {
	if (e !== 3 && e !== 6) throw RangeError("zoneWidthDegrees must be either 3 or 6.");
}
function b(t) {
	let n = t % e.Math.TWO_PI;
	return n > Math.PI ? n - e.Math.TWO_PI : n < -Math.PI ? n + e.Math.TWO_PI : n;
}
function x(e, t) {
	if (!Number.isFinite(t)) throw RangeError(`${e} must be finite.`);
}
//#endregion
//#region src/gridGeometry.ts
var S = e.Math.toRadians(84), C = e.Math.toRadians(-80), ee = 8192, w = 5e5, te = [
	{
		maximumCameraHeight: 2e3,
		gridSpacing: 100
	},
	{
		maximumCameraHeight: 5e3,
		gridSpacing: 250
	},
	{
		maximumCameraHeight: 1e4,
		gridSpacing: 500
	},
	{
		maximumCameraHeight: 25e3,
		gridSpacing: 1e3
	},
	{
		maximumCameraHeight: 6e4,
		gridSpacing: 2e3
	},
	{
		maximumCameraHeight: 15e4,
		gridSpacing: 5e3
	},
	{
		maximumCameraHeight: 4e5,
		gridSpacing: 1e4
	},
	{
		maximumCameraHeight: 8e5,
		gridSpacing: 2e4
	},
	{
		maximumCameraHeight: 15e5,
		gridSpacing: 5e4
	},
	{
		maximumCameraHeight: 3e6,
		gridSpacing: 1e5
	},
	{
		maximumCameraHeight: 6e6,
		gridSpacing: 2e5
	},
	{
		maximumCameraHeight: 12e6,
		gridSpacing: 5e5
	},
	{
		maximumCameraHeight: 25e6,
		gridSpacing: 1e6
	},
	{
		maximumCameraHeight: Infinity,
		gridSpacing: 2e6
	}
], T = /* @__PURE__ */ new Map();
function E(e, t) {
	let n = `${t}:${e}`, r = T.get(n);
	return r || (r = new g(e, t), T.size >= 128 && T.delete(T.keys().next().value), T.set(n, r)), r;
}
var D = new e.Cartesian3(), O = new e.Cartesian3(), k = new e.Cartesian3();
function A(t) {
	let n = {
		calculationMode: t.calculationMode ?? (t.gridSpacing === void 0 ? "lod" : "bounded"),
		zoneWidthDegrees: t.zoneWidthDegrees ?? 6,
		zoneNumber: t.zoneNumber,
		gridSpacing: t.gridSpacing ?? 1e3,
		spacingLevels: (t.spacingLevels ?? te).map((e) => ({ ...e })),
		maximumEastingSpacing: t.maximumEastingSpacing ?? 5e5,
		viewPadding: t.viewPadding ?? .12,
		maximumLinesPerAxis: t.maximumLinesPerAxis ?? 28,
		sampleSpacing: t.sampleSpacing,
		altitude: t.altitude ?? 100,
		lineColor: e.Color.clone(t.lineColor ?? e.Color.WHITE.withAlpha(.82)),
		lineWidth: t.lineWidth ?? 1.25,
		majorLineEvery: t.majorLineEvery ?? 10,
		majorLineWidth: t.majorLineWidth ?? 2.5,
		minimumLabelSpacing: t.minimumLabelSpacing ?? 72,
		labelPixelRatio: t.labelPixelRatio ?? 2,
		refreshInterval: t.refreshInterval ?? 80,
		labelUpdateInterval: t.labelUpdateInterval ?? 32,
		largeViewRefreshInterval: t.largeViewRefreshInterval ?? 250,
		largeViewZoneThreshold: t.largeViewZoneThreshold ?? 4
	};
	return W(n), n;
}
function j(t, n) {
	let r = ae(t, n.viewPadding);
	if (r.length === 0) return;
	let i = r.flatMap((e) => P(t, e, n.zoneWidthDegrees, n.zoneNumber));
	if (i.length === 0) return;
	let a = Math.max(0, t.camera.positionCartographic.height), o = M(i), s = !1;
	if (n.calculationMode === "bounded" && !N(o, n)) {
		let e = ne(t, n, r);
		if (!e) return;
		i = e, o = M(i), s = !0;
	}
	let c = n.calculationMode === "bounded" ? n.gridSpacing : oe(a, o.width, o.height, n.spacingLevels, n.maximumLinesPerAxis), l = n.calculationMode === "bounded" ? n.gridSpacing : Math.min(c, n.maximumEastingSpacing), u = Math.max(.001, Math.min(.08, a / Math.max(1, t.canvas.clientHeight) * .05, n.altitude * .25)), d = Math.min(2e3, Math.sqrt(8 * 635e4 * u)), f = Math.sqrt(8 * 635e4 * n.altitude * .25), p = Math.min(n.sampleSpacing ?? Infinity, f, Math.max(d, c * .5)), m = Math.min(n.sampleSpacing ?? Infinity, f, Math.max(d, l * .5)), h = 0, g = 0;
	for (let { projectedBounds: e } of i) {
		let t = R(e.minimumEasting, e.maximumEasting, l), n = R(e.minimumNorthing, e.maximumNorthing, c);
		h += t + n, g += t * (Math.max(2, Math.ceil((e.maximumNorthing - e.minimumNorthing) / p)) + 1) + n * (Math.max(2, Math.ceil((e.maximumEasting - e.minimumEasting) / m)) + 1);
	}
	if (h > ee || g > w || !Number.isFinite(g)) return;
	let _ = [], v = 0, y = 0, b = 0;
	for (let e of i) {
		let r = Math.ceil(e.projectedBounds.minimumEasting / l), i = Math.floor(e.projectedBounds.maximumEasting / l), a = Math.ceil(e.projectedBounds.minimumNorthing / c), o = Math.floor(e.projectedBounds.maximumNorthing / c), { minimumEasting: s, maximumEasting: u, minimumNorthing: d, maximumNorthing: f } = e.projectedBounds;
		for (let a = r; a <= i; a += 1) {
			let r = z(e, t, "easting", a * l, l, d, f, p, n);
			for (let e of r) _.push(e), v += 1, b += e.positions.length - 1;
		}
		for (let r = a; r <= o; r += 1) {
			let i = z(e, t, "northing", r * c, c, s, u, m, n);
			for (let e of i) _.push(e), y += 1, b += e.positions.length - 1;
		}
	}
	return {
		lines: _,
		status: {
			calculationMode: n.calculationMode,
			cameraHeight: a,
			rangeLimited: s,
			gridSpacing: c,
			eastingGridSpacing: l,
			northingGridSpacing: c,
			zoneWidthDegrees: n.zoneWidthDegrees,
			zoneNumbers: [...new Set(i.map((e) => e.projection.zoneNumber))],
			centralMeridians: [...new Set(i.map((t) => e.Math.toDegrees(t.projection.centralMeridian)))],
			verticalLineCount: v,
			horizontalLineCount: y,
			segmentCount: b,
			drawCommandCount: +(_.length > 0)
		}
	};
}
function M(e) {
	let t = 0, n = 0;
	for (let { projectedBounds: r } of e) t += r.maximumEasting - r.minimumEasting, n = Math.max(n, r.maximumNorthing - r.minimumNorthing);
	return {
		width: t,
		height: n
	};
}
function N(e, t) {
	return Math.ceil(e.width / t.gridSpacing) + 1 <= t.maximumLinesPerAxis && Math.ceil(e.height / t.gridSpacing) + 1 <= t.maximumLinesPerAxis;
}
function ne(t, n, r) {
	let i = n.gridSpacing * (n.maximumLinesPerAxis - 1), a = i / 2, o = t.camera.positionCartographic;
	if (!(!Number.isFinite(a) || o.height > a || re(t))) for (let s = 0; s < 4; s += 1) {
		let s = a / e.Ellipsoid.WGS84.minimumRadius, c = Math.min(e.Math.PI_OVER_TWO, Math.abs(o.latitude) + s), l = Math.min(Math.PI, s / Math.max(1e-8, Math.cos(c))), u = L(new e.Rectangle(o.longitude - l, o.latitude - s, o.longitude + l, o.latitude + s), 0), d = [];
		for (let e of r) for (let r of u) {
			let i = {
				west: Math.max(e.west, r.west),
				east: Math.min(e.east, r.east),
				south: Math.max(e.south, r.south),
				north: Math.min(e.north, r.north)
			};
			i.east <= i.west || i.north <= i.south || d.push(...P(t, i, n.zoneWidthDegrees, n.zoneNumber));
		}
		if (d.length === 0) return;
		let f = M(d);
		if (N(f, n)) return d;
		a *= .98 * Math.min(i / f.width, i / f.height);
	}
}
function re(t) {
	let n = e.Ellipsoid.WGS84, r = t.camera.positionCartographic, i = n.cartographicToCartesian(new e.Cartographic(r.longitude, r.latitude)), a = n.geodeticSurfaceNormal(i), o = new e.Cartesian3(), s = new e.Cartesian2(), c = new e.Ray();
	for (let n of [0, t.canvas.clientWidth]) for (let r of [0, t.canvas.clientHeight]) {
		s.x = n, s.y = r;
		let l = t.camera.getPickRay(s, c);
		if (!l || e.Cartesian3.dot(a, l.direction) < 0 || e.Cartesian3.dot(a, e.Cartesian3.subtract(l.origin, i, o)) <= 0) return !1;
	}
	return !0;
}
function P(e, t, n, r) {
	if (r !== void 0) return F(e, E(r, n), t);
	let i = [], a = +(n === 6), o = n === 6 ? 60 : 119;
	for (let r = a; r <= o; r += 1) {
		let a = E(r, n);
		i.push(...F(e, a, t));
	}
	return i;
}
function F(t, n, r) {
	let i = [];
	for (let a of [
		-e.Math.TWO_PI,
		0,
		e.Math.TWO_PI
	]) {
		let e = I(t, n, r, a);
		e && i.push(e);
	}
	return i;
}
function I(e, t, n, r) {
	let i = {
		west: Math.max(n.west, t.westBoundary + r),
		east: Math.min(n.east, t.eastBoundary + r),
		south: n.south,
		north: n.north
	};
	if (!(i.east <= i.west || i.north <= i.south) && B(e, i)) return {
		projection: t,
		geographicBounds: i,
		projectedBounds: ie(t, i)
	};
}
function ie(t, n) {
	let r = Infinity, i = -Infinity, a = Infinity, o = -Infinity, s = t.centralMeridian + Math.round(((n.west + n.east) * .5 - t.centralMeridian) / e.Math.TWO_PI) * e.Math.TWO_PI, c = [
		n.south,
		n.north,
		e.Math.clamp(0, n.south, n.north)
	], l = [
		n.west,
		n.east,
		e.Math.clamp(s, n.west, n.east)
	];
	for (let n of c) for (let s of l) {
		let c = t.project(new e.Cartographic(s, n));
		r = Math.min(r, c.easting), i = Math.max(i, c.easting), a = Math.min(a, c.northing), o = Math.max(o, c.northing);
	}
	return {
		minimumEasting: r - .001,
		maximumEasting: i + .001,
		minimumNorthing: a - .001,
		maximumNorthing: o + .001
	};
}
function ae(t, n) {
	let r = t.camera.computeViewRectangle(e.Ellipsoid.WGS84);
	return r ? L(r, n) : [];
}
function L(t, n) {
	let r = t.east;
	r < t.west && (r += e.Math.TWO_PI);
	let i = Math.min(e.Math.TWO_PI, r - t.west), a = t.north - t.south, o = i * n, s = a * n, c = {
		south: e.Math.clamp(t.south - s, C, S),
		north: e.Math.clamp(t.north + s, C, S)
	}, l = t.west - o;
	if (r += o, r - l >= e.Math.TWO_PI) return [{
		west: -Math.PI,
		east: Math.PI,
		...c
	}];
	for (; l < -Math.PI;) l += e.Math.TWO_PI, r += e.Math.TWO_PI;
	return r > Math.PI ? [{
		west: l,
		east: Math.PI,
		...c
	}, {
		west: -Math.PI,
		east: r - e.Math.TWO_PI,
		...c
	}] : [{
		west: l,
		east: r,
		...c
	}];
}
function oe(e, t, n, r, i) {
	let a = r.findIndex((t) => e <= t.maximumCameraHeight);
	for (a < 0 && (a = r.length - 1); a < r.length - 1;) {
		let e = r[a]?.gridSpacing;
		if (e === void 0 || Math.ceil(t / e) + 1 <= i && Math.ceil(n / e) + 1 <= i) break;
		a += 1;
	}
	return r[a]?.gridSpacing ?? 1e6;
}
function R(e, t, n) {
	return Math.max(0, Math.floor(t / n) - Math.ceil(e / n) + 1);
}
function z(e, t, n, r, i, a, o, s, c) {
	let l = n === "easting", u = se(e, t, l ? r : a, l ? a : r, l ? r : o, l ? o : r, s, c.altitude), d = Math.round(r / i), f = Math.abs(d) % c.majorLineEvery === 0;
	return u.map((t) => ({
		axis: n,
		coordinate: r,
		zoneNumber: e.projection.zoneNumber,
		isMajor: f,
		positions: t
	}));
}
function se(t, n, r, i, a, o, s, c) {
	let l = Math.hypot(a - r, o - i), u = Math.max(2, Math.ceil(l / s)), d = [], f = [], p = 0, m = !1;
	for (let s = 0; s <= u; s += 1) {
		let l = s / u, h = H(t, r, i, a, o, l, c), g = e.Ellipsoid.WGS84.cartographicToCartesian(h), _ = U(t, h) && V(n, g);
		if (s > 0 && _ !== m) {
			let s = H(t, r, i, a, o, ce(t, n, r, i, a, o, p, l, m, c), c);
			f.push(e.Ellipsoid.WGS84.cartographicToCartesian(s)), _ || (f.length >= 2 && d.push(f), f = []);
		}
		_ && f.push(g), p = l, m = _;
	}
	return f.length >= 2 && d.push(f), d;
}
function ce(t, n, r, i, a, o, s, c, l, u) {
	let d = s, f = c, p = Math.hypot(a - r, o - i);
	for (let s = 0; s < 32 && (f - d) * p > .01; s += 1) {
		let s = (d + f) * .5, c = H(t, r, i, a, o, s, u);
		(U(t, c) && V(n, e.Ellipsoid.WGS84.cartographicToCartesian(c))) === l ? d = s : f = s;
	}
	return l ? d : f;
}
function B(t, n) {
	if (t.mode !== e.SceneMode.SCENE3D) return !0;
	let r = t.camera.positionWC, i = Math.atan2(r.y, r.x), a = i + Math.round(((n.west + n.east) * .5 - i) / e.Math.TWO_PI) * e.Math.TWO_PI, o = e.Math.clamp(a, n.west, n.east), s = r.x * Math.cos(o) + r.y * Math.sin(o), c = e.Math.clamp(Math.atan2(r.z, s), n.south, n.north), l = (e) => s * Math.cos(e) + r.z * Math.sin(e);
	return Math.max(l(n.south), l(n.north), l(c)) > e.Ellipsoid.WGS84.minimumRadius;
}
function V(t, n) {
	return t.mode === e.SceneMode.SCENE3D ? (e.Ellipsoid.WGS84.scaleToGeodeticSurface(n, D), e.Ellipsoid.WGS84.geodeticSurfaceNormal(D, O), e.Cartesian3.subtract(t.camera.positionWC, D, k), e.Cartesian3.dot(O, k) > 0) : !0;
}
function H(t, n, r, i, a, o, s) {
	return t.projection.unproject(e.Math.lerp(n, i, o), e.Math.lerp(r, a, o), s);
}
function U(t, n) {
	let r = e.Math.EPSILON10, i = e.Math.EPSILON10, a = n.longitude + Math.round(((t.geographicBounds.west + t.geographicBounds.east) * .5 - n.longitude) / e.Math.TWO_PI) * e.Math.TWO_PI;
	return a >= t.geographicBounds.west - r && a <= t.geographicBounds.east + r && n.latitude >= t.geographicBounds.south - i && n.latitude <= t.geographicBounds.north + i;
}
function W(e) {
	if (e.calculationMode !== "bounded" && e.calculationMode !== "lod") throw RangeError("calculationMode must be either \"bounded\" or \"lod\".");
	if (e.zoneWidthDegrees !== 3 && e.zoneWidthDegrees !== 6) throw RangeError("zoneWidthDegrees must be either 3 or 6.");
	if (e.spacingLevels.length === 0) throw RangeError("spacingLevels must contain at least one level.");
	e.zoneNumber !== void 0 && v(e.zoneNumber, e.zoneWidthDegrees), G("gridSpacing", e.gridSpacing), G("maximumEastingSpacing", e.maximumEastingSpacing);
	let t = -Infinity, n = 0;
	for (let r of e.spacingLevels) {
		if (!Number.isFinite(r.maximumCameraHeight) && r.maximumCameraHeight !== Infinity || r.maximumCameraHeight < 0 || r.maximumCameraHeight <= t) throw RangeError("spacingLevels maximumCameraHeight values must be non-negative and strictly ascending.");
		if (G("gridSpacing", r.gridSpacing), r.gridSpacing < n) throw RangeError("spacingLevels gridSpacing values must be non-decreasing.");
		t = r.maximumCameraHeight, n = r.gridSpacing;
	}
	if (!Number.isFinite(e.viewPadding) || e.viewPadding < 0) throw RangeError("viewPadding must be a non-negative finite number.");
	if (!Number.isInteger(e.maximumLinesPerAxis) || e.maximumLinesPerAxis < 2) throw RangeError("maximumLinesPerAxis must be an integer of at least 2.");
	e.sampleSpacing !== void 0 && G("sampleSpacing", e.sampleSpacing), G("altitude", e.altitude);
	for (let t of [
		e.lineColor.red,
		e.lineColor.green,
		e.lineColor.blue,
		e.lineColor.alpha
	]) if (!Number.isFinite(t) || t < 0 || t > 1) throw RangeError("lineColor components must be finite values from 0 through 1.");
	if (G("lineWidth", e.lineWidth), !Number.isInteger(e.majorLineEvery) || e.majorLineEvery < 1) throw RangeError("majorLineEvery must be a positive integer.");
	if (G("majorLineWidth", e.majorLineWidth), G("minimumLabelSpacing", e.minimumLabelSpacing), G("labelPixelRatio", e.labelPixelRatio), !Number.isFinite(e.refreshInterval) || e.refreshInterval < 0) throw RangeError("refreshInterval must be a non-negative finite number.");
	if (!Number.isFinite(e.labelUpdateInterval) || e.labelUpdateInterval < 0) throw RangeError("labelUpdateInterval must be a non-negative finite number.");
	if (!Number.isFinite(e.largeViewRefreshInterval) || e.largeViewRefreshInterval < 0) throw RangeError("largeViewRefreshInterval must be a non-negative finite number.");
	if (!Number.isInteger(e.largeViewZoneThreshold) || e.largeViewZoneThreshold < 1) throw RangeError("largeViewZoneThreshold must be a positive integer.");
}
function G(e, t) {
	if (!Number.isFinite(t) || t <= 0) throw RangeError(`${e} must be a positive finite number.`);
}
//#endregion
//#region src/screenLabels.ts
var K = "11px Arial, sans-serif", le = "bold 16px Arial, sans-serif", ue = {
	easting: "bottom",
	northing: "left"
}, de = .12, fe = class {
	scene;
	options;
	canvas;
	context;
	projectedPoints = /* @__PURE__ */ new Map();
	textWidths = /* @__PURE__ */ new Map();
	axisBorders = { ...ue };
	visible = !0;
	destroyed = !1;
	constructor(e, t) {
		this.scene = e, this.options = t;
		let n = e.canvas.parentElement;
		if (!n) throw Error("Cesium canvas must have a parent element.");
		this.canvas = document.createElement("canvas"), this.canvas.className = "gauss-kruger-grid-labels", this.canvas.setAttribute("aria-hidden", "true"), Object.assign(this.canvas.style, {
			position: "absolute",
			left: "0",
			top: "0",
			zIndex: "2",
			pointerEvents: "none"
		});
		let r = this.canvas.getContext("2d");
		if (!r) throw Error("A 2D canvas context is required for grid labels.");
		this.context = r, n.appendChild(this.canvas);
	}
	get show() {
		return this.visible;
	}
	set show(e) {
		this.destroyed || (this.visible = e, this.canvas.style.display = e ? "block" : "none");
	}
	update(t) {
		if (this.destroyed || this.scene.isDestroyed()) return 0;
		let n = this.scene.canvas.clientWidth, r = this.scene.canvas.clientHeight;
		if (Object.assign(this.canvas.style, {
			left: `${this.scene.canvas.offsetLeft}px`,
			top: `${this.scene.canvas.offsetTop}px`,
			width: `${n}px`,
			height: `${r}px`
		}), n <= 0 || r <= 0 || this.scene.mode !== e.SceneMode.SCENE3D) return this.context.setTransform(1, 0, 0, 1, 0, 0), this.context.clearRect(0, 0, this.canvas.width, this.canvas.height), this.projectedPoints.clear(), 0;
		let i = Math.min(4, Math.max(window.devicePixelRatio || 1, this.options.pixelRatio)), a = Math.round(n * i), o = Math.round(r * i);
		(this.canvas.width !== a || this.canvas.height !== o) && (this.canvas.width = a, this.canvas.height = o), this.projectedPoints.clear(), this.context.setTransform(i, 0, 0, i, 0, 0), this.context.clearRect(0, 0, n, r), he(this.context), this.axisBorders = ge(this.scene, t, n, r, this.axisBorders, this.projectedPoints);
		let s = 0;
		for (let e of ["easting", "northing"]) {
			let i = pe(this.scene, t, e, this.axisBorders[e], n, r, this.projectedPoints), a = i.reduce((e, t) => Math.max(e, Z(this.context, Y(t.line), this.textWidths).reduce((e, t) => e + t.width, 0)), 0), o = me(i.filter((e) => e.intersection.border === "bottom" ? e.borderPosition >= a + 12 && e.borderPosition < n - a / 2 - 6 : e.borderPosition < r - 48), this.axisBorders[e] === "bottom" ? Math.max(this.options.minimumSpacing, a + 12) : this.options.minimumSpacing);
			for (let e of o) be(this.context, Y(e.line), e.intersection, n, r, this.textWidths);
			s += o.length;
		}
		return s;
	}
	destroy() {
		this.destroyed || (this.destroyed = !0, this.canvas.remove(), this.projectedPoints.clear(), this.textWidths.clear());
	}
};
function pe(e, t, n, r, i, a, o) {
	let s = [];
	for (let c of t) {
		if (c.axis !== n) continue;
		let t = xe(e, c.positions, i, a, [r], o);
		t && s.push({
			line: c,
			intersection: t,
			borderPosition: r === "bottom" ? t.position.x : t.position.y
		});
	}
	return s;
}
function me(e, t) {
	if (e.length <= 1) return [...e];
	let n = [...e].sort((e, t) => e.borderPosition - t.borderPosition), r = [];
	for (let e = 1; e < n.length; e += 1) {
		let t = n[e].borderPosition - n[e - 1].borderPosition;
		t > .5 && r.push(t);
	}
	r.sort((e, t) => e - t);
	let i = r[Math.floor(r.length * .5)] ?? t, a = Math.max(1, Math.ceil(t / i)), o = [...e].sort((e, t) => e.line.coordinate - t.line.coordinate), s = Infinity;
	for (let e = 1; e < o.length; e += 1) {
		let t = Math.abs(o[e].line.coordinate - o[e - 1].line.coordinate);
		t > 0 && (s = Math.min(s, t));
	}
	let c = Number.isFinite(s) ? n.filter((e) => {
		let t = Math.round(e.line.coordinate / s);
		return Math.abs(t) % a === 0;
	}) : n, l = c.length > 0 ? c : [n[0]], u = [], d = -Infinity;
	for (let e of l) e.borderPosition - d < t * .85 || (u.push(e), d = e.borderPosition);
	return u;
}
function he(e) {
	e.lineJoin = "round", e.miterLimit = 2, e.lineWidth = 2.5, e.strokeStyle = "rgba(255, 255, 255, 0.95)", e.fillStyle = "#161616";
}
function ge(e, t, n, r, i, a) {
	let o = q(e, t, "easting", n, r, a), s = q(e, t, "northing", n, r, a);
	if (o === void 0 || s === void 0) return i;
	let c = o - s;
	return Math.abs(c) < de ? i : c > 0 ? {
		easting: "bottom",
		northing: "left"
	} : {
		easting: "left",
		northing: "bottom"
	};
}
function q(e, t, n, r, i, a) {
	let o = 0, s = 0, c = Math.hypot(r, i) * .5;
	for (let l of t) {
		if (l.axis !== n) continue;
		let t;
		for (let n of l.positions) {
			let l = X(e, n, a);
			if (!l) {
				t = void 0;
				continue;
			}
			if (t) {
				let e = Math.abs(l.x - t.x), n = Math.abs(l.y - t.y), a = Math.hypot(e, n), u = (l.x + t.x) * .5, d = (l.y + t.y) * .5;
				a <= c && u >= -r * .25 && u <= r * 1.25 && d >= -i * .25 && d <= i * 1.25 && (o += e, s += n);
			}
			t = l;
		}
	}
	let l = o + s;
	return l > 0 ? s / l : void 0;
}
function _e(t, n) {
	let r = e.Ellipsoid.WGS84.geodeticSurfaceNormal(n, ve);
	return e.Cartesian3.subtract(t.camera.positionWC, n, J), e.Cartesian3.dot(r, J) > 0;
}
var ve = new e.Cartesian3(), J = new e.Cartesian3();
function ye(e) {
	let t = Y(e);
	return `${t.prefix} ${t.value} km`;
}
function Y(e) {
	let t = e.axis === "easting" ? e.zoneNumber * 1e6 + e.coordinate : e.coordinate;
	return {
		prefix: e.axis === "easting" ? "Y" : "X",
		value: String(Number((t / 1e3).toFixed(6)))
	};
}
function X(t, n, r) {
	if (r.has(n)) return r.get(n);
	let i = _e(t, n) ? e.SceneTransforms.worldToWindowCoordinates(t, n) : void 0, a = i && Number.isFinite(i.x) && Number.isFinite(i.y) ? i : void 0;
	return r.set(n, a), a;
}
function be(t, n, r, i, a, o) {
	let s = Z(t, n, o), c = s.reduce((e, t) => e + t.width, 0), l = e.Math.clamp(r.position.x, 3, i - 3), u = e.Math.clamp(r.position.y, 3, a - 3), d, f;
	switch (r.border) {
		case "top":
			d = e.Math.clamp(l - c * .5, 3, i - c - 3), f = 18;
			break;
		case "right":
			d = i - c - 5, f = e.Math.clamp(u + 5, 18, a - 5);
			break;
		case "bottom":
			d = e.Math.clamp(l - c * .5, 3, i - c - 3), f = a - 25;
			break;
		case "left":
			d = 5, f = e.Math.clamp(u + 5, 18, a - 5);
			break;
	}
	t.save(), t.textAlign = "left", t.textBaseline = "alphabetic";
	let p = d;
	for (let e of s) t.font = e.font, t.strokeText(e.text, p, f + e.baselineOffset), p += e.width;
	p = d;
	for (let e of s) t.font = e.font, t.fillText(e.text, p, f + e.baselineOffset), p += e.width;
	t.restore();
}
function Z(e, t, n) {
	let r = t.value.startsWith("-"), [i, a] = (r ? t.value.slice(1) : t.value).split("."), o = i.slice(0, -2), s = i.slice(-2), c = r ? "−" : "";
	return [
		{
			text: o ? c + o : "",
			font: K,
			baselineOffset: -5
		},
		{
			text: (o ? "" : c) + s,
			font: le,
			baselineOffset: 0
		},
		{
			text: a ? `.${a}` : "",
			font: K,
			baselineOffset: 0
		}
	].filter((e) => e.text.length > 0).map((t) => {
		let r = `${t.font}:${t.text}`, i = n.get(r);
		return i === void 0 && (e.font = t.font, i = e.measureText(t.text).width, n.size >= 1024 && n.clear(), n.set(r, i)), {
			...t,
			width: i
		};
	});
}
function xe(e, t, n, r, i, a) {
	let o = [], s;
	for (let i of t) {
		let t = X(e, i, a);
		s && t && we(s, t, n, r, o), s = t;
	}
	for (let t of i) {
		let i = o.find((i) => i.border === t && Se(e, i, n, r));
		if (i) return i;
	}
}
function Se(t, n, r, i) {
	let a = Ce;
	return a.x = e.Math.clamp(n.position.x, 2, r - 2), a.y = e.Math.clamp(n.position.y, 2, i - 2), n.border === "left" ? a.x = 2 : n.border === "right" ? a.x = r - 2 : n.border === "top" ? a.y = 2 : a.y = i - 2, !!t.camera.pickEllipsoid(a, e.Ellipsoid.WGS84);
}
var Ce = new e.Cartesian2();
function we(e, t, n, r, i) {
	let a = t.x - e.x, o = t.y - e.y;
	o !== 0 && (Q(e, a, o, -e.y / o, "top", n, r, i), Q(e, a, o, (r - e.y) / o, "bottom", n, r, i)), a !== 0 && (Q(e, a, o, -e.x / a, "left", n, r, i), Q(e, a, o, (n - e.x) / a, "right", n, r, i));
}
function Q(t, n, r, i, a, o, s, c) {
	if (i < 0 || i > 1) return;
	let l = t.x + n * i, u = t.y + r * i;
	l < -.5 || l > o + .5 || u < -.5 || u > s + .5 || c.push({
		border: a,
		position: new e.Cartesian2(e.Math.clamp(l, 0, o), e.Math.clamp(u, 0, s))
	});
}
//#endregion
//#region src/GaussKrugerGrid.ts
var $ = class {
	changed = new e.Event();
	scene;
	options;
	primitive;
	labelOverlay;
	removeMoveStartListener;
	removeMoveEndListener;
	removePreUpdateListener;
	removePreRenderListener;
	lastViewMatrix = new e.Matrix4();
	lastGridViewMatrix = new e.Matrix4();
	lastProjectionMatrix = new e.Matrix4();
	lastGridProjectionMatrix = new e.Matrix4();
	lastSceneMode;
	lastPixelRatio = 0;
	lines = [];
	currentStatus;
	lastCanvasWidth = 0;
	lastCanvasHeight = 0;
	lastGridRefresh = -Infinity;
	lastLabelUpdate = -Infinity;
	labelsDirty = !1;
	cameraMoving = !1;
	visible = !0;
	destroyed = !1;
	constructor(t, n = {}) {
		if (this.scene = t, this.options = A(n), t.isDestroyed()) throw Error("GaussKrugerGrid requires a Scene that has not been destroyed.");
		if (!t.ellipsoid.equals(e.Ellipsoid.WGS84)) throw Error("GaussKrugerGrid requires the WGS84 scene ellipsoid.");
		this.labelOverlay = new fe(t, {
			minimumSpacing: this.options.minimumLabelSpacing,
			pixelRatio: this.options.labelPixelRatio
		}), this.primitive = t.primitives.add(new d({
			lineColor: this.options.lineColor,
			lineWidth: this.options.lineWidth,
			majorLineWidth: this.options.majorLineWidth
		})), this.removeMoveStartListener = t.camera.moveStart.addEventListener(this.handleMoveStart), this.removeMoveEndListener = t.camera.moveEnd.addEventListener(this.handleMoveEnd), this.removePreUpdateListener = t.preUpdate.addEventListener(this.handlePreUpdate), this.removePreRenderListener = t.preRender.addEventListener(this.handlePreRender);
		try {
			this.refresh();
		} catch (e) {
			throw this.destroy(), e;
		}
	}
	get show() {
		return this.visible;
	}
	set show(t) {
		this.destroyed || this.scene.isDestroyed() || this.visible === t || (this.visible = t, this.primitive.show = t && this.scene.mode === e.SceneMode.SCENE3D, this.labelOverlay.show = this.primitive.show && !(this.cameraMoving && this.isLargeView()), this.scene.requestRender(), t && this.refresh());
	}
	get status() {
		return this.currentStatus;
	}
	refresh() {
		if (this.destroyed || this.scene.isDestroyed() || !this.visible) return;
		if (e.Matrix4.clone(this.scene.camera.viewMatrix, this.lastGridViewMatrix), e.Matrix4.clone(this.scene.camera.frustum.projectionMatrix, this.lastGridProjectionMatrix), this.lastSceneMode = this.scene.mode, this.lastGridRefresh = performance.now(), this.lastCanvasWidth = this.scene.canvas.clientWidth, this.lastCanvasHeight = this.scene.canvas.clientHeight, this.scene.mode !== e.SceneMode.SCENE3D || this.lastCanvasWidth <= 0 || this.lastCanvasHeight <= 0) {
			this.clearGrid();
			return;
		}
		let t = j(this.scene, this.options);
		if (!t) {
			this.clearGrid();
			return;
		}
		this.lines = t.lines, this.primitive.set(this.lines), this.primitive.show = this.visible, this.currentStatus = t.status, this.labelsDirty = !0, this.cameraMoving && this.isLargeView() && (this.labelOverlay.show = !1), this.scene.requestRender(), this.changed.raiseEvent(t.status);
	}
	isDestroyed() {
		return this.destroyed;
	}
	destroy() {
		this.destroyed || (this.destroyed = !0, this.removeMoveStartListener(), this.removeMoveEndListener(), this.removePreUpdateListener(), this.removePreRenderListener(), this.scene.isDestroyed() || (this.scene.primitives.remove(this.primitive), this.scene.requestRender()), this.primitive.isDestroyed() || this.primitive.destroy(), this.lines = [], this.currentStatus = void 0, this.labelOverlay.destroy());
	}
	handleMoveStart = () => {
		this.cameraMoving = !0, this.isLargeView() && (this.labelOverlay.show = !1);
	};
	handleMoveEnd = () => {
		this.cameraMoving = !1, this.refresh();
	};
	handlePreUpdate = () => {
		if (this.destroyed || this.scene.isDestroyed() || !this.visible) return;
		let t = performance.now(), n = this.scene.canvas.clientWidth, r = this.scene.canvas.clientHeight;
		if (this.scene.mode !== this.lastSceneMode || n !== this.lastCanvasWidth || r !== this.lastCanvasHeight) {
			this.refresh();
			return;
		}
		if (this.scene.mode !== e.SceneMode.SCENE3D || n <= 0 || r <= 0) return;
		let i = !e.Matrix4.equals(this.scene.camera.viewMatrix, this.lastGridViewMatrix) || !e.Matrix4.equals(this.scene.camera.frustum.projectionMatrix, this.lastGridProjectionMatrix);
		(window.devicePixelRatio || 1) !== this.lastPixelRatio && (this.labelsDirty = !0);
		let a = this.isLargeView() ? Math.max(this.options.refreshInterval, this.options.largeViewRefreshInterval) : this.options.refreshInterval;
		if (i && t - this.lastGridRefresh >= a) {
			this.refresh();
			return;
		}
		!(this.cameraMoving && this.isLargeView()) && (this.labelsDirty || this.hasLabelViewChanged()) && t - this.lastLabelUpdate >= this.options.labelUpdateInterval && this.scene.requestRender();
	};
	handlePreRender = () => {
		if (this.destroyed || !this.visible || this.scene.mode !== e.SceneMode.SCENE3D) return;
		let t = performance.now();
		if (this.cameraMoving && this.isLargeView()) {
			this.labelOverlay.show = !1;
			return;
		}
		!this.labelsDirty && (!this.hasLabelViewChanged() || t - this.lastLabelUpdate < this.options.labelUpdateInterval) || (e.Matrix4.clone(this.scene.camera.viewMatrix, this.lastViewMatrix), e.Matrix4.clone(this.scene.camera.frustum.projectionMatrix, this.lastProjectionMatrix), this.lastLabelUpdate = t, this.lastPixelRatio = window.devicePixelRatio || 1, this.labelsDirty = !1, this.labelOverlay.update(this.lines), this.labelOverlay.show = this.visible);
	};
	hasLabelViewChanged() {
		return !e.Matrix4.equals(this.scene.camera.viewMatrix, this.lastViewMatrix) || !e.Matrix4.equals(this.scene.camera.frustum.projectionMatrix, this.lastProjectionMatrix);
	}
	isLargeView() {
		return (this.currentStatus?.zoneNumbers.length ?? 0) >= this.options.largeViewZoneThreshold;
	}
	clearGrid() {
		let e = this.currentStatus !== void 0;
		this.lines = [], this.primitive.set([]), this.primitive.show = !1, this.currentStatus = void 0, this.labelsDirty = !1, this.labelOverlay.update([]), this.labelOverlay.show = !1, this.scene.requestRender(), e && this.changed.raiseEvent(void 0);
	}
};
//#endregion
export { d as DrawCommandGaussKrugerGridPrimitive, $ as GaussKrugerGrid, $ as GaussKrugerNeighborGrid, $ as WebMercatorSquareGrid, g as GaussKrugerProjection, ye as formatGridCoordinate, _ as zoneNumberFromLongitude };

//# sourceMappingURL=index.js.map