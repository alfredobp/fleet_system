import {
  Vehicle,
  TelemetryPayload,
  SimulatorStatus,
  VehicleStatus,
  StopInfo,
  StopReasonType,
  VehicleTripHistory,
  HistoricalPoint,
  EmergencyIncident,
  RespondingUnit,
  EmergencyMission
} from '@fleet/types';
import { PRESET_ROUTES, RouteDefinition, PRESET_INCIDENTS, EMERGENCY_FLEET_CONFIGS } from './routes-data.js';
import { calculateBearing, calculateDistanceMeters } from './gis-math.js';

interface VehicleSimState {
  vehicle: Vehicle;
  route: RouteDefinition;
  currentSegmentIndex: number;
  segmentProgress: number;     // 0.0 a 1.0 dentro del segmento de calle
  targetSpeed: number;         // km/h
  currentStop?: StopInfo;
  isEmergencyUnit?: boolean;
  emergencyRole?: 'police' | 'fire' | 'ambulance';
  emergencyTarget?: { lat: number; lng: number };
  emergencyApproachWaypoints?: Array<{ lat: number; lng: number }>;
  emergencyWaypointIndex?: number;
}

const TACTICAL_OFFSETS: Record<string, { dLat: number; dLng: number; heading: number }> = {
  police: { dLat: 0.00018, dLng: -0.00022, heading: 45 },
  fire: { dLat: -0.00012, dLng: -0.00014, heading: 90 },
  ambulance: { dLat: -0.00020, dLng: 0.00018, heading: 135 }
};

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
  private onStatusChangeCallback?: (vehicleId: string, status: VehicleStatus, stop?: StopInfo, emergency?: EmergencyMission) => void;
  private onEmergencyUpdateCallback?: (incident: EmergencyIncident | null) => void;

  private activeIncident: EmergencyIncident | null = null;

  constructor() {
    this.initializeFleet();
  }

  private initializeFleet() {
    // 1. Unidades de Emergencias 112 de Madrid
    const emergencyFleet = EMERGENCY_FLEET_CONFIGS.map((cfg) => {
      const route = PRESET_ROUTES[cfg.routeIndex];
      const initialTelemetry: TelemetryPayload = {
        vehicleId: cfg.id,
        latitude: cfg.initialLat,
        longitude: cfg.initialLng,
        speed: 0,
        heading: 90,
        altitude: 660,
        battery: 98,
        odometer: 18450,
        timestamp: Date.now()
      };

      const vehicle: Vehicle = {
        id: cfg.id,
        name: cfg.name,
        plate: cfg.plate,
        type: cfg.type,
        status: 'idle',
        driverName: cfg.driverName,
        color: cfg.color,
        lastTelemetry: initialTelemetry
      };

      return {
        vehicle,
        route,
        currentSegmentIndex: 0,
        segmentProgress: 0,
        targetSpeed: cfg.emergencySpeed,
        isEmergencyUnit: true,
        emergencyRole: cfg.role
      };
    });

    // 2. Flota comercial y logística existente
    const commercialFleetConfig = [
      { id: 'veh-01', name: 'Scania Heavy 450', plate: '7412-MBL', type: 'truck' as const, driverName: 'Carlos Mendizábal', color: '#38bdf8', routeIndex: 0, startSegment: 0 },
      { id: 'veh-02', name: 'Mercedes Sprinter Eco', plate: '9083-LKT', type: 'van' as const, driverName: 'Elena Ramos', color: '#10b981', routeIndex: 1, startSegment: 2 },
      { id: 'veh-03', name: 'Volvo FH16 Reefer', plate: '3341-NZZ', type: 'truck' as const, driverName: 'Jorge Aranda', color: '#a855f7', routeIndex: 2, startSegment: 4 },
      { id: 'veh-07', name: 'Silence S02 Reparto Urgente', plate: '4452-MMD', type: 'motorcycle' as const, driverName: 'Mateo Gil', color: '#eab308', routeIndex: 4, startSegment: 1 }
    ];

    const commercialFleet = commercialFleetConfig.map((item) => {
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
        segmentProgress: 0,
        targetSpeed: route.targetSpeedKmh,
        isEmergencyUnit: false
      };
    });

    this.vehiclesState = [...emergencyFleet, ...commercialFleet];
  }

  public start(
    onTelemetry: (t: TelemetryPayload) => void,
    onStatusChange: (vehicleId: string, status: VehicleStatus, stop?: StopInfo, emergency?: EmergencyMission) => void,
    onEmergencyUpdate?: (incident: EmergencyIncident | null) => void
  ) {
    this.onTelemetryCallback = onTelemetry;
    this.onStatusChangeCallback = onStatusChange;
    this.onEmergencyUpdateCallback = onEmergencyUpdate;

    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  public getVehicles(): Vehicle[] {
    return this.vehiclesState.map((s) => s.vehicle);
  }

  public getActiveIncident(): EmergencyIncident | null {
    return this.activeIncident;
  }

  public getStatus(): SimulatorStatus {
    return {
      isRunning: this.isRunning,
      speedMultiplier: this.speedMultiplier,
      activeVehiclesCount: this.vehiclesState.length,
      intervalMs: this.intervalMs
    };
  }

  public pause() {
    this.isRunning = false;
  }

  public resume() {
    this.isRunning = true;
  }

  public setSpeedMultiplier(multiplier: number) {
    this.speedMultiplier = Math.max(0.25, Math.min(10.0, multiplier));
  }

  // Despacho de Incidente de Emergencia (112 Madrid)
  public triggerEmergency(
    incidentId?: string,
    latitude?: number,
    longitude?: number,
    title?: string,
    address?: string
  ) {
    const preset = PRESET_INCIDENTS.find((p) => p.id === incidentId) || PRESET_INCIDENTS[0];
    const targetLat = latitude ?? preset.latitude;
    const targetLng = longitude ?? preset.longitude;
    const incTitle = title ?? preset.title;
    const incAddress = address ?? preset.address;

    const units: RespondingUnit[] = [];

    // Despachar cada unidad de emergencias a su puesto táctico asignado
    for (const state of this.vehiclesState) {
      if (!state.isEmergencyUnit) continue;

      const v = state.vehicle;
      const role = v.type === 'police' ? 'police' : v.type === 'ambulance' ? 'ambulance' : 'fire';
      const offset = TACTICAL_OFFSETS[role] || { dLat: 0, dLng: 0, heading: 0 };
      const tacticalLat = targetLat + offset.dLat;
      const tacticalLng = targetLng + offset.dLng;

      const speedKmh = state.targetSpeed;
      const distMeters = calculateDistanceMeters(v.lastTelemetry.latitude, v.lastTelemetry.longitude, tacticalLat, tacticalLng);
      const speedMs = (speedKmh * 1000) / 3600;
      const etaSeconds = Math.max(10, Math.round(distMeters / speedMs));

      state.emergencyTarget = { lat: tacticalLat, lng: tacticalLng };
      state.emergencyWaypointIndex = 0;
      
      // Creamos waypoints de aproximación directa
      const midPoints: Array<{ lat: number; lng: number }> = [];
      const steps = 4;
      for (let s = 1; s <= steps; s++) {
        const frac = s / steps;
        const lat = v.lastTelemetry.latitude + (tacticalLat - v.lastTelemetry.latitude) * frac;
        const lng = v.lastTelemetry.longitude + (tacticalLng - v.lastTelemetry.longitude) * frac;
        midPoints.push({ lat, lng });
      }
      state.emergencyApproachWaypoints = midPoints;

      v.status = 'responding';
      v.lastTelemetry.speed = speedKmh;

      const mission: EmergencyMission = {
        incidentId: preset.id,
        role,
        targetLat: tacticalLat,
        targetLng: tacticalLng,
        address: incAddress,
        etaSeconds,
        distanceRemainingMeters: Math.round(distMeters),
        status: 'en_route'
      };

      v.emergencyMission = mission;
      v.lastTelemetry.emergencyMission = mission;

      units.push({
        vehicleId: v.id,
        role,
        name: v.name,
        plate: v.plate,
        speedKmh,
        etaSeconds,
        distanceMeters: Math.round(distMeters),
        status: 'responding',
        arrived: false,
        actionText: role === 'police'
          ? 'En camino • Prioridad Código 3 (Acordonamiento y corte de vía)'
          : role === 'ambulance'
          ? 'En camino • Soporte Vital Avanzado (Atención médica y triaje)'
          : 'En camino • Tren de Extinción (Bomba pesada y excarcelación)'
      });

      this.onStatusChangeCallback?.(v.id, 'responding', undefined, mission);
    }

    this.activeIncident = {
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

    this.onEmergencyUpdateCallback?.(this.activeIncident);
  }

  // Resolver / Cancelar Incidente y reanudar patrullas rutinarias
  public resolveEmergency() {
    if (!this.activeIncident) return;

    for (const state of this.vehiclesState) {
      if (state.isEmergencyUnit) {
        state.vehicle.status = 'idle';
        state.vehicle.emergencyMission = undefined;
        state.vehicle.lastTelemetry.emergencyMission = undefined;
        state.vehicle.lastTelemetry.speed = 0;
        state.emergencyTarget = undefined;
        state.emergencyApproachWaypoints = undefined;

        this.onStatusChangeCallback?.(state.vehicle.id, 'idle', undefined, undefined);
      }
    }

    this.activeIncident = null;
    this.onEmergencyUpdateCallback?.(null);
  }

  // Generador de histórico de viaje realista
  public getVehicleHistory(vehicleId: string): VehicleTripHistory | null {
    const state = this.vehiclesState.find((s) => s.vehicle.id === vehicleId);
    if (!state) return null;

    const route = state.route;
    const now = Date.now();
    const startTime = now - 3600 * 1000;
    const numPoints = 60;
    const points: HistoricalPoint[] = [];
    const waypoints = route.waypoints;

    let cumulativeDistance = 0;
    let stopsCount = 0;

    for (let i = 0; i < numPoints; i++) {
      const progress = i / (numPoints - 1);
      const timestamp = startTime + Math.round(progress * 3600 * 1000);

      const segmentF = progress * (waypoints.length - 1);
      const segIndex = Math.min(waypoints.length - 2, Math.floor(segmentF));
      const segRatio = segmentF - segIndex;

      const wpA = waypoints[segIndex];
      const wpB = waypoints[segIndex + 1];

      const lat = wpA.lat + (wpB.lat - wpA.lat) * segRatio;
      const lng = wpA.lng + (wpB.lng - wpA.lng) * segRatio;
      const heading = calculateBearing(wpA.lat, wpA.lng, wpB.lat, wpB.lng);

      const isStop = (i >= 12 && i <= 15) || (i >= 38 && i <= 41);
      let stopReason: string | undefined;
      let speed = route.targetSpeedKmh;

      if (isStop) {
        speed = 0;
        if (i === 12) {
          stopsCount++;
          stopReason = 'Entrega de Paquetería';
        } else if (i === 38) {
          stopsCount++;
          stopReason = 'Semáforo en Rojo';
        } else {
          stopReason = i < 20 ? 'Entrega de Paquetería' : 'Semáforo en Rojo';
        }
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

    // Actualización de unidades en caso de emergencia activa
    if (this.activeIncident) {
      let allArrived = true;

      for (const state of this.vehiclesState) {
        if (!state.isEmergencyUnit || !state.emergencyTarget || !state.emergencyApproachWaypoints) continue;

        const v = state.vehicle;
        const target = state.emergencyTarget;
        const currentDist = calculateDistanceMeters(v.lastTelemetry.latitude, v.lastTelemetry.longitude, target.lat, target.lng);

        if (currentDist <= 20) {
          // ¡Llegada confirmada al puesto táctico asignado!
          if (v.status !== 'on_scene') {
            v.status = 'on_scene';
            v.lastTelemetry.speed = 0;
            v.lastTelemetry.latitude = target.lat;
            v.lastTelemetry.longitude = target.lng;

            const offset = TACTICAL_OFFSETS[state.emergencyRole || 'police'];
            if (offset) {
              v.lastTelemetry.heading = offset.heading;
            }

            const unitRef = this.activeIncident.units.find((u) => u.vehicleId === v.id);
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

            this.onStatusChangeCallback?.(v.id, 'on_scene', undefined, v.emergencyMission);
          }
        } else {
          allArrived = false;

          // Avanzar hacia el puesto táctico
          const wps = state.emergencyApproachWaypoints;
          const wpIdx = state.emergencyWaypointIndex ?? 0;
          const nextTarget = wps[wpIdx] || target;

          const distToWp = calculateDistanceMeters(v.lastTelemetry.latitude, v.lastTelemetry.longitude, nextTarget.lat, nextTarget.lng);
          const speedKmh = state.targetSpeed;
          const moveStepMeters = (speedKmh * 1000 / 3600) * dtSeconds;

          const heading = calculateBearing(v.lastTelemetry.latitude, v.lastTelemetry.longitude, nextTarget.lat, nextTarget.lng);

          const stepRatio = Math.min(1.0, moveStepMeters / Math.max(1, distToWp));
          const newLat = v.lastTelemetry.latitude + (nextTarget.lat - v.lastTelemetry.latitude) * stepRatio;
          const newLng = v.lastTelemetry.longitude + (nextTarget.lng - v.lastTelemetry.longitude) * stepRatio;

          if (distToWp <= 30 && wpIdx < wps.length - 1) {
            state.emergencyWaypointIndex = wpIdx + 1;
          }

          const remDist = calculateDistanceMeters(newLat, newLng, target.lat, target.lng);
          const etaSec = Math.max(1, Math.round(remDist / ((speedKmh * 1000) / 3600)));

          v.lastTelemetry.latitude = Number(newLat.toFixed(6));
          v.lastTelemetry.longitude = Number(newLng.toFixed(6));
          v.lastTelemetry.heading = Math.round(heading);
          v.lastTelemetry.speed = speedKmh;
          v.lastTelemetry.timestamp = Date.now();

          if (v.emergencyMission) {
            v.emergencyMission.etaSeconds = etaSec;
            v.emergencyMission.distanceRemainingMeters = Math.round(remDist);
          }

          const unitRef = this.activeIncident.units.find((u) => u.vehicleId === v.id);
          if (unitRef) {
            unitRef.etaSeconds = etaSec;
            unitRef.distanceMeters = Math.round(remDist);
            unitRef.speedKmh = speedKmh;
          }

          this.onTelemetryCallback?.(v.lastTelemetry);
        }
      }

      // Progresión activa de la atención a la emergencia una vez las dotaciones llegan al lugar
      const prevProg = this.activeIncident.interventionProgress || 0;
      let newProg = prevProg;

      if (allArrived) {
        newProg = Math.min(100, Math.round(prevProg + 4 * this.speedMultiplier));
        this.activeIncident.interventionProgress = newProg;

        if (newProg < 30) {
          this.activeIncident.status = 'on_scene';
          this.activeIncident.interventionPhase = 'Fase 1: Aseguramiento perimetral y corte de vía';
          this.activeIncident.units.forEach((u) => {
            if (u.role === 'police') u.actionText = '🚨 Corte de vía establecido. Perímetro de seguridad de 50m activo.';
            if (u.role === 'fire') u.actionText = '🚨 Mangueras desplegadas. Enfriando derrame con espuma ignífuga.';
            if (u.role === 'ambulance') u.actionText = '🚨 Accediendo al habitáculo. Triaje inicial de víctimas.';
          });
        } else if (newProg < 75) {
          this.activeIncident.status = 'on_scene';
          this.activeIncident.interventionPhase = 'Fase 2: Excarcelación hidráulica y estabilización de heridos';
          this.activeIncident.units.forEach((u) => {
            if (u.role === 'police') u.actionText = '🚨 Tráfico desviado por vías alternativas. Atestados recopilando datos.';
            if (u.role === 'fire') u.actionText = '🚨 Corte de pilares con cizalla hidráulica para liberar atrapados.';
            if (u.role === 'ambulance') u.actionText = '🚨 2 heridos inmovilizados con collarín y sueroterapia.';
          });
        } else if (newProg < 100) {
          this.activeIncident.status = 'on_scene';
          this.activeIncident.interventionPhase = 'Fase 3: Carga en ambulancia y retirada de vehículos';
          this.activeIncident.units.forEach((u) => {
            if (u.role === 'police') u.actionText = '🚨 Grúa municipal asegurando los turismos accidentados.';
            if (u.role === 'fire') u.actionText = '✅ Atrapados liberados con éxito. Limpieza de calzada.';
            if (u.role === 'ambulance') u.actionText = '🚨 Pacientes monitorizados en el interior del SVA.';
          });
        } else {
          this.activeIncident.status = 'under_control';
          this.activeIncident.interventionPhase = '✅ Incidente Controlado: Evacuación sanitaria y reapertura';
          this.activeIncident.units.forEach((u) => {
            if (u.role === 'police') u.actionText = '✅ Calzada declarada segura y tráfico restablecido.';
            if (u.role === 'fire') u.actionText = '✅ Incendio y vertido neutralizados. Dotación lista.';
            if (u.role === 'ambulance') u.actionText = '🚨 Evacuación urgente con preaviso al Hospital Clínico.';
          });
        }
      }

      this.onEmergencyUpdateCallback?.(this.activeIncident);
    }

    // Rutina de simulación para vehículos comerciales estándar
    for (const state of this.vehiclesState) {
      if (state.isEmergencyUnit && this.activeIncident) continue;

      const route = state.route;
      const waypoints = route.waypoints;

      // Manejo de paradas normales
      if (state.currentStop) {
        state.currentStop.remainingSeconds = Math.max(0, Math.round(state.currentStop.remainingSeconds - dtSeconds));
        
        if (state.currentStop.remainingSeconds <= 0) {
          state.currentStop = undefined;
          state.vehicle.currentStop = undefined;
          state.vehicle.status = 'moving';
          this.onStatusChangeCallback?.(state.vehicle.id, 'moving', undefined);
        } else {
          state.vehicle.lastTelemetry.speed = 0;
          state.vehicle.lastTelemetry.timestamp = Date.now();
          state.vehicle.lastTelemetry.currentStop = state.currentStop;
          this.onTelemetryCallback?.(state.vehicle.lastTelemetry);
          continue;
        }
      }

      const pA = waypoints[state.currentSegmentIndex];
      const pB = waypoints[state.currentSegmentIndex + 1];
      const segmentDistMeters = calculateDistanceMeters(pA.lat, pA.lng, pB.lat, pB.lng);

      const currentSpeedKmh = state.targetSpeed;
      const distanceTraveledMeters = (currentSpeedKmh * 1000 / 3600) * dtSeconds;
      const progressIncrement = segmentDistMeters > 0 ? distanceTraveledMeters / segmentDistMeters : 1;

      state.segmentProgress += progressIncrement;

      while (state.segmentProgress >= 1.0) {
        state.segmentProgress -= 1.0;
        state.currentSegmentIndex = (state.currentSegmentIndex + 1) % (waypoints.length - 1);
      }

      const activeWpA = waypoints[state.currentSegmentIndex];
      const activeWpB = waypoints[state.currentSegmentIndex + 1];

      const currentLat = activeWpA.lat + (activeWpB.lat - activeWpA.lat) * state.segmentProgress;
      const currentLng = activeWpA.lng + (activeWpB.lng - activeWpA.lng) * state.segmentProgress;
      const heading = calculateBearing(activeWpA.lat, activeWpA.lng, activeWpB.lat, activeWpB.lng);

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
