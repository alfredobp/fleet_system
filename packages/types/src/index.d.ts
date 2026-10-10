export type VehicleType = 'truck' | 'van' | 'car' | 'motorcycle';
export type VehicleStatus = 'moving' | 'idle' | 'stopped' | 'alert';
export type StopReasonType = 'traffic_light' | 'delivery' | 'loading_dock' | 'fuel_rest' | 'incident';
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
    speed: number;
    heading: number;
    altitude?: number;
    battery: number;
    fuel?: number;
    odometer: number;
    timestamp: number;
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
export type WSClientMessage = {
    type: 'SUBSCRIBE';
} | {
    type: 'SIMULATOR_COMMAND';
    command: 'play' | 'pause' | 'set_speed';
    speedMultiplier?: number;
} | {
    type: 'TRIGGER_ALERT';
    vehicleId: string;
    message: string;
} | {
    type: 'TRIGGER_STOP';
    vehicleId: string;
    reason: StopReasonType;
    duration: number;
} | {
    type: 'GET_VEHICLE_HISTORY';
    vehicleId: string;
};
export type WSServerMessage = {
    type: 'INITIAL_STATE';
    payload: {
        vehicles: Vehicle[];
        simulator: SimulatorStatus;
    };
} | {
    type: 'TELEMETRY_UPDATE';
    payload: TelemetryPayload;
} | {
    type: 'VEHICLE_STATUS_CHANGE';
    payload: {
        vehicleId: string;
        status: VehicleStatus;
        currentStop?: StopInfo;
    };
} | {
    type: 'SIMULATOR_STATUS';
    payload: SimulatorStatus;
} | {
    type: 'ALERT_EVENT';
    payload: {
        vehicleId: string;
        message: string;
        timestamp: number;
    };
} | {
    type: 'VEHICLE_HISTORY_DATA';
    payload: VehicleTripHistory;
};
