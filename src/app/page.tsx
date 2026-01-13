'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Footprints, Info } from 'lucide-react';

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
  angleOffset: number; // Native angle around the body
  state: 'reaching' | 'sliding' = 'sliding';
  reachPhase: number = 0;

  constructor(x: number, y: number, length: number, segLength: number, color: string, angleOffset: number) {
    this.segLength = segLength;
    this.color = color;
    this.angleOffset = angleOffset;
    for (let i = 0; i < length; i++) {
      this.segments.push(new Segment(x, y));
    }
  }

  update(bodyX: number, bodyY: number, targetX: number, targetY: number, time: number, movePhase: number) {
    // 1. Root is always fixed to body COG
    this.segments[0].x = bodyX;
    this.segments[0].y = bodyY;

    // 2. Head (Tip) decides its goal based on movePhase
    // "Phase 0.0 -> 0.5: Reach out"
    // "Phase 0.5 -> 1.0: Hold and Pull (Stay fixed relative to world/drag)"
    const head = this.segments[this.segments.length - 1];

    // Direction to mouse
    const dx = targetX - bodyX;
    const dy = targetY - bodyY;
    const distToTarget = Math.sqrt(dx * dx + dy * dy);
    const angleToTarget = Math.atan2(dy, dx);

    // Goal calculation:
    // When movePhase is low, tentacles reach in front of the body.
    if (movePhase < 0.5) {
      // Reaching phase: Move head forward
      const reachStrength = Math.sin(movePhase * Math.PI); // Peak at 0.25
      const sweepAngle = angleToTarget + this.angleOffset * 0.5;
      const reachDist = (this.segments.length * this.segLength) * (0.6 + reachStrength * 0.4);

      const tx = bodyX + Math.cos(sweepAngle) * reachDist;
      const ty = bodyY + Math.sin(sweepAngle) * reachDist;

      head.x = lerp(head.x, tx, 0.1);
      head.y = lerp(head.y, ty, 0.1);
    } else {
      // Dragging phase: Stay grounded (don't update head, it stays where it was)
      // This causes the body to "pull" towards it as IK resolves
    }

    // 3. Resolve IK Chain (Constraint satisfaction)
    // We do one backward pass (Head to Root) and one forward pass (Root(Body) to Head)

    // Backward (Adjust body towards head if we were simulating friction, 
    // but here we let the Body COG move separately based on gait)
    for (let i = this.segments.length - 2; i >= 0; i--) {
      const next = this.segments[i + 1];
      const curr = this.segments[i];
      const dist = Math.sqrt((curr.x - next.x) ** 2 + (curr.y - next.y) ** 2) || 1;
      const diff = (dist - this.segLength) / dist;
      curr.x -= (curr.x - next.x) * diff;
      curr.y -= (curr.y - next.y) * diff;
    }

    // Forward (Re-fix Root and adjust chain)
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

    // Draw segment nodes
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

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef<Point>({ x: 0, y: 0 });
  const bodyRef = useRef<Point & { vx: number; vy: number }>({ x: 0, y: 0, vx: 0, vy: 0 });
  const gaitPhase = useRef(0);
  const tentaclesRef = useRef<Tentacle[]>([]);
  const [gameState, setGameState] = useState<'start' | 'playing'>('start');

  const startSimulation = () => {
    if (gameState === 'playing') return;
    setGameState('playing');
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.code === 'Space') startSimulation(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let time = 0;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      bodyRef.current = { x: canvas.width / 2, y: canvas.height / 2, vx: 0, vy: 0 };
      mouseRef.current = { x: canvas.width / 2, y: canvas.height / 2 };

      tentaclesRef.current = [];
      for (let i = 0; i < TENTACLE_COUNT; i++) {
        const color = COLORS[i % COLORS.length];
        const angleOffset = (i / TENTACLE_COUNT) * Math.PI * 2 - Math.PI;
        tentaclesRef.current.push(new Tentacle(bodyRef.current.x, bodyRef.current.y, 12, 10, color, angleOffset));
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

      // Background with trail
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const body = bodyRef.current;
      const target = mouseRef.current;
      const dist = Math.sqrt((target.x - body.x) ** 2 + (target.y - body.y) ** 2);

      // --- GAIT LOGIC (Walking Simulation) ---
      // If far from target, proceed with walking stages
      if (dist > 20) {
        gaitPhase.current += 0.05; // Speed of walking
        if (gaitPhase.current > 1) gaitPhase.current = 0;
      } else {
        gaitPhase.current = lerp(gaitPhase.current, 0, 0.1);
      }

      const phase = gaitPhase.current;

      // 1. PHASE 1: Tentacles reach forward (phase 0.0 to 0.5)
      // 2. PHASE 2: Body shifts weight (phase 0.5 to 1.0)
      if (phase >= 0.5 && phase < 0.9) {
        // Weight shift: Body moves forward
        const moveX = (target.x - body.x) * 0.1;
        const moveY = (target.y - body.y) * 0.1;
        body.x += moveX;
        body.y += moveY;
      }

      // Update tentacles with current gait phase
      ctx.globalCompositeOperation = 'lighter';
      tentaclesRef.current.forEach(t => {
        t.update(body.x, body.y, target.x, target.y, time, phase);
        t.draw(ctx);
      });

      // Draw Central Body (The Nucleus)
      const glowSize = 30 + Math.sin(time * 5) * 5;
      ctx.shadowBlur = glowSize;
      ctx.shadowColor = '#0ff';
      ctx.fillStyle = '#fff';

      // Core pulsating nucleus
      ctx.beginPath();
      ctx.arc(body.x, body.y, 8, 0, Math.PI * 2);
      ctx.fill();

      // Decorative orbit inner glow
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(body.x, body.y, 15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, [gameState]);

  return (
    <div className="fixed inset-0 bg-[#000] overflow-hidden select-none touch-none">
      <canvas ref={canvasRef} className="block w-full h-full" onClick={startSimulation} />

      <AnimatePresence>
        {gameState === 'start' && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 pointer-events-auto"
            onClick={startSimulation}
          >
            <div className="text-center p-10 max-w-md">
              <div className="flex justify-center mb-6">
                <div className="p-4 bg-cyan-500/20 rounded-full animate-bounce">
                  <Footprints className="w-10 h-10 text-cyan-400" />
                </div>
              </div>
              <h1 className="text-4xl font-black italic text-cyan-400 mb-4 uppercase tracking-tighter">
                Creeping Organism
              </h1>
              <p className="text-white/30 mb-10 text-xs mono leading-relaxed uppercase">
                Walking Simulation Logic:<br />
                1. Tentacles Forward (Reach)<br />
                2. Body Shifting (Lunging)
              </p>
              <button className="w-full py-4 bg-white text-black font-bold uppercase tracking-widest rounded-sm hover:bg-cyan-500 transition-all shadow-[0_0_30px_rgba(255,255,255,0.2)]">
                Initialize Lifeform
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute top-10 left-10 pointer-events-none opacity-40">
        <div className="flex flex-col gap-2">
          <div className="mono text-[10px] text-cyan-400 flex items-center gap-2">
            <div className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse" />
            GAIT_SIMULATOR_ACTIVE
          </div>
          <div className="h-0.5 w-32 bg-cyan-900/50" />
          <div className="mono text-[8px] text-white/40 uppercase">Locomotion: Bipedal_Creep</div>
        </div>
      </div>

      <div className="absolute bottom-10 left-10 pointer-events-none opacity-20">
        <div className="flex items-center gap-3 text-white text-[10px] uppercase font-bold tracking-[0.3em] mono">
          <Info size={14} /> Move cursor to induce creeping gait
        </div>
      </div>
    </div>
  );
}
