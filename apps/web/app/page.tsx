'use client';

import React, { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useFleetTelemetry } from '../hooks/useFleetTelemetry';
import { VehicleSidebar } from '../components/VehicleSidebar';
import { VehicleDetailDrawer } from '../components/VehicleDetailDrawer';
import { SimulatorControls } from '../components/SimulatorControls';
import { RoutePlaybackBar } from '../components/RoutePlaybackBar';
import { HistoricalPoint } from '@fleet/types';

// Cargar FleetMap dinámicamente con ssr: false para garantizar compatibilidad con OpenLayers
const FleetMap = dynamic(
  () => import('../components/FleetMap').then((mod) => mod.FleetMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-slate-950 text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-medium">Cargando motor OpenLayers...</span>
        </div>
      </div>
    )
  }
);

export default function FleetDashboardPage() {
  const {
    vehicles,
    vehicleList,
    breadcrumbs,
    tripHistory,
    fetchVehicleHistory,
    clearTripHistory,
    connectionStatus,
    simulatorStatus,
    sendSimulatorCommand,
    triggerStop,
    stats
  } = useFleetTelemetry();

  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [followMode, setFollowMode] = useState<boolean>(false);
  const [currentPlaybackPoint, setCurrentPlaybackPoint] = useState<HistoricalPoint | null>(null);

  const selectedVehicle = selectedVehicleId ? vehicles[selectedVehicleId] || null : null;

  const handleSelectVehicle = useCallback((id: string | null) => {
    setSelectedVehicleId(id);
    if (!id) {
      setFollowMode(false);
    }
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden flex bg-slate-950">
      {/* Barra lateral de vehículos y filtros */}
      <VehicleSidebar
        vehicles={vehicleList}
        selectedVehicleId={selectedVehicleId}
        onSelectVehicle={handleSelectVehicle}
        stats={stats}
        connectionStatus={connectionStatus}
      />

      {/* Contenedor central del mapa OpenLayers */}
      <div className="relative flex-1 h-full">
        {/* Controles de Simulación superiores (ocultos durante la reproducción histórica) */}
        {!tripHistory && (
          <SimulatorControls
            status={simulatorStatus}
            onCommand={sendSimulatorCommand}
          />
        )}

        {/* Mapa OpenLayers */}
        <FleetMap
          vehicles={vehicles}
          selectedVehicleId={selectedVehicleId}
          breadcrumbs={breadcrumbs}
          followMode={followMode}
          onSelectVehicle={handleSelectVehicle}
          tripHistory={tripHistory}
          playbackPoint={currentPlaybackPoint}
        />

        {/* Ficha flotante de telemetría del vehículo seleccionado */}
        {!tripHistory && (
          <VehicleDetailDrawer
            vehicle={selectedVehicle}
            onClose={() => handleSelectVehicle(null)}
            followMode={followMode}
            onToggleFollow={() => setFollowMode((prev) => !prev)}
            onTriggerStop={triggerStop}
            onOpenHistory={fetchVehicleHistory}
          />
        )}

        {/* Barra Flotante de Reproducción Histórica (Time-Machine) */}
        {tripHistory && (
          <RoutePlaybackBar
            history={tripHistory}
            onPointChange={(pt) => setCurrentPlaybackPoint(pt)}
            onClose={() => {
              clearTripHistory();
              setCurrentPlaybackPoint(null);
            }}
          />
        )}
      </div>
    </main>
  );
}
