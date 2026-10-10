'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Vehicle,
  SimulatorStatus,
  WSServerMessage,
  WSClientMessage,
  VehicleTripHistory,
  HistoricalPoint,
  StopReasonType
} from '@fleet/types';
import { PRESET_ROUTES } from '../data/routes-data';

export interface VehicleBreadcrumb {
  lat: number;
  lng: number;
  timestamp: number;
}

const INITIAL_VEHICLE_CONFIGS = [
  { id: 'v-001', name: 'Trailer Trans-Iberia 01', type: 'truck' as const, plate: '9841-LMN', color: '#3b82f6', driverName: 'Carlos Gómez', routeIndex: 0 },
  { id: 'v-002', name: 'Furgón Paquetería Prime', type: 'van' as const, plate: '3412-KZX', color: '#10b981', driverName: 'Elena Martínez', routeIndex: 1 },
  { id: 'v-003', name: 'Cisterna Mercancías M-30', type: 'truck' as const, plate: '5120-JTR', color: '#f59e0b', driverName: 'Javier Santos', routeIndex: 2 },
  { id: 'v-004', name: 'Express Logística Barajas', type: 'truck' as const, plate: '7723-MBV', color: '#8b5cf6', driverName: 'David Navarro', routeIndex: 3 },
  { id: 'v-005', name: 'Moto Reparto Urgente Centro', type: 'motorcycle' as const, plate: '0045-HPL', color: '#ec4899', driverName: 'Lucía Morales', routeIndex: 4 },
  { id: 'v-006', name: 'Supervisión de Flota Norte', type: 'car' as const, plate: '1289-KLL', color: '#06b6d4', driverName: 'Marcos Rubio', routeIndex: 5 },
];

function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.cos(toRad(lat1)) * Math.cos(dLon);
  return (Math.round(toDeg(Math.atan2(y, x))) + 360) % 360;
}

