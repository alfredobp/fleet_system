import {
  Vehicle,
  TelemetryPayload,
  SimulatorStatus,
  VehicleStatus,
  StopInfo,
  StopReasonType,
  VehicleTripHistory,
  HistoricalPoint
} from '@fleet/types';
import { PRESET_ROUTES, RouteDefinition } from './routes-data.js';
import { calculateBearing, calculateDistanceMeters } from './gis-math.js';

interface VehicleSimState {
  vehicle: Vehicle;
  route: RouteDefinition;
  currentSegmentIndex: number;
  segmentProgress: number;     // 0.0 a 1.0 dentro del segmento de calle
  targetSpeed: number;         // km/h
  currentStop?: StopInfo;
}

const STOP_TEMPLATES: Array<{
  reason: StopReasonType;
  label: string;
  minDuration: number;
  maxDuration: number;
}> = [
  { reason: 'traffic_light', label: 'Semáforo en Rojo', minDuration: 15, maxDuration: 25 },
  { reason: 'delivery', label: 'Entrega de Paquetería', minDuration: 35, maxDuration: 65 },
  { reason: 'loading_dock', label: 'Carga en Almacén', minDuration: 45, maxDuration: 90 },
  { reason: 'fuel_rest', label: 'Descanso de Tacógrafo', minDuration: 40, maxDuration: 75 },
  { reason: 'incident', label: 'Retención de Tráfico', minDuration: 20, maxDuration: 40 }
];

export class FleetSimulator {
  private vehiclesState: VehicleSimState[] = [];
  private isRunning: boolean = true;
  private speedMultiplier: number = 1.0;
  private intervalMs: number = 1000;
  private timer: NodeJS.Timeout | null = null;
  private onTelemetryCallback?: (telemetry: TelemetryPayload) => void;
  private onStatusChangeCallback?: (vehicleId: string, status: VehicleStatus, stop?: StopInfo) => void;

  constructor() {
    this.initializeFleet();
  }

  private initializeFleet() {
    const rawFleetConfig: Array<{
      id: string;
      name: string;
      plate: string;
      type: 'truck' | 'van' | 'car' | 'motorcycle';
      driverName: string;
      color: string;
      routeIndex: number;
      startSegment: number;
    }> = [
      { id: 'veh-01', name: 'Scania Heavy 450', plate: '7412-MBL', type: 'truck', driverName: 'Carlos Mendizábal', color: '#3b82f6', routeIndex: 0, startSegment: 0 },
      { id: 'veh-02', name: 'Mercedes Sprinter Eco', plate: '9083-LKT', type: 'van', driverName: 'Elena Ramos', color: '#10b981', routeIndex: 1, startSegment: 2 },
      { id: 'veh-03', name: 'Volvo FH16 Reefer', plate: '3341-NZZ', type: 'truck', driverName: 'Jorge Aranda', color: '#f59e0b', routeIndex: 2, startSegment: 4 },
      { id: 'veh-04', name: 'Renault Kangoo E-Tech', plate: '5190-MPX', type: 'van', driverName: 'Sara Morales', color: '#8b5cf6', routeIndex: 3, startSegment: 1 },
      { id: 'veh-05', name: 'Ford Transit Custom', plate: '1128-LBB', type: 'van', driverName: 'David Soria', color: '#ec4899', routeIndex: 4, startSegment: 3 },
      { id: 'veh-06', name: 'MAN TGX Euro 6', plate: '8872-NZP', type: 'truck', driverName: 'Lucía Benítez', color: '#06b6d4', routeIndex: 5, startSegment: 0 },
      { id: 'veh-07', name: 'Silence S02 Express', plate: '4452-MMD', type: 'motorcycle', driverName: 'Mateo Gil', color: '#eab308', routeIndex: 1, startSegment: 6 },
      { id: 'veh-08', name: 'Toyota Proace City', plate: '6201-NHH', type: 'car', driverName: 'Andrea Valls', color: '#14b8a6', routeIndex: 0, startSegment: 7 }
    ];

    this.vehiclesState = rawFleetConfig.map((item) => {
      const route = PRESET_ROUTES[item.routeIndex % PRESET_ROUTES.length];
      const startSeg = item.startSegment % (route.waypoints.length - 1);
      const wpA = route.waypoints[startSeg];
      const wpB = route.waypoints[startSeg + 1];
      const initialHeading = calculateBearing(wpA.lat, wpA.lng, wpB.lat, wpB.lng);

      const initialTelemetry: TelemetryPayload = {
        vehicleId: item.id,
        latitude: wpA.lat,
        longitude: wpA.lng,
        speed: route.targetSpeedKmh,
        heading: Math.round(initialHeading),
        altitude: 660,
        battery: Math.floor(75 + Math.random() * 23),
        fuel: Math.floor(60 + Math.random() * 35),
        odometer: Math.floor(45000 + Math.random() * 50000),
        timestamp: Date.now()
      };

      const vehicle: Vehicle = {
        id: item.id,
        name: item.name,
        plate: item.plate,
        type: item.type,
        status: 'moving',
        driverName: item.driverName,
        color: item.color,
        lastTelemetry: initialTelemetry
      };

      return {
        vehicle,
        route,
        currentSegmentIndex: startSeg,
        segmentProgress: 0.1,
        targetSpeed: route.targetSpeedKmh
      };
    });
  }

