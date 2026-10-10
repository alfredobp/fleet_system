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
import { fromLonLat } from 'ol/proj.js';
import { Vehicle, VehicleTripHistory, HistoricalPoint } from '@fleet/types';
import { VehicleBreadcrumb } from '../hooks/useFleetTelemetry';

interface FleetMapProps {
  vehicles: Record<string, Vehicle>;
  selectedVehicleId: string | null;
  breadcrumbs: Record<string, VehicleBreadcrumb[]>;
  followMode: boolean;
  onSelectVehicle: (id: string | null) => void;
  tripHistory?: VehicleTripHistory | null;
  playbackPoint?: HistoricalPoint | null;
}

// Genera un icono SVG rotativo para el vehículo con su color y flecha de dirección
function createVehicleSvgIcon(color: string, type: string): string {
  // SVG con punta de dirección aerodinámica y punto de anclaje centrado
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
    <defs>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.6"/>
      </filter>
    </defs>
    <!-- Halo exterior -->
    <circle cx="22" cy="22" r="17" fill="#0f172a" stroke="${color}" stroke-width="2.5" filter="url(#glow)"/>
    <!-- Flecha de rumbo (apunta hacia arriba 0°) -->
    <path d="M 22 10 L 29 26 L 22 22 L 15 26 Z" fill="${color}"/>
    <circle cx="22" cy="22" r="3" fill="#ffffff"/>
  </svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export function FleetMap({
  vehicles,
  selectedVehicleId,
  breadcrumbs,
  followMode,
  onSelectVehicle,
  tripHistory,
  playbackPoint
}: FleetMapProps) {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const vectorSourceRef = useRef<VectorSource>(new VectorSource());
  const trailSourceRef = useRef<VectorSource>(new VectorSource());
  const playbackSourceRef = useRef<VectorSource>(new VectorSource());
  const playbackMarkerFeatureRef = useRef<Feature<Point> | null>(null);

  // Almacena las posiciones animadas actuales (en EPSG:3857) para LERP
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

  // Inicialización ÚNICA del mapa OpenLayers (sin recreaciones destructivas)
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

    // Capa vectorial de vehículos
    const vehicleLayer = new VectorLayer({
      source: vectorSourceRef.current,
      zIndex: 10
    });

    // Capa vectorial para reproducción de histórico (Time-Machine)
    const playbackLayer = new VectorLayer({
      source: playbackSourceRef.current,
      zIndex: 25
    });

    // Centro inicial: Madrid [lng, lat]
    const initialCenter = fromLonLat([-3.6917, 40.4200]);

    const map = new Map({
      target: mapElementRef.current,
      layers: [osmDarkLayer, osmStandardLayer, satelliteLayer, trailLayer, vehicleLayer, playbackLayer],
      view: new View({
        center: initialCenter,
        zoom: 13,
        minZoom: 3,
        maxZoom: 22
      })
    });

    // Evento de clic en vehículo utilizando ref estable
    map.on('click', (event) => {
      let clickedVehicleId: string | null = null;
      map.forEachFeatureAtPixel(event.pixel, (feature) => {
        const id = feature.get('vehicleId');
        if (id) {
          clickedVehicleId = id;
          return true;
        }
      });
      onSelectVehicleRef.current(clickedVehicleId);
    });

    mapRef.current = map;

    return () => {
      map.setTarget(undefined);
    };
  }, []); // Dependencia vacía: se inicializa una sola vez

  // Función para construir/actualizar el estilo del vehículo (refleja paradas y rumbo)
  const updateFeatureStyle = (feature: Feature<Point>, vehicle: Vehicle, isSelected: boolean, headingDeg: number) => {
    const headingRad = (headingDeg * Math.PI) / 180;
    const isStopped = !!vehicle.currentStop;
    const labelText = isStopped
      ? `${vehicle.name.split(' ')[0]} • 🛑 ${vehicle.currentStop!.remainingSeconds}s`
      : `${vehicle.name.split(' ')[0]} • ${vehicle.lastTelemetry.speed} km/h`;

    const iconColor = isSelected ? '#38bdf8' : isStopped ? '#f59e0b' : vehicle.color;
    const bgFillColor = isSelected
      ? 'rgba(2, 132, 199, 0.95)'
      : isStopped
      ? 'rgba(180, 83, 9, 0.95)'
      : 'rgba(15, 23, 42, 0.85)';

    feature.setStyle(
      new Style({
        image: new Icon({
          src: createVehicleSvgIcon(iconColor, vehicle.type),
          rotation: headingRad,
          rotateWithView: true,
          scale: isSelected ? 1.15 : 0.95
        }),
        text: new Text({
          text: labelText,
          font: isSelected || isStopped ? 'bold 11px sans-serif' : '10px sans-serif',
          offsetY: 26,
          fill: new Fill({ color: isSelected || isStopped ? '#ffffff' : '#cbd5e1' }),
          backgroundFill: new Fill({ color: bgFillColor }),
          backgroundStroke: new Stroke({
            color: isSelected ? '#38bdf8' : isStopped ? '#fbbf24' : 'rgba(255, 255, 255, 0.15)',
            width: 1
          }),
          padding: [2, 6, 2, 6]
        })
      })
    );
  };

  // Actualización de coordenadas objetivo y estilos cuando llega telemetría
  useEffect(() => {
    const vectorSource = vectorSourceRef.current;

    Object.values(vehicles).forEach((vehicle) => {
      const targetCoords = fromLonLat([vehicle.lastTelemetry.longitude, vehicle.lastTelemetry.latitude]) as [number, number];
      const existing = animatedPositionsRef.current[vehicle.id];
      const isSelected = selectedVehicleId === vehicle.id;

      if (!existing) {
        // Primera vez que se detecta el vehículo
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

    // Limpieza de vehículos eliminados si los hubiera
    const currentIds = new Set(Object.keys(vehicles));
    Object.keys(featuresMapRef.current).forEach((id) => {
      if (!currentIds.has(id)) {
        const feat = featuresMapRef.current[id];
        if (feat) vectorSource.removeFeature(feat);
        delete featuresMapRef.current[id];
        delete animatedPositionsRef.current[id];
      }
    });
  }, [vehicles, selectedVehicleId]);

  // Bucle de animación cinemática fluida (LERP a 60 FPS sin recreación de objetos)
  useEffect(() => {
    const animate = () => {
      const positions = animatedPositionsRef.current;
      const features = featuresMapRef.current;

      Object.keys(positions).forEach((id) => {
        const pos = positions[id];
        const feature = features[id];
        if (!pos || !feature) return;

        // Suavizado cinemático continuo
        const lerpFactor = 0.15;
        pos.current[0] += (pos.target[0] - pos.current[0]) * lerpFactor;
        pos.current[1] += (pos.target[1] - pos.current[1]) * lerpFactor;

        // Mover geometría sin recrear objetos
        const geom = feature.getGeometry();
        if (geom) {
          geom.setCoordinates(pos.current);
        }

        // Rotar el icono existente sin decodificar SVG repetidamente
        const style = feature.getStyle() as Style;
        if (style) {
          const icon = style.getImage() as Icon;
          if (icon) {
            icon.setRotation((pos.heading * Math.PI) / 180);
          }
        }
      });

      // Seguimiento de cámara si está activo
      if (followModeRef.current && selectedVehicleIdRef.current && mapRef.current) {
        const selectedPos = positions[selectedVehicleIdRef.current];
        if (selectedPos) {
          mapRef.current.getView().setCenter(selectedPos.current);
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
  }, []);

  // Actualizar la polilínea del rastro del vehículo seleccionado
  useEffect(() => {
    const trailSource = trailSourceRef.current;
    trailSource.clear();

    if (!selectedVehicleId) return;

    const trail = breadcrumbs[selectedVehicleId];
    if (trail && trail.length > 1) {
      const lineCoords = trail.map((pt) => fromLonLat([pt.lng, pt.lat]));
      const lineFeature = new Feature({
        geometry: new LineString(lineCoords)
      });
      trailSource.addFeature(lineFeature);
    }
  }, [selectedVehicleId, breadcrumbs]);

  // Efecto cuando se activa o cambia tripHistory (dibuja la polilínea completa, inicio, fin y paradas)
  useEffect(() => {
    const source = playbackSourceRef.current;
    source.clear();
    playbackMarkerFeatureRef.current = null;

    if (!tripHistory || tripHistory.points.length === 0) return;

    const coords = tripHistory.points.map((pt) => fromLonLat([pt.longitude, pt.latitude]));

    // 1. Polilínea del viaje histórico
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
    source.addFeature(routeLine);

    // 2. Línea interior luminosa (efecto neón)
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
    source.addFeature(routeLineInner);

    // 3. Marcador de Inicio
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
    source.addFeature(startFeature);

    // 4. Marcador de Fin
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
    source.addFeature(endFeature);

    // 5. Marcadores de paradas registradas
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
        source.addFeature(stopFeat);
      }
    });

    // 6. Marcador del vehículo en reproducción
    const markerFeature = new Feature({
      geometry: new Point(fromLonLat([startPoint.longitude, startPoint.latitude]))
    });
    playbackMarkerFeatureRef.current = markerFeature;
    source.addFeature(markerFeature);

    // Encuadrar la vista al viaje completo
    const extent = routeLine.getGeometry()?.getExtent();
    if (extent && mapRef.current) {
      mapRef.current.getView().fit(extent, {
        padding: [60, 60, 160, 60],
        duration: 800
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

    playbackMarkerFeatureRef.current.setStyle(
      new Style({
        image: new Icon({
          src: createVehicleSvgIcon(isStopped ? '#f59e0b' : '#38bdf8', 'truck'),
          rotation: headingRad,
          rotateWithView: true,
          scale: 1.25
        }),
        text: new Text({
          text: isStopped ? `🛑 ${playbackPoint.stopReason}` : `${playbackPoint.speed} km/h`,
          font: 'bold 11px sans-serif',
          offsetY: 28,
          fill: new Fill({ color: '#ffffff' }),
          backgroundFill: new Fill({ color: isStopped ? 'rgba(217, 119, 6, 0.95)' : 'rgba(2, 132, 199, 0.95)' }),
          backgroundStroke: new Stroke({ color: '#38bdf8', width: 1 }),
          padding: [2, 6, 2, 6]
        })
      })
    );

    // Centrar mapa si followMode está activo
    if (followMode && mapRef.current) {
      mapRef.current.getView().setCenter(coords);
    }
  }, [playbackPoint, followMode]);

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
