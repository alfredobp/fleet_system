export interface LatLngPoint {
  lat: number;
  lng: number;
}

// Caché en memoria para evitar peticiones redundantes al motor OSRM
const routeCache = new Map<string, LatLngPoint[]>();

/**
 * Consulta la API pública de OSRM para obtener el trazado exacto de las calles entre origen y destino.
 * Si falla la conexión o se ejecuta sin red, realiza fallback inmediato a interpolación continua.
 */
export async function fetchRoadSnappedRoute(
  start: LatLngPoint,
  destination: LatLngPoint
): Promise<LatLngPoint[]> {
  const cacheKey = `${start.lat.toFixed(5)},${start.lng.toFixed(5)}->${destination.lat.toFixed(5)},${destination.lng.toFixed(5)}`;
  if (routeCache.has(cacheKey)) {
    return routeCache.get(cacheKey)!;
  }

  const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.code === 'Ok' && data.routes && data.routes[0]) {
        const coords: LatLngPoint[] = data.routes[0].geometry.coordinates.map((pt: [number, number]) => ({
          lat: Number(pt[1].toFixed(6)),
          lng: Number(pt[0].toFixed(6))
        }));
        if (coords.length > 0) {
          routeCache.set(cacheKey, coords);
          return coords;
        }
      }
    }
  } catch (err) {
    console.warn('Aviso: OSRM no disponible en este momento, usando fallback viario directo.', err);
  }

  // Fallback con puntos densos en caso de que OSRM tarde o esté offline
  const fallback: LatLngPoint[] = [];
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    fallback.push({
      lat: Number((start.lat + (destination.lat - start.lat) * f).toFixed(6)),
      lng: Number((start.lng + (destination.lng - start.lng) * f).toFixed(6))
    });
  }
  return fallback;
}