  public getVehicles(): Vehicle[] {
    return this.vehiclesState.map((s) => s.vehicle);
  }

  public getStatus(): SimulatorStatus {
    return {
      isRunning: this.isRunning,
      speedMultiplier: this.speedMultiplier,
      activeVehiclesCount: this.vehiclesState.length,
      intervalMs: this.intervalMs
    };
  }

  public start(
    onTelemetry: (t: TelemetryPayload) => void,
    onStatusChange: (vehicleId: string, s: VehicleStatus, stop?: StopInfo) => void
  ) {
    this.onTelemetryCallback = onTelemetry;
    this.onStatusChangeCallback = onStatusChange;
    this.isRunning = true;

    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  public pause() {
    this.isRunning = false;
  }

  public resume() {
    this.isRunning = true;
  }

  public setSpeedMultiplier(multiplier: number) {
    this.speedMultiplier = Math.max(0.25, Math.min(10, multiplier));
  }

  public getVehicleHistory(vehicleId: string): VehicleTripHistory | null {
    const state = this.vehiclesState.find((s) => s.vehicle.id === vehicleId);
    if (!state) return null;

    const waypoints = state.route.waypoints;
    const now = Date.now();
    const durationMs = 25 * 60 * 1000; // 25 minutos de trayecto
    const startTime = now - durationMs;
    const numPoints = 85;
    const timeStepMs = durationMs / numPoints;

    const points: HistoricalPoint[] = [];
    let cumulativeDistance = 0;
    let stopsCount = 0;

    for (let i = 0; i < numPoints; i++) {
      const progress = i / (numPoints - 1);
      const exactIndex = progress * (waypoints.length - 1);
      const segmentIndex = Math.floor(exactIndex);
      const segmentProgress = exactIndex - segmentIndex;

      const wpA = waypoints[segmentIndex];
      const wpB = waypoints[Math.min(waypoints.length - 1, segmentIndex + 1)];

      const lat = wpA.lat + (wpB.lat - wpA.lat) * segmentProgress;
      const lng = wpA.lng + (wpB.lng - wpA.lng) * segmentProgress;
      const heading = calculateBearing(wpA.lat, wpA.lng, wpB.lat, wpB.lng);

      const timestamp = startTime + i * timeStepMs;

      // Simular dos eventos de parada realistas a lo largo del viaje
      let speed = state.targetSpeed + ((i % 5) - 2) * 4;
      let stopReason: string | undefined = undefined;

      if (i >= 22 && i <= 28) {
        speed = 0;
        stopReason = 'Semáforo en Rojo';
        if (i === 22) stopsCount++;
      } else if (i >= 55 && i <= 63) {
        speed = 0;
        stopReason = 'Entrega de Paquetería';
        if (i === 55) stopsCount++;
      }

      if (i > 0) {
        const prev = points[i - 1];
        cumulativeDistance += calculateDistanceMeters(prev.latitude, prev.longitude, lat, lng) / 1000;
      }

      const battery = Math.max(10, Math.round(92 - (i / numPoints) * 18));

      points.push({
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lng.toFixed(6)),
        speed: Math.max(0, Math.round(speed)),
        heading: Math.round(heading),
        timestamp,
        stopReason,
        battery
      });
    }

    return {
      vehicleId,
      vehicleName: state.vehicle.name,
      plate: state.vehicle.plate,
      driverName: state.vehicle.driverName,
      startTime,
      endTime: now,
      totalDistanceKm: Number(cumulativeDistance.toFixed(1)),
      stopsCount,
      points
    };
  }

  public triggerVehicleStop(vehicleId: string, reasonType: StopReasonType = 'delivery', durationSeconds = 45) {
    const state = this.vehiclesState.find((s) => s.vehicle.id === vehicleId);
    if (!state) return;

    const template = STOP_TEMPLATES.find((t) => t.reason === reasonType) || STOP_TEMPLATES[1];
    const stopInfo: StopInfo = {
      reason: reasonType,
      label: template.label,
      durationSeconds,
      remainingSeconds: durationSeconds,
      startedAt: Date.now()
    };

    state.currentStop = stopInfo;
    state.vehicle.currentStop = stopInfo;
    state.vehicle.status = reasonType === 'traffic_light' || reasonType === 'incident' ? 'idle' : 'stopped';
    state.vehicle.lastTelemetry.speed = 0;
    state.vehicle.lastTelemetry.currentStop = stopInfo;

    this.onStatusChangeCallback?.(vehicleId, state.vehicle.status, stopInfo);
    this.onTelemetryCallback?.(state.vehicle.lastTelemetry);
  }

