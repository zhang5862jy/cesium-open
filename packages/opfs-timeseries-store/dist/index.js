//#region src/errors.ts
var e = class extends Error {
	code;
	constructor(e, t, n) {
		super(t, n), this.name = "TimeSeriesStorageError", this.code = e;
	}
};
function t(t) {
	return new e(t.code, t.message, { cause: t.cause ? Error(t.cause) : void 0 });
}
var n = 5e3, r = 64 * 1024 * 1024;
function i(t) {
	if (!t || t.length > 256) throw new e("INVALID_ARGUMENT", "sceneId 必须是 1–256 个字符。");
}
function a(t, n = "timestampMs") {
	if (!Number.isSafeInteger(t)) throw new e("INVALID_ARGUMENT", `${n} 必须是安全整数毫秒时间戳。`);
}
function o(t) {
	if (!Number.isSafeInteger(t) || t <= 0) throw new e("INVALID_ARGUMENT", "protocolId 必须是正安全整数。");
}
function s(t) {
	if (i(t.sceneId), a(t.fromInclusive, "fromInclusive"), a(t.toExclusive, "toExclusive"), t.fromInclusive >= t.toExclusive) throw new e("INVALID_ARGUMENT", "时间范围必须满足 fromInclusive < toExclusive。");
	let r = [...new Set(t.protocolIds ?? [])].sort((e, t) => e - t);
	r.forEach(o);
	let s = t.batchSize ?? 2e3;
	if (!Number.isInteger(s) || s < 1 || s > 5e3) throw new e("INVALID_ARGUMENT", `batchSize 必须在 1–${n} 之间。`);
	return {
		...t,
		protocolIds: r,
		batchSize: s
	};
}
function c(t) {
	if (i(t.sceneId), a(t.timestampMs), !Number.isSafeInteger(t.sequence) || t.sequence <= 0) throw new e("INVALID_ARGUMENT", "sequence 必须是正安全整数。");
}
function l(t) {
	if (t.sceneId !== void 0 && t.sceneId !== "" && i(t.sceneId), a(t.fromInclusive, "fromInclusive"), a(t.toExclusive, "toExclusive"), t.fromInclusive >= t.toExclusive) throw new e("INVALID_ARGUMENT", "时间范围必须满足 fromInclusive < toExclusive。");
	let n = [...new Set(t.protocolIds ?? [])].sort((e, t) => e - t);
	n.forEach(o);
	let r = t.pageSize ?? 50;
	if (!Number.isInteger(r) || r < 1 || r > 200) throw new e("INVALID_ARGUMENT", "pageSize 必须在 1–200 之间。");
	return {
		...t,
		sceneId: t.sceneId || void 0,
		protocolIds: n,
		pageSize: r
	};
}
//#endregion
//#region src/protocol-registry.ts
function u(e, t) {
	return `${e}:${t}`;
}
var d = class {
	#e = /* @__PURE__ */ new Map();
	#t = /* @__PURE__ */ new Map();
	register(t) {
		if (o(t.protocolId), !Number.isSafeInteger(t.version) || t.version <= 0) throw new e("INVALID_ARGUMENT", "协议 version 必须是正安全整数。");
		let n = u(t.protocolId, t.version);
		if (this.#e.has(n)) throw new e("INVALID_ARGUMENT", `协议 ${n} 已注册。`);
		let r = t;
		this.#e.set(n, r);
		let i = this.#t.get(t.protocolId);
		return (!i || t.version > i.version) && this.#t.set(t.protocolId, r), this;
	}
	encode(t, n) {
		let r = this.#t.get(t);
		if (!r) throw new e("UNKNOWN_PROTOCOL", `未注册 protocolId=${t} 的编码器。`);
		try {
			return {
				codecVersion: r.version,
				payload: r.encode(n)
			};
		} catch (n) {
			throw new e("ENCODING", `protocolId=${t} 编码失败。`, { cause: n });
		}
	}
	decode(t) {
		let n = u(t.protocolId, t.codecVersion), r = this.#e.get(n);
		if (!r) throw new e("UNKNOWN_PROTOCOL", `未注册协议解码器 ${n}。`);
		try {
			let { payload: e, ...n } = t;
			return {
				...n,
				value: r.decode(t.payload)
			};
		} catch (t) {
			throw new e("CORRUPT_PAYLOAD", `协议 ${n} 的 payload 无法解码。`, { cause: t });
		}
	}
}, f = class {
	#e;
	#t = [];
	#n = 0;
	constructor(e) {
		this.#e = e;
	}
	get used() {
		return this.#n;
	}
	async acquire(t) {
		if (!Number.isFinite(t) || t < 0 || t > this.#e) throw new e("BACKPRESSURE", `单批数据不能超过 ${this.#e} 字节。`);
		if (this.#t.length === 0 && this.#n + t <= this.#e) {
			this.#n += t;
			return;
		}
		await new Promise((e) => {
			this.#t.push({
				bytes: t,
				resolve: e
			}), this.#r();
		});
	}
	release(e) {
		this.#n = Math.max(0, this.#n - e), this.#r();
	}
	#r() {
		for (; this.#t.length > 0;) {
			let e = this.#t[0];
			if (!e || this.#n + e.bytes > this.#e) return;
			this.#t.shift(), this.#n += e.bytes, e.resolve();
		}
	}
}, p = class {
	#e;
	#t;
	#n;
	constructor(e) {
		this.#e = e;
	}
	async acquire() {
		if (!("locks" in navigator)) throw new e("UNSUPPORTED", "当前浏览器不支持 Web Locks API。");
		let t, n, r = new Promise((e, r) => {
			t = e, n = r;
		}), i = new Promise((e) => {
			this.#t = e;
		});
		if (this.#n = navigator.locks.request(this.#e, {
			mode: "exclusive",
			ifAvailable: !0
		}, async (e) => {
			t(!!e), e && await i;
		}).catch(n), !await r) throw this.#t = void 0, new e("LOCK_UNAVAILABLE", "另一个标签页正在使用时序数据库。");
	}
	async release() {
		this.#t?.(), this.#t = void 0, await this.#n, this.#n = void 0;
	}
}, m = 1024 ** 3, h = 3e4, g = m, _ = class {
	#e;
	#t = 0;
	#n = 0;
	async initialize(t) {
		if (!navigator.storage?.estimate) throw new e("UNSUPPORTED", "当前浏览器不支持 StorageManager。");
		return t && navigator.storage.persist && await navigator.storage.persist(), this.refresh();
	}
	async beforeWrite(t) {
		this.#n += t;
		let n = performance.now() - this.#t >= h;
		(!this.#e || n || this.#n >= g) && await this.refresh();
		let r = this.#e;
		if (!r || r.available - t < r.reserve) throw new e("QUOTA_EXCEEDED", `剩余空间必须保留至少 ${v(r?.reserve ?? 2 * m)}。`);
		return r;
	}
	async refresh() {
		let e = await navigator.storage.estimate(), t = navigator.storage.persisted ? await navigator.storage.persisted() : !1, n = e.usage ?? 0, r = e.quota ?? 0, i = Math.max(2 * m, r * .15), a = Math.max(0, r - n);
		return this.#e = {
			usage: n,
			quota: r,
			available: a,
			reserve: i,
			writable: r > 0 && a >= i,
			persisted: t
		}, this.#t = performance.now(), this.#n = 0, this.#e;
	}
};
function v(e) {
	if (!Number.isFinite(e) || e <= 0) return "0 B";
	let t = [
		"B",
		"KiB",
		"MiB",
		"GiB",
		"TiB"
	], n = Math.min(Math.floor(Math.log(e) / Math.log(1024)), t.length - 1);
	return `${(e / 1024 ** n).toFixed(n === 0 ? 0 : 2)} ${t[n]}`;
}
//#endregion
//#region src/worker-messages.ts
var y = "/browser-timeseries-store-v1", b = class n {
	#e;
	#t;
	#n;
	#r = new _();
	#i = new f(r);
	#a = /* @__PURE__ */ new Map();
	#o;
	#s;
	#c;
	constructor(e, t, n) {
		this.#e = e, this.#t = t, this.#n = n, t.onmessage = (e) => this.#d(e.data), t.onerror = (e) => this.#p(Error(e.message || "无法加载存储 Worker。")), t.onmessageerror = () => this.#p(/* @__PURE__ */ Error("Worker message could not be decoded"));
	}
	static async open(t, r = {}) {
		if (!globalThis.isSecureContext || !globalThis.navigator?.storage?.getDirectory || typeof Worker > "u") throw new e("UNSUPPORTED", "OPFS 需要 HTTPS 或 localhost 安全上下文。");
		let i = r.databaseName ?? "timeseries-v1", a = new p(`browser-timeseries-store:${y}`);
		await a.acquire();
		let o;
		try {
			o = new Worker(new URL(
				/* @vite-ignore */
				"" + new URL("assets/storage.worker-BEO9imrF.js", import.meta.url).href,
				"" + import.meta.url
			), {
				type: "module",
				name: "browser-timeseries-storage"
			});
			let e = new n(t, o, a);
			if (e.#c = await e.#r.initialize(r.requestPersistence ?? !0), (await e.#u({
				kind: "initialize",
				databaseName: i
			})).kind !== "initialize") throw Error("unexpected initialize response");
			return e;
		} catch (e) {
			throw o?.terminate(), await a.release(), e;
		}
	}
	get storageEstimate() {
		return this.#c;
	}
	async appendBatch(t) {
		if (this.#m(), t.length === 0) throw new e("INVALID_ARGUMENT", "appendBatch 至少需要一条记录。");
		let n = [], r = [], s = 0;
		for (let e of t) {
			i(e.sceneId), a(e.timestampMs), o(e.protocolId);
			let t = this.#e.encode(e.protocolId, e.value), c = Uint8Array.from(t.payload).buffer;
			r.length > 0 && (r.length >= 5e3 || s + c.byteLength > 4194304) && (n.push(r), r = [], s = 0), r.push({
				sceneId: e.sceneId,
				timestampMs: e.timestampMs,
				protocolId: e.protocolId,
				codecVersion: t.codecVersion,
				payload: c
			}), s += c.byteLength;
		}
		r.length > 0 && n.push(r);
		let c = 0, l = 0, u = 0;
		for (let e of n) {
			let t = e.reduce((e, t) => e + t.payload.byteLength, 0);
			this.#c = await this.#r.beforeWrite(t), await this.#i.acquire(t);
			try {
				let n = e.map((e) => e.payload), r = await this.#u({
					kind: "append",
					records: e,
					byteLength: t
				}, n);
				if (r.kind !== "append") throw Error("unexpected append response");
				u === 0 && (c = r.value.firstSequence), l = r.value.lastSequence, u += r.value.committedCount;
			} finally {
				this.#i.release(t);
			}
		}
		return {
			firstSequence: c,
			lastSequence: l,
			committedCount: u
		};
	}
	queryRange(e) {
		this.#m();
		let t = s(e), n;
		return new ReadableStream({
			start: async () => {
				let e = await this.#u({
					kind: "query-open",
					query: t
				});
				if (e.kind !== "query-open") throw Error("unexpected query-open response");
				n = e.queryId;
			},
			pull: async (e) => {
				if (n) try {
					let t = await this.#u({
						kind: "query-next",
						queryId: n
					});
					if (t.kind !== "query-next") throw Error("unexpected query-next response");
					let r = {
						records: t.batch.records.map((e) => ({
							...e,
							payload: new Uint8Array(e.payload)
						})),
						nextCursor: t.batch.nextCursor,
						done: t.batch.done
					};
					e.enqueue(r), r.done && (n = void 0, e.close());
				} catch (t) {
					e.error(t);
				}
			},
			cancel: async () => {
				if (!n || this.#o) return;
				let e = n;
				if (n = void 0, (await this.#u({
					kind: "query-close",
					queryId: e
				})).kind !== "query-close") throw Error("unexpected query-close response");
			}
		});
	}
	async recordsPage(e) {
		this.#m();
		let t = l(e), n = await this.#u({
			kind: "records-page",
			query: t
		});
		if (n.kind !== "records-page") throw Error("unexpected records-page response");
		return {
			...n.value,
			records: n.value.records.map((e) => ({
				...e,
				payload: new Uint8Array(e.payload)
			}))
		};
	}
	async updateRecord(e) {
		this.#m(), c(e.key), i(e.sceneId), a(e.timestampMs), o(e.protocolId);
		let t = this.#e.encode(e.protocolId, e.value), n = Uint8Array.from(t.payload).buffer, r = n.byteLength;
		this.#c = await this.#r.beforeWrite(r), await this.#i.acquire(r);
		try {
			let r = await this.#u({
				kind: "update-record",
				record: {
					key: { ...e.key },
					sceneId: e.sceneId,
					timestampMs: e.timestampMs,
					protocolId: e.protocolId,
					codecVersion: t.codecVersion,
					payload: n
				}
			}, [n]);
			if (r.kind !== "update-record") throw Error("unexpected update-record response");
			return r.value;
		} finally {
			this.#i.release(r);
		}
	}
	async deleteRecord(e) {
		this.#m(), c(e);
		let t = await this.#u({
			kind: "delete-record",
			key: e
		});
		if (t.kind !== "delete-record") throw Error("unexpected delete-record response");
		return t.value;
	}
	decode(e) {
		return this.#e.decode(e);
	}
	decodeManaged(e) {
		return this.#e.decode(e);
	}
	async stats() {
		this.#m();
		let e = await this.#u({ kind: "stats" });
		if (e.kind !== "stats") throw Error("unexpected stats response");
		return e.value;
	}
	async clearAllData() {
		this.#m();
		let e = await this.#u({ kind: "clear-all" });
		if (e.kind !== "clear-all") throw Error("unexpected clear-all response");
		return this.#c = await this.#r.refresh(), e.value;
	}
	async refreshStorageEstimate() {
		return this.#m(), this.#c = await this.#r.refresh(), this.#c;
	}
	close() {
		return this.#o ??= this.#l();
	}
	async #l() {
		try {
			if ((await this.#u({ kind: "close" })).kind !== "close") throw Error("unexpected close response");
		} finally {
			this.#t.terminate(), this.#f(new e("CLOSED", "数据库客户端已关闭。")), await this.#n.release();
		}
	}
	async #u(e, t = []) {
		this.#m();
		let n = crypto.randomUUID(), r = {
			...e,
			id: n
		};
		return new Promise((e, i) => {
			this.#a.set(n, {
				resolve: e,
				reject: i
			});
			try {
				this.#t.postMessage(r, t);
			} catch (e) {
				this.#a.delete(n), i(e);
			}
		});
	}
	#d(e) {
		let n = this.#a.get(e.id);
		n && (this.#a.delete(e.id), e.ok ? n.resolve(e.result) : n.reject(t(e.error)));
	}
	#f(e) {
		for (let t of this.#a.values()) t.reject(e);
		this.#a.clear();
	}
	#p(e) {
		this.#s ??= e, this.#f(e);
	}
	#m() {
		if (this.#o) throw new e("CLOSED", "数据库客户端已关闭。");
		if (this.#s) throw this.#s;
	}
};
//#endregion
export { d as ProtocolRegistry, e as TimeSeriesStorageError, b as TimeSeriesStore, v as formatBytes };
