'use client';

import { useEffect, useRef, useState } from 'react';
import Map from 'ol/Map.js';
import View from 'ol/View.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorLayer from 'ol/layer/Vector.js';
import XYZ from 'ol/source/XYZ.js';
import OSM from 'ol/source/OSM.js';
import VectorSource from 'ol/source/Vector.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import LineString from 'ol/geom/LineString.js';
import Circle from 'ol/geom/Circle.js';
import { Style, Stroke, Fill, Text, Icon } from 'ol/style.js';
import { fromLonLat, toLonLat } from 'ol/proj.js';
import { Vehicle, VehicleTripHistory, HistoricalPoint, EmergencyIncident } from '@fleet/types';
import { VehicleBreadcrumb } from '../hooks/useFleetTelemetry';

interface FleetMapProps {
  vehicles: Record<string, Vehicle>;
  selectedVehicleId: string | null;
  breadcrumbs: Record<string, VehicleBreadcrumb[]>;
  followMode: boolean;
  onSelectVehicle: (id: string | null) => void;
  tripHistory?: VehicleTripHistory | null;
  playbackPoint?: HistoricalPoint | null;
  activeIncident?: EmergencyIncident | null;
  onMapClickCoordinates?: (lat: number, lng: number) => void;
}

// Genera un icono SVG rotativo para el vehículo según su tipo y color de servicio
function createVehicleSvgIcon(color: string, type: string, isResponding = false): string {
  let emblemSvg = '<circle cx="22" cy="22" r="3" fill="#ffffff"/>';

  if (type === 'police') {
    emblemSvg = `
      <!-- Sirenas policiales azul/rojo -->
      <rect x="16" y="20" width="5" height="4" rx="1.5" fill="#3b82f6"/>
      <rect x="23" y="20" width="5" height="4" rx="1.5" fill="#ef4444"/>
      <circle cx="22" cy="22" r="1.5" fill="#ffffff"/>
    `;
  } else if (type === 'fire_truck') {
    emblemSvg = `
      <!-- Sirena de bomberos roja/ámbar y escalera -->
      <rect x="15" y="19" width="6" height="4" rx="1" fill="#ef4444"/>
      <rect x="23" y="19" width="6" height="4" rx="1" fill="#f59e0b"/>
      <line x1="22" y1="16" x2="22" y2="28" stroke="#ffffff" stroke-width="2"/>
    `;
  } else if (type === 'ambulance') {
    emblemSvg = `
      <!-- Cruz médica Star of Life -->
      <rect x="20" y="18" width="4" height="8" rx="1" fill="#ffffff"/>
      <rect x="18" y="20" width="8" height="4" rx="1" fill="#ffffff"/>
      <rect x="15" y="17" width="4" height="3" rx="1" fill="#3b82f6"/>
      <rect x="25" y="17" width="4" height="3" rx="1" fill="#f59e0b"/>
    `;
  }

  const strokeWidth = isResponding ? '3.5' : '2.5';
  const strokeColor = isResponding ? '#ffffff' : color;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="46" height="46" viewBox="0 0 44 44">
    <defs>
      <filter id="glow" x="-25%" y="-25%" width="150%" height="150%">
        <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#000" flood-opacity="0.7"/>
      </filter>
    </defs>
    <!-- Halo exterior -->
    <circle cx="22" cy="22" r="18" fill="#0f172a" stroke="${strokeColor}" stroke-width="${strokeWidth}" filter="url(#glow)"/>
    <!-- Flecha de rumbo (0° arriba) -->
    <path d="M 22 9 L 30 26 L 22 22 L 14 26 Z" fill="${color}"/>
    ${emblemSvg}
  </svg>`;

  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

// Icono SVG para el epicentro del incidente de emergencia
function createIncidentSvgIcon(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56">
    <circle cx="28" cy="28" r="26" fill="rgba(239, 68, 68, 0.25)" stroke="#ef4444" stroke-width="2" stroke-dasharray="4 2"/>
    <circle cx="28" cy="28" r="18" fill="#dc2626" stroke="#ffffff" stroke-width="3"/>
    <!-- Icono de fuego / alerta -->
    <path d="M 28 17 C 28 17 33 22 33 27 C 33 30 30.5 33 28 33 C 25.5 33 23 30 23 27 C 23 23 26 20 28 17 Z" fill="#fef08a"/>
    <circle cx="28" cy="29" r="2.5" fill="#ffffff"/>
  </svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

// Caché global de iconos para evitar re-decodificar SVG en cada frame
const svgCache: Record<string, string> = {};
function getSvgDataUrl(color: string, type: string, isResponding = false): string {
  const key = `${color}_${type}_${isResponding}`;
  if (!svgCache[key]) {
    svgCache[key] = createVehicleSvgIcon(color, type, isResponding);
  }
  return svgCache[key];
}

// Obtiene el emoji y nombre del tipo de vehículo
function getVehicleTypeLabel(type?: string): string {
  switch (type) {
    case 'police':
      return '🚓 Policía';
    case 'ambulance':
      return '🚑 Ambulancia';
    case 'fire_truck':
    case 'fire':
      return '🚒 Bomberos';
    case 'truck':
      return '🚚 Camión';
    case 'van':
      return '🚐 Furgoneta';
    case 'motorcycle':
      return '🛵 Moto';
    case 'car':
      return '🚗 Coche';
    default:
      return '🚗 Vehículo';
  }
}

// Configuración de puestos tácticos asignados alrededor del incidente (Madrid 112)
const TACTICAL_OFFSETS: Record<string, { dLat: number; dLng: number; heading: number; label: string; roleColor: string }> = {
  police: { dLat: 0.00018, dLng: -0.00022, heading: 45, label: '🚓 CORTE POLICIAL', roleColor: '#3b82f6' },
  fire: { dLat: -0.00012, dLng: -0.00014, heading: 90, label: '🚒 EMPLAZAMIENTO BOMBEROS', roleColor: '#ef4444' },
  ambulance: { dLat: -0.00020, dLng: 0.00018, heading: 135, label: '🚑 ZONA TRIAJE SAMUR', roleColor: '#10b981' }
};

export function FleetMap({
  vehicles,
  selectedVehicleId,
  breadcrumbs,
  followMode,
  onSelectVehicle,
  tripHistory,
  playbackPoint,
  activeIncident,
  onMapClickCoordinates
}: FleetMapProps) {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const vectorSourceRef = useRef<VectorSource>(new VectorSource());
  const trailSourceRef = useRef<VectorSource>(new VectorSource());
  const playbackSourceRef = useRef<VectorSource>(new VectorSource());
  const emergencySourceRef = useRef<VectorSource>(new VectorSource());
  const playbackMarkerFeatureRef = useRef<Feature<Point> | null>(null);
  const lastIncidentIdRef = useRef<string | null>(null);

  // Estado para el tooltip interactivo al pasar el cursor sobre los iconos
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  // Refs actualizadas para lectura en tiempo real dentro del listener de pointermove
  const vehiclesRef = useRef(vehicles);
  vehiclesRef.current = vehicles;

  const activeIncidentRef = useRef(activeIncident);
  activeIncidentRef.current = activeIncident;

  const tripHistoryRef = useRef(tripHistory);
  tripHistoryRef.current = tripHistory;

  const playbackPointRef = useRef(playbackPoint);
  playbackPointRef.current = playbackPoint;

  const vehicleLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const trailLayerRef = useRef<VectorLayer<VectorSource> | null>(null);

  // Almacena las posiciones animadas actuales (en EPSG:3857) para LERP suave
  const animatedPositionsRef = useRef<Record<string, { current: [number, number]; target: [number, number]; heading: number }>>({});
  const featuresMapRef = useRef<Record<string, Feature<Point>>>({});
  const animationFrameIdRef = useRef<number | null>(null);

  const osmDarkLayerRef = useRef<TileLayer<OSM> | null>(null);
  const osmStandardLayerRef = useRef<TileLayer<OSM> | null>(null);
  const satelliteLayerRef = useRef<TileLayer<XYZ> | null>(null);
  const [activeBasemap, setActiveBasemap] = useState<'dark' | 'standard' | 'satellite'>('dark');

  const onSelectVehicleRef = useRef(onSelectVehicle);
  onSelectVehicleRef.current = onSelectVehicle;

  const followModeRef = useRef(followMode);
  followModeRef.current = followMode;

  const selectedVehicleIdRef = useRef(selectedVehicleId);
  selectedVehicleIdRef.current = selectedVehicleId;

  const onMapClickCoordinatesRef = useRef(onMapClickCoordinates);
  onMapClickCoordinatesRef.current = onMapClickCoordinates;

  // Inicialización ÚNICA del mapa OpenLayers
  useEffect(() => {
    if (!mapElementRef.current) return;

    // 1. Capa OSM Oscuro (OSM libre con filtro nocturno - 0 API Key)
    const osmDarkLayer = new TileLayer({
      className: 'ol-tile-dark',
      source: new OSM(),
      visible: true
    });
    osmDarkLayerRef.current = osmDarkLayer;

    // 2. Capa OSM Estándar (100% libre - 0 API Key)
    const osmStandardLayer = new TileLayer({
      source: new OSM(),
      visible: false
    });
    osmStandardLayerRef.current = osmStandardLayer;

    // 3. Capa Satélite Esri World Imagery (acceso público abierto - 0 API Key)
    const satelliteLayer = new TileLayer({
      source: new XYZ({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attributions: 'Tiles © Esri, Maxar, Earthstar',
        maxZoom: 22
      }),
      visible: false
    });
    satelliteLayerRef.current = satelliteLayer;

    // Capa para las trazas de ruta (breadcrumbs)
    const trailLayer = new VectorLayer({
      source: trailSourceRef.current,
      style: new Style({
        stroke: new Stroke({
          color: 'rgba(56, 189, 248, 0.75)',
          width: 3.5,
          lineDash: [6, 4]
        })
      })
    });
    trailLayerRef.current = trailLayer;

    // Capa vectorial para el incidente de emergencia y líneas de despacho 112
    const emergencyLayer = new VectorLayer({
      source: emergencySourceRef.current,
      zIndex: 15
    });

    // Capa vectorial de vehículos en tiempo real
    const vehicleLayer = new VectorLayer({
      source: vectorSourceRef.current,
      zIndex: 20
    });
    vehicleLayerRef.current = vehicleLayer;

    // Capa vectorial para reproducción de histórico (Time-Machine)
    const playbackLayer = new VectorLayer({
      source: playbackSourceRef.current,
      zIndex: 25
    });

    // Centro inicial: Madrid [lng, lat]
    const initialCenter = fromLonLat([-3.6917, 40.4200]);

    const map = new Map({
      target: mapElementRef.current,
      layers: [osmDarkLayer, osmStandardLayer, satelliteLayer, trailLayer, emergencyLayer, vehicleLayer, playbackLayer],
      view: new View({
        center: initialCenter,
        zoom: 13,
        minZoom: 3,
        maxZoom: 22
      })
    });

    // Evento de clic en mapa: selección de vehículo o coordenadas para nuevo incidente
    map.on('click', (event) => {
      let clickedVehicleId: string | null = null;
      map.forEachFeatureAtPixel(event.pixel, (feature) => {
        const id = feature.get('vehicleId');
        if (id) {
          clickedVehicleId = id;
          return true;
        }
      });

      if (clickedVehicleId) {
        onSelectVehicleRef.current(clickedVehicleId);
      } else {
        onSelectVehicleRef.current(null);
        const lonLat = toLonLat(event.coordinate);
        onMapClickCoordinatesRef.current?.(lonLat[1], lonLat[0]);
      }
    });

    // Evento de hover (pointermove) sobre iconos del mapa para mostrar Tooltip: solo Tipo de Vehículo y Velocidad
    map.on('pointermove', (event) => {
      if (event.dragging) {
        setTooltip(null);
        return;
      }

      let detectedText: string | null = null;

      map.forEachFeatureAtPixel(
        event.pixel,
        (feature) => {
          const vehicleId = feature.get('vehicleId');
          if (vehicleId) {
            const v = vehiclesRef.current[vehicleId];
            if (v) {
              detectedText = `${getVehicleTypeLabel(v.type)} • ${v.lastTelemetry.speed} km/h`;
              return true;
            }
          }

          if (feature.get('isIncident')) {
            const inc = activeIncidentRef.current;
            detectedText = inc ? `💥 Incidente • ${inc.title}` : '💥 Incidente de Emergencia';
            return true;
          }

          const stagingRole = feature.get('stagingRole');
          if (stagingRole) {
            detectedText = `📍 Puesto • ${getVehicleTypeLabel(stagingRole)}`;
            return true;
          }

          if (feature.get('isStopPoint')) {
            const stopReason = feature.get('stopReason');
            detectedText = `🛑 Parada • 0 km/h${stopReason ? ` (${stopReason})` : ''}`;
            return true;
          }

          if (feature.get('isStartPoint')) {
            detectedText = '🏁 Salida del Viaje';
            return true;
          }

          if (feature.get('isEndPoint')) {
            detectedText = '🎯 Llegada del Viaje';
            return true;
          }

          if (feature.get('isPlaybackMarker')) {
            const pt = playbackPointRef.current;
            const history = tripHistoryRef.current;
            const type = history?.vehicleName.toLowerCase().includes('moto')
              ? 'motorcycle'
              : history?.vehicleName.toLowerCase().includes('sprinter')
              ? 'van'
              : 'truck';
            detectedText = `${getVehicleTypeLabel(type)} • ${pt?.speed ?? 0} km/h`;
            return true;
          }
        },
        { hitTolerance: 10 }
      );

      const targetEl = map.getTargetElement();
      if (detectedText) {
        if (targetEl) targetEl.style.cursor = 'pointer';
        setTooltip({
          x: event.pixel[0],
          y: event.pixel[1],
          text: detectedText
        });
      } else {
        if (targetEl) targetEl.style.cursor = '';
        setTooltip(null);
      }
    });

    const targetEl = mapElementRef.current;
    const handleMouseLeave = () => setTooltip(null);
    if (targetEl) {
      targetEl.addEventListener('mouseleave', handleMouseLeave);
    }

    mapRef.current = map;

    return () => {
      if (targetEl) {
        targetEl.removeEventListener('mouseleave', handleMouseLeave);
      }
      map.setTarget(undefined);
    };
  }, []);

  // Ocultar flota en tiempo real cuando el modo histórico esté activo
  useEffect(() => {
    const isHistoryActive = !!tripHistory;
    if (vehicleLayerRef.current) {
      vehicleLayerRef.current.setVisible(!isHistoryActive);
    }
    if (trailLayerRef.current) {
      trailLayerRef.current.setVisible(!isHistoryActive);
    }
  }, [tripHistory]);

  // Actualizar estilo del vehículo en tiempo real (solo icono rotativo sin etiquetas de texto; se muestran en tooltip)
  const updateFeatureStyle = (feature: Feature<Point>, vehicle: Vehicle, isSelected: boolean, headingDeg: number) => {
    const headingRad = (headingDeg * Math.PI) / 180;
    const isResponding = vehicle.status === 'responding';
    const isOnScene = vehicle.status === 'on_scene';
    const isStopped = !!vehicle.currentStop;

    const iconColor = isSelected ? '#38bdf8' : isOnScene ? '#ef4444' : isStopped ? '#f59e0b' : vehicle.color;
    const existingStyle = feature.getStyle() as Style | undefined;

    if (existingStyle && existingStyle.getImage()) {
      existingStyle.getImage()?.setRotation(headingRad);
      feature.changed();
    } else {
      feature.setStyle(
        new Style({
          image: new Icon({
            src: getSvgDataUrl(iconColor, vehicle.type, isResponding),
            rotation: headingRad,
            rotateWithView: true,
            scale: isResponding || isOnScene || isSelected ? 1.25 : 0.95
          })
        })
      );
    }
  };

  // Actualización de coordenadas objetivo cuando llega telemetría
  useEffect(() => {
    if (tripHistory) return;
    const vectorSource = vectorSourceRef.current;

    Object.values(vehicles).forEach((vehicle) => {
      const targetCoords = fromLonLat([vehicle.lastTelemetry.longitude, vehicle.lastTelemetry.latitude]) as [number, number];
      const existing = animatedPositionsRef.current[vehicle.id];
      const isSelected = selectedVehicleId === vehicle.id;

      if (!existing) {
        animatedPositionsRef.current[vehicle.id] = {
          current: [...targetCoords],
          target: [...targetCoords],
          heading: vehicle.lastTelemetry.heading
        };

        const feature = new Feature({
          geometry: new Point(targetCoords),
          vehicleId: vehicle.id
        });

        updateFeatureStyle(feature, vehicle, isSelected, vehicle.lastTelemetry.heading);
        featuresMapRef.current[vehicle.id] = feature;
        vectorSource.addFeature(feature);
      } else {
        existing.target = targetCoords;
        existing.heading = vehicle.lastTelemetry.heading;

        const feature = featuresMapRef.current[vehicle.id];
        if (feature) {
          updateFeatureStyle(feature, vehicle, isSelected, vehicle.lastTelemetry.heading);
        }
      }
    });

    const currentIds = new Set(Object.keys(vehicles));
    Object.keys(featuresMapRef.current).forEach((id) => {
      if (!currentIds.has(id)) {
        const feat = featuresMapRef.current[id];
        if (feat) vectorSource.removeFeature(feat);
        delete featuresMapRef.current[id];
        delete animatedPositionsRef.current[id];
      }
    });
  }, [vehicles, selectedVehicleId, tripHistory, activeIncident]);

  // Bucle de animación continua con LERP
  useEffect(() => {
    const LERP_FACTOR = 0.08;

    const animate = () => {
      if (!tripHistory) {
        let followedCoords: [number, number] | null = null;

        Object.keys(animatedPositionsRef.current).forEach((id) => {
          const pos = animatedPositionsRef.current[id];
          const feature = featuresMapRef.current[id];
          if (!feature) return;

          const dx = pos.target[0] - pos.current[0];
          const dy = pos.target[1] - pos.current[1];

          if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) {
            pos.current[0] += dx * LERP_FACTOR;
            pos.current[1] += dy * LERP_FACTOR;

            const geom = feature.getGeometry();
            if (geom) {
              geom.setCoordinates(pos.current);
            }
          }

          if (followModeRef.current && selectedVehicleIdRef.current === id) {
            followedCoords = pos.current;
          }
        });

        if (followedCoords && mapRef.current) {
          mapRef.current.getView().setCenter(followedCoords);
        }
      }

      animationFrameIdRef.current = requestAnimationFrame(animate);
    };

    animationFrameIdRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
  }, [tripHistory]);

  // Actualizar la polilínea del rastro del vehículo seleccionado
  useEffect(() => {
    const trailSource = trailSourceRef.current;
    trailSource.clear();

    if (!selectedVehicleId || tripHistory) return;

    const trail = breadcrumbs[selectedVehicleId];
    if (trail && trail.length > 1) {
      const lineCoords = trail.map((pt) => fromLonLat([pt.lng, pt.lat]));
      const lineFeature = new Feature({
        geometry: new LineString(lineCoords)
      });
      trailSource.addFeature(lineFeature);
    }
  }, [selectedVehicleId, breadcrumbs, tripHistory]);

  // Renderizado del incidente de emergencia 112, perímetro de exclusión y despliegue táctico
  useEffect(() => {
    const emergencySource = emergencySourceRef.current;
    emergencySource.clear();

    if (!activeIncident || tripHistory) {
      lastIncidentIdRef.current = null;
      return;
    }

    const incidentCenterCoords = fromLonLat([activeIncident.longitude, activeIncident.latitude]);

    // 1. Perímetro de Seguridad Exterior 112 (50 metros)
    const outerPerimeterGeom = new Circle(incidentCenterCoords, 50);
    const outerPerimeterFeature = new Feature({
      geometry: outerPerimeterGeom,
      name: 'perimetro_seguridad_exterior'
    });
    outerPerimeterFeature.setStyle(
      new Style({
        stroke: new Stroke({
          color: 'rgba(239, 68, 68, 0.95)',
          width: 2.5,
          lineDash: [8, 6]
        }),
        fill: new Fill({
          color: 'rgba(239, 68, 68, 0.12)'
        })
      })
    );

    // 2. Zona Cero / Foco de Impacto (20 metros)
    const hotZoneGeom = new Circle(incidentCenterCoords, 20);
    const hotZoneFeature = new Feature({
      geometry: hotZoneGeom,
      name: 'zona_cero_impacto'
    });
    hotZoneFeature.setStyle(
      new Style({
        stroke: new Stroke({
          color: 'rgba(245, 158, 11, 0.85)',
          width: 2,
          lineDash: [5, 4]
        }),
        fill: new Fill({
          color: 'rgba(239, 68, 68, 0.22)'
        })
      })
    );

    // 3. Epicentro del Incidente (Icono limpio sin texto estático invasivo; detalles en Tooltip)
    const incidentMarkerFeature = new Feature({
      geometry: new Point(incidentCenterCoords),
      isIncident: true,
      incidentId: activeIncident.id
    });
    incidentMarkerFeature.setStyle(
      new Style({
        image: new Icon({
          src: createIncidentSvgIcon(),
          scale: 1.15
        })
      })
    );

    const featuresToAdd: Feature[] = [outerPerimeterFeature, hotZoneFeature, incidentMarkerFeature];

    // 4. Puestos tácticos asignados alrededor del incidente (Policía, Bomberos, SAMUR)
    const emergencyRoles: Array<'police' | 'fire' | 'ambulance'> = ['police', 'fire', 'ambulance'];
    emergencyRoles.forEach((role) => {
      const offset = TACTICAL_OFFSETS[role];
      if (!offset) return;

      const tacticalCoords = fromLonLat([
        activeIncident.longitude + offset.dLng,
        activeIncident.latitude + offset.dLat
      ]);

      const stagingFeature = new Feature({
        geometry: new Point(tacticalCoords),
        stagingRole: role,
        stagingLabel: offset.label
      });
      stagingFeature.setStyle(
        new Style({
          image: new Icon({
            src: getSvgDataUrl(offset.roleColor, role),
            scale: 0.7
          })
        })
      );
      featuresToAdd.push(stagingFeature);
    });

    // 5. Líneas tácticas dinámicas y despliegue sobre el terreno (sin textos fijos)
    Object.values(vehicles).forEach((vehicle) => {
      let role: 'police' | 'fire' | 'ambulance' | null = null;
      if (vehicle.type === 'police') role = 'police';
      else if (vehicle.type === 'ambulance') role = 'ambulance';
      else if (vehicle.type === 'fire_truck') role = 'fire';

      if (!role) return;
      const offset = TACTICAL_OFFSETS[role];
      if (!offset) return;

      const vehicleCoords = fromLonLat([vehicle.lastTelemetry.longitude, vehicle.lastTelemetry.latitude]);
      const tacticalCoords = fromLonLat([
        activeIncident.longitude + offset.dLng,
        activeIncident.latitude + offset.dLat
      ]);

      if (vehicle.status === 'responding') {
        // En camino: vector de respuesta
        const lineFeature = new Feature({
          geometry: new LineString([vehicleCoords, tacticalCoords])
        });
        lineFeature.setStyle(
          new Style({
            stroke: new Stroke({
              color: offset.roleColor,
              width: 2.5,
              lineDash: [6, 4]
            })
          })
        );
        featuresToAdd.push(lineFeature);
      } else if (vehicle.status === 'on_scene') {
        // En el lugar: despliegue de material operativo
        if (role === 'police') {
          // Cordón policial de seguridad cortando la calzada
          const barrierP1 = fromLonLat([
            activeIncident.longitude + offset.dLng - 0.00018,
            activeIncident.latitude + offset.dLat - 0.00012
          ]);
          const barrierP2 = fromLonLat([
            activeIncident.longitude + offset.dLng + 0.00018,
            activeIncident.latitude + offset.dLat + 0.00012
          ]);
          const barrierFeature = new Feature({
            geometry: new LineString([barrierP1, barrierP2])
          });
          barrierFeature.setStyle(
            new Style({
              stroke: new Stroke({
                color: '#3b82f6',
                width: 4.5,
                lineDash: [8, 4]
              })
            })
          );
          featuresToAdd.push(barrierFeature);
        } else if (role === 'fire') {
          // Tendido de manguera de alta presión desde la bomba al fuego
          const hoseFeature = new Feature({
            geometry: new LineString([vehicleCoords, incidentCenterCoords])
          });
          hoseFeature.setStyle(
            new Style({
              stroke: new Stroke({
                color: '#f59e0b',
                width: 3.5
              })
            })
          );
          featuresToAdd.push(hoseFeature);
        } else if (role === 'ambulance') {
          // Corredor sanitario de evacuación hacia el SVA
          const corridorFeature = new Feature({
            geometry: new LineString([vehicleCoords, incidentCenterCoords])
          });
          corridorFeature.setStyle(
            new Style({
              stroke: new Stroke({
                color: '#10b981',
                width: 3,
                lineDash: [6, 4]
              })
            })
          );
          featuresToAdd.push(corridorFeature);
        }
      }
    });

    emergencySource.addFeatures(featuresToAdd);

    // Centrado suave de cámara cuando entra un nuevo incidente
    if (lastIncidentIdRef.current !== activeIncident.id) {
      lastIncidentIdRef.current = activeIncident.id;
      if (mapRef.current) {
        mapRef.current.getView().animate({
          center: incidentCenterCoords,
          zoom: 16.5,
          duration: 900
        });
      }
    }
  }, [activeIncident, vehicles, tripHistory]);

  // Efecto cuando se activa tripHistory: dibuja polilínea, inicio, fin y paradas de forma atómica
  useEffect(() => {
    const source = playbackSourceRef.current;
    source.clear();
    playbackMarkerFeatureRef.current = null;

    if (!tripHistory || tripHistory.points.length === 0) return;

    const coords = tripHistory.points.map((pt) => fromLonLat([pt.longitude, pt.latitude]));

    const routeLine = new Feature({
      geometry: new LineString(coords)
    });
    routeLine.setStyle(
      new Style({
        stroke: new Stroke({
          color: 'rgba(2, 132, 199, 0.9)',
          width: 5
        })
      })
    );

    const routeLineInner = new Feature({
      geometry: new LineString(coords)
    });
    routeLineInner.setStyle(
      new Style({
        stroke: new Stroke({
          color: '#38bdf8',
          width: 2.5
        })
      })
    );

    const startPoint = tripHistory.points[0];
    const startFeature = new Feature({
      geometry: new Point(fromLonLat([startPoint.longitude, startPoint.latitude])),
      isStartPoint: true
    });
    startFeature.setStyle(
      new Style({
        text: new Text({
          text: '🏁',
          font: '16px sans-serif',
          offsetY: -4
        })
      })
    );

    const endPoint = tripHistory.points[tripHistory.points.length - 1];
    const endFeature = new Feature({
      geometry: new Point(fromLonLat([endPoint.longitude, endPoint.latitude])),
      isEndPoint: true
    });
    endFeature.setStyle(
      new Style({
        text: new Text({
          text: '🎯',
          font: '16px sans-serif',
          offsetY: -4
        })
      })
    );

    const stopFeatures: Feature<Point>[] = [];
    tripHistory.points.forEach((pt) => {
      if (pt.stopReason) {
        const stopFeat = new Feature({
          geometry: new Point(fromLonLat([pt.longitude, pt.latitude])),
          isStopPoint: true,
          stopReason: pt.stopReason
        });
        stopFeat.setStyle(
          new Style({
            text: new Text({
              text: '🛑',
              font: '14px sans-serif',
              offsetY: -4
            })
          })
        );
        stopFeatures.push(stopFeat);
      }
    });

    const markerFeature = new Feature({
      geometry: new Point(fromLonLat([startPoint.longitude, startPoint.latitude])),
      isPlaybackMarker: true
    });
    markerFeature.setStyle(
      new Style({
        image: new Icon({
          src: getSvgDataUrl('#38bdf8', 'truck'),
          rotation: (startPoint.heading * Math.PI) / 180,
          rotateWithView: true,
          scale: 1.2
        })
      })
    );
    playbackMarkerFeatureRef.current = markerFeature;

    source.addFeatures([routeLine, routeLineInner, startFeature, endFeature, ...stopFeatures, markerFeature]);

    const extent = routeLine.getGeometry()?.getExtent();
    if (extent && mapRef.current) {
      mapRef.current.getView().fit(extent, {
        padding: [80, 80, 180, 80],
        duration: 500
      });
    }
  }, [tripHistory]);

  // Efecto cuando avanza el punto de reproducción (Time-Machine)
  useEffect(() => {
    if (!playbackPoint || !playbackMarkerFeatureRef.current) return;

    const coords = fromLonLat([playbackPoint.longitude, playbackPoint.latitude]);
    const geom = playbackMarkerFeatureRef.current.getGeometry();
    if (geom) {
      geom.setCoordinates(coords);
    }

    const headingRad = (playbackPoint.heading * Math.PI) / 180;
    const style = playbackMarkerFeatureRef.current.getStyle() as Style | undefined;

    if (style && style.getImage()) {
      style.getImage()?.setRotation(headingRad);
      playbackMarkerFeatureRef.current.changed();
    }
  }, [playbackPoint]);

  const handleBasemapChange = (type: 'dark' | 'standard' | 'satellite') => {
    setActiveBasemap(type);
    if (osmDarkLayerRef.current) osmDarkLayerRef.current.setVisible(type === 'dark');
    if (osmStandardLayerRef.current) osmStandardLayerRef.current.setVisible(type === 'standard');
    if (satelliteLayerRef.current) satelliteLayerRef.current.setVisible(type === 'satellite');
  };

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div ref={mapElementRef} className="w-full h-full" />

      {/* Tooltip interactivo flotante (Solo Tipo de Vehículo y Velocidad) */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-50 transition-all duration-75 ease-out select-none"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, calc(-100% - 14px))'
          }}
        >
          <div className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/95 backdrop-blur-md border border-slate-700/80 shadow-2xl shadow-black/90 text-xs font-semibold text-slate-100 whitespace-nowrap animate-in fade-in zoom-in-95 duration-100">
            <span>{tooltip.text}</span>
            {/* Flecha inferior del tooltip */}
            <div className="absolute left-1/2 -bottom-1 -translate-x-1/2 w-2 h-2 bg-slate-900 border-r border-b border-slate-700 rotate-45" />
          </div>
        </div>
      )}

      {/* Selector de Capas Base (100% Libres sin API Key) */}
      <div className="absolute bottom-4 left-4 glass-panel rounded-xl p-1 flex items-center gap-1 z-10 border border-slate-700/80 shadow-lg text-xs">
        <button
          onClick={() => handleBasemapChange('dark')}
          className={`px-2.5 py-1 rounded-lg font-medium transition ${
            activeBasemap === 'dark'
              ? 'bg-blue-600 text-white shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          🌙 Noche (OSM)
        </button>
        <button
          onClick={() => handleBasemapChange('standard')}
          className={`px-2.5 py-1 rounded-lg font-medium transition ${
            activeBasemap === 'standard'
              ? 'bg-blue-600 text-white shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          🗺️ Calles
        </button>
        <button
          onClick={() => handleBasemapChange('satellite')}
          className={`px-2.5 py-1 rounded-lg font-medium transition ${
            activeBasemap === 'satellite'
              ? 'bg-blue-600 text-white shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          🛰️ Satélite
        </button>
      </div>
    </div>
  );
}
