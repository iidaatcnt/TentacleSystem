'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, MousePointer2 } from 'lucide-react';

// --- Types ---
type Point = { x: number; y: number };

class Segment {
  x: number;
  y: number;
  vx: number = 0;
  vy: number = 0;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}

class Tentacle {
  segments: Segment[] = [];
  segLength: number;
  color: string;
  wobbleOffset: number;

  constructor(x: number, y: number, length: number, segLength: number, color: string) {
    this.segLength = segLength;
    this.color = color;
    this.wobbleOffset = Math.random() * Math.PI * 2;
    for (let i = 0; i < length; i++) {
      this.segments.push(new Segment(x, y));
    }
  }

  // Root is anchored to the body
  update(rootX: number, rootY: number, targetX: number, targetY: number, time: number, bodyVel: Point) {
    // 1. Anchor segments[0] to the body (emitter)
    this.segments[0].x = rootX;
    this.segments[0].y = rootY;

    // 2. The tip (last segment) reaches for the mouse
    const tip = this.segments[this.segments.length - 1];

    // Direction from root to mouse
    const dx = targetX - rootX;
    const dy = targetY - rootY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // The "reaching" target for the tip
    // We want the tip to reach forward in the direction of movement + target seeking
    const reachX = targetX + Math.sin(time * 0.05 + this.wobbleOffset) * 40;
    const reachY = targetY + Math.cos(time * 0.05 + this.wobbleOffset) * 40;

    // Apply reach force to the tip
    tip.vx += (reachX - tip.x) * 0.05;
    tip.vy += (reachY - tip.y) * 0.05;

    // Damping
    tip.vx *= 0.8;
    tip.vy *= 0.8;
    tip.x += tip.vx;
    tip.y += tip.vy;

    // 3. Constrain segments (IK / Chain logic)
    // Forward pass: ensure tip is pulled back if too far from body
    // We do a relaxation loop
    for (let r = 0; r < 2; r++) {
      // Body to Tip (Root is fixed at repo[0])
      for (let i = 1; i < this.segments.length; i++) {
        const prev = this.segments[i - 1];
        const curr = this.segments[i];
        const cdx = curr.x - prev.x;
        const cdy = curr.y - prev.y;
        const cdist = Math.sqrt(cdx * cdx + cdy * cdy) || 0.01;
        const diff = (cdist - this.segLength) / cdist;

        curr.x -= cdx * diff * 0.5;
        curr.y -= cdy * diff * 0.5;
      }
      // Re-fix root
      this.segments[0].x = rootX;
      this.segments[0].y = rootY;
    }

    // Apply some organic drag/wave
    for (let i = 1; i < this.segments.length; i++) {
      const s = this.segments[i];
      // Swing effect
      s.x += Math.sin(time * 0.02 + i * 0.2 + this.wobbleOffset) * 0.5;
      s.y += Math.cos(time * 0.02 + i * 0.2 + this.wobbleOffset) * 0.5;
    }
  }

