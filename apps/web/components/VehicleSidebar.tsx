'use client';

import React, { useState } from 'react';
import { Vehicle, VehicleStatus, EmergencyIncident } from '@fleet/types';
import {
  Truck,
  Car,
  Bike,
  Search,
  Navigation2,
  BatteryCharging,
  Gauge,
  Activity,
  Radio,
  Flame
} from 'lucide-react';

interface VehicleSidebarProps {
  vehicles: Vehicle[];
  selectedVehicleId: string | null;
  onSelectVehicle: (id: string) => void;
  stats: {
    total: number;
    moving: number;
    idle: number;
    avgSpeed: number;
  };
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'demo';
  onToggleEmergencyPanel?: () => void;
  isEmergencyPanelOpen?: boolean;
  activeIncident?: EmergencyIncident | null;
}

function getVehicleIcon(type: string) {
  switch (type) {
    case 'police':
      return <span className="text-lg">🚓</span>;
    case 'fire_truck':
      return <span className="text-lg">🚒</span>;
    case 'ambulance':
      return <span className="text-lg">🚑</span>;
    case 'truck':
      return <Truck className="w-5 h-5" />;
    case 'motorcycle':
      return <Bike className="w-5 h-5" />;
    case 'car':
      return <Car className="w-5 h-5" />;
    default:
      return <Truck className="w-5 h-5" />;
  }
}

function getStatusBadge(vehicle: Vehicle) {
  if (vehicle.status === 'responding') {
    const eta = vehicle.emergencyMission?.etaSeconds;
    const etaText = eta !== undefined ? ` (${eta}s)` : '';
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-black bg-rose-600/30 text-rose-300 border border-rose-500/60 animate-pulse">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping"></span>
        🚨 CÓDIGO 3{etaText}
      </span>
    );
  }

  if (vehicle.status === 'on_scene') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/50">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
        🚨 EN EL LUGAR
      </span>
    );
  }

  if (vehicle.currentStop) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/40">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
        {vehicle.currentStop.label.split(' ')[0]} ({vehicle.currentStop.remainingSeconds}s)
      </span>
    );
  }

  if (vehicle.status === 'moving') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
        En Ruta
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-700/30 text-slate-400 border border-slate-700/50">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
      En Base / Libre
    </span>
  );
}

