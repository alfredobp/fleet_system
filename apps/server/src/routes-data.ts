export interface Waypoint {
  lat: number;
  lng: number;
}

export interface RouteDefinition {
  id: string;
  name: string;
  waypoints: Waypoint[];
  targetSpeedKmh: number;
}

export const PRESET_ROUTES: RouteDefinition[] = [
  {
    id: 'route-castellana-axis',
    name: 'Eje Castellana - Recoletos - Prado',
    targetSpeedKmh: 45,
    waypoints: [
      { lat: 40.4072, lng: -3.6917 }, // Estación de Atocha
      { lat: 40.4105, lng: -3.6924 }, // CaixaForum Paseo del Prado
      { lat: 40.4150, lng: -3.6934 }, // Fuente de Neptuno
      { lat: 40.4194, lng: -3.6931 }, // Plaza de Cibeles
      { lat: 40.4225, lng: -3.6918 }, // Paseo de Recoletos / Biblioteca Nacional
      { lat: 40.4255, lng: -3.6901 }, // Plaza de Colón
      { lat: 40.4312, lng: -3.6895 }, // Castellana / Glorieta de Emilio Castelar
      { lat: 40.4370, lng: -3.6896 }, // Castellana / Plaza de Gregorio Marañón
      { lat: 40.4430, lng: -3.6912 }, // Castellana / Nuevos Ministerios
      { lat: 40.4485, lng: -3.6908 }, // Castellana / Raimundo Fdez Villaverde
      { lat: 40.4531, lng: -3.6906 }, // Estadio Santiago Bernabéu / Plaza de Lima
      { lat: 40.4590, lng: -3.6898 }, // Castellana / Plaza de Cuzco
      { lat: 40.4655, lng: -3.6892 }, // Plaza de Castilla (Torres Kio)
      { lat: 40.4740, lng: -3.6875 }, // Castellana Norte
      { lat: 40.4795, lng: -3.6874 }, // Cuatro Torres Business Area (CTBA)
      // Retorno sur trazando la calzada contraria
      { lat: 40.4740, lng: -3.6878 },
      { lat: 40.4655, lng: -3.6895 },
      { lat: 40.4590, lng: -3.6902 },
      { lat: 40.4531, lng: -3.6909 },
      { lat: 40.4430, lng: -3.6915 },
      { lat: 40.4370, lng: -3.6899 },
      { lat: 40.4255, lng: -3.6904 },
      { lat: 40.4194, lng: -3.6934 },
      { lat: 40.4072, lng: -3.6917 }
    ]
  },
  {
    id: 'route-gran-via-alcala',
    name: 'Ruta Comercial Gran Vía - Alcalá - Goya',
    targetSpeedKmh: 35,
    waypoints: [
      { lat: 40.4234, lng: -3.7121 }, // Plaza de España
      { lat: 40.4225, lng: -3.7088 }, // Gran Vía / Santo Domingo
      { lat: 40.4208, lng: -3.7061 }, // Gran Vía / Callao
      { lat: 40.4198, lng: -3.7025 }, // Gran Vía / Red de San Luis (Telefónica)
      { lat: 40.4188, lng: -3.6980 }, // Gran Vía / Montera
      { lat: 40.4180, lng: -3.6945 }, // Gran Vía / Edificio Metrópolis
      { lat: 40.4195, lng: -3.6931 }, // Plaza de Cibeles
      { lat: 40.4198, lng: -3.6888 }, // Puerta de Alcalá
      { lat: 40.4228, lng: -3.6850 }, // Calle Alcalá / Velázquez
      { lat: 40.4248, lng: -3.6800 }, // Calle Goya / Príncipe de Vergara
      { lat: 40.4242, lng: -3.6705 }, // Calle Alcalá / Manuel Becerra
      { lat: 40.4290, lng: -3.6640 }, // Plaza de Toros de Las Ventas
      // Retorno hacia el centro
      { lat: 40.4242, lng: -3.6705 },
      { lat: 40.4228, lng: -3.6850 },
      { lat: 40.4198, lng: -3.6888 },
      { lat: 40.4195, lng: -3.6931 },
      { lat: 40.4180, lng: -3.6945 },
      { lat: 40.4208, lng: -3.7061 },
      { lat: 40.4234, lng: -3.7121 }
    ]
  },
  {
    id: 'route-m30-ring',
    name: 'Anillo de Circunvalación Autovía M-30',
    targetSpeedKmh: 80,
    waypoints: [
      { lat: 40.4503, lng: -3.6591 }, // M-30 Ventas / El Carmen
      { lat: 40.4395, lng: -3.6575 }, // M-30 Parque de las Avenidas
      { lat: 40.4285, lng: -3.6582 }, // M-30 O'Donnell
      { lat: 40.4140, lng: -3.6620 }, // M-30 Conde de Casal
      { lat: 40.4005, lng: -3.6668 }, // M-30 Puente de Vallecas
      { lat: 40.3910, lng: -3.6780 }, // M-30 Méndez Álvaro
      { lat: 40.3862, lng: -3.6934 }, // M-30 Legazpi / Planetario
      { lat: 40.3890, lng: -3.7080 }, // M-30 Nudo Sur / Puente de Praga
      { lat: 40.3951, lng: -3.7183 }, // M-30 San Dámaso / Río Manzanares
      { lat: 40.4050, lng: -3.7245 }, // M-30 Puente de San Isidro
      { lat: 40.4140, lng: -3.7291 }, // M-30 Príncipe Pío
      { lat: 40.4260, lng: -3.7285 }, // M-30 Marqués de Monistrol
      { lat: 40.4412, lng: -3.7258 }, // M-30 Moncloa / Puente de los Franceses
      { lat: 40.4560, lng: -3.7200 }, // M-30 Puerta de Hierro
      { lat: 40.4680, lng: -3.7120 }, // M-30 Dehesa de la Villa
      { lat: 40.4780, lng: -3.6980 }, // M-30 Herrera Oria
      { lat: 40.4820, lng: -3.6821 }, // M-30 Nudo Norte
      { lat: 40.4780, lng: -3.6710 }, // M-30 Manoteras
      { lat: 40.4731, lng: -3.6642 }, // M-30 Pinar de Chamartín
      { lat: 40.4610, lng: -3.6610 }, // M-30 Arturo Soria enlace
      { lat: 40.4503, lng: -3.6591 }  // Cierre de bucle en Ventas
    ]
  },
  {
    id: 'route-a2-airport',
    name: 'Corredor Autovía A-2 Carga Aérea',
    targetSpeedKmh: 85,
    waypoints: [
      { lat: 40.4362, lng: -3.6705 }, // Avenida de América
      { lat: 40.4410, lng: -3.6520 }, // A-2 / Parque de las Avenidas
      { lat: 40.4440, lng: -3.6380 }, // A-2 / Canillejas
      { lat: 40.4465, lng: -3.6200 }, // A-2 / Polígono Las Mercedes
      { lat: 40.4485, lng: -3.6050 }, // A-2 / San Blas
      { lat: 40.4550, lng: -3.5780 }, // A-2 / Alameda de Osuna
      { lat: 40.4680, lng: -3.5700 }, // Enlace Aeropuerto T1-T2-T3
      { lat: 40.4790, lng: -3.5750 }, // Autovía M-14 hacia T4
      { lat: 40.4912, lng: -3.5930 }, // Centro de Carga Aérea Barajas T4
      { lat: 40.4790, lng: -3.5750 },
      { lat: 40.4680, lng: -3.5700 },
      { lat: 40.4550, lng: -3.5780 },
      { lat: 40.4440, lng: -3.6380 },
      { lat: 40.4362, lng: -3.6705 }
    ]
  },
  {
    id: 'route-madrid-rio-centro',
    name: 'Reparto Madrid Río - Puerta de Toledo - Sol',
    targetSpeedKmh: 30,
    waypoints: [
      { lat: 40.4070, lng: -3.7110 }, // Glorieta Puerta de Toledo
      { lat: 40.4105, lng: -3.7135 }, // Calle de Toledo
      { lat: 40.4120, lng: -3.7160 }, // Calle Bailén / Viaducto
      { lat: 40.4150, lng: -3.7142 }, // Palacio Real / Catedral de la Almudena
      { lat: 40.4170, lng: -3.7110 }, // Plaza de Oriente / Teatro Real
      { lat: 40.4155, lng: -3.7075 }, // Plaza Mayor
      { lat: 40.4168, lng: -3.7038 }, // Puerta del Sol (Kilómetro Cero)
      { lat: 40.4160, lng: -3.6990 }, // Carrera de San Jerónimo / Cortes
      { lat: 40.4150, lng: -3.6934 }, // Plaza de Neptuno
      { lat: 40.4105, lng: -3.6924 }, // Paseo del Prado
      { lat: 40.4072, lng: -3.6917 }, // Estación de Atocha
      { lat: 40.4070, lng: -3.7110 }  // Regreso
    ]
  },
  {
    id: 'route-bravo-murillo',
    name: 'Eje Comercial Bravo Murillo - Cuatro Caminos',
    targetSpeedKmh: 35,
    waypoints: [
      { lat: 40.4450, lng: -3.7035 }, // Glorieta de Cuatro Caminos
      { lat: 40.4510, lng: -3.7030 }, // Bravo Murillo / Metro Alvarado
      { lat: 40.4570, lng: -3.7015 }, // Bravo Murillo / Metro Estrecho
      { lat: 40.4630, lng: -3.6980 }, // Bravo Murillo / Metro Tetuán
      { lat: 40.4655, lng: -3.6892 }, // Plaza de Castilla
      { lat: 40.4630, lng: -3.6980 },
      { lat: 40.4570, lng: -3.7015 },
      { lat: 40.4510, lng: -3.7030 },
      { lat: 40.4450, lng: -3.7035 }
    ]
  }
];

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
