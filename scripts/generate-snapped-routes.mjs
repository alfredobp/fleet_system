import fs from 'fs';

async function fetchRoute(wps) {
  // OSRM coordinates are lng,lat
  const coordsStr = wps.map(p => `${p.lng},${p.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;
  
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.code === 'Ok' && data.routes && data.routes[0]) {
      return data.routes[0].geometry.coordinates.map(coord => ({
        lat: Number(coord[1].toFixed(6)),
        lng: Number(coord[0].toFixed(6))
      }));
    }
  } catch (err) {
    console.error('Error fetching route:', err);
  }
  return wps;
}

const PRESET_ROUTES_RAW = [
  {
    id: 'route-castellana-axis',
    name: 'Eje Castellana - Recoletos - Prado',
    targetSpeedKmh: 45,
    waypoints: [
      { lat: 40.4072, lng: -3.6917 }, // Atocha
      { lat: 40.4150, lng: -3.6934 }, // Neptuno
      { lat: 40.4194, lng: -3.6931 }, // Cibeles
      { lat: 40.4255, lng: -3.6901 }, // Colón
      { lat: 40.4370, lng: -3.6896 }, // Gregorio Marañón
      { lat: 40.4430, lng: -3.6912 }, // Nuevos Ministerios
      { lat: 40.4531, lng: -3.6906 }, // Bernabéu
      { lat: 40.4655, lng: -3.6892 }, // Plaza de Castilla
      { lat: 40.4795, lng: -3.6874 }, // Cuatro Torres
      { lat: 40.4655, lng: -3.6895 },
      { lat: 40.4430, lng: -3.6915 },
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
      { lat: 40.4208, lng: -3.7061 }, // Callao
      { lat: 40.4180, lng: -3.6945 }, // Metrópolis
      { lat: 40.4195, lng: -3.6931 }, // Cibeles
      { lat: 40.4198, lng: -3.6888 }, // Puerta de Alcalá
      { lat: 40.4228, lng: -3.6850 }, // Velázquez
      { lat: 40.4248, lng: -3.6800 }, // Goya
      { lat: 40.4242, lng: -3.6705 }, // Manuel Becerra
      { lat: 40.4290, lng: -3.6640 }, // Ventas
      { lat: 40.4242, lng: -3.6705 },
      { lat: 40.4198, lng: -3.6888 },
      { lat: 40.4180, lng: -3.6945 },
      { lat: 40.4234, lng: -3.7121 }
    ]
  },
  {
    id: 'route-m30-ring',
    name: 'Anillo de Circunvalación Autovía M-30',
    targetSpeedKmh: 80,
    waypoints: [
      { lat: 40.4503, lng: -3.6591 }, // Ventas
      { lat: 40.4285, lng: -3.6582 }, // O'Donnell
      { lat: 40.4005, lng: -3.6668 }, // Vallecas
      { lat: 40.3862, lng: -3.6934 }, // Legazpi
      { lat: 40.3951, lng: -3.7183 }, // San Dámaso
      { lat: 40.4140, lng: -3.7291 }, // Príncipe Pío
      { lat: 40.4412, lng: -3.7258 }, // Moncloa
      { lat: 40.4680, lng: -3.7120 }, // Dehesa de la Villa
      { lat: 40.4820, lng: -3.6821 }, // Nudo Norte
      { lat: 40.4610, lng: -3.6610 }, // Arturo Soria
      { lat: 40.4503, lng: -3.6591 }  // Cierre
    ]
  },
  {
    id: 'route-a2-airport',
    name: 'Corredor Autovía A-2 Carga Aérea',
    targetSpeedKmh: 85,
    waypoints: [
      { lat: 40.4362, lng: -3.6705 }, // Avenida de América
      { lat: 40.4440, lng: -3.6380 }, // Canillejas
      { lat: 40.4550, lng: -3.5780 }, // Alameda de Osuna
      { lat: 40.4680, lng: -3.5700 }, // Aeropuerto T1-T2-T3
      { lat: 40.4912, lng: -3.5930 }, // Carga Aérea Barajas T4
      { lat: 40.4680, lng: -3.5700 },
      { lat: 40.4362, lng: -3.6705 }
    ]
  },
  {
    id: 'route-madrid-rio-centro',
    name: 'Reparto Madrid Río - Puerta de Toledo - Sol',
    targetSpeedKmh: 30,
    waypoints: [
      { lat: 40.4070, lng: -3.7110 }, // Puerta de Toledo
      { lat: 40.4120, lng: -3.7160 }, // Bailén
      { lat: 40.4150, lng: -3.7142 }, // Palacio Real
      { lat: 40.4170, lng: -3.7110 }, // Ópera
      { lat: 40.4168, lng: -3.7038 }, // Puerta del Sol
      { lat: 40.4150, lng: -3.6934 }, // Neptuno
      { lat: 40.4072, lng: -3.6917 }, // Atocha
      { lat: 40.4070, lng: -3.7110 }
    ]
  },
  {
    id: 'route-bravo-murillo',
    name: 'Eje Comercial Bravo Murillo - Cuatro Caminos',
    targetSpeedKmh: 35,
    waypoints: [
      { lat: 40.4450, lng: -3.7035 }, // Cuatro Caminos
      { lat: 40.4570, lng: -3.7015 }, // Estrecho
      { lat: 40.4655, lng: -3.6892 }, // Plaza de Castilla
      { lat: 40.4570, lng: -3.7015 },
      { lat: 40.4450, lng: -3.7035 }
    ]
  }
];

// Rutas tácticas de emergencia para los 3 incidentes clave
const EMERGENCY_UNITS = [
  { id: 'police', start: { lat: 40.4248, lng: -3.6800 } }, // Calle Goya
  { id: 'ambulance', start: { lat: 40.4072, lng: -3.6917 } }, // Atocha
  { id: 'fire', start: { lat: 40.4503, lng: -3.6591 } } // Ventas
];

const INCIDENTS = [
  {
    id: 'inc-gran-via',
    targets: {
      police: { lat: 40.4180 + 0.00018, lng: -3.6945 - 0.00022 },
      fire: { lat: 40.4180 - 0.00012, lng: -3.6945 - 0.00014 },
      ambulance: { lat: 40.4180 - 0.00020, lng: -3.6945 + 0.00018 }
    }
  },
  {
    id: 'inc-cibeles',
    targets: {
      police: { lat: 40.4194 + 0.00018, lng: -3.6931 - 0.00022 },
      fire: { lat: 40.4194 - 0.00012, lng: -3.6931 - 0.00014 },
      ambulance: { lat: 40.4194 - 0.00020, lng: -3.6931 + 0.00018 }
    }
  },
  {
    id: 'inc-m30',
    targets: {
      police: { lat: 40.4285 + 0.00018, lng: -3.6582 - 0.00022 },
      fire: { lat: 40.4285 - 0.00012, lng: -3.6582 - 0.00014 },
      ambulance: { lat: 40.4285 - 0.00020, lng: -3.6582 + 0.00018 }
    }
  }
];

async function main() {
  console.log('Fetching OSRM road routes for Madrid...');
  const snappedRoutes = [];

  for (const r of PRESET_ROUTES_RAW) {
    console.log(`Processing ${r.name}...`);
    const densePoints = await fetchRoute(r.waypoints);
    console.log(`  -> Generated ${densePoints.length} street points.`);
    snappedRoutes.push({
      ...r,
      waypoints: densePoints
    });
    // Sleep 250ms to be nice to OSRM demo server
    await new Promise(res => setTimeout(res, 250));
  }

  const emergencyApproachRoutes = {};
  for (const inc of INCIDENTS) {
    emergencyApproachRoutes[inc.id] = {};
    for (const unit of EMERGENCY_UNITS) {
      console.log(`Processing emergency approach for ${unit.id} -> ${inc.id}...`);
      const target = inc.targets[unit.id];
      const points = await fetchRoute([unit.start, target]);
      console.log(`  -> Generated ${points.length} street points.`);
      emergencyApproachRoutes[inc.id][unit.id] = points;
      await new Promise(res => setTimeout(res, 250));
    }
  }

  const output = {
    PRESET_ROUTES: snappedRoutes,
    EMERGENCY_APPROACH_ROUTES: emergencyApproachRoutes
  };

  fs.writeFileSync('scripts/snapped-routes.json', JSON.stringify(output, null, 2));
  console.log('Saved to scripts/snapped-routes.json!');
}

main();