  private tick() {
    if (!this.isRunning) return;

    const dtSeconds = (this.intervalMs / 1000) * this.speedMultiplier;

    for (const state of this.vehiclesState) {
      // 1. Manejo de vehículo actualmente en parada
      if (state.currentStop) {
        state.currentStop.remainingSeconds = Math.max(0, Math.round(state.currentStop.remainingSeconds - dtSeconds));
        
        if (state.currentStop.remainingSeconds <= 0) {
          // Parada finalizada -> reanudar marcha
          state.currentStop = undefined;
          state.vehicle.currentStop = undefined;
          state.vehicle.status = 'moving';
          this.onStatusChangeCallback?.(state.vehicle.id, 'moving', undefined);
        } else {
          // Vehículo continúa detenido
          state.vehicle.lastTelemetry.speed = 0;
          state.vehicle.lastTelemetry.timestamp = Date.now();
          state.vehicle.lastTelemetry.currentStop = state.currentStop;
          this.onTelemetryCallback?.(state.vehicle.lastTelemetry);
          continue;
        }
      } else if (Math.random() < 0.015 * this.speedMultiplier) {
        // 2. Probabilidad natural de iniciar una parada con motivo realista
        const template = STOP_TEMPLATES[Math.floor(Math.random() * STOP_TEMPLATES.length)];
        const duration = Math.floor(template.minDuration + Math.random() * (template.maxDuration - template.minDuration));
        
        const stopInfo: StopInfo = {
          reason: template.reason,
          label: template.label,
          durationSeconds: duration,
          remainingSeconds: duration,
          startedAt: Date.now()
        };

        state.currentStop = stopInfo;
        state.vehicle.currentStop = stopInfo;
        state.vehicle.status = template.reason === 'traffic_light' || template.reason === 'incident' ? 'idle' : 'stopped';
        state.vehicle.lastTelemetry.speed = 0;
        state.vehicle.lastTelemetry.currentStop = stopInfo;
        state.vehicle.lastTelemetry.timestamp = Date.now();

        this.onStatusChangeCallback?.(state.vehicle.id, state.vehicle.status, stopInfo);
        this.onTelemetryCallback?.(state.vehicle.lastTelemetry);
        continue;
      }

      // 3. Avance a lo largo de los waypoints de la calle
      const speedJitter = (Math.random() - 0.5) * 4;
      const currentSpeedKmh = Math.max(15, Math.min(105, state.targetSpeed + speedJitter));
      const speedMetersPerSec = (currentSpeedKmh * 1000) / 3600;
      const distanceTraveledMeters = speedMetersPerSec * dtSeconds;

      const waypoints = state.route.waypoints;
      const wpA = waypoints[state.currentSegmentIndex];
      const nextIndex = (state.currentSegmentIndex + 1) % waypoints.length;
      const wpB = waypoints[nextIndex];

      const segmentLengthMeters = Math.max(5, calculateDistanceMeters(wpA.lat, wpA.lng, wpB.lat, wpB.lng));
      const progressDelta = distanceTraveledMeters / segmentLengthMeters;

      state.segmentProgress += progressDelta;

      while (state.segmentProgress >= 1.0) {
        state.segmentProgress -= 1.0;
        state.currentSegmentIndex = (state.currentSegmentIndex + 1) % (waypoints.length - 1);
      }

      const activeWpA = waypoints[state.currentSegmentIndex];
      const activeWpB = waypoints[state.currentSegmentIndex + 1];

      // Interpolación sobre el eje de la calle
      const currentLat = activeWpA.lat + (activeWpB.lat - activeWpA.lat) * state.segmentProgress;
      const currentLng = activeWpA.lng + (activeWpB.lng - activeWpA.lng) * state.segmentProgress;
      const heading = calculateBearing(activeWpA.lat, activeWpA.lng, activeWpB.lat, activeWpB.lng);

      // Incremento de odómetro y batería
      state.vehicle.lastTelemetry.odometer += distanceTraveledMeters / 1000;
      if (Math.random() < 0.04) {
        state.vehicle.lastTelemetry.battery = Math.max(5, state.vehicle.lastTelemetry.battery - 0.05);
      }

      state.vehicle.lastTelemetry.latitude = Number(currentLat.toFixed(6));
      state.vehicle.lastTelemetry.longitude = Number(currentLng.toFixed(6));
      state.vehicle.lastTelemetry.speed = Math.round(currentSpeedKmh);
      state.vehicle.lastTelemetry.heading = Math.round(heading);
      state.vehicle.lastTelemetry.timestamp = Date.now();
      state.vehicle.lastTelemetry.currentStop = undefined;
      state.vehicle.status = 'moving';
      state.vehicle.currentStop = undefined;

      this.onTelemetryCallback?.(state.vehicle.lastTelemetry);
    }
  }
}
