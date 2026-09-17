import { Room } from "./room.mjs";
import { mintAuthorization } from "./openai.mjs";
const json = (body, status = 200, origin = "") => Response.json(body, { status, headers: {
  "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
  ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {})
} });
export default {
  async fetch(request, env) {
    const url = new URL(request.url), origin = request.headers.get("Origin");
    const allowed = (env.APP_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
    if (!origin || !allowed.includes(origin)) return json({ error: "Origen no autorizado. Configura APP_ORIGINS con la dirección de tu página." }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: {
      "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin", "Access-Control-Max-Age": "600"
    } });
    if (url.pathname === "/health") return json({ service: "puente", version: 1 }, 200, origin);
    if (url.pathname !== "/room" || request.method !== "GET") return json({ error: "Ruta no disponible." }, 404, origin);
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return json({ error: "Se necesita WebSocket." }, 426, origin);
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(env.ROOM_ACCESS_TOKEN || "") || env.ROOM_ACCESS_TOKEN.startsWith("sk-"))
      return json({ error: "Configura ROOM_ACCESS_TOKEN en el servidor." }, 503, origin);
    return env.EVENT_ROOM.get(env.EVENT_ROOM.idFromName("single-event")).fetch(request);
  }
};
// The regular WebSocket API pins this singleton actor while connected.
// Caption text lives only in memory, is bounded, and expires after 30 idle minutes.
export class EventRoom {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env; this.sockets = new Map();
    this.room = new Room({ mint: async signal => {
      await ctx.storage.put("mintTimes", this.room.tokenTimes);
      return mintAuthorization(env.OPENAI_API_KEY, signal);
    } });
    ctx.blockConcurrencyWhile(async () => { this.room.tokenTimes = await ctx.storage.get("mintTimes") || []; });
  }
  async fetch() {
    if (this.sockets.size >= 200) return json({ error: "La sala está llena." }, 503);
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    const id = crypto.randomUUID();
    const peer = { joined: false, created: Date.now() };
    this.sockets.set(id, { server, peer });
    server.addEventListener("message", event => {
      void this.message(id, event.data).catch(() => this.close(id, 1011, "Error de sala."));
    });
    server.addEventListener("close", () => this.close(id, 1000, "Desconectado."));
    server.addEventListener("error", () => this.close(id, 1011, "Conexión interrumpida."));
    await this.ctx.storage.setAlarm(Date.now() + 5000);
    return new Response(null, { status: 101, webSocket: client });
  }
  async message(id, raw) {
    const item = this.sockets.get(id); if (!item) return;
    if (typeof raw !== "string" || raw.length > 12000) return this.close(id, 1009, "Mensaje demasiado grande.");
    let msg; try { msg = JSON.parse(raw); } catch { return this.close(id, 1003, "Formato no válido."); }
    if (!msg || typeof msg !== "object" || Array.isArray(msg)) return this.close(id, 1003, "Formato no válido.");
    if (!item.peer.joined) {
      if (msg.type !== "join" || typeof msg.token !== "string" || !equalToken(msg.token, this.env.ROOM_ACCESS_TOKEN))
        return this.close(id, 4003, "El enlace de acceso no es válido.");
      item.peer.joined = true;
      this.room.add(id, message => item.server.send(JSON.stringify(message)));
      return;
    }
    await this.room.receive(id, msg);
  }
  close(id, code, reason) {
    const item = this.sockets.get(id); if (!item) return;
    this.sockets.delete(id); this.room.remove(id);
    try { item.server.close(code, reason); } catch { /* closed */ }
  }
  async alarm() {
    this.room.sweep();
    for (const [id, item] of this.sockets) {
      if ((!item.peer.joined && Date.now() - item.peer.created > 5000) ||
        (item.peer.joined && !this.room.peers.has(id))) this.close(id, 4008, "La conexión expiró.");
    }
    if (this.sockets.size || this.room.lastTextAt) await this.ctx.storage.setAlarm(Date.now() + 5000);
  }
}
function equalToken(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0; for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
