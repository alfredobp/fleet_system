'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
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

// Caché global de iconos para evitar re-decodificar SVG en cada frame
const svgCache: Record<string, string> = {};
function getSvgDataUrl(color: string, type: string): string {
  const key = `${color}_${type}`;
  if (!svgCache[key]) {
    svgCache[key] = createVehicleSvgIcon(color, type);
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
  playbackPoint
}: FleetMapProps) {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const vectorSourceRef = useRef<VectorSource>(new VectorSource());
  const trailSourceRef = useRef<VectorSource>(new VectorSource());
  const playbackSourceRef = useRef<VectorSource>(new VectorSource());
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

    // Capa vectorial de vehículos en tiempo real
    const vehicleLayer = new VectorLayer({
      source: vectorSourceRef.current,
      zIndex: 10
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
      layers: [osmDarkLayer, osmStandardLayer, satelliteLayer, trailLayer, vehicleLayer, playbackLayer],
      view: new View({
        center: initialCenter,
        zoom: 13,
        minZoom: 3,
        maxZoom: 22
      })
    });

    // Evento de clic en vehículo
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

  // Actualizar estilo del vehículo en tiempo real reutilizando el Icon en caché
  const updateFeatureStyle = (feature: Feature<Point>, vehicle: Vehicle, isSelected: boolean, headingDeg: number) => {
    const headingRad = (headingDeg * Math.PI) / 180;
    const isStopped = !!vehicle.currentStop;
    const labelText = isStopped
      ? `${vehicle.name.split(' ')[0]} • 🛑 ${vehicle.currentStop!.remainingSeconds}s`
      : `${vehicle.name.split(' ')[0]} • ${vehicle.lastTelemetry.speed} km/h`;

    const iconColor = isSelected ? '#38bdf8' : isStopped ? '#f59e0b' : vehicle.color;
    const existingStyle = feature.getStyle() as Style | undefined;

    if (existingStyle && existingStyle.getImage()) {
      // Reutilizar la instancia de imagen para evitar redecodificaciones y flash
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
            src: getSvgDataUrl(iconColor, vehicle.type),
            rotation: headingRad,
            rotateWithView: true,
            scale: isSelected ? 1.15 : 0.95
          }),
          text: new Text({
            text: labelText,
            font: isSelected || isStopped ? 'bold 11px sans-serif' : '10px sans-serif',
            offsetY: 26,
            fill: new Fill({ color: isSelected || isStopped ? '#ffffff' : '#cbd5e1' }),
            backgroundFill: new Fill({
              color: isSelected ? 'rgba(2, 132, 199, 0.95)' : isStopped ? 'rgba(180, 83, 9, 0.95)' : 'rgba(15, 23, 42, 0.85)'
            }),
            backgroundStroke: new Stroke({
              color: isSelected ? '#38bdf8' : isStopped ? '#fbbf24' : 'rgba(255, 255, 255, 0.15)',
              width: 1
            }),
            padding: [2, 6, 2, 6]
          })
        })
      );
    }
  };

  // Actualización de coordenadas objetivo cuando llega telemetría
  useEffect(() => {
    if (tripHistory) return; // Si estamos en histórico, no procesar cambios de mapa en vivo
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
  }, [vehicles, selectedVehicleId, tripHistory]);

  // Bucle de animación continua con LERP
  useEffect(() => {
    const LERP_FACTOR = 0.08;

    const animate = () => {
      // Si el modo histórico está activo, pausar el ciclo LERP en segundo plano
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

    // 5. Marcadores de paradas registradas
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

    // 6. Marcador del vehículo en reproducción
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

    // Agregar todas las entidades juntas en una sola llamada sin múltiples repintados
    source.addFeatures([routeLine, routeLineInner, startFeature, endFeature, ...stopFeatures, markerFeature]);

    // Encuadrar la vista al viaje completo suavemente
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

    // Modificar la rotación y el texto directamente sobre el estilo existente (¡cero flash/parpadeo!)
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