export function useFleetTelemetry() {
  const [vehicles, setVehicles] = useState<Record<string, Vehicle>>({});
  const [breadcrumbs, setBreadcrumbs] = useState<Record<string, VehicleBreadcrumb[]>>({});
  const [tripHistory, setTripHistory] = useState<VehicleTripHistory | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'demo'>('connecting');
  const [simulatorStatus, setSimulatorStatus] = useState<SimulatorStatus>({
    isRunning: true,
    speedMultiplier: 1,
    activeVehiclesCount: 6,
    intervalMs: 1000
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const demoIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isDemoModeRef = useRef<boolean>(false);

  // Estados locales para la simulación cliente cuando no hay backend WS
  const clientSimState = useRef<{
    vehicles: Record<string, Vehicle>;
    progress: Record<string, { currentSegment: number; segmentProgress: number }>;
    speedMultiplier: number;
    isRunning: boolean;
  }>({
    vehicles: {},
    progress: {},
    speedMultiplier: 1,
    isRunning: true
  });

  // Inicializador de simulación local en el navegador
  const initClientSimulation = useCallback(() => {
    if (isDemoModeRef.current) return;
    isDemoModeRef.current = true;
    setConnectionStatus('demo');
    console.log('⚡ Modo Demo Autónomo activo (simulación client-side en Madrid)');

    const vMap: Record<string, Vehicle> = {};
    const trails: Record<string, VehicleBreadcrumb[]> = {};
    const now = Date.now();

    INITIAL_VEHICLE_CONFIGS.forEach((cfg) => {
      const route = PRESET_ROUTES[cfg.routeIndex] || PRESET_ROUTES[0];
      const startWp = route.waypoints[0];
      const nextWp = route.waypoints[1] || route.waypoints[0];
      const bearing = calculateBearing(startWp.lat, startWp.lng, nextWp.lat, nextWp.lng);

      const v: Vehicle = {
        id: cfg.id,
        name: cfg.name,
        type: cfg.type,
        plate: cfg.plate,
        driverName: cfg.driverName,
        color: cfg.color,
        status: 'moving',
        lastTelemetry: {
          vehicleId: cfg.id,
          timestamp: now,
          latitude: startWp.lat,
          longitude: startWp.lng,
          speed: route.targetSpeedKmh,
          heading: bearing,
          battery: 88,
          odometer: 42150
        }
      };

      vMap[cfg.id] = v;
      trails[cfg.id] = [{ lat: startWp.lat, lng: startWp.lng, timestamp: now }];
      clientSimState.current.progress[cfg.id] = { currentSegment: 0, segmentProgress: 0 };
    });

    clientSimState.current.vehicles = vMap;
    setVehicles(vMap);
    setBreadcrumbs(trails);

    // Bucle de actualización client-side cada 1 segundo
    if (demoIntervalRef.current) clearInterval(demoIntervalRef.current);
    demoIntervalRef.current = setInterval(() => {
      const state = clientSimState.current;
      if (!state.isRunning) return;

      const updatedVehicles = { ...state.vehicles };
      const ts = Date.now();

      INITIAL_VEHICLE_CONFIGS.forEach((cfg) => {
        const v = updatedVehicles[cfg.id];
        if (!v) return;

        const route = PRESET_ROUTES[cfg.routeIndex] || PRESET_ROUTES[0];
        const wps = route.waypoints;
        const prog = state.progress[cfg.id];

        // Manejo de parada activa
        if (v.currentStop && v.currentStop.remainingSeconds > 0) {
          const rem = Math.max(0, v.currentStop.remainingSeconds - Math.round(state.speedMultiplier));
          if (rem === 0) {
            v.currentStop = undefined;
            v.status = 'moving';
            v.lastTelemetry.speed = route.targetSpeedKmh;
          } else {
            v.currentStop = { ...v.currentStop, remainingSeconds: rem };
            v.lastTelemetry.speed = 0;
            v.status = 'stopped';
          }
          return;
        }

        // Progreso a lo largo de los waypoints
        const p1 = wps[prog.currentSegment];
        const nextSeg = (prog.currentSegment + 1) % wps.length;
        const p2 = wps[nextSeg];

        const step = 0.08 * state.speedMultiplier;
        prog.segmentProgress += step;

        if (prog.segmentProgress >= 1) {
          prog.segmentProgress = 0;
          prog.currentSegment = nextSeg;
        }

        const lat = p1.lat + (p2.lat - p1.lat) * prog.segmentProgress;
        const lng = p1.lng + (p2.lng - p1.lng) * prog.segmentProgress;
        const bearing = calculateBearing(p1.lat, p1.lng, p2.lat, p2.lng);

        v.lastTelemetry = {
          ...v.lastTelemetry,
          timestamp: ts,
          latitude: lat,
          longitude: lng,
          heading: bearing,
          speed: route.targetSpeedKmh
        };

        setBreadcrumbs((prev) => {
          const trail = prev[cfg.id] || [];
          const nextTrail = [...trail, { lat, lng, timestamp: ts }];
          if (nextTrail.length > 35) nextTrail.shift();
          return { ...prev, [cfg.id]: nextTrail };
        });
      });

      setVehicles({ ...updatedVehicles });
    }, 1000);
  }, []);

  const connect = useCallback(() => {
    if (typeof window === 'undefined') return;
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4001';
    setConnectionStatus('connecting');

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const fallbackTimer = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          console.warn('⚠️ WebSocket no disponible. Activando modo Demo Autónomo.');
          initClientSimulation();
        }
      }, 1500);

      ws.onopen = () => {
        clearTimeout(fallbackTimer);
        isDemoModeRef.current = false;
        if (demoIntervalRef.current) clearInterval(demoIntervalRef.current);
        console.log('✅ Conectado al Gateway de Telemetría WS en vivo');
        setConnectionStatus('connected');
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WSServerMessage;

          if (msg.type === 'INITIAL_STATE') {
            const vMap: Record<string, Vehicle> = {};
            const initialTrails: Record<string, VehicleBreadcrumb[]> = {};

            msg.payload.vehicles.forEach((v) => {
              vMap[v.id] = v;
              initialTrails[v.id] = [
                {
                  lat: v.lastTelemetry.latitude,
                  lng: v.lastTelemetry.longitude,
                  timestamp: v.lastTelemetry.timestamp
                }
              ];
            });

            setVehicles(vMap);
            setBreadcrumbs(initialTrails);
            setSimulatorStatus(msg.payload.simulator);
          } else if (msg.type === 'TELEMETRY_UPDATE') {
            const t = msg.payload;

            setVehicles((prev) => {
              const existing = prev[t.vehicleId];
              if (!existing) return prev;
              return {
                ...prev,
                [t.vehicleId]: {
                  ...existing,
                  lastTelemetry: t,
                  currentStop: t.currentStop
                }
              };
            });

            setBreadcrumbs((prev) => {
              const trail = prev[t.vehicleId] || [];
              const updated = [
                ...trail,
                { lat: t.latitude, lng: t.longitude, timestamp: t.timestamp }
              ];
              if (updated.length > 35) updated.shift();
              return {
                ...prev,
                [t.vehicleId]: updated
              };
            });
          } else if (msg.type === 'VEHICLE_STATUS_CHANGE') {
            const { vehicleId, status, currentStop } = msg.payload;
            setVehicles((prev) => {
              const existing = prev[vehicleId];
              if (!existing) return prev;
              return {
                ...prev,
                [vehicleId]: {
                  ...existing,
                  status,
                  currentStop
                }
              };
            });
          } else if (msg.type === 'SIMULATOR_STATUS') {
            setSimulatorStatus(msg.payload);
          } else if (msg.type === 'VEHICLE_HISTORY_DATA') {
            setTripHistory(msg.payload);
          }
        } catch (err) {
          console.error('Error parseando mensaje WS:', err);
        }
      };

      ws.onclose = () => {
        if (!isDemoModeRef.current) {
          console.warn('⚠️ Desconectado del Gateway WS. Cambiando a simulación demo...');
          initClientSimulation();
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      initClientSimulation();
    }
  }, [initClientSimulation]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (demoIntervalRef.current) clearInterval(demoIntervalRef.current);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const sendSimulatorCommand = useCallback((command: 'play' | 'pause' | 'set_speed', speedMultiplier?: number) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const msg: WSClientMessage = {
        type: 'SIMULATOR_COMMAND',
        command,
        speedMultiplier
      };
      wsRef.current.send(JSON.stringify(msg));
    } else {
      // Manejo local en modo demo
      const state = clientSimState.current;
      if (command === 'play') state.isRunning = true;
      if (command === 'pause') state.isRunning = false;
      if (command === 'set_speed' && speedMultiplier) state.speedMultiplier = speedMultiplier;

      setSimulatorStatus({
        isRunning: state.isRunning,
        speedMultiplier: state.speedMultiplier,
        activeVehiclesCount: Object.keys(state.vehicles).length,
        intervalMs: 1000
      });
    }
  }, []);

  const triggerStop = useCallback((vehicleId: string, reason: StopReasonType = 'delivery', duration = 45) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'TRIGGER_STOP',
        vehicleId,
        reason,
        duration
      }));
    } else {
      // Manejo local en modo demo
      const reasonLabels: Record<string, string> = {
        traffic_light: 'Semáforo en Rojo',
        delivery: 'Entrega a Cliente',
        loading_dock: 'Muelle de Carga',
        fuel_rest: 'Repostaje / Descanso',
        incident: 'Congestión / Incidencia'
      };

      setVehicles((prev) => {
        const v = prev[vehicleId];
        if (!v) return prev;
        return {
          ...prev,
          [vehicleId]: {
            ...v,
            status: 'stopped',
            lastTelemetry: { ...v.lastTelemetry, speed: 0 },
            currentStop: {
              reason,
              label: reasonLabels[reason] || 'Parada',
              durationSeconds: duration,
              remainingSeconds: duration,
              startedAt: Date.now()
            }
          }
        };
      });
    }
  }, []);

  const fetchVehicleHistory = useCallback((vehicleId: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'GET_VEHICLE_HISTORY',
        vehicleId
      }));
      return;
    }

    // Generador de histórico local para modo Demo (GitHub Pages)
    const cfg = INITIAL_VEHICLE_CONFIGS.find((c) => c.id === vehicleId) || INITIAL_VEHICLE_CONFIGS[0];
    const route = PRESET_ROUTES[cfg.routeIndex] || PRESET_ROUTES[0];
    const wps = route.waypoints;

    const points: HistoricalPoint[] = [];
    const baseTime = Date.now() - 3600 * 1000; // Hace 1 hora
    const numPoints = 60;

    for (let i = 0; i < numPoints; i++) {
      const overallProgress = i / (numPoints - 1);
      const scaledIdx = overallProgress * (wps.length - 1);
      const seg = Math.min(wps.length - 2, Math.floor(scaledIdx));
      const segFrac = scaledIdx - seg;

      const p1 = wps[seg];
      const p2 = wps[seg + 1];

      const lat = p1.lat + (p2.lat - p1.lat) * segFrac;
      const lng = p1.lng + (p2.lng - p1.lng) * segFrac;
      const heading = calculateBearing(p1.lat, p1.lng, p2.lat, p2.lng);
      const timestamp = baseTime + Math.round(overallProgress * 3600 * 1000);

      const isStopPoint = (i >= 12 && i <= 15) || (i >= 38 && i <= 40);
      const stopReason = i >= 12 && i <= 15 ? 'Entrega a Cliente' : i >= 38 && i <= 40 ? 'Semáforo en Rojo' : undefined;

      points.push({
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lng.toFixed(6)),
        speed: isStopPoint ? 0 : route.targetSpeedKmh,
        heading,
        timestamp,
        battery: Math.round(90 - overallProgress * 20),
        stopReason
      });
    }

    setTripHistory({
      vehicleId,
      vehicleName: cfg.name,
      plate: cfg.plate,
      driverName: cfg.driverName,
      startTime: baseTime,
      endTime: Date.now(),
      totalDistanceKm: Number((points.length * 1.4).toFixed(1)),
      stopsCount: 2,
      points
    });
  }, []);

  const clearTripHistory = useCallback(() => {
    setTripHistory(null);
  }, []);

  const vehicleList = Object.values(vehicles);
  const movingCount = vehicleList.filter((v) => v.status === 'moving').length;
  const idleCount = vehicleList.filter((v) => v.status === 'idle' || v.status === 'stopped').length;
  const avgSpeed = vehicleList.length > 0
    ? Math.round(vehicleList.reduce((acc, v) => acc + v.lastTelemetry.speed, 0) / vehicleList.length)
    : 0;

  return {
    vehicles,
    vehicleList,
    breadcrumbs,
    tripHistory,
    fetchVehicleHistory,
    clearTripHistory,
    connectionStatus,
    simulatorStatus,
    sendSimulatorCommand,
    triggerStop,
    stats: {
      total: vehicleList.length,
      moving: movingCount,
      idle: idleCount,
      avgSpeed
    }
  };
}
