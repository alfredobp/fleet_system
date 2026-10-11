import fs from 'fs';

const snapped = JSON.parse(fs.readFileSync('scripts/snapped-routes.json', 'utf8'));

const fileHeader = `export interface Waypoint {
  lat: number;
  lng: number;
}

export interface RouteDefinition {
  id: string;
  name: string;
  waypoints: Waypoint[];
  targetSpeedKmh: number;
}

// Rutas comerciales y troncales de Madrid ajustadas a la red viaria real (OSRM / OpenStreetMap)
export const PRESET_ROUTES: RouteDefinition[] = ${JSON.stringify(snapped.PRESET_ROUTES, null, 2)};

export interface PresetIncidentDefinition {
  id: string;
  title: string;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  severity: 'critical' | 'high' | 'medium';
}

export const PRESET_INCIDENTS: PresetIncidentDefinition[] = [
  {
    id: 'inc-gran-via',
    title: 'Colisión Múltiple con Incendio',
    description: 'Choque de 3 turismos con conato de incendio y personas atrapadas. Bloqueo total de la calzada.',
    address: 'Gran Vía 1 con Alcalá (Edificio Metrópolis)',
    latitude: 40.4180,
    longitude: -3.6945,
    severity: 'critical'
  },
  {
    id: 'inc-cibeles',
    title: 'Accidente de Tráfico con Heridos Graves',
    description: 'Impacto lateral en glorieta principal. Derrame de combustible y conductor inconsciente.',
    address: 'Plaza de Cibeles / Paseo de Recoletos',
    latitude: 40.4194,
    longitude: -3.6931,
    severity: 'high'
  },
  {
    id: 'inc-m30',
    title: 'Vuelco de Vehículo Pesado en Autovía',
    description: 'Vehículo volcado sobre la bionda de la M-30. Retenciones masivas y riesgo de colisión secundaria.',
    address: "M-30 Km 7 / Enlace O'Donnell",
    latitude: 40.4285,
    longitude: -3.6582,
    severity: 'critical'
  }
];

export const EMERGENCY_FLEET_CONFIGS = [
  {
    id: 'veh-pol',
    name: 'Patrulla Z-402 • Policía Municipal',
    type: 'police' as const,
    role: 'police' as const,
    plate: '0112-POL',
    driverName: 'Oficial Delgado & Agente Ruiz',
    color: '#3b82f6',
    routeIndex: 1,
    emergencySpeed: 85,
    initialLat: 40.4248,
    initialLng: -3.6800 // Calle Goya
  },
  {
    id: 'veh-amb',
    name: 'SAMUR SVA Alfa-08 • Ambulancia',
    type: 'ambulance' as const,
    role: 'ambulance' as const,
    plate: '0112-SMR',
    driverName: 'Dra. Beltrán & Téc. Navarro',
    color: '#f59e0b',
    routeIndex: 0,
    emergencySpeed: 75,
    initialLat: 40.4072,
    initialLng: -3.6917 // Atocha
  },
  {
    id: 'veh-fire',
    name: 'Bomba Pesada B-14 • Bomberos',
    type: 'fire_truck' as const,
    role: 'fire' as const,
    plate: '0112-BMB',
    driverName: 'Sgto. Ramos & Dotación B-14',
    color: '#ef4444',
    routeIndex: 2,
    emergencySpeed: 65,
    initialLat: 40.4503,
    initialLng: -3.6591 // Ventas
  }
];

// Rutas de aproximación viarias reales (calle a calle con OSRM) para emergencias 112
export const EMERGENCY_APPROACH_ROUTES: Record<string, Record<string, Waypoint[]>> = ${JSON.stringify(snapped.EMERGENCY_APPROACH_ROUTES, null, 2)};
`;

fs.writeFileSync('apps/web/data/routes-data.ts', fileHeader, 'utf8');
fs.writeFileSync('apps/server/src/routes-data.ts', fileHeader, 'utf8');
console.log('✅ Applied road-snapped routes to both apps/web and apps/server!');
