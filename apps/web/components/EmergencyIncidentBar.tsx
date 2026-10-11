'use client';

import React, { useState, useEffect, useRef } from 'react';
import { EmergencyIncident, RespondingUnit } from '@fleet/types';
import { PRESET_INCIDENTS } from '../data/routes-data';
import {
  Flame,
  ShieldAlert,
  Ambulance,
  Radio,
  Volume2,
  VolumeX,
  X,
  AlertOctagon,
  Clock,
  Compass,
  CheckCircle2,
  Navigation
} from 'lucide-react';

interface EmergencyIncidentBarProps {
  activeIncident: EmergencyIncident | null;
  onTriggerEmergency: (incidentId: string) => void;
  onResolveEmergency: () => void;
  onClose?: () => void;
}

export function EmergencyIncidentBar({
  activeIncident,
  onTriggerEmergency,
  onResolveEmergency,
  onClose
}: EmergencyIncidentBarProps) {
  const [sirenSound, setSirenSound] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const sirenIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Síntesis de sirena de emergencia europea bi-tono (650Hz / 850Hz) vía Web Audio API
  useEffect(() => {
    if (!sirenSound || !activeIncident || activeIncident.status === 'under_control') {
      if (sirenIntervalRef.current) clearInterval(sirenIntervalRef.current);
      if (oscRef.current) {
        try {
          oscRef.current.stop();
          oscRef.current.disconnect();
        } catch {}
        oscRef.current = null;
      }
      return;
    }

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.05; // Volumen suave y agradable
      osc.type = 'sawtooth';
      osc.frequency.value = 650;

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      oscRef.current = osc;

      let highTone = false;
      sirenIntervalRef.current = setInterval(() => {
        if (!oscRef.current) return;
        highTone = !highTone;
        oscRef.current.frequency.setValueAtTime(highTone ? 850 : 650, ctx.currentTime);
      }, 550);
    } catch (e) {
      console.warn('AudioContext no soportado:', e);
    }

    return () => {
      if (sirenIntervalRef.current) clearInterval(sirenIntervalRef.current);
      if (oscRef.current) {
        try {
          oscRef.current.stop();
          oscRef.current.disconnect();
        } catch {}
        oscRef.current = null;
      }
    };
  }, [sirenSound, activeIncident]);

  const formatEta = (seconds: number) => {
    if (seconds <= 0) return '¡EN EL LUGAR!';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 w-[94%] max-w-4xl glass-panel rounded-2xl p-3.5 shadow-2xl border border-rose-500/40 animate-in fade-in slide-in-from-top-3 duration-200">
      {/* 1. MODO: Sin Incidente Activo -> Selector de Escenarios de Emergencia */}
      {!activeIncident ? (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-rose-600/20 text-rose-400 border border-rose-500/40">
              <ShieldAlert className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-white">Centro de Mando 112 • Despacho de Emergencias</span>
                <span className="text-[10px] font-mono bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-full border border-rose-500/30">
                  Policía • Bomberos • SAMUR
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Selecciona un incidente en vía pública para simular la movilización y tiempos de llegada (ETA):
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {PRESET_INCIDENTS.map((inc) => (
              <button
                key={inc.id}
                onClick={() => onTriggerEmergency(inc.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/90 hover:bg-rose-950 text-slate-200 hover:text-white border border-slate-700 hover:border-rose-500/60 text-xs font-semibold transition shadow"
              >
                <Flame className="w-3.5 h-3.5 text-rose-400" />
                {inc.title.split(' ')[0]} {inc.title.split(' ')[1]}
              </button>
            ))}

            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition ml-1"
                title="Cerrar panel flotante"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      ) : (
        /* 2. MODO: Incidente Activo -> Tablero Táctico con Cuenta Atrás de ETA de cada Unidad */
        <div className="space-y-3">
          {/* Cabecera del Incidente */}
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-rose-600 text-white animate-bounce shadow-lg shadow-rose-600/50">
                <Flame className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-black text-sm text-rose-300 tracking-wide uppercase">
                    🚨 {activeIncident.title}
                  </span>
                  <span className="text-[10px] font-mono font-bold bg-rose-600 text-white px-2 py-0.5 rounded uppercase">
                    Prioridad Código 3
                  </span>
                  {activeIncident.status === 'under_control' && (
                    <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/40 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Bajo Control
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                  <span className="text-slate-300 font-medium">📍 {activeIncident.address}</span>
                  <span>•</span>
                  <span>{activeIncident.description}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Botón de Sirena con Web Audio API */}
              <button
                onClick={() => setSirenSound((prev) => !prev)}
                className={`p-1.5 rounded-lg border text-xs font-medium transition flex items-center gap-1.5 ${
                  sirenSound
                    ? 'bg-rose-600/30 text-rose-300 border-rose-500/50'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                }`}
                title={sirenSound ? 'Silenciar sirena 112' : 'Activar sonido de sirena 112'}
              >
                {sirenSound ? <Volume2 className="w-4 h-4 text-rose-400 animate-pulse" /> : <VolumeX className="w-4 h-4" />}
                <span className="text-[11px]">{sirenSound ? 'Sirena On' : 'Sirena'}</span>
              </button>

              {/* Botón Resolver Incidente */}
              <button
                onClick={onResolveEmergency}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-lg shadow-emerald-600/30"
              >
                <CheckCircle2 className="w-4 h-4" />
                Resolver Incidente
              </button>

              {onClose && (
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition ml-1"
                  title="Minimizar panel flotante"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Barra de Progreso y Fase de Atención al Incidente */}
          {activeIncident.interventionPhase && (
            <div className="bg-slate-900/90 rounded-xl p-2.5 border border-slate-800">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-bold text-slate-200 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                  {activeIncident.interventionPhase}
                </span>
                <span className="font-mono font-black text-rose-400 text-xs">
                  Progreso Atención: {activeIncident.interventionProgress || 0}%
                </span>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                <div
                  className="bg-gradient-to-r from-rose-500 via-amber-500 to-emerald-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(5, activeIncident.interventionProgress || 0)}%` }}
                />
              </div>
            </div>
          )}

          {/* Tarjetas de Despacho y Tiempos de Llegada (ETA) */}
          <div className="grid grid-cols-3 gap-2.5">
            {activeIncident.units.map((unit) => {
              const isPolice = unit.role === 'police';
              const isAmbulance = unit.role === 'ambulance';
              const isFire = unit.role === 'fire';

              const roleColor = isPolice ? 'blue' : isAmbulance ? 'amber' : 'rose';
              const borderClass = unit.arrived
                ? 'border-emerald-500/50 bg-emerald-950/20'
                : isPolice
                ? 'border-blue-500/40 bg-blue-950/20'
                : isAmbulance
                ? 'border-amber-500/40 bg-amber-950/20'
                : 'border-rose-500/40 bg-rose-950/20';

              return (
                <div
                  key={unit.vehicleId}
                  className={`p-2.5 rounded-xl border ${borderClass} relative overflow-hidden transition-all duration-300`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">
                        {isPolice ? '🚓' : isAmbulance ? '🚑' : '🚒'}
                      </span>
                      <div>
                        <div className="font-bold text-xs text-white leading-tight">
                          {unit.name.split('•')[0]}
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          Matrícula: {unit.plate}
                        </span>
                      </div>
                    </div>

                    {/* Tiempo Estimado de Llegada (ETA) destacado */}
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">ETA Llegada</span>
                      <span
                        className={`text-sm font-black font-mono ${
                          unit.arrived ? 'text-emerald-400' : 'text-white'
                        }`}
                      >
                        {formatEta(unit.etaSeconds)}
                      </span>
                    </div>
                  </div>

                  {/* Estado y Métrica de Distancia / Velocidad */}
                  <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <Navigation className="w-3 h-3 text-slate-400" />
                      <span className="text-slate-300 font-mono">
                        {unit.arrived ? '0 m' : `${unit.distanceMeters} m`}
                      </span>
                      <span className="text-slate-500">•</span>
                      <span className="text-slate-300 font-mono">{unit.speedKmh} km/h</span>
                    </div>

                    <span
                      className={`font-semibold px-2 py-0.5 rounded text-[10px] ${
                        unit.arrived
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-rose-500/20 text-rose-300 animate-pulse'
                      }`}
                    >
                      {unit.arrived ? 'Llegada 100%' : 'En Ruta (Código 3)'}
                    </span>
                  </div>

                  {/* Texto de Acción Operativa */}
                  <div className="mt-1.5 text-[10px] text-slate-400 leading-relaxed italic bg-slate-900/60 p-1.5 rounded">
                    {unit.actionText}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
