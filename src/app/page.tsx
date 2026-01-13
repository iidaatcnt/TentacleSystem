'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, MousePointer2, Info } from 'lucide-react';

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
  angle: number;
  speed: number;
  segLength: number;
  color: string;
  wobbleSpeed: number;
  wobbleIntensity: number;

  constructor(x: number, y: number, length: number, segLength: number, color: string) {
    this.angle = Math.random() * Math.PI * 2;
    this.speed = 4 + Math.random() * 6; // Increased speed for "reaching out" feel
    this.segLength = segLength;
    this.color = color;
    this.wobbleSpeed = 0.05 + Math.random() * 0.1;
    this.wobbleIntensity = 0.1 + Math.random() * 0.3;

    for (let i = 0; i < length; i++) {
      this.segments.push(new Segment(x, y));
    }
  }

  update(targetX: number, targetY: number, time: number) {
    const head = this.segments[0];

    // Smooth navigation with reach-out behavior
    const dx = targetX - head.x;
    const dy = targetY - head.y;
    const angleToTarget = Math.atan2(dy, dx);
    const distToTarget = Math.sqrt(dx * dx + dy * dy);

    // Turn faster when far, slower when close for graceful approach
    const turnSpeed = distToTarget > 100 ? 0.15 : 0.05;
    const angleDiff = angleToTarget - this.angle;
    this.angle += Math.sin(angleDiff) * turnSpeed;

    // Add organic procedural wiggle
    this.angle += Math.sin(time * this.wobbleSpeed) * this.wobbleIntensity;

    // Head moves towards target
    head.x += Math.cos(this.angle) * this.speed;
    head.y += Math.sin(this.angle) * this.speed;

    // Body Following logic
    for (let i = 1; i < this.segments.length; i++) {
      const prev = this.segments[i - 1];
      const curr = this.segments[i];

      const ldx = prev.x - curr.x;
      const ldy = prev.y - curr.y;
      const dist = Math.sqrt(ldx * ldx + ldy * ldy);

      if (dist > this.segLength) {
        const angle = Math.atan2(ldy, ldx);
        curr.x = prev.x - Math.cos(angle) * this.segLength;
        curr.y = prev.y - Math.sin(angle) * this.segLength;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const segments = this.segments;
    const count = segments.length;

    for (let i = 0; i < count - 1; i++) {
      const p1 = segments[i];
      const p2 = segments[i + 1];
      const ratio = 1 - (i / count);

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);

      ctx.lineWidth = 0.5 + ratio * 12; // Thicker base, thinner tail
      ctx.strokeStyle = this.color.replace('opacity', (ratio * 0.7).toString());
      ctx.lineCap = 'round';
      ctx.stroke();

      if (i < 3) {
        ctx.shadowBlur = 20 * ratio;
        ctx.shadowColor = ctx.strokeStyle as string;
      } else {
        ctx.shadowBlur = 0;
      }
    }

    // Reach Tip (Glowing dot at the end of some tentacles)
    ctx.beginPath();
    ctx.arc(segments[0].x, segments[0].y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#fff';
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

const TENTACLE_COUNT = 32;
const COLORS = [
  'rgba(180, 240, 255, opacity)', // Bright Cyan
  'rgba(100, 200, 255, opacity)', // Sky Blue
  'rgba(200, 150, 255, opacity)', // Soft Purple
];

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef<Point>({ x: 0, y: 0 });
  const tentaclesRef = useRef<Tentacle[]>([]);
  const [gameState, setGameState] = useState<'start' | 'playing'>('start');

  const audioCtxRef = useRef<AudioContext | null>(null);

  const startSimulation = () => {
    if (gameState === 'playing') return;
    setGameState('playing');

    // Initialize Web Audio
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    audioCtxRef.current.resume();
    playStartSound();
  };

  const playStartSound = () => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.3);

    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  };

  const playMotionSound = (volume: number) => {
    if (!audioCtxRef.current || Math.random() > 0.1) return; // Only occasional sounds
    const ctx = audioCtxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(400 + Math.random() * 400, ctx.currentTime);

    gain.gain.setValueAtTime(volume * 0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') startSimulation();
    };
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
      mouseRef.current = { x: canvas.width / 2, y: canvas.height / 2 };

      tentaclesRef.current = [];
      for (let i = 0; i < TENTACLE_COUNT; i++) {
        const color = COLORS[i % COLORS.length];
        const segCount = 20 + Math.floor(Math.random() * 20); // Longer tentacles
        const segDist = 12 + Math.random() * 6; // More stretch
        tentaclesRef.current.push(
          new Tentacle(canvas.width / 2, canvas.height / 2, segCount, segDist, color)
        );
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
      if (gameState === 'playing') {
        const speed = Math.sqrt(e.movementX ** 2 + e.movementY ** 2);
        if (speed > 10) playMotionSound(Math.min(speed / 100, 1));
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) {
        mouseRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleTouchMove);
    resize();

    let animationId: number;
    const render = () => {
      time += 1;

      // Spec: rgba(30, 30, 30, 0.1) trail
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(10, 12, 15, 0.15)'; // Slightly darker deep blue/black
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.globalCompositeOperation = 'lighter';

      tentaclesRef.current.forEach((t, i) => {
        // Organic reaching behavior: some tentacles lead, some lag
        const lag = Math.sin(time * 0.02 + i) * 80;
        t.update(mouseRef.current.x + lag, mouseRef.current.y + lag, time);
        t.draw(ctx);
      });

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
    <div className="fixed inset-0 bg-[#0a0c0f] overflow-hidden select-none">
      <canvas ref={canvasRef} className="block w-full h-full" onClick={() => gameState === 'start' && startSimulation()} />

      <AnimatePresence>
        {gameState === 'start' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-auto"
            onClick={startSimulation}
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-center p-12 rounded-3xl border border-white/10 bg-zinc-900/80 shadow-2xl max-w-lg"
            >
              <div className="flex justify-center mb-6">
                <div className="p-4 bg-cyan-500/20 rounded-full">
                  <MousePointer2 className="w-10 h-10 text-cyan-400" />
                </div>
              </div>
              <h1 className="text-4xl font-black italic tracking-tighter text-white mb-4 uppercase">
                Tentacle System
              </h1>
              <p className="text-zinc-400 text-sm mb-10 leading-relaxed font-medium">
                マウスカーソルや指先に有機的な生命体が群がります。<br />
                IK（逆運動学）による滑らかな動きをお楽しみください。
              </p>

              <div className="flex flex-col gap-4">
                <button
                  className="w-full py-4 bg-white text-black font-bold uppercase tracking-widest rounded-xl hover:bg-cyan-400 transition-colors flex items-center justify-center gap-2 group"
                >
                  <Play className="group-hover:scale-110 transition-transform" fill="currentColor" size={18} />
                  Start Interaction
                </button>
                <div className="text-[10px] text-zinc-500 uppercase tracking-widest flex items-center justify-center gap-4 py-2">
                  <span>Space Key</span>
                  <span className="w-1 h-1 bg-zinc-700 rounded-full" />
                  <span>Screen Tap</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Playing HUD */}
      {gameState === 'playing' && (
        <>
          <motion.div
            initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
            className="absolute top-10 left-10 pointer-events-none mono text-[10px] text-cyan-400/60 uppercase tracking-widest"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-cyan-500 animate-pulse rounded-full" />
              <span className="font-bold">Neural_Link: Established</span>
            </div>
            <div className="flex flex-col gap-1 opacity-50">
              <div>IK_Nodes: {TENTACLE_COUNT * 20}</div>
              <div>Frequency: 60Hz</div>
            </div>
          </motion.div>

          <div className="absolute bottom-10 left-10 pointer-events-none opacity-20">
            <div className="flex items-center gap-3 text-white text-[10px] uppercase font-bold tracking-[0.3em]">
              <Info size={14} /> Mouse movement affects resonance
            </div>
          </div>
        </>
      )}

      {/* Decorative Grids */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[length:100px_100px]" />
    </div>
  );
}
