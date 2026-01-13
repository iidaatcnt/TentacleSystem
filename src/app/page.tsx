'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Footprints, Info, Zap, Wind, User } from 'lucide-react';

// --- Types ---
type Point = { x: number; y: number };

class Segment {
  x: number;
  y: number;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}

class Tentacle {
  segments: Segment[] = [];
  segLength: number;
  color: string;
  angleOffset: number;

  constructor(x: number, y: number, length: number, segLength: number, color: string, angleOffset: number) {
    this.segLength = segLength;
    this.color = color;
    this.angleOffset = angleOffset;
    for (let i = 0; i < length; i++) {
      this.segments.push(new Segment(x, y));
    }
  }

  update(bodyX: number, bodyY: number, targetX: number, targetY: number, time: number, movePhase: number) {
    this.segments[0].x = bodyX;
    this.segments[0].y = bodyY;

    const head = this.segments[this.segments.length - 1];
    const dx = targetX - bodyX;
    const dy = targetY - bodyY;
    const angleToTarget = Math.atan2(dy, dx);

    if (movePhase < 0.5) {
      const reachStrength = Math.sin(movePhase * Math.PI);
      const sweepAngle = angleToTarget + this.angleOffset * 0.5;
      const reachDist = (this.segments.length * this.segLength) * (0.6 + reachStrength * 0.4);

      const tx = bodyX + Math.cos(sweepAngle) * reachDist;
      const ty = bodyY + Math.sin(sweepAngle) * reachDist;

      head.x = lerp(head.x, tx, 0.1);
      head.y = lerp(head.y, ty, 0.1);
    }

    for (let i = this.segments.length - 2; i >= 0; i--) {
      const next = this.segments[i + 1];
      const curr = this.segments[i];
      const dist = Math.sqrt((curr.x - next.x) ** 2 + (curr.y - next.y) ** 2) || 1;
      const diff = (dist - this.segLength) / dist;
      curr.x -= (curr.x - next.x) * diff;
      curr.y -= (curr.y - next.y) * diff;
    }

    this.segments[0].x = bodyX;
    this.segments[0].y = bodyY;
    for (let i = 1; i < this.segments.length; i++) {
      const prev = this.segments[i - 1];
      const curr = this.segments[i];
      const dist = Math.sqrt((curr.x - prev.x) ** 2 + (curr.y - prev.y) ** 2) || 1;
      const diff = (dist - this.segLength) / dist;
      curr.x -= (curr.x - prev.x) * diff;
      curr.y -= (curr.y - prev.y) * diff;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const segments = this.segments;
    ctx.beginPath();
    ctx.moveTo(segments[0].x, segments[0].y);

    for (let i = 1; i < segments.length; i++) {
      const xc = (segments[i].x + segments[i - 1].x) / 2;
      const yc = (segments[i].y + segments[i - 1].y) / 2;
      ctx.quadraticCurveTo(segments[i - 1].x, segments[i - 1].y, xc, yc);
    }

    ctx.strokeStyle = this.color.replace('opacity', '0.3');
    ctx.lineWidth = 1;
    ctx.stroke();

    for (let i = 0; i < segments.length; i++) {
      const ratio = 1 - (i / segments.length);
      ctx.fillStyle = this.color.replace('opacity', (0.1 + ratio * 0.4).toString());
      ctx.beginPath();
      ctx.arc(segments[i].x, segments[i].y, 1 + ratio * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

const TENTACLE_COUNT = 16;
const COLORS = [
  'rgba(180, 240, 255, opacity)',
  'rgba(0, 180, 255, opacity)',
  'rgba(100, 100, 255, opacity)',
];

type SpeedProfile = 'slow' | 'normal' | 'fast';
const SPEEDS: Record<SpeedProfile, { gait: number; lerp: number; label: string }> = {
  slow: { gait: 0.02, lerp: 0.03, label: 'Languid (Slow)' },
  normal: { gait: 0.05, lerp: 0.1, label: 'Standard (Normal)' },
  fast: { gait: 0.12, lerp: 0.25, label: 'Predatory (Fast)' }
};

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef<Point>({ x: 0, y: 0 });
  const bodyRef = useRef<Point>({ x: 0, y: 0 });
  const gaitPhase = useRef(0);
  const tentaclesRef = useRef<Tentacle[]>([]);
  const [gameState, setGameState] = useState<'start' | 'playing'>('start');
  const [speedProfile, setSpeedProfile] = useState<SpeedProfile>('normal');

  const startSimulation = () => {
    if (gameState === 'playing') return;
    setGameState('playing');
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let time = 0;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      bodyRef.current = { x: canvas.width / 2, y: canvas.height / 2 };
      mouseRef.current = { x: canvas.width / 2, y: canvas.height / 2 };

      tentaclesRef.current = [];
      for (let i = 0; i < TENTACLE_COUNT; i++) {
        const color = COLORS[i % COLORS.length];
        const angleOffset = (i / TENTACLE_COUNT) * Math.PI * 2 - Math.PI;
        tentaclesRef.current.push(new Tentacle(bodyRef.current.x, bodyRef.current.y, 14, 10, color, angleOffset));
      }
    };

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', (e) => mouseRef.current = { x: e.clientX, y: e.clientY });
    window.addEventListener('touchmove', (e) => {
      if (e.touches[0]) mouseRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: true });
    resize();

    let animationId: number;
    const render = () => {
      time += 0.02;

      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const body = bodyRef.current;
      const target = mouseRef.current;
      const dist = Math.sqrt((target.x - body.x) ** 2 + (target.y - body.y) ** 2);

      const speedCfg = SPEEDS[speedProfile];

      if (dist > 30 && gameState === 'playing') {
        gaitPhase.current += speedCfg.gait;
        if (gaitPhase.current > 1) gaitPhase.current = 0;
      } else {
        gaitPhase.current = lerp(gaitPhase.current, 0, 0.1);
      }

      const phase = gaitPhase.current;

      if (phase >= 0.5 && phase < 0.9) {
        body.x += (target.x - body.x) * speedCfg.lerp;
        body.y += (target.y - body.y) * speedCfg.lerp;
      }

      ctx.globalCompositeOperation = 'lighter';
      tentaclesRef.current.forEach(t => {
        t.update(body.x, body.y, target.x, target.y, time, phase);
        t.draw(ctx);
      });

      const glowSize = 30 + Math.sin(time * 5) * 5;
      ctx.shadowBlur = glowSize;
      ctx.shadowColor = '#0ff';
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(body.x, body.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, [gameState, speedProfile]);

  return (
    <div className="fixed inset-0 bg-[#000] overflow-hidden select-none touch-none">
      <canvas ref={canvasRef} className="block w-full h-full" />

      <AnimatePresence>
        {gameState === 'start' && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 pointer-events-auto"
          >
            <div className="text-center p-12 max-w-lg bg-zinc-950/50 backdrop-blur-xl border border-white/5 rounded-3xl">
              <div className="flex justify-center mb-8">
                <div className="p-5 bg-cyan-500/10 rounded-full border border-cyan-500/20">
                  <Footprints className="w-12 h-12 text-cyan-400" />
                </div>
              </div>
              <h1 className="text-5xl font-black italic text-white mb-2 uppercase tracking-tighter">
                Creeping_System
              </h1>
              <p className="text-zinc-500 mb-12 text-xs mono uppercase tracking-widest leading-relaxed">
                Select Locomotion Urgency
              </p>

              <div className="flex flex-col gap-4 mb-10">
                {(Object.keys(SPEEDS) as SpeedProfile[]).map((sp) => (
                  <button
                    key={sp}
                    onClick={() => setSpeedProfile(sp)}
                    className={`group relative flex items-center justify-between p-5 rounded-xl border transition-all ${speedProfile === sp
                        ? 'bg-cyan-500/10 border-cyan-500 text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.15)]'
                        : 'bg-zinc-900/50 border-white/5 text-zinc-500 hover:border-white/10 hover:text-white'
                      }`}
                  >
                    <div className="flex items-center gap-4">
                      {sp === 'slow' && <Wind size={20} />}
                      {sp === 'normal' && <User size={20} />}
                      {sp === 'fast' && <Zap size={20} />}
                      <span className="font-bold uppercase tracking-widest text-sm">{SPEEDS[sp].label}</span>
                    </div>
                    {speedProfile === sp && (
                      <motion.div layoutId="indicator" className="w-2 h-2 bg-cyan-400 rounded-full" />
                    )}
                  </button>
                ))}
              </div>

              <button
                onClick={startSimulation}
                className="w-full py-5 bg-white text-black font-black uppercase tracking-[0.2em] rounded-xl hover:bg-cyan-400 transition-all active:scale-[0.98]"
              >
                Launch Simulation
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute top-10 left-10 pointer-events-none opacity-40">
        <div className="flex flex-col gap-2">
          <div className="mono text-[10px] text-cyan-400 flex items-center gap-2">
            <div className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse" />
            GAIT_SIM_v2 // {speedProfile.toUpperCase()}
          </div>
          <div className="h-0.5 w-32 bg-cyan-900/50" />
        </div>
      </div>

      {gameState === 'playing' && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="absolute bottom-10 inset-x-0 flex justify-center pointer-events-none"
        >
          <div className="flex items-center gap-6 px-8 py-3 bg-black/40 backdrop-blur-md rounded-full border border-white/5">
            {(Object.keys(SPEEDS) as SpeedProfile[]).map((sp) => (
              <button
                key={sp}
                onClick={(e) => { e.stopPropagation(); setSpeedProfile(sp); }}
                className={`pointer-events-auto text-[10px] font-bold uppercase tracking-widest transition-colors ${speedProfile === sp ? 'text-cyan-400' : 'text-zinc-600 hover:text-zinc-400'
                  }`}
              >
                {sp}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
