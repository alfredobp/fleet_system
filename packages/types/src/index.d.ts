export type VehicleType = 'truck' | 'van' | 'car' | 'motorcycle' | 'fire_truck' | 'ambulance' | 'police';
export type VehicleStatus = 'moving' | 'idle' | 'stopped' | 'alert' | 'responding' | 'on_scene';
export type StopReasonType = 'traffic_light' | 'delivery' | 'loading_dock' | 'fuel_rest' | 'incident';
export interface StopInfo {
    reason: StopReasonType;
    label: string;
    durationSeconds: number;
    remainingSeconds: number;
    startedAt: number;
}
export type EmergencyRole = 'police' | 'fire' | 'ambulance';
export interface EmergencyMission {
    incidentId: string;
    role: EmergencyRole;
    targetLat: number;
    targetLng: number;
    address: string;
    etaSeconds: number;
    distanceRemainingMeters: number;
    status: 'dispatched' | 'en_route' | 'arrived';
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
    emergencyMission?: EmergencyMission;
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
    emergencyMission?: EmergencyMission;
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
export interface RespondingUnit {
    vehicleId: string;
    role: EmergencyRole;
    name: string;
    plate: string;
    speedKmh: number;
    etaSeconds: number;
    distanceMeters: number;
    status: 'responding' | 'arrived';
    arrived?: boolean;
    actionText: string;
}
export interface EmergencyIncident {
    id: string;
    title: string;
    description: string;
    latitude: number;
    longitude: number;
    address: string;
    severity: 'critical' | 'high' | 'medium';
    status: 'dispatched' | 'units_responding' | 'on_scene' | 'under_control' | 'resolved';
    createdAt: number;
    units: RespondingUnit[];
    interventionProgress?: number;
    interventionPhase?: string;
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
} | {
    type: 'TRIGGER_EMERGENCY';
    incidentId?: string;
    latitude?: number;
    longitude?: number;
    title?: string;
    address?: string;
} | {
    type: 'RESOLVE_EMERGENCY';
    incidentId: string;
};
export type WSServerMessage = {
    type: 'INITIAL_STATE';
    payload: {
        vehicles: Vehicle[];
        simulator: SimulatorStatus;
        incident?: EmergencyIncident | null;
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
        emergencyMission?: EmergencyMission;
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
} | {
    type: 'EMERGENCY_UPDATE';
    payload: EmergencyIncident | null;
};
