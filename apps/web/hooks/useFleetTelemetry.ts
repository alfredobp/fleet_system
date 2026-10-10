'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Vehicle,
  SimulatorStatus,
  WSServerMessage,
  WSClientMessage,
  VehicleTripHistory,
  HistoricalPoint,
  StopReasonType,
  EmergencyIncident,
  RespondingUnit,
  EmergencyMission
} from '@fleet/types';
import { PRESET_ROUTES, PRESET_INCIDENTS, EMERGENCY_FLEET_CONFIGS } from '../data/routes-data';

export interface VehicleBreadcrumb {
  lat: number;
  lng: number;
  timestamp: number;
}

const ALL_INITIAL_VEHICLE_CONFIGS = [
  // 1. Unidades de Emergencias 112 (Madrid)
  {
    id: 'veh-pol',
    name: 'Patrulla Z-402 • Policía Municipal',
    type: 'police' as const,
    role: 'police' as const,
    plate: '0112-POL',
    color: '#3b82f6',
    driverName: 'Oficial Delgado & Agente Ruiz',
    routeIndex: 1,
    emergencySpeed: 85,
    initialLat: 40.4248,
    initialLng: -3.6800,
    isEmergency: true
  },
  {
    id: 'veh-amb',
    name: 'SAMUR SVA Alfa-08 • Ambulancia',
    type: 'ambulance' as const,
    role: 'ambulance' as const,
    plate: '0112-SMR',
    color: '#f59e0b',
    driverName: 'Dra. Beltrán & Téc. Navarro',
    routeIndex: 0,
    emergencySpeed: 75,
    initialLat: 40.4072,
    initialLng: -3.6917,
    isEmergency: true
  },
  {
    id: 'veh-fire',
    name: 'Bomba Pesada B-14 • Bomberos',
    type: 'fire_truck' as const,
    role: 'fire' as const,
    plate: '0112-BMB',
    color: '#ef4444',
    driverName: 'Sgto. Ramos & Dotación B-14',
    routeIndex: 2,
    emergencySpeed: 65,
    initialLat: 40.4503,
    initialLng: -3.6591,
    isEmergency: true
  },
  // 2. Flota comercial y logística
  {
    id: 'v-001',
    name: 'Trailer Trans-Iberia 01',
    type: 'truck' as const,
    role: undefined,
    plate: '9841-LMN',
    color: '#06b6d4',
    driverName: 'Carlos Gómez',
    routeIndex: 0,
    emergencySpeed: 45,
    initialLat: 40.4370,
    initialLng: -3.6896,
    isEmergency: false
  },
  {
    id: 'v-002',
    name: 'Furgón Paquetería Prime',
    type: 'van' as const,
    role: undefined,
    plate: '3412-KZX',
    color: '#10b981',
    driverName: 'Elena Martínez',
    routeIndex: 1,
    emergencySpeed: 35,
    initialLat: 40.4208,
    initialLng: -3.7061,
    isEmergency: false
  },
  {
    id: 'v-005',
    name: 'Moto Reparto Urgente Centro',
    type: 'motorcycle' as const,
    role: undefined,
    plate: '0045-HPL',
    color: '#ec4899',
    driverName: 'Lucía Morales',
    routeIndex: 4,
    emergencySpeed: 30,
    initialLat: 40.4150,
    initialLng: -3.7142,
    isEmergency: false
  }
];

function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.cos(toRad(lat1)) * Math.cos(dLon);
  return (Math.round(toDeg(Math.atan2(y, x))) + 360) % 360;
}

