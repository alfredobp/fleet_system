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

    mapRef.current = map;

    return () => {
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

  // Visualización del Incidente y Líneas de Aproximación 112
  useEffect(() => {
    const source = emergencySourceRef.current;
    source.clear();

    if (!activeIncident) return;

    const incCoords = fromLonLat([activeIncident.longitude, activeIncident.latitude]);

    // 1. Marcador del Incidente con Baliza de Emergencia
    const incidentFeature = new Feature({
      geometry: new Point(incCoords)
    });

    incidentFeature.setStyle(
      new Style({
        image: new Icon({
          src: createIncidentSvgIcon(),
          scale: 1.15
        }),
        text: new Text({
          text: `🚨 ${activeIncident.title.toUpperCase()}\n📍 ${activeIncident.address}`,
          font: 'bold 11px sans-serif',
          offsetY: -36,
          fill: new Fill({ color: '#ffffff' }),
          backgroundFill: new Fill({ color: 'rgba(185, 28, 28, 0.95)' }),
          backgroundStroke: new Stroke({ color: '#fca5a5', width: 1.5 }),
          padding: [4, 8, 4, 8]
        })
      })
    );

    const featuresToAdd: Feature[] = [incidentFeature];

    // 2. Líneas de despacho desde cada vehículo que acude hacia el incidente
    activeIncident.units.forEach((unit) => {
      const v = vehicles[unit.vehicleId];
      if (!v) return;

      const vCoords = fromLonLat([v.lastTelemetry.longitude, v.lastTelemetry.latitude]);
      const approachLine = new Feature({
        geometry: new LineString([vCoords, incCoords])
      });

      const strokeColor =
        unit.role === 'police'
          ? 'rgba(59, 130, 246, 0.85)'
          : unit.role === 'ambulance'
          ? 'rgba(245, 158, 11, 0.85)'
          : 'rgba(239, 68, 68, 0.85)';

      approachLine.setStyle(
        new Style({
          stroke: new Stroke({
            color: strokeColor,
            width: unit.status === 'arrived' ? 1.5 : 3.5,
            lineDash: unit.status === 'arrived' ? [3, 3] : [8, 4]
          })
        })
      );

      featuresToAdd.push(approachLine);
    });

    source.addFeatures(featuresToAdd);
  }, [activeIncident, vehicles]);

  // Actualizar estilo del vehículo en tiempo real (refleja emergencias, ETA, paradas y rumbo)
  const updateFeatureStyle = (feature: Feature<Point>, vehicle: Vehicle, isSelected: boolean, headingDeg: number) => {
    const headingRad = (headingDeg * Math.PI) / 180;
    const isResponding = vehicle.status === 'responding';
    const isOnScene = vehicle.status === 'on_scene';
    const isStopped = !!vehicle.currentStop;

    let labelText = `${vehicle.name.split(' ')[0]} • ${vehicle.lastTelemetry.speed} km/h`;
    let bgFillColor = 'rgba(15, 23, 42, 0.85)';
    let strokeColor = 'rgba(255, 255, 255, 0.15)';

    if (isResponding && vehicle.emergencyMission) {
      const eta = vehicle.emergencyMission.etaSeconds;
      const etaStr = eta >= 60 ? `${Math.floor(eta / 60)}m ${eta % 60}s` : `${eta}s`;
      const roleIcon = vehicle.type === 'police' ? '🚓' : vehicle.type === 'ambulance' ? '🚑' : '🚒';
      labelText = `${roleIcon} ETA: ${etaStr} • ${vehicle.lastTelemetry.speed} km/h`;
      bgFillColor = vehicle.type === 'police'
        ? 'rgba(29, 78, 216, 0.95)'
        : vehicle.type === 'ambulance'
        ? 'rgba(217, 119, 6, 0.95)'
        : 'rgba(185, 28, 28, 0.95)';
      strokeColor = '#ffffff';
    } else if (isOnScene) {
      labelText = `🚨 EN EL LUGAR (${vehicle.plate})`;
      bgFillColor = 'rgba(185, 28, 28, 0.95)';
      strokeColor = '#facc15';
    } else if (isStopped) {
      labelText = `${vehicle.name.split(' ')[0]} • 🛑 ${vehicle.currentStop!.remainingSeconds}s`;
      bgFillColor = 'rgba(180, 83, 9, 0.95)';
      strokeColor = '#fbbf24';
    } else if (isSelected) {
      bgFillColor = 'rgba(2, 132, 199, 0.95)';
      strokeColor = '#38bdf8';
    }

    const iconColor = isSelected ? '#38bdf8' : isOnScene ? '#ef4444' : isStopped ? '#f59e0b' : vehicle.color;
    const existingStyle = feature.getStyle() as Style | undefined;

    if (existingStyle && existingStyle.getImage()) {
      existingStyle.getImage()?.setRotation(headingRad);
      const text = existingStyle.getText();
      if (text) {
        text.setText(labelText);
      }
      feature.changed();
    } else {
      feature.setStyle(
        new Style({
          image: new Icon({
            src: getSvgDataUrl(iconColor, vehicle.type, isResponding),
            rotation: headingRad,
            rotateWithView: true,
            scale: isResponding || isOnScene || isSelected ? 1.25 : 0.95
          }),
          text: new Text({
            text: labelText,
            font: isResponding || isOnScene || isSelected ? 'bold 11px sans-serif' : '10px sans-serif',
            offsetY: 28,
            fill: new Fill({ color: '#ffffff' }),
            backgroundFill: new Fill({ color: bgFillColor }),
            backgroundStroke: new Stroke({ color: strokeColor, width: 1.5 }),
            padding: [2, 6, 2, 6]
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
      geometry: new Point(fromLonLat([startPoint.longitude, startPoint.latitude]))
    });
    startFeature.setStyle(
      new Style({
        text: new Text({
          text: '🏁 SALIDA',
          font: 'bold 11px sans-serif',
          offsetY: -16,
          fill: new Fill({ color: '#ffffff' }),
          backgroundFill: new Fill({ color: '#16a34a' }),
          padding: [2, 6, 2, 6]
        })
      })
    );

    const endPoint = tripHistory.points[tripHistory.points.length - 1];
    const endFeature = new Feature({
      geometry: new Point(fromLonLat([endPoint.longitude, endPoint.latitude]))
    });
    endFeature.setStyle(
      new Style({
        text: new Text({
          text: '🎯 LLEGADA',
          font: 'bold 11px sans-serif',
          offsetY: -16,
          fill: new Fill({ color: '#ffffff' }),
          backgroundFill: new Fill({ color: '#dc2626' }),
          padding: [2, 6, 2, 6]
        })
      })
    );

    const stopFeatures: Feature<Point>[] = [];
    tripHistory.points.forEach((pt) => {
      if (pt.stopReason) {
        const stopFeat = new Feature({
          geometry: new Point(fromLonLat([pt.longitude, pt.latitude]))
        });
        stopFeat.setStyle(
          new Style({
            text: new Text({
              text: `🛑 ${pt.stopReason}`,
              font: 'bold 10px sans-serif',
              offsetY: -16,
              fill: new Fill({ color: '#ffffff' }),
              backgroundFill: new Fill({ color: '#d97706' }),
              padding: [2, 6, 2, 6]
            })
          })
        );
        stopFeatures.push(stopFeat);
      }
    });

    const markerFeature = new Feature({
      geometry: new Point(fromLonLat([startPoint.longitude, startPoint.latitude]))
    });
    markerFeature.setStyle(
      new Style({
        image: new Icon({
          src: getSvgDataUrl('#38bdf8', 'truck'),
          rotation: (startPoint.heading * Math.PI) / 180,
          rotateWithView: true,
          scale: 1.2
        }),
        text: new Text({
          text: `${startPoint.speed} km/h`,
          font: 'bold 11px sans-serif',
          offsetY: 28,
          fill: new Fill({ color: '#ffffff' }),
          backgroundFill: new Fill({ color: 'rgba(2, 132, 199, 0.95)' }),
          backgroundStroke: new Stroke({ color: '#38bdf8', width: 1 }),
          padding: [2, 6, 2, 6]
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
    const isStopped = !!playbackPoint.stopReason;
    const style = playbackMarkerFeatureRef.current.getStyle() as Style | undefined;

    if (style && style.getImage()) {
      style.getImage()?.setRotation(headingRad);
      const text = style.getText();
      if (text) {
        text.setText(isStopped ? `🛑 ${playbackPoint.stopReason}` : `${playbackPoint.speed} km/h`);
      }
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
