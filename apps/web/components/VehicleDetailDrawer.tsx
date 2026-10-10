'use client';

import React from 'react';
import { Vehicle } from '@fleet/types';
import {
  X,
  Navigation,
  Gauge,
  Battery,
  Fuel,
  MapPin,
  Eye,
  EyeOff,
  UserCheck,
  Clock,
  Package,
  TrafficCone,
  History
} from 'lucide-react';

interface VehicleDetailDrawerProps {
  vehicle: Vehicle | null;
  onClose: () => void;
  followMode: boolean;
  onToggleFollow: () => void;
  onTriggerStop?: (vehicleId: string, reason: string, duration: number) => void;
  onOpenHistory?: (vehicleId: string) => void;
}

function getCardinalDirection(angle: number): string {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  const index = Math.round(((angle %= 360) < 0 ? angle + 360 : angle) / 45) % 8;
  return directions[index];
}

export function VehicleDetailDrawer({
  vehicle,
  onClose,
  followMode,
  onToggleFollow,
  onTriggerStop,
  onOpenHistory
}: VehicleDetailDrawerProps) {
  if (!vehicle) return null;

  const t = vehicle.lastTelemetry;
  const cardinal = getCardinalDirection(t.heading);

  return (
    <div className="absolute top-4 right-16 w-84 glass-panel rounded-2xl p-4 shadow-2xl border border-slate-700/80 z-20 animate-in fade-in slide-in-from-right-4 duration-200">
      {/* Cabecera */}
      <div className="flex items-start justify-between pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: vehicle.color }}
            />
            <h2 className="text-base font-bold text-white">{vehicle.name}</h2>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-semibold border border-slate-700">
              {vehicle.plate}
            </span>
            <span className="text-xs text-slate-400 capitalize">
              {vehicle.type}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Conductor asignado */}
      <div className="flex items-center gap-2.5 py-3 border-b border-slate-800 text-xs text-slate-300">
        <div className="p-1.5 rounded-lg bg-blue-600/10 text-blue-400">
          <UserCheck className="w-4 h-4" />
        </div>
        <div>
          <span className="text-slate-500 block text-[10px] uppercase font-bold">Conductor</span>
          <span className="font-medium text-white">{vehicle.driverName}</span>
        </div>
      </div>

      {/* Banner de Parada Activa con Cuenta Atrás */}
      {vehicle.currentStop && (
        <div className="bg-amber-500/15 border border-amber-500/40 rounded-xl p-3 my-2.5 shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
              <Clock className="w-4 h-4 text-amber-400 animate-spin" />
              {vehicle.currentStop.label}
            </span>
            <span className="font-mono text-sm font-extrabold text-amber-300">
              {vehicle.currentStop.remainingSeconds}s
            </span>
          </div>
          <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-amber-400 h-1.5 rounded-full transition-all duration-500"
              style={{
                width: `${Math.round(
                  (vehicle.currentStop.remainingSeconds / vehicle.currentStop.durationSeconds) * 100
                )}%`
              }}
            />
          </div>
          <span className="text-[10px] text-amber-400/80 block mt-1">
            Vehículo detenido en destino • Tacógrafo en pausa
          </span>
        </div>
      )}

      {/* Indicadores Principales */}
      <div className="grid grid-cols-2 gap-2.5 my-3">
        {/* Velocímetro */}
        <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 flex flex-col items-center justify-center">
          <Gauge className="w-5 h-5 text-blue-400 mb-1" />
          <span className="text-2xl font-black text-white tracking-tight">{t.speed}</span>
          <span className="text-[10px] uppercase font-bold text-slate-400">km/h actuales</span>
        </div>

        {/* Rumbo y Brújula */}
        <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 flex flex-col items-center justify-center">
          <div className="relative mb-1">
            <Navigation
              className="w-5 h-5 text-cyan-400 transition-transform duration-300"
              style={{ transform: `rotate(${t.heading}deg)` }}
            />
          </div>
          <span className="text-2xl font-black text-cyan-400 tracking-tight">
            {t.heading}° <span className="text-xs font-medium text-slate-400">{cardinal}</span>
          </span>
          <span className="text-[10px] uppercase font-bold text-slate-400">Rumbo de marcha</span>
        </div>
      </div>

      {/* Telemetría Adicional */}
      <div className="space-y-2 text-xs py-1 border-t border-slate-800">
        <div className="flex items-center justify-between text-slate-300">
          <span className="flex items-center gap-1.5 text-slate-400">
            <Battery className="w-3.5 h-3.5 text-emerald-400" /> Batería
          </span>
          <span className="font-semibold text-emerald-400">{t.battery}%</span>
        </div>
        <div className="flex items-center justify-between text-slate-300">
          <span className="flex items-center gap-1.5 text-slate-400">
            <Fuel className="w-3.5 h-3.5 text-amber-400" /> Combustible
          </span>
          <span className="font-semibold text-amber-400">{t.fuel || 75}%</span>
        </div>
        <div className="flex items-center justify-between text-slate-300">
          <span className="flex items-center gap-1.5 text-slate-400">
            <MapPin className="w-3.5 h-3.5 text-blue-400" /> Odómetro
          </span>
          <span className="font-mono font-semibold text-white">
            {Math.round(t.odometer).toLocaleString()} km
          </span>
        </div>
        <div className="flex items-center justify-between text-slate-400 text-[11px] font-mono pt-1">
          <span>GPS:</span>
          <span>{t.latitude.toFixed(5)}, {t.longitude.toFixed(5)}</span>
        </div>
      </div>

      {/* Simulación manual de paradas de prueba */}
      {onTriggerStop && (
        <div className="mt-3 pt-2 border-t border-slate-800">
          <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1.5">
            Simular Parada de Prueba:
          </span>
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            <button
              onClick={() => onTriggerStop(vehicle.id, 'delivery', 45)}
              className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-amber-500/40 transition font-medium"
            >
              <Package className="w-3.5 h-3.5 text-amber-400" /> Entrega (45s)
            </button>
            <button
              onClick={() => onTriggerStop(vehicle.id, 'traffic_light', 20)}
              className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-rose-500/40 transition font-medium"
            >
              <TrafficCone className="w-3.5 h-3.5 text-rose-400" /> Semáforo (20s)
            </button>
          </div>
        </div>
      )}

      {/* Botón Time-Machine / Historial de Viaje */}
      {onOpenHistory && (
        <div className="mt-2.5">
          <button
            onClick={() => onOpenHistory(vehicle.id)}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition shadow bg-blue-600/20 hover:bg-blue-600/35 text-blue-300 border border-blue-500/40 hover:border-blue-400"
          >
            <History className="w-4 h-4 text-blue-400" />
            Reproducir Historial (Time-Machine)
          </button>
        </div>
      )}

      {/* Botón de Seguimiento de Cámara */}
      <div className="mt-2 pt-2">
        <button
          onClick={onToggleFollow}
          className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition shadow ${
            followMode
              ? 'bg-blue-600 text-white shadow-blue-500/20 ring-2 ring-blue-400/40'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
          }`}
        >
          {followMode ? (
            <>
              <Eye className="w-4 h-4 animate-pulse text-cyan-300" />
              Siguiendo Cámara (Activo)
            </>
          ) : (
            <>
              <EyeOff className="w-4 h-4 text-slate-400" />
              Fijar Cámara al Vehículo
            </>
          )}
        </button>
      </div>
    </div>
  );
}