function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Radio de la Tierra en metros
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function useFleetTelemetry() {
  const [vehicles, setVehicles] = useState<Record<string, Vehicle>>({});
  const [breadcrumbs, setBreadcrumbs] = useState<Record<string, VehicleBreadcrumb[]>>({});
  const [tripHistory, setTripHistory] = useState<VehicleTripHistory | null>(null);
  const [activeIncident, setActiveIncident] = useState<EmergencyIncident | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'demo'>('connecting');
  const [simulatorStatus, setSimulatorStatus] = useState<SimulatorStatus>({
    isRunning: true,
    speedMultiplier: 1,
    activeVehiclesCount: ALL_INITIAL_VEHICLE_CONFIGS.length,
    intervalMs: 1000
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const demoIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isDemoModeRef = useRef<boolean>(false);

  // Estado mutable para la simulación local client-side
  const clientSimState = useRef<{
    vehicles: Record<string, Vehicle>;
    progress: Record<string, { currentSegment: number; segmentProgress: number }>;
    emergencyState: Record<string, { targetLat: number; targetLng: number; approachWaypoints: Array<{ lat: number; lng: number }>; currentWpIdx: number }>;
    activeIncident: EmergencyIncident | null;
    speedMultiplier: number;
    isRunning: boolean;
  }>({
    vehicles: {},
    progress: {},
    emergencyState: {},
    activeIncident: null,
    speedMultiplier: 1,
    isRunning: true
  });

  // Inicializador de simulación local autónoma en el navegador
  const initClientSimulation = useCallback(() => {
    if (isDemoModeRef.current) return;
    isDemoModeRef.current = true;
    setConnectionStatus('demo');
    console.log('⚡ Modo Demo Autónomo activo (Emergencias 112 y Flota en Madrid)');

    const vMap: Record<string, Vehicle> = {};
    const trails: Record<string, VehicleBreadcrumb[]> = {};
    const now = Date.now();

    ALL_INITIAL_VEHICLE_CONFIGS.forEach((cfg) => {
      const lat = cfg.initialLat;
      const lng = cfg.initialLng;
      const route = PRESET_ROUTES[cfg.routeIndex] || PRESET_ROUTES[0];
      const nextWp = route.waypoints[1] || route.waypoints[0];
      const bearing = calculateBearing(lat, lng, nextWp.lat, nextWp.lng);

      const v: Vehicle = {
        id: cfg.id,
        name: cfg.name,
        type: cfg.type,
        plate: cfg.plate,
        driverName: cfg.driverName,
        color: cfg.color,
        status: cfg.isEmergency ? 'idle' : 'moving',
        lastTelemetry: {
          vehicleId: cfg.id,
          timestamp: now,
          latitude: lat,
          longitude: lng,
          speed: cfg.isEmergency ? 0 : route.targetSpeedKmh,
          heading: bearing,
          battery: 95,
          odometer: 24500
        }
      };

      vMap[cfg.id] = v;
      trails[cfg.id] = [{ lat, lng, timestamp: now }];
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
      const inc = state.activeIncident;

      // 1. Simulación de unidades de emergencia si hay incidente activo
      if (inc) {
        let allArrived = true;
        const TACTICAL_OFFSETS: Record<string, { dLat: number; dLng: number; heading: number }> = {
          police: { dLat: 0.00018, dLng: -0.00022, heading: 45 },
          fire: { dLat: -0.00012, dLng: -0.00014, heading: 90 },
          ambulance: { dLat: -0.00020, dLng: 0.00018, heading: 135 }
        };

        ALL_INITIAL_VEHICLE_CONFIGS.filter((c) => c.isEmergency).forEach((cfg) => {
          const v = updatedVehicles[cfg.id];
          if (!v) return;

          const eState = state.emergencyState[cfg.id];
          if (!eState) return;

          const currentDist = calculateDistanceMeters(v.lastTelemetry.latitude, v.lastTelemetry.longitude, eState.targetLat, eState.targetLng);

          if (currentDist <= 20) {
            // ¡Llegada al puesto táctico asignado!
            if (v.status !== 'on_scene') {
              v.status = 'on_scene';
              v.lastTelemetry.speed = 0;
              v.lastTelemetry.latitude = eState.targetLat;
              v.lastTelemetry.longitude = eState.targetLng;

              const offset = TACTICAL_OFFSETS[cfg.role || 'police'];
              if (offset) {
                v.lastTelemetry.heading = offset.heading;
              }

              const unitRef = inc.units.find((u) => u.vehicleId === v.id);
              if (unitRef) {
                unitRef.status = 'arrived';
                unitRef.arrived = true;
                unitRef.etaSeconds = 0;
                unitRef.distanceMeters = 0;
                unitRef.speedKmh = 0;
              }

              if (v.emergencyMission) {
                v.emergencyMission.status = 'arrived';
                v.emergencyMission.etaSeconds = 0;
                v.emergencyMission.distanceRemainingMeters = 0;
              }
            }
          } else {
            allArrived = false;

            const wps = eState.approachWaypoints;
            const nextTarget = wps[eState.currentWpIdx] || { lat: eState.targetLat, lng: eState.targetLng };
            const distToNext = calculateDistanceMeters(v.lastTelemetry.latitude, v.lastTelemetry.longitude, nextTarget.lat, nextTarget.lng);

            const speedKmh = cfg.emergencySpeed;
            const stepMeters = (speedKmh * 1000 / 3600) * state.speedMultiplier;
            const stepRatio = Math.min(1.0, stepMeters / Math.max(1, distToNext));

            const newLat = v.lastTelemetry.latitude + (nextTarget.lat - v.lastTelemetry.latitude) * stepRatio;
            const newLng = v.lastTelemetry.longitude + (nextTarget.lng - v.lastTelemetry.longitude) * stepRatio;
            const heading = calculateBearing(v.lastTelemetry.latitude, v.lastTelemetry.longitude, nextTarget.lat, nextTarget.lng);

            if (distToNext <= 35 && eState.currentWpIdx < wps.length - 1) {
              eState.currentWpIdx += 1;
            }

            const remDist = calculateDistanceMeters(newLat, newLng, eState.targetLat, eState.targetLng);
            const etaSec = Math.max(1, Math.round(remDist / ((speedKmh * 1000) / 3600)));

            v.lastTelemetry = {
              ...v.lastTelemetry,
              timestamp: ts,
              latitude: Number(newLat.toFixed(6)),
              longitude: Number(newLng.toFixed(6)),
              heading: Math.round(heading),
              speed: speedKmh
            };

            if (v.emergencyMission) {
              v.emergencyMission.etaSeconds = etaSec;
              v.emergencyMission.distanceRemainingMeters = Math.round(remDist);
            }

            const unitRef = inc.units.find((u) => u.vehicleId === v.id);
            if (unitRef) {
              unitRef.etaSeconds = etaSec;
              unitRef.distanceMeters = Math.round(remDist);
              unitRef.speedKmh = speedKmh;
            }

            setBreadcrumbs((prev) => {
              const trail = prev[cfg.id] || [];
              const nextTrail = [...trail, { lat: newLat, lng: newLng, timestamp: ts }];
              if (nextTrail.length > 35) nextTrail.shift();
              return { ...prev, [cfg.id]: nextTrail };
            });
          }
        });

        // Progresión activa de la atención de la emergencia una vez desplegados
        const prevProg = inc.interventionProgress || 0;
        let newProg = prevProg;

        if (allArrived) {
          newProg = Math.min(100, Math.round(prevProg + 4 * state.speedMultiplier));
          inc.interventionProgress = newProg;

          if (newProg < 30) {
            inc.status = 'on_scene';
            inc.interventionPhase = 'Fase 1: Aseguramiento perimetral y corte de vía';
            inc.units.forEach((u) => {
              if (u.role === 'police') u.actionText = '🚨 Corte de vía establecido. Perímetro de seguridad de 50m activo.';
              if (u.role === 'fire') u.actionText = '🚨 Mangueras desplegadas. Enfriando derrame con espuma ignífuga.';
              if (u.role === 'ambulance') u.actionText = '🚨 Accediendo al habitáculo. Triaje inicial de víctimas.';
            });
          } else if (newProg < 75) {
            inc.status = 'on_scene';
            inc.interventionPhase = 'Fase 2: Excarcelación hidráulica y estabilización de heridos';
            inc.units.forEach((u) => {
              if (u.role === 'police') u.actionText = '🚨 Tráfico desviado por vías alternativas. Atestados recopilando datos.';
              if (u.role === 'fire') u.actionText = '🚨 Corte de pilares con cizalla hidráulica para liberar atrapados.';
              if (u.role === 'ambulance') u.actionText = '🚨 2 heridos inmovilizados con collarín y sueroterapia.';
            });
          } else if (newProg < 100) {
            inc.status = 'on_scene';
            inc.interventionPhase = 'Fase 3: Carga en ambulancia y retirada de vehículos';
            inc.units.forEach((u) => {
              if (u.role === 'police') u.actionText = '🚨 Grúa municipal asegurando los turismos accidentados.';
              if (u.role === 'fire') u.actionText = '✅ Atrapados liberados con éxito. Limpieza de calzada.';
              if (u.role === 'ambulance') u.actionText = '🚨 Pacientes monitorizados en el interior del SVA.';
            });
          } else {
            inc.status = 'under_control';
            inc.interventionPhase = '✅ Incidente Controlado: Evacuación sanitaria y reapertura';
            inc.units.forEach((u) => {
              if (u.role === 'police') u.actionText = '✅ Calzada declarada segura y tráfico restablecido.';
              if (u.role === 'fire') u.actionText = '✅ Incendio y vertido neutralizados. Dotación lista.';
              if (u.role === 'ambulance') u.actionText = '🚨 Evacuación urgente con preaviso al Hospital Clínico.';
            });
          }
        }

        setActiveIncident({ ...inc });
      }

      // 2. Simulación de vehículos logísticos ordinarios
      ALL_INITIAL_VEHICLE_CONFIGS.filter((c) => !c.isEmergency).forEach((cfg) => {
        const v = updatedVehicles[cfg.id];
        if (!v) return;

        const route = PRESET_ROUTES[cfg.routeIndex] || PRESET_ROUTES[0];
        const wps = route.waypoints;
        const prog = state.progress[cfg.id];

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
            if (msg.payload.incident) {
              setActiveIncident(msg.payload.incident);
            }
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
                  currentStop: t.currentStop,
                  emergencyMission: t.emergencyMission
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
            const { vehicleId, status, currentStop, emergencyMission } = msg.payload;
            setVehicles((prev) => {
              const existing = prev[vehicleId];
              if (!existing) return prev;
              return {
                ...prev,
                [vehicleId]: {
                  ...existing,
                  status,
                  currentStop,
                  emergencyMission: emergencyMission ?? existing.emergencyMission
                }
              };
            });
          } else if (msg.type === 'EMERGENCY_UPDATE') {
            setActiveIncident(msg.payload);
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

  // Disparar incidente de emergencia (Cibeles, Gran Vía, M-30 o punto personalizado)
  const triggerEmergency = useCallback((
    incidentId?: string,
    latitude?: number,
    longitude?: number,
    title?: string,
    address?: string
  ) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'TRIGGER_EMERGENCY',
        incidentId,
        latitude,
        longitude,
        title,
        address
      }));
      return;
    }

    // Modo local autónomo
    const preset = PRESET_INCIDENTS.find((p) => p.id === incidentId) || PRESET_INCIDENTS[0];
    const targetLat = latitude ?? preset.latitude;
    const targetLng = longitude ?? preset.longitude;
    const incTitle = title ?? preset.title;
    const incAddress = address ?? preset.address;

    const state = clientSimState.current;
    const units: RespondingUnit[] = [];

    const TACTICAL_OFFSETS: Record<string, { dLat: number; dLng: number; heading: number }> = {
      police: { dLat: 0.00018, dLng: -0.00022, heading: 45 },
      fire: { dLat: -0.00012, dLng: -0.00014, heading: 90 },
      ambulance: { dLat: -0.00020, dLng: 0.00018, heading: 135 }
    };

    ALL_INITIAL_VEHICLE_CONFIGS.filter((c) => c.isEmergency).forEach((cfg) => {
      const v = state.vehicles[cfg.id];
      if (!v) return;

      const offset = TACTICAL_OFFSETS[cfg.role || 'police'] || { dLat: 0, dLng: 0, heading: 0 };
      const tacticalLat = targetLat + offset.dLat;
      const tacticalLng = targetLng + offset.dLng;

      const dist = calculateDistanceMeters(v.lastTelemetry.latitude, v.lastTelemetry.longitude, tacticalLat, tacticalLng);
      const speedMs = (cfg.emergencySpeed * 1000) / 3600;
      const etaSeconds = Math.max(10, Math.round(dist / speedMs));

      // Crear waypoints de aproximación
      const approachWps: Array<{ lat: number; lng: number }> = [];
      const steps = 4;
      for (let s = 1; s <= steps; s++) {
        const f = s / steps;
        approachWps.push({
          lat: v.lastTelemetry.latitude + (tacticalLat - v.lastTelemetry.latitude) * f,
          lng: v.lastTelemetry.longitude + (tacticalLng - v.lastTelemetry.longitude) * f
        });
      }

      state.emergencyState[cfg.id] = {
        targetLat: tacticalLat,
        targetLng: tacticalLng,
        approachWaypoints: approachWps,
        currentWpIdx: 0
      };

      v.status = 'responding';
      v.lastTelemetry.speed = cfg.emergencySpeed;

      const mission: EmergencyMission = {
        incidentId: preset.id,
        role: cfg.role!,
        targetLat: tacticalLat,
        targetLng: tacticalLng,
        address: incAddress,
        etaSeconds,
        distanceRemainingMeters: Math.round(dist),
        status: 'en_route'
      };

      v.emergencyMission = mission;
      v.lastTelemetry.emergencyMission = mission;

      units.push({
        vehicleId: cfg.id,
        role: cfg.role!,
        name: cfg.name,
        plate: cfg.plate,
        speedKmh: cfg.emergencySpeed,
        etaSeconds,
        distanceMeters: Math.round(dist),
        status: 'responding',
        arrived: false,
        actionText: cfg.role === 'police'
          ? 'En camino • Prioridad Código 3 (Acordonamiento y corte de vía)'
          : cfg.role === 'ambulance'
          ? 'En camino • Soporte Vital Avanzado (Atención médica y triaje)'
          : 'En camino • Tren de Extinción (Bomba pesada y excarcelación)'
      });
    });

    const newInc: EmergencyIncident = {
      id: preset.id,
      title: incTitle,
      description: preset.description,
      latitude: targetLat,
      longitude: targetLng,
      address: incAddress,
      severity: preset.severity,
      status: 'units_responding',
      createdAt: Date.now(),
      units,
      interventionProgress: 0,
      interventionPhase: 'Fase 1: Respuesta y aproximación rápida de dotaciones'
    };

    state.activeIncident = newInc;
    setActiveIncident(newInc);
    setVehicles({ ...state.vehicles });
  }, []);

  // Resolver incidente y reanudar normalidad
  const resolveEmergency = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'RESOLVE_EMERGENCY',
        incidentId: activeIncident?.id || 'all'
      }));
      return;
    }

    const state = clientSimState.current;
    state.activeIncident = null;
    state.emergencyState = {};

    ALL_INITIAL_VEHICLE_CONFIGS.filter((c) => c.isEmergency).forEach((cfg) => {
      const v = state.vehicles[cfg.id];
      if (v) {
        v.status = 'idle';
        v.emergencyMission = undefined;
        v.lastTelemetry.emergencyMission = undefined;
        v.lastTelemetry.speed = 0;
      }
    });

    setActiveIncident(null);
    setVehicles({ ...state.vehicles });
  }, [activeIncident]);

  const sendSimulatorCommand = useCallback((command: 'play' | 'pause' | 'set_speed', speedMultiplier?: number) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const msg: WSClientMessage = {
        type: 'SIMULATOR_COMMAND',
        command,
        speedMultiplier
      };
      wsRef.current.send(JSON.stringify(msg));
    } else {
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

    const cfg = ALL_INITIAL_VEHICLE_CONFIGS.find((c) => c.id === vehicleId) || ALL_INITIAL_VEHICLE_CONFIGS[0];
    const route = PRESET_ROUTES[cfg.routeIndex] || PRESET_ROUTES[0];
    const wps = route.waypoints;

    const points: HistoricalPoint[] = [];
    const baseTime = Date.now() - 3600 * 1000;
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
  const movingCount = vehicleList.filter((v) => v.status === 'moving' || v.status === 'responding').length;
  const idleCount = vehicleList.filter((v) => v.status === 'idle' || v.status === 'stopped' || v.status === 'on_scene').length;
  const avgSpeed = vehicleList.length > 0
    ? Math.round(vehicleList.reduce((acc, v) => acc + v.lastTelemetry.speed, 0) / vehicleList.length)
    : 0;

  return {
    vehicles,
    vehicleList,
    breadcrumbs,
    tripHistory,
    activeIncident,
    triggerEmergency,
    resolveEmergency,
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
