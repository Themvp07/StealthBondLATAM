// Logger that broadcasts to SSE and console
let sseClients = [];

function registerClient(res) {
  sseClients.push(res);
  res.on('close', () => {
    const idx = sseClients.indexOf(res);
    if (idx > -1) sseClients.splice(idx, 1);
  });
  res.on('error', () => {
    const idx = sseClients.indexOf(res);
    if (idx > -1) sseClients.splice(idx, 1);
  });
}

function broadcast(category, message) {
  const data = JSON.stringify({ category, message });
  const text = `data: ${data}\n\n`;
  // Filter clients that are no longer writable
  const alive = [];
  sseClients.forEach(c => {
    try {
      if (c.writable && !c.writableEnded) {
        c.write(text);
        alive.push(c);
      }
    } catch (e) {
      // Ignore errors from closed streams
    }
  });
  sseClients = alive;
  console.log(`[${category}] ${message}`);
}

function log(category, message) {
  broadcast(category, message);
}

module.exports = { registerClient, broadcast, log };
