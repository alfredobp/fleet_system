'use client';

import React, { useState, useEffect, useRef } from 'react';
import { VehicleTripHistory, HistoricalPoint } from '@fleet/types';
import {
  Play,
  Pause,
  FastForward,
  RotateCcw,
  X,
  Gauge,
  Clock,
  Compass,
  MapPin,
  AlertTriangle,
  History
} from 'lucide-react';

interface RoutePlaybackBarProps {
  history: VehicleTripHistory;
  onPointChange: (point: HistoricalPoint, index: number) => void;
  onClose: () => void;
}

export function RoutePlaybackBar({
  history,
  onPointChange,
  onClose
}: RoutePlaybackBarProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(2); // 1x, 2x, 5x, 10x

  const points = history.points;
  const currentPoint = points[currentIndex] || points[0];

  // Disparar cambio de punto inicial
  useEffect(() => {
    if (currentPoint) {
      onPointChange(currentPoint, currentIndex);
    }
  }, [currentIndex, currentPoint, onPointChange]);

  // Bucle de temporizador de reproducción
  useEffect(() => {
    if (!isPlaying || points.length === 0) return;

    // Intervalo de avance según multiplicador
    const intervalTime = Math.max(30, 200 / playbackSpeed);

    const timer = setInterval(() => {
      setCurrentIndex((prev) => {
        if (prev >= points.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [isPlaying, playbackSpeed, points.length]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newIdx = parseInt(e.target.value, 10);
    setCurrentIndex(newIdx);
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setIsPlaying(true);
  };

  const formatTime = (ts: number) => {
    const date = new Date(ts);
    return date.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const progressPercent = ((currentIndex / (points.length - 1)) * 100).toFixed(1);

  return (
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 w-[92%] max-w-4xl glass-panel rounded-2xl p-4 shadow-2xl border border-slate-700/80 z-30 animate-in fade-in slide-in-from-bottom-4 duration-200">
      {/* Cabecera del Reproductor */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
            <History className="w-5 h-5 animate-spin" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white">{history.vehicleName}</span>
              <span className="font-mono text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
                {history.plate}
              </span>
              <span className="text-slate-400">• {history.driverName}</span>
            </div>
            <div className="flex items-center gap-3 text-slate-400 mt-0.5 text-[11px]">
              <span>Distancia viaje: <strong className="text-slate-200">{history.totalDistanceKm} km</strong></span>
              <span>Paradas registradas: <strong className="text-amber-400">{history.stopsCount}</strong></span>
              <span>Puntos: <strong>{points.length} waypoints</strong></span>
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition font-medium border border-slate-700"
        >
          <X className="w-4 h-4" />
          Volver a Tiempo Real
        </button>
      </div>

      {/* Barra de Tiempo (Timeline Scrubber) */}
      <div className="my-3 px-1">
        <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1 font-mono">
          <span>{formatTime(history.startTime)}</span>
          <span className="text-blue-400 font-bold">
            Punto {currentIndex + 1} de {points.length} ({progressPercent}%)
          </span>
          <span>{formatTime(history.endTime)}</span>
        </div>

        <div className="relative flex items-center">
          <input
            type="range"
            min={0}
            max={points.length - 1}
            value={currentIndex}
            onChange={handleSliderChange}
            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500 focus:outline-none"
          />
        </div>

        {/* Indicadores de paradas sobre la línea */}
        <div className="relative w-full h-2 mt-1">
          {points.map((pt, idx) => {
            if (!pt.stopReason) return null;
            const leftPercent = (idx / (points.length - 1)) * 100;
            return (
              <div
                key={idx}
                title={`${pt.stopReason} a las ${formatTime(pt.timestamp)}`}
                className="absolute top-0 w-2 h-2 rounded-full bg-amber-400 -translate-x-1 cursor-pointer hover:scale-150 transition"
                style={{ left: `${leftPercent}%` }}
                onClick={() => setCurrentIndex(idx)}
              />
            );
          })}
        </div>
      </div>

      {/* Controles de Reproducción y Telemetría Instantánea */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-800">
        {/* Botones de Control */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition shadow-lg shadow-blue-600/30 flex items-center justify-center"
            title={isPlaying ? 'Pausar viaje' : 'Reproducir viaje'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>

          <button
            onClick={handleRestart}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title="Reiniciar desde el principio"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Selector de velocidad */}
          <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800 text-xs ml-2">
            {[1, 2, 5, 10].map((speed) => (
              <button
                key={speed}
                onClick={() => setPlaybackSpeed(speed)}
                className={`px-2 py-0.5 rounded-lg font-mono font-bold transition ${
                  playbackSpeed === speed
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>

        {/* Telemetría en ese instante */}
        <div className="flex items-center gap-4 text-xs">
          {currentPoint.stopReason ? (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse font-bold">
              <span>🛑 {currentPoint.stopReason}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-slate-300 font-semibold bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-800">
              <Gauge className="w-4 h-4 text-blue-400" />
              <span>{currentPoint.speed} km/h</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-slate-300 font-semibold bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-800">
            <Compass className="w-4 h-4 text-cyan-400" />
            <span>{currentPoint.heading}°</span>
          </div>

          <div className="flex items-center gap-1.5 text-slate-300 font-mono font-bold bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-800">
            <Clock className="w-4 h-4 text-amber-400" />
            <span>{formatTime(currentPoint.timestamp)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
