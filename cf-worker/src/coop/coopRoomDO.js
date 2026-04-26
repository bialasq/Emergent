import { GameRoom } from "./gameRoom.js";
import { zlibCrc32 } from "./crc32.js";

function normalizeRoomPath(pathname) {
  const m = pathname.match(/^\/api\/ws\/coop\/([^/]+)\/?$/i);
  if (!m) return null;
  const code = decodeURIComponent(m[1]).trim().toUpperCase().slice(0, 12);
  const alnum = code.replace(/_/g, "");
  if (!code || !/^[A-Z0-9_]+$/.test(code) || !/^[A-Z0-9]+$/.test(alnum)) return null;
  return code;
}

export class CoopRoomDO {
  /** @param {DurableObjectState} ctx @param {Env} env */
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    /** @type {GameRoom | null} */
    this.game = null;
    /** @type {Map<import("@cloudflare/workers-types").WebSocket, { pid: string }>} */
    this.wsPid = new Map();
    this.roomCode = "";
    this.seed = 0;
  }

  /** @param {Request} request */
  async fetch(request) {
    const url = new URL(request.url);
    const code = normalizeRoomPath(url.pathname);
    if (!code) {
      return new Response("Invalid room", { status: 400 });
    }
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", {
        status: 426,
        headers: { Connection: "Upgrade", Upgrade: "websocket" },
      });
    }

    if (!this.roomCode) this.roomCode = code;
    else if (this.roomCode !== code) {
      return new Response("Room mismatch", { status: 500 });
    }

    if (this.wsPid.size >= 4) {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      try {
        server.send(JSON.stringify({ type: "error", detail: "Room full" }));
        server.close(4001, "Room full");
      } catch {
        /* ignore */
      }
      return new Response(null, { status: 101, webSocket: client });
    }

    const name = (url.searchParams.get("name") || "Wanderer").slice(0, 24);
    let cls = url.searchParams.get("cls") || "warrior";
    if (!["warrior", "mage", "rogue", "ranger"].includes(cls)) cls = "warrior";

    if (!this.game) {
      this.seed = zlibCrc32(code) & 0x7fffffff;
      this.game = new GameRoom(code, this.seed);
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const pid = crypto.randomUUID();
    this.ctx.acceptWebSocket(server);
    this.wsPid.set(server, { pid });
    server.serializeAttachment(JSON.stringify({ pid, name, cls }));

    const self = this;
    queueMicrotask(() => {
      self._completeJoin(server, pid, name, cls).catch(() => {
        try {
          server.close(1011, "join failed");
        } catch {
          /* ignore */
        }
      });
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  /** @param {WebSocket} ws */
  async _completeJoin(ws, pid, name, cls) {
    const game = this.game;
    if (!game) return;
    game.addPlayer(pid, name, cls);
    const you = game.players[pid];
    const others = Object.values(game.players)
      .filter((p) => p.pid !== pid)
      .map((p) => ({ id: p.pid, name: p.name, cls: p.cls, x: p.x, y: p.y, alive: p.alive }));
    ws.send(
      JSON.stringify({
        type: "joined",
        you: { id: pid, name, cls },
        seed: this.seed,
        room: this.roomCode,
        players: others,
      }),
    );
    ws.send(JSON.stringify({ type: "map", ...game.mapPayload() }));
    const joinMsg = JSON.stringify({
      type: "player_join",
      player: { id: pid, name, cls, x: you.x, y: you.y, alive: true },
    });
    for (const [w] of this.wsPid) {
      if (w === ws) continue;
      try {
        w.send(joinMsg);
      } catch {
        /* ignore */
      }
    }
    this._sendStateToAll();
  }

  _sendStateToAll() {
    const game = this.game;
    if (!game) return;
    for (const [w, meta] of this.wsPid) {
      try {
        w.send(JSON.stringify(game.stateFor(meta.pid)));
      } catch {
        /* ignore */
      }
    }
  }

  /** @param {WebSocket} ws @param {string | ArrayBuffer} message */
  async webSocketMessage(ws, message) {
    const meta = this.wsPid.get(ws);
    const game = this.game;
    if (!meta || !game) return;
    const text = typeof message === "string" ? message : new TextDecoder().decode(message);
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return;
    }
    if (!data || typeof data !== "object") return;
    if (data.type === "ping") {
      try {
        ws.send(JSON.stringify({ type: "pong" }));
      } catch {
        /* ignore */
      }
      return;
    }
    if (data.type !== "action") return;
    const prevDepth = game.depth;
    game.handle(meta.pid, data);
    if (game.depth !== prevDepth) {
      const payload = JSON.stringify({ type: "map", ...game.mapPayload() });
      for (const w of this.wsPid.keys()) {
        try {
          w.send(payload);
        } catch {
          /* ignore */
        }
      }
    }
    this._sendStateToAll();
    if (game.victory) {
      const v = JSON.stringify({ type: "victory" });
      for (const w of this.wsPid.keys()) {
        try {
          w.send(v);
        } catch {
          /* ignore */
        }
      }
    }
  }

  /** @param {WebSocket} ws */
  async webSocketClose(ws) {
    const meta = this.wsPid.get(ws);
    this.wsPid.delete(ws);
    if (!this.game || !meta) return;
    this.game.removePlayer(meta.pid);
    const leave = JSON.stringify({ type: "player_leave", id: meta.pid });
    for (const w of this.wsPid.keys()) {
      try {
        w.send(leave);
      } catch {
        /* ignore */
      }
    }
    this._sendStateToAll();
    if (this.wsPid.size === 0) {
      this.game = null;
      this.roomCode = "";
      this.seed = 0;
    }
  }
}
