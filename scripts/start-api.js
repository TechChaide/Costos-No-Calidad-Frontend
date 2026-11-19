/**
 * Se ejecuta automáticamente antes de `npm run dev` (script "predev").
 * Levanta el API de costos (../costos-no-calidad-backend) si no está escuchando, para que el proxy
 * /api-costos del frontend siempre tenga a quién llamar. Solo desarrollo: no interviene en build ni producción.
 *
 * Variables opcionales:
 *   COSTOS_API_DIR   carpeta del backend (por defecto ../costos-no-calidad-backend)
 *   COSTOS_API_PORT  puerto del backend (por defecto 5400)
 */
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const dir = path.resolve(process.env.COSTOS_API_DIR || path.join(__dirname, '..', '..', 'costos-no-calidad-backend'));
const port = Number(process.env.COSTOS_API_PORT || 5400);
const log = path.join(os.tmpdir(), 'costos-no-calidad-backend.log');

const escuchando = () =>
  new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.setTimeout(1500);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.on('error', () => resolve(false));
  });

(async () => {
  if (await escuchando()) {
    console.log(`[api] El API de costos ya está corriendo en el puerto ${port}.`);
    return;
  }
  if (!fs.existsSync(path.join(dir, 'server.js'))) {
    console.warn(`[api] No se encontró el backend en "${dir}". Defina COSTOS_API_DIR o levántelo manualmente.`);
    return;
  }

  const salida = fs.openSync(log, 'a');
  const hijo = spawn(process.execPath, ['server.js'], {
    cwd: dir,
    detached: true, // sigue corriendo aunque se cierre `npm run dev`
    stdio: ['ignore', salida, salida],
    windowsHide: true,
    env: process.env,
  });
  hijo.unref();
  console.log(`[api] Levantando el API de costos en el puerto ${port} (log: ${log})...`);

  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await escuchando()) {
      console.log('[api] API de costos listo.');
      return;
    }
  }
  console.warn(`[api] El API no respondió en 20 s. Revise el log: ${log}`);
})();
