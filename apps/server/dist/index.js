"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const ws_1 = require("ws");
const simulator_js_1 = require("./simulator.js");
const PORT = Number(process.env.PORT) || 4001;
// Servidor HTTP básico
const server = http_1.default.createServer((req, res) => {
    // Configurar CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
        return;
    }
    if (req.url === '/api/vehicles') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(simulator.getVehicles()));
        return;
    }
    const historyMatch = req.url?.match(/^\/api\/vehicles\/([^/]+)\/history$/);
    if (historyMatch) {
        const vehicleId = historyMatch[1];
        const history = simulator.getVehicleHistory(vehicleId);
        if (!history) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Vehículo no encontrado' }));
            return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(history));
        return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
});
// Servidor WebSocket
const wss = new ws_1.WebSocketServer({ server });
const simulator = new simulator_js_1.FleetSimulator();
function broadcast(message) {
    const data = JSON.stringify(message);
    for (const client of wss.clients) {
        if (client.readyState === ws_1.WebSocket.OPEN) {
            client.send(data);
        }
    }
}
// Iniciar simulación y enlazar eventos
simulator.start((telemetry) => {
    broadcast({ type: 'TELEMETRY_UPDATE', payload: telemetry });
}, (vehicleId, status, currentStop) => {
    broadcast({ type: 'VEHICLE_STATUS_CHANGE', payload: { vehicleId, status, currentStop } });
});
wss.on('connection', (ws) => {
    console.log('📡 Nuevo cliente conectado al WebSocket');
    // Enviar estado inicial inmediato al cliente recién conectado
    const initialMessage = {
        type: 'INITIAL_STATE',
        payload: {
            vehicles: simulator.getVehicles(),
            simulator: simulator.getStatus()
        }
    };
    ws.send(JSON.stringify(initialMessage));
    ws.on('message', (raw) => {
        try {
            const msg = JSON.parse(raw.toString());
            if (msg.type === 'SIMULATOR_COMMAND') {
                if (msg.command === 'play') {
                    simulator.resume();
                }
                else if (msg.command === 'pause') {
                    simulator.pause();
                }
                else if (msg.command === 'set_speed' && msg.speedMultiplier) {
                    simulator.setSpeedMultiplier(msg.speedMultiplier);
                }
                broadcast({ type: 'SIMULATOR_STATUS', payload: simulator.getStatus() });
            }
            else if (msg.type === 'TRIGGER_STOP') {
                simulator.triggerVehicleStop(msg.vehicleId, msg.reason, msg.duration);
            }
            else if (msg.type === 'GET_VEHICLE_HISTORY') {
                const history = simulator.getVehicleHistory(msg.vehicleId);
                if (history) {
                    ws.send(JSON.stringify({ type: 'VEHICLE_HISTORY_DATA', payload: history }));
                }
            }
        }
        catch (err) {
            console.error('Error parseando mensaje WS del cliente:', err);
        }
    });
    ws.on('close', () => {
        console.log('Cliente desconectado');
    });
});
server.listen(PORT, () => {
    console.log(`🚀 Gateway de Telemetría y Simulador de Flota escuchando en:`);
    console.log(`   - HTTP: http://localhost:${PORT}`);
    console.log(`   - WebSocket: ws://localhost:${PORT}`);
});
