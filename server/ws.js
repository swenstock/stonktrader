// Live push layer — broadcasts quote ticks to all connected clients every 2s
// so the watchlist/positions/chart update without the client polling.
// Leaderboard is left on client-side polling (a few seconds) since it changes
// less often and recomputing it on every tick for every client is wasted work.

const { WebSocketServer } = require("ws");
const { listSymbols, getQuotes } = require("./dataProvider");

function attachWebSocket(server) {
  const wss = new WebSocketServer({ server, path: "/ws" });
  const allSymbols = listSymbols().map((s) => s.symbol);

  const broadcast = () => {
    if (wss.clients.size === 0) return;
    const payload = JSON.stringify({ type: "quotes", data: getQuotes(allSymbols) });
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) client.send(payload);
    }
  };

  const interval = setInterval(broadcast, 2000);
  interval.unref?.();

  wss.on("connection", (ws) => {
    ws.send(JSON.stringify({ type: "quotes", data: getQuotes(allSymbols) }));
  });

  return wss;
}

module.exports = { attachWebSocket };