export function VehicleSidebar({
  vehicles,
  selectedVehicleId,
  onSelectVehicle,
  stats,
  connectionStatus,
  onToggleEmergencyPanel,
  isEmergencyPanelOpen,
  activeIncident
}: VehicleSidebarProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'moving' | 'idle'>('all');

  const filteredVehicles = vehicles.filter((v) => {
    const matchesSearch =
      v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.plate.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.driverName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || v.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  return (
    <aside className="w-96 h-full flex flex-col glass-panel z-20 border-r border-slate-800">
      {/* Header del Centro de Control */}
      <div className="p-4 border-b border-slate-800/80">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-wide">Centro de Flotas</h1>
              <p className="text-xs text-slate-400">GIS OpenLayers • Madrid</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <span
              className={`w-2 h-2 rounded-full ${
                connectionStatus === 'connected'
                  ? 'bg-emerald-400'
                  : connectionStatus === 'demo'
                  ? 'bg-cyan-400'
                  : connectionStatus === 'connecting'
                  ? 'bg-amber-400 animate-ping'
                  : 'bg-rose-400'
              }`}
            />
            <span className="text-slate-400">
              {connectionStatus === 'connected' ? 'En Vivo' : connectionStatus === 'demo' ? 'Modo Demo' : 'Conectando'}
            </span>
          </div>
        </div>

        {/* Tarjetas de Métricas Rápidas */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-400 block uppercase font-semibold">Total</span>
            <span className="text-lg font-bold text-white">{stats.total}</span>
          </div>
          <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
            <span className="text-[10px] text-emerald-400 block uppercase font-semibold">En Ruta</span>
            <span className="text-lg font-bold text-emerald-400">{stats.moving}</span>
          </div>
          <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
            <span className="text-[10px] text-blue-400 block uppercase font-semibold">Vel. Med</span>
            <span className="text-lg font-bold text-blue-400">{stats.avgSpeed} <span className="text-xs font-normal">km/h</span></span>
          </div>
        </div>
      </div>

      {/* Botón de Acceso al Centro de Mando 112 Flotante */}
      <div className="p-3 border-b border-slate-800/80 bg-slate-900/30">
        <button
          onClick={onToggleEmergencyPanel}
          className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-xs font-bold transition shadow-lg ${
            activeIncident
              ? 'bg-rose-950/80 hover:bg-rose-900/90 border-rose-500/70 text-rose-200 shadow-rose-950/50'
              : isEmergencyPanelOpen
              ? 'bg-rose-900/40 border-rose-500/60 text-white shadow-rose-950/30'
              : 'bg-slate-900/90 hover:bg-slate-800 border-rose-500/30 text-rose-300 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-lg ${activeIncident ? 'bg-rose-600 text-white animate-bounce' : 'bg-rose-600/20 text-rose-400'}`}>
              <Flame className="w-4 h-4" />
            </div>
            <div className="text-left">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-white">Despacho 112</span>
                {activeIncident && (
                  <span className="text-[10px] bg-rose-600 text-white px-1.5 py-0.5 rounded font-black uppercase animate-pulse">
                    ACTIVO
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 font-normal truncate max-w-[170px]">
                {activeIncident ? activeIncident.title : 'Simular atención a incidentes'}
              </p>
            </div>
          </div>
          <span className={`text-[11px] font-mono px-2 py-1 rounded-md border ${
            isEmergencyPanelOpen
              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
              : 'bg-slate-800/80 text-slate-300 border-slate-700'
          }`}>
            {isEmergencyPanelOpen ? 'Ocultar ✕' : 'Ver 🚨'}
          </span>
        </button>
      </div>

      {/* Buscador y Filtros */}
      <div className="p-3 border-b border-slate-800/80 space-y-2.5">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar vehículo, matrícula o conductor..."
            className="w-full bg-slate-900/80 border border-slate-800 text-sm text-slate-200 placeholder-slate-500 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-blue-500/60 transition"
          />
        </div>

        <div className="flex gap-1.5">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-3 py-1 text-xs rounded-md font-medium transition ${
              filterStatus === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-900/60 text-slate-400 hover:text-slate-200'
            }`}
          >
            Todos ({vehicles.length})
          </button>
          <button
            onClick={() => setFilterStatus('moving')}
            className={`px-3 py-1 text-xs rounded-md font-medium transition ${
              filterStatus === 'moving'
                ? 'bg-emerald-600/40 text-emerald-300 border border-emerald-500/40'
                : 'bg-slate-900/60 text-slate-400 hover:text-slate-200'
            }`}
          >
            En Ruta ({stats.moving})
          </button>
          <button
            onClick={() => setFilterStatus('idle')}
            className={`px-3 py-1 text-xs rounded-md font-medium transition ${
              filterStatus === 'idle'
                ? 'bg-amber-600/40 text-amber-300 border border-amber-500/40'
                : 'bg-slate-900/60 text-slate-400 hover:text-slate-200'
            }`}
          >
            Parados ({stats.idle})
          </button>
        </div>
      </div>

      {/* Lista de Vehículos */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filteredVehicles.length === 0 ? (
          <div className="text-center py-10 text-slate-500 text-sm">
            No se encontraron vehículos coincidentes
          </div>
        ) : (
          filteredVehicles.map((vehicle) => {
            const isSelected = selectedVehicleId === vehicle.id;
            const t = vehicle.lastTelemetry;

            return (
              <div
                key={vehicle.id}
                onClick={() => onSelectVehicle(vehicle.id)}
                className={`p-3 rounded-xl cursor-pointer transition border ${
                  isSelected
                    ? 'bg-blue-950/40 border-blue-500 shadow-lg shadow-blue-950/30 ring-1 ring-blue-500/30'
                    : 'bg-slate-900/40 border-slate-800/80 hover:bg-slate-800/50 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="p-2 rounded-lg text-white"
                      style={{ backgroundColor: `${vehicle.color}25`, color: vehicle.color }}
                    >
                      {getVehicleIcon(vehicle.type)}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white leading-tight">
                        {vehicle.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs font-mono text-slate-300 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/60">
                          {vehicle.plate}
                        </span>
                        <span className="text-xs text-slate-400 truncate max-w-[110px]">
                          {vehicle.driverName}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div>{getStatusBadge(vehicle)}</div>
                </div>

                {/* Telemetría Mini */}
                <div className="grid grid-cols-3 gap-1 pt-2 border-t border-slate-800/60 text-xs">
                  <div className="flex items-center gap-1 text-slate-300">
                    <Gauge className="w-3.5 h-3.5 text-blue-400" />
                    <span className="font-semibold">{t.speed}</span>
                    <span className="text-[10px] text-slate-500">km/h</span>
                  </div>
                  <div className="flex items-center gap-1 text-slate-300">
                    <Navigation2
                      className="w-3.5 h-3.5 text-cyan-400"
                      style={{ transform: `rotate(${t.heading}deg)` }}
                    />
                    <span className="font-semibold">{t.heading}°</span>
                  </div>
                  <div className="flex items-center gap-1 text-slate-300">
                    <BatteryCharging className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="font-semibold">{t.battery}%</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
