export type VehicleType = 'truck' | 'van' | 'car' | 'motorcycle';

export type VehicleStatus = 'moving' | 'idle' | 'stopped' | 'alert';

export type StopReasonType =
  | 'traffic_light'   // Semáforo en rojo
  | 'delivery'        // Entrega de paquetería / cliente
  | 'loading_dock'    // Muelle de carga / descarga
  | 'fuel_rest'       // Repostaje o descanso del conductor
  | 'incident';       // Incidencia o atasco

export interface StopInfo {
  reason: StopReasonType;
  label: string;
  durationSeconds: number;
  remainingSeconds: number;
  startedAt: number;
}

export interface TelemetryPayload {
  vehicleId: string;
  latitude: number;
  longitude: number;
  speed: number;        // km/h
  heading: number;      // 0 to 359 degrees
  altitude?: number;    // meters
  battery: number;      // 0 to 100 percentage
  fuel?: number;        // 0 to 100 percentage
  odometer: number;     // Total km
  timestamp: number;    // Unix ms
  currentStop?: StopInfo;
}

export interface Vehicle {
  id: string;
  name: string;
  plate: string;
  type: VehicleType;
  status: VehicleStatus;
  driverName: string;
  color: string;
  lastTelemetry: TelemetryPayload;
  currentStop?: StopInfo;
}

export interface SimulatorStatus {
  isRunning: boolean;
  speedMultiplier: number;
  activeVehiclesCount: number;
  intervalMs: number;
}

export interface HistoricalPoint {
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  timestamp: number;
  stopReason?: string;
  battery: number;
}

export interface VehicleTripHistory {
  vehicleId: string;
  vehicleName: string;
  plate: string;
  driverName: string;
  startTime: number;
  endTime: number;
  totalDistanceKm: number;
  stopsCount: number;
  points: HistoricalPoint[];
}

export type WSClientMessage =
  | { type: 'SUBSCRIBE' }
  | { type: 'SIMULATOR_COMMAND'; command: 'play' | 'pause' | 'set_speed'; speedMultiplier?: number }
  | { type: 'TRIGGER_ALERT'; vehicleId: string; message: string }
  | { type: 'TRIGGER_STOP'; vehicleId: string; reason: StopReasonType; duration: number }
  | { type: 'GET_VEHICLE_HISTORY'; vehicleId: string };

export type WSServerMessage =
  | { type: 'INITIAL_STATE'; payload: { vehicles: Vehicle[]; simulator: SimulatorStatus } }
  | { type: 'TELEMETRY_UPDATE'; payload: TelemetryPayload }
  | { type: 'VEHICLE_STATUS_CHANGE'; payload: { vehicleId: string; status: VehicleStatus; currentStop?: StopInfo } }
  | { type: 'SIMULATOR_STATUS'; payload: SimulatorStatus }
  | { type: 'ALERT_EVENT'; payload: { vehicleId: string; message: string; timestamp: number } }
  | { type: 'VEHICLE_HISTORY_DATA'; payload: VehicleTripHistory };
