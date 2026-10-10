'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Vehicle,
  TelemetryPayload,
  SimulatorStatus,
  WSServerMessage,
  WSClientMessage,
  VehicleStatus,
  VehicleTripHistory,
  HistoricalPoint
} from '@fleet/types';

export interface VehicleBreadcrumb {
  lat: number;
  lng: number;
  timestamp: number;
}

export function useFleetTelemetry() {
  const [vehicles, setVehicles] = useState<Record<string, Vehicle>>({});
  const [breadcrumbs, setBreadcrumbs] = useState<Record<string, VehicleBreadcrumb[]>>({});
  const [tripHistory, setTripHistory] = useState<VehicleTripHistory | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [simulatorStatus, setSimulatorStatus] = useState<SimulatorStatus>({
    isRunning: true,
    speedMultiplier: 1,
    activeVehiclesCount: 0,
    intervalMs: 1000
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (typeof window === 'undefined') return;
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4001';
    setConnectionStatus('connecting');

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('✅ Conectado al Gateway de Telemetría WS');
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

            // Actualizar rastro de coordenadas (histórico en memoria)
            setBreadcrumbs((prev) => {
              const trail = prev[t.vehicleId] || [];
              const updated = [
                ...trail,
                { lat: t.latitude, lng: t.longitude, timestamp: t.timestamp }
              ];
              // Mantener los últimos 35 puntos para rendimiento óptimo
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
        console.warn('⚠️ Desconectado del Gateway WS. Reintentando en 3s...');
        setConnectionStatus('disconnected');
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };

      ws.onerror = (err) => {
        console.error('Error de socket:', err);
        ws.close();
      };
    } catch (err) {
      console.error('No se pudo inicializar WebSocket:', err);
      setConnectionStatus('disconnected');
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
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
    }
  }, []);

  const vehicleList = Object.values(vehicles);
  const movingCount = vehicleList.filter((v) => v.status === 'moving').length;
  const idleCount = vehicleList.filter((v) => v.status === 'idle' || v.status === 'stopped').length;
  const avgSpeed = vehicleList.length > 0
    ? Math.round(vehicleList.reduce((acc, v) => acc + v.lastTelemetry.speed, 0) / vehicleList.length)
    : 0;

  const triggerStop = useCallback((vehicleId: string, reason = 'delivery', duration = 45) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'TRIGGER_STOP',
        vehicleId,
        reason,
        duration
      }));
    }
  }, []);

  const fetchVehicleHistory = useCallback((vehicleId: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'GET_VEHICLE_HISTORY',
        vehicleId
      }));
    } else {
      fetch(`http://localhost:4001/api/vehicles/${vehicleId}/history`)
        .then((res) => res.json())
        .then((data) => setTripHistory(data))
        .catch((err) => console.error('Error obteniendo historial:', err));
    }
  }, []);

  const clearTripHistory = useCallback(() => {
    setTripHistory(null);
  }, []);

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
