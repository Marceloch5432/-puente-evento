// One authoritative room. The adapter authenticates peers before adding them.
export class Room {
  constructor({ now = Date.now, uuid = () => crypto.randomUUID(), mint } = {}) {
    this.now = now; this.uuid = uuid; this.mint = mint;
    this.peers = new Map(); this.owner = null; this.version = 0;
    this.boot = this.uuid(); this.mode = "live";
    this.captions = { lines: [], pending: "", source: "" };
    this.lastTextAt = 0; this.tokenTimes = [];
  }
  add(id, send) {
    this.peers.set(id, { send, seen: this.now(), window: 0, count: 0 });
    send({ ...this.snapshot(), type: "welcome", id }); this.broadcast();
  }
  remove(id) {
    this.peers.delete(id);
    if (this.owner?.id === id) { this.owner.abort?.abort(); this.owner = null; }
    this.broadcast();
  }
  snapshot() {
    return { type: "snapshot", boot: this.boot, version: this.version,
      people: this.peers.size, owner: this.owner ? { id: this.owner.id, state: this.owner.state } : null,
      mode: this.mode, captions: this.captions, lastTextAt: this.lastTextAt };
  }
  broadcast() {
    this.version++; const message = this.snapshot();
    for (const p of this.peers.values()) { try { p.send(message); } catch { /* adapter removes closed sockets */ } }
  }
  reply(id, request, result, error) {
    this.peers.get(id)?.send({ type: "reply", request, ...(error ? { error } : { result }) });
  }
  sweep() {
    const now = this.now();
    for (const [id, p] of this.peers) if (now - p.seen > 18000) this.remove(id);
    if (this.owner && this.owner.state === "preparing" && now - this.owner.since > 90000) {
      const id = this.owner.id;
      this.owner.abort?.abort(); this.owner = null; this.broadcast();
      this.peers.get(id)?.send({ type: "notice", message: "No se inició el audio. El micrófono quedó libre; vuelve a intentarlo." });
    }
    if (!this.owner && this.lastTextAt && now - this.lastTextAt > 30 * 60 * 1000) {
      this.captions = { lines: [], pending: "", source: "" }; this.lastTextAt = 0; this.broadcast();
    }
  }
  async receive(id, message) {
    const p = this.peers.get(id); if (!p) return;
    const now = this.now();
    if (now - p.window > 1000) { p.window = now; p.count = 0; }
    if (++p.count > 30) return this.reply(id, message.request, null, "Demasiadas solicitudes. Espera un momento.");
    p.seen = now;
    const { type, request } = message;
    if (type === "ping") return p.send({ type: "pong" });
    if (type === "take") {
      if (this.owner) return this.reply(id, request, null, "El micrófono está en uso.");
      if (!["live", "demo"].includes(message.mode)) return this.reply(id, request, null, "Modo no válido.");
      if (message.mode !== this.mode) { this.captions = { lines: [], pending: "", source: "" }; this.lastTextAt = 0; }
      this.mode = message.mode;
      this.owner = { id, lease: this.uuid(), state: "preparing", since: now, sequence: 0, mints: 0 };
      this.reply(id, request, { lease: this.owner.lease }); this.broadcast(); return;
    }
    if (!this.owner || this.owner.id !== id || message.lease !== this.owner.lease)
      return this.reply(id, request, null, "Este dispositivo no tiene el micrófono.");
    const owner = this.owner;
    if (type === "release") {
      owner.abort?.abort(); this.owner = null; this.reply(id, request, {}); this.broadcast(); return;
    }
    if (type === "clear") {
      this.captions = { lines: [], pending: "", source: "" }; this.lastTextAt = 0;
      this.reply(id, request, {}); this.broadcast(); return;
    }
    if (type === "ready") { owner.state = "live"; this.reply(id, request, {}); this.broadcast(); return; }
    if (type === "preparing") { owner.state = "preparing"; owner.since = now; this.reply(id, request, {}); this.broadcast(); return; }
    if (type === "captions") {
      const c = message.captions;
      if (!Number.isSafeInteger(message.sequence) || message.sequence <= owner.sequence) return;
      if (!c || !Array.isArray(c.lines) || c.lines.length > 8 || c.lines.some(s => typeof s !== "string" || s.length > 600)
        || typeof c.pending !== "string" || c.pending.length > 600 || typeof c.source !== "string" || c.source.length > 600) return;
      owner.sequence = message.sequence;
      this.captions = { lines: c.lines, pending: c.pending, source: c.source };
      this.lastTextAt = now; this.broadcast(); return;
    }
    if (type === "token") {
      if (this.mode !== "live") return this.reply(id, request, null, "La demo no usa OpenAI.");
      this.tokenTimes = this.tokenTimes.filter(t => now - t < 3600000);
      if (owner.minting || (owner.lastMint && now - owner.lastMint < 20000) || this.tokenTimes.length >= 12)
        return this.reply(id, request, null, "Espera unos segundos antes de iniciar otra conexión. La sala permite 12 autorizaciones por hora.");
      owner.minting = true; owner.lastMint = now; this.tokenTimes.push(now);
      const abort = new AbortController(); owner.abort = abort;
      try {
        const result = await this.mint(abort.signal);
        if (this.owner === owner && this.peers.has(id)) this.reply(id, request, result);
      } catch (error) {
        if (this.owner === owner && this.peers.has(id))
          this.reply(id, request, null, error?.safeMessage || "No se pudo autorizar OpenAI. Revisa la configuración del servidor.");
      } finally { owner.minting = false; }
      return;
    }
    this.reply(id, request, null, "Solicitud no reconocida.");
  }
}
