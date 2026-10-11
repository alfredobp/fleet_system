'use client';

import React, { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useFleetTelemetry } from '../hooks/useFleetTelemetry';
import { VehicleSidebar } from '../components/VehicleSidebar';
import { VehicleDetailDrawer } from '../components/VehicleDetailDrawer';
import { SimulatorControls } from '../components/SimulatorControls';
import { RoutePlaybackBar } from '../components/RoutePlaybackBar';
import { EmergencyIncidentBar } from '../components/EmergencyIncidentBar';
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
    activeIncident,
    triggerEmergency,
    resolveEmergency,
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
  const [isEmergencyPanelOpen, setIsEmergencyPanelOpen] = useState<boolean>(false);

  const selectedVehicle = selectedVehicleId ? vehicles[selectedVehicleId] || null : null;

  const handleSelectVehicle = useCallback((id: string | null) => {
    setSelectedVehicleId(id);
    if (!id) {
      setFollowMode(false);
    }
  }, []);

  const handleOpenHistory = useCallback((vehicleId: string) => {
    setFollowMode(false);
    fetchVehicleHistory(vehicleId);
  }, [fetchVehicleHistory]);

  const handleCloseHistory = useCallback(() => {
    clearTripHistory();
    setCurrentPlaybackPoint(null);
    setFollowMode(false);
  }, [clearTripHistory]);

  const handlePlaybackPointChange = useCallback((pt: HistoricalPoint) => {
    setCurrentPlaybackPoint(pt);
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden flex bg-slate-950">
      {/* Barra lateral de vehículos, emergencias y filtros */}
      <VehicleSidebar
        vehicles={vehicleList}
        selectedVehicleId={selectedVehicleId}
        onSelectVehicle={handleSelectVehicle}
        stats={stats}
        connectionStatus={connectionStatus}
        onToggleEmergencyPanel={() => setIsEmergencyPanelOpen((prev) => !prev)}
        isEmergencyPanelOpen={isEmergencyPanelOpen}
        activeIncident={activeIncident}
      />

      {/* Contenedor central del mapa OpenLayers */}
      <div className="relative flex-1 h-full">
        {/* Panel Superior Táctico de Emergencias 112 (flotante, activado desde el menú lateral) */}
        {!tripHistory && isEmergencyPanelOpen && (
          <EmergencyIncidentBar
            activeIncident={activeIncident}
            onTriggerEmergency={(incId) => {
              triggerEmergency(incId);
              setIsEmergencyPanelOpen(true);
            }}
            onResolveEmergency={() => {
              resolveEmergency();
            }}
            onClose={() => setIsEmergencyPanelOpen(false)}
          />
        )}

        {/* Controles de Simulación inferiores (ocultos durante la reproducción histórica) */}
        {!tripHistory && (
          <SimulatorControls
            status={simulatorStatus}
            onCommand={sendSimulatorCommand}
          />
        )}

        {/* Mapa OpenLayers con capas de emergencia y flota */}
        <FleetMap
          vehicles={vehicles}
          selectedVehicleId={selectedVehicleId}
          breadcrumbs={breadcrumbs}
          followMode={followMode}
          onSelectVehicle={handleSelectVehicle}
          tripHistory={tripHistory}
          playbackPoint={currentPlaybackPoint}
          activeIncident={activeIncident}
        />

        {/* Ficha flotante de telemetría del vehículo seleccionado */}
        {!tripHistory && (
          <VehicleDetailDrawer
            vehicle={selectedVehicle}
            onClose={() => handleSelectVehicle(null)}
            followMode={followMode}
            onToggleFollow={() => setFollowMode((prev) => !prev)}
            onTriggerStop={triggerStop}
            onOpenHistory={handleOpenHistory}
          />
        )}

        {/* Barra Flotante de Reproducción Histórica (Time-Machine) */}
        {tripHistory && (
          <RoutePlaybackBar
            history={tripHistory}
            onPointChange={handlePlaybackPointChange}
            onClose={handleCloseHistory}
          />
        )}
      </div>
    </main>
  );
}
