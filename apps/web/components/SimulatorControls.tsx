'use client';

import React from 'react';
import { Play, Pause, FastForward, Activity } from 'lucide-react';
import { SimulatorStatus } from '@fleet/types';

interface SimulatorControlsProps {
  status: SimulatorStatus;
  onCommand: (command: 'play' | 'pause' | 'set_speed', speed?: number) => void;
}

export function SimulatorControls({ status, onCommand }: SimulatorControlsProps) {
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 glass-panel rounded-full px-4 py-2 flex items-center gap-4 z-20 border border-slate-700/80 shadow-2xl">
      <div className="flex items-center gap-2 pr-3 border-r border-slate-800">
        <Activity className={`w-4 h-4 ${status.isRunning ? 'text-emerald-400 animate-spin' : 'text-slate-500'}`} />
        <span className="text-xs font-semibold text-slate-300">
          Simulador: <span className={status.isRunning ? 'text-emerald-400' : 'text-amber-400'}>{status.isRunning ? 'Activo' : 'En Pausa'}</span>
        </span>
      </div>

      {/* Botón Play / Pause */}
      <button
        onClick={() => onCommand(status.isRunning ? 'pause' : 'play')}
        className={`p-1.5 rounded-full text-white transition ${
          status.isRunning
            ? 'bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 border border-amber-500/30'
            : 'bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/30'
        }`}
        title={status.isRunning ? 'Pausar simulación' : 'Reanudar simulación'}
      >
        {status.isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </button>

      {/* Multiplicadores de velocidad */}
      <div className="flex items-center gap-1 bg-slate-900/60 p-1 rounded-full border border-slate-800 text-xs">
        {[1, 2, 5].map((multiplier) => (
          <button
            key={multiplier}
            onClick={() => onCommand('set_speed', multiplier)}
            className={`px-2.5 py-0.5 rounded-full font-mono font-bold transition ${
              status.speedMultiplier === multiplier
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {multiplier}x
          </button>
        ))}
      </div>
    </div>
  );
}