  // Simplified and more stable IK update for "Reaching"
  updateReaching(rootX: number, rootY: number, targetX: number, targetY: number, time: number) {
    this.segments[0].x = rootX;
    this.segments[0].y = rootY;

    // Lead from the tip towards mouse
    const last = this.segments.length - 1;
    const tip = this.segments[last];

    // Tip seeking mouse
    const angleToMouse = Math.atan2(targetY - rootY, targetX - rootX);
    const reachDist = Math.min(dist(rootX, rootY, targetX, targetY), this.segments.length * this.segLength);

    // Target position for tip
    const tx = rootX + Math.cos(angleToMouse + Math.sin(time * 0.03 + this.wobbleOffset) * 0.2) * reachDist;
    const ty = rootY + Math.sin(angleToMouse + Math.sin(time * 0.03 + this.wobbleOffset) * 0.2) * reachDist;

    tip.x = lerp(tip.x, tx, 0.1);
    tip.y = lerp(tip.y, ty, 0.1);

    // Backward pass (Tip towards Root)
    for (let i = last - 1; i >= 0; i--) {
      const next = this.segments[i + 1];
      const curr = this.segments[i];
      const dx = curr.x - next.x;
      const dy = curr.y - next.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const ang = Math.atan2(dy, dx);
      curr.x = next.x + Math.cos(ang) * this.segLength;
      curr.y = next.y + Math.sin(ang) * this.segLength;
    }

    // Forward pass (Fix Root)
    this.segments[0].x = rootX;
    this.segments[0].y = rootY;
    for (let i = 1; i <= last; i++) {
      const prev = this.segments[i - 1];
      const curr = this.segments[i];
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const ang = Math.atan2(dy, dx);
      curr.x = prev.x + Math.cos(ang) * this.segLength;
      curr.y = prev.y + Math.sin(ang) * this.segLength;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const segments = this.segments;
    const count = segments.length;

    ctx.beginPath();
    ctx.moveTo(segments[0].x, segments[0].y);

    for (let i = 1; i < count; i++) {
      const ratio = 1 - (i / count);
      const p = segments[i];

      // Use bezier for even smoother lines
      const xc = (segments[i].x + segments[i - 1].x) / 2;
      const yc = (segments[i].y + segments[i - 1].y) / 2;
      ctx.quadraticCurveTo(segments[i - 1].x, segments[i - 1].y, xc, yc);
    }

    ctx.strokeStyle = this.color.replace('opacity', '0.4');
    ctx.lineWidth = 1;
    ctx.stroke();

    // Secondary stroke for glow
    ctx.beginPath();
    ctx.moveTo(segments[0].x, segments[0].y);
    for (let i = 1; i < count; i++) {
      const xc = (segments[i].x + segments[i - 1].x) / 2;
      const yc = (segments[i].y + segments[i - 1].y) / 2;
      ctx.quadraticCurveTo(segments[i - 1].x, segments[i - 1].y, xc, yc);
    }
    ctx.strokeStyle = this.color.replace('opacity', '0.1');
    ctx.lineWidth = 12; // Glow envelope
    ctx.stroke();

    // Tip orb
    const tip = segments[count - 1];
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }
}

function dist(x1: number, y1: number, x2: number, y2: number) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

const TENTACLE_COUNT = 36;
const COLORS = [
  'rgba(180, 240, 255, opacity)',
  'rgba(0, 180, 255, opacity)',
  'rgba(200, 220, 255, opacity)',
];

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef<Point>({ x: 0, y: 0 });
  const bodyRef = useRef<Point & { vx: number; vy: number }>({ x: 0, y: 0, vx: 0, vy: 0 });
  const tentaclesRef = useRef<Tentacle[]>([]);
  const [gameState, setGameState] = useState<'start' | 'playing'>('start');
  const audioCtxRef = useRef<AudioContext | null>(null);

  const startSimulation = () => {
    if (gameState === 'playing') return;
    setGameState('playing');
    if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioCtxRef.current.resume();
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
        const segCount = 12 + Math.floor(Math.random() * 12);
        const segDist = 8 + Math.random() * 8;
        tentaclesRef.current.push(new Tentacle(bodyRef.current.x, bodyRef.current.y, segCount, segDist, color));
      }
    };

    const handleMouseMove = (e: MouseEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY }; };
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) mouseRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleTouchMove);
    resize();

    let animationId: number;
    const render = () => {
      time += 1;

      // Spec: deep background with trail
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 1. Move Body (Emitter) towards Mouse
      const body = bodyRef.current;
      const target = mouseRef.current;

      // Body pursuit logic
      body.vx += (target.x - body.x) * 0.05;
      body.vy += (target.y - body.y) * 0.05;
      body.vx *= 0.85;
      body.vy *= 0.85;
      body.x += body.vx;
      body.y += body.vy;

      ctx.globalCompositeOperation = 'lighter';

      // 2. Update and Draw Tentacles
      tentaclesRef.current.forEach(t => {
        // Tentacles are attached to Body, reach forward to Target
        t.updateReaching(body.x, body.y, target.x, target.y, time);
        t.draw(ctx);
      });

      // 3. Draw Body (The "emitter body" mentioned by user)
      ctx.beginPath();
      ctx.arc(body.x, body.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';

      // Body Glow
      ctx.shadowBlur = 40;
      ctx.shadowColor = '#0ff';
      ctx.fill();

      // Core
      ctx.beginPath();
      ctx.arc(body.x, body.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.shadowBlur = 0;

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
      cancelAnimationFrame(animationId);
    };
  }, [gameState]);

  return (
    <div className="fixed inset-0 bg-black overflow-hidden select-none touch-none">
      <canvas ref={canvasRef} className="block w-full h-full" onClick={startSimulation} />

      <AnimatePresence>
        {gameState === 'start' && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto"
            onClick={startSimulation}
          >
            <div className="text-center p-10">
              <h1 className="text-5xl font-black italic text-cyan-400 mb-6 uppercase tracking-tighter">
                Tentacle System
              </h1>
              <p className="text-white/40 mb-10 text-sm mono">
                Body pursuing Cursor // Tentacles reaching forward
              </p>
              <button className="px-10 py-4 bg-white text-black font-bold uppercase tracking-widest rounded-full hover:bg-cyan-400 transition-all">
                Sync & Start
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Retro Grid Background */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.05] bg-[linear-gradient(rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[length:50px_50px]" />
    </div>
  );
}
