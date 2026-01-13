'use client';

import React, { useEffect, useRef } from 'react';

// --- Constants & Types ---
const TENTACLE_COUNT = 24;
const BASE_SEGMENTS = 20;
const SEGMENT_DISTANCE = 12;
const COLORS = [
  'rgba(0, 242, 255, 0.8)', // Cyan
  'rgba(0, 114, 255, 0.8)', // Deep Blue
  'rgba(182, 0, 255, 0.8)', // Purple
];

class Segment {
  x: number;
  y: number;
  angle: number = 0;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}

class Tentacle {
  segments: Segment[] = [];
  color: string;
  thickness: number;

  constructor(x: number, y: number, length: number, color: string) {
    this.color = color;
    this.thickness = 2 + Math.random() * 4;
    for (let i = 0; i < length; i++) {
      this.segments.push(new Segment(x, y));
    }
  }

  update(targetX: number, targetY: number) {
    // Lead segment follows target
    let head = this.segments[0];
    head.x = THREE_lerp(head.x, targetX, 0.1);
    head.y = THREE_lerp(head.y, targetY, 0.1);

    // Following segments
    for (let i = 1; i < this.segments.length; i++) {
      let prev = this.segments[i - 1];
      let curr = this.segments[i];

      let dx = prev.x - curr.x;
      let dy = prev.y - curr.y;
      let angle = Math.atan2(dy, dx);
      curr.angle = angle;

      curr.x = prev.x - Math.cos(angle) * SEGMENT_DISTANCE;
      curr.y = prev.y - Math.sin(angle) * SEGMENT_DISTANCE;
    }
  }

  draw(ctx: CanvasRenderingContext2D, time: number) {
    ctx.beginPath();
    ctx.moveTo(this.segments[0].x, this.segments[0].y);

    for (let i = 1; i < this.segments.length; i++) {
      // Use quadratic curve for smoothness
      const xc = (this.segments[i].x + this.segments[i - 1].x) / 2;
      const yc = (this.segments[i].y + this.segments[i - 1].y) / 2;
      ctx.quadraticCurveTo(this.segments[i - 1].x, this.segments[i - 1].y, xc, yc);
    }

    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.thickness;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Add glowing effect
    ctx.shadowBlur = 15;
    ctx.shadowColor = this.color;

    ctx.stroke();

    // Draw "head" orb
    ctx.beginPath();
    ctx.arc(this.segments[0].x, this.segments[0].y, this.thickness * 1.5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.shadowBlur = 30;
    ctx.fill();
  }
}

function THREE_lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export default function TentacleSystem() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const tentaclesRef = useRef<Tentacle[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      mouseRef.current = { x: canvas.width / 2, y: canvas.height / 2 };

      // Initialize tentacles
      tentaclesRef.current = [];
      for (let i = 0; i < TENTACLE_COUNT; i++) {
        const color = COLORS[i % COLORS.length];
        const length = BASE_SEGMENTS + Math.floor(Math.random() * 10);
        tentaclesRef.current.push(new Tentacle(canvas.width / 2, canvas.height / 2, length, color));
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
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
    let time = 0;

    const render = () => {
      time += 0.01;

      // Clear with deep trail effect
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.globalCompositeOperation = 'lighter';

      // Draw global core glow beneath tentacles
      const gradient = ctx.createRadialGradient(
        mouseRef.current.x, mouseRef.current.y, 0,
        mouseRef.current.x, mouseRef.current.y, 100
      );
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
      gradient.addColorStop(0.2, 'rgba(0, 242, 255, 0.2)');
      gradient.addColorStop(1, 'transparent');

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      tentaclesRef.current.forEach((t, i) => {
        // More organic movement noise
        const noiseX = Math.sin(time * 0.5 + i) * 60;
        const noiseY = Math.cos(time * 0.5 + i) * 60;

        t.update(mouseRef.current.x + noiseX, mouseRef.current.y + noiseY);
        t.draw(ctx, time);
      });

      // Draw main core orb on top
      ctx.shadowBlur = 40;
      ctx.shadowColor = '#0ff';
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(mouseRef.current.x, mouseRef.current.y, 4, 0, Math.PI * 2);
      ctx.fill();

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black cursor-none overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full" />

      {/* HUD Info */}
      <div className="absolute bottom-8 left-8 flex flex-col gap-1 pointer-events-none">
        <h1 className="text-cyan-400 font-bold tracking-widest text-xs uppercase">Tentacle_System_v1.0</h1>
        <div className="w-48 h-px bg-cyan-900/50" />
        <p className="text-white/20 text-[10px] uppercase mono">Procedural_IK_Simulation // Subsurface_Scattering</p>
      </div>

      <div className="absolute top-8 right-8 text-right pointer-events-none">
        <div className="text-cyan-400/50 mono text-[10px] uppercase">Active_Nodes: {TENTACLE_COUNT}</div>
        <div className="text-cyan-400/30 mono text-[10px] uppercase">Processing_Load: OPTIMAL</div>
      </div>

      {/* Retro Scanlines */}
      <div className="absolute inset-0 pointer-events-none pointer-events-none opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />
    </div>
  );
}
