// Server-authoritative coop WS client.
// Protocol (in):
//   {type:"joined", you, room, seed, players}
//   {type:"map", depth, biome, w, h, rows, exit}
//   {type:"state", depth, turn, victory, you, players, enemies, items, explored, visible, log}
//   {type:"player_join", player} / {type:"player_leave", id}
//   {type:"victory"} / {type:"error", detail}
// Protocol (out):
//   {type:"action", kind:"move|wait|spell|use_potion|use_mana", ...}

export class CoopClient {
  constructor({ room, name, cls, onJoined, onMap, onState, onPlayerJoin, onPlayerLeave, onVictory, onError, onClose }) {
    this.room = room;
    this.name = name;
    this.cls = cls;
    this.handlers = { onJoined, onMap, onState, onPlayerJoin, onPlayerLeave, onVictory, onError, onClose };
    this.ws = null;
    this.id = null;
  }
  connect() {
    const base = process.env.REACT_APP_BACKEND_URL.replace(/^http/, "ws");
    const qs = new URLSearchParams({ name: this.name, cls: this.cls });
    const url = `${base}/api/ws/coop/${encodeURIComponent(this.room)}?${qs}`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      switch (m.type) {
        case "joined":     this.id = m.you.id; this.handlers.onJoined && this.handlers.onJoined(m); break;
        case "map":        this.handlers.onMap && this.handlers.onMap(m); break;
        case "state":      this.handlers.onState && this.handlers.onState(m); break;
        case "player_join":  this.handlers.onPlayerJoin && this.handlers.onPlayerJoin(m.player); break;
        case "player_leave": this.handlers.onPlayerLeave && this.handlers.onPlayerLeave(m.id); break;
        case "victory":    this.handlers.onVictory && this.handlers.onVictory(m); break;
        case "error":      this.handlers.onError && this.handlers.onError(m.detail || "error"); break;
        default: break;
      }
    };
    ws.onerror = () => this.handlers.onError && this.handlers.onError("connection error");
    ws.onclose = () => this.handlers.onClose && this.handlers.onClose();
  }
  send(obj) {
    if (!this.ws || this.ws.readyState !== 1) return;
    this.ws.send(JSON.stringify(obj));
  }
  close() { try { this.ws && this.ws.close(); } catch { /* ignore */ } }
}
