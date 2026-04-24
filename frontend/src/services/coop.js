// Simple WebSocket co-op client.
// Protocol (JSON messages):
//  C→S  { type:"join", room, name, cls }
//  C→S  { type:"pos", x, y } / { type:"spell", ... } / { type:"descend", depth }
//  C→S  { type:"death" }
//  S→C  { type:"joined", you:{id,...}, room, seed, players:[...] }
//  S→C  { type:"player_join", player }
//  S→C  { type:"player_leave", id }
//  S→C  { type:"event", from, data }

export class CoopClient {
  constructor({ room, name, cls, onReady, onEvent, onLeave, onJoin, onError }) {
    this.room = room;
    this.name = name;
    this.cls = cls;
    this.onReady = onReady || (() => {});
    this.onEvent = onEvent || (() => {});
    this.onLeave = onLeave || (() => {});
    this.onJoin = onJoin || (() => {});
    this.onError = onError || (() => {});
    this.ws = null;
    this.id = null;
    this.seed = null;
    this.players = new Map();
    this.ghosts = new Map();
  }

  connect() {
    const base = process.env.REACT_APP_BACKEND_URL.replace(/^http/, "ws");
    const qs = new URLSearchParams({ name: this.name, cls: this.cls });
    const url = `${base}/api/ws/coop/${encodeURIComponent(this.room)}?${qs}`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      this.handle(msg);
    };
    ws.onclose = () => this.onLeave();
    ws.onerror = (e) => this.onError(e);
  }

  handle(msg) {
    switch (msg.type) {
      case "joined":
        this.id = msg.you.id;
        this.seed = msg.seed;
        for (const p of msg.players) {
          if (p.id === this.id) continue;
          this.players.set(p.id, p);
          this.ghosts.set(p.id, {
            x: p.x || 0, y: p.y || 0, cls: p.cls, name: p.name, alive: true, depth: p.depth || 1,
          });
        }
        this.onReady({ seed: this.seed, id: this.id });
        break;
      case "player_join":
        this.players.set(msg.player.id, msg.player);
        this.ghosts.set(msg.player.id, {
          x: msg.player.x || 0, y: msg.player.y || 0, cls: msg.player.cls, name: msg.player.name, alive: true, depth: msg.player.depth || 1,
        });
        this.onJoin(msg.player);
        break;
      case "player_leave":
        this.players.delete(msg.id);
        this.ghosts.delete(msg.id);
        break;
      case "event": {
        const g = this.ghosts.get(msg.from);
        if (g && msg.data) {
          if (msg.data.type === "pos" || msg.data.type === "spawn") {
            g.x = msg.data.x; g.y = msg.data.y;
            if (msg.data.depth != null) g.depth = msg.data.depth;
          } else if (msg.data.type === "descend") {
            g.depth = msg.data.depth;
          } else if (msg.data.type === "death") {
            g.alive = false;
          }
        }
        this.onEvent(msg);
        break;
      }
      default: break;
    }
  }

  send(obj) {
    if (!this.ws || this.ws.readyState !== 1) return;
    this.ws.send(JSON.stringify(obj));
  }

  close() {
    try { this.ws && this.ws.close(); } catch { /* ignore */ }
  }
}
