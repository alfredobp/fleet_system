export interface LatLngPoint {
  lat: number;
  lng: number;
}

const routeCache = new Map<string, LatLngPoint[]>();

/**
 * Consulta la API pública de OSRM desde el backend para obtener el trazado exacto de las calles.
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
      const data = (await res.json()) as any;
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
    console.warn('Aviso OSRM server-side fallback:', err);
  }

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
