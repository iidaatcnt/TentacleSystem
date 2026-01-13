'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Radio, Wind, Zap, Footprints } from 'lucide-react';

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

class Leg {
  segments: Segment[] = [];
  segLength: number;

  // IK State
  tipPos: Point;
  targetTipPos: Point;
  isStepping: boolean = false;
  stepProgress: number = 0;

  // Anatomy
  homeOffset: Point; // Default position relative to body center
  color: string;
  index: number;

  constructor(x: number, y: number, length: number, segLength: number, angle: number, dist: number, color: string, index: number) {
    this.segLength = segLength;
    this.color = color;
    this.index = index;

    // Position home point radially around the body
    this.homeOffset = {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist
    };

    for (let i = 0; i < length; i++) {
      this.segments.push(new Segment(x + this.homeOffset.x, y + this.homeOffset.y));
    }

    this.tipPos = { x: x + this.homeOffset.x, y: y + this.homeOffset.y };
    this.targetTipPos = { ...this.tipPos };
  }

  update(bodyX: number, bodyY: number, bodyAngle: number, velocity: Point, speedCfg: any) {
    // 1. Calculate World Home Position (where the leg "wants" to be)
    // Rotate home offset by body orientation
    const cos = Math.cos(bodyAngle);
    const sin = Math.sin(bodyAngle);
    const worldHomeX = bodyX + (this.homeOffset.x * cos - this.homeOffset.y * sin);
    const worldHomeY = bodyY + (this.homeOffset.x * sin + this.homeOffset.y * cos);

    // 2. Step Logic
    const distToHome = Math.sqrt((this.tipPos.x - worldHomeX) ** 2 + (this.tipPos.y - worldHomeY) ** 2);

    // Trigger step if too far from home, and not already stepping
    const stepThreshold = 80;
    if (!this.isStepping && distToHome > stepThreshold) {
      this.isStepping = true;
      this.stepProgress = 0;

      // Project new landing spot ahead based on velocity
      const reachMult = 1.5;
      this.targetTipPos = {
        x: worldHomeX + velocity.x * reachMult,
        y: worldHomeY + velocity.y * reachMult
      };
    }

    if (this.isStepping) {
      this.stepProgress += speedCfg.stepSpeed;
      if (this.stepProgress >= 1) {
        this.stepProgress = 1;
        this.isStepping = false;
        this.tipPos = { ...this.targetTipPos };
      } else {
        // Linear interpolation for X,Y + arc for "lifting" feel
        const t = this.stepProgress;
        const ease = t * t * (3 - 2 * t); // smoothstep

        // Lift height (visual only)
        // Note: we don't have Z, so we simulate it by tweaking the IK math or shadow
        this.tipPos.x = lerp(this.tipPos.x, this.targetTipPos.x, ease);
        this.tipPos.y = lerp(this.tipPos.y, this.targetTipPos.y, ease);
      }
    }

    // 3. IK Chain Update
    const last = this.segments.length - 1;

    // Anchor root to body
    this.segments[0].x = bodyX;
    this.segments[0].y = bodyY;

    // Constrain Tip to tipPos
    this.segments[last].x = this.tipPos.x;
    this.segments[last].y = this.tipPos.y;

    // Relaxation loop for IK
    for (let r = 0; r < 3; r++) {
      // Body to Tip (Root is fixed)
      for (let i = 1; i <= last; i++) {
        const prev = this.segments[i - 1];
        const curr = this.segments[i];
        const dx = curr.x - prev.x;
        const dy = curr.y - prev.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const diff = (d - this.segLength) / d;
        curr.x -= dx * diff * 0.5;
        curr.y -= dy * diff * 0.5;
      }
      // Re-fix root
      this.segments[0].x = bodyX;
      this.segments[0].y = bodyY;

      // Tip to Body (Tip is fixed to world planted spot)
      for (let i = last - 1; i >= 0; i--) {
        const next = this.segments[i + 1];
        const curr = this.segments[i];
        const dx = curr.x - next.x;
        const dy = curr.y - next.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const diff = (d - this.segLength) / d;
        curr.x -= dx * diff * 0.5;
        curr.y -= dy * diff * 0.5;
      }
      // Re-fix tip
      this.segments[last].x = this.tipPos.x;
      this.segments[last].y = this.tipPos.y;
    }
  }

  draw(ctx: CanvasRenderingContext2D, time: number) {
    const segments = this.segments;
    const count = segments.length;

    // Draw misty trail/shadow
    ctx.beginPath();
    ctx.moveTo(segments[0].x, segments[0].y);
    for (let i = 1; i < count; i++) {
      const xc = (segments[i].x + segments[i - 1].x) / 2;
      const yc = (segments[i].y + segments[i - 1].y) / 2;
      ctx.quadraticCurveTo(segments[i - 1].x, segments[i - 1].y, xc, yc);
    }
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 15;
    ctx.filter = 'blur(10px)';
    ctx.stroke();
    ctx.filter = 'none';

    // Draw Actual Leg
    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = this.color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.moveTo(segments[0].x, segments[0].y);
    for (let i = 1; i < count; i++) {
      const xc = (segments[i].x + segments[i - 1].x) / 2;
      const yc = (segments[i].y + segments[i - 1].y) / 2;
      ctx.quadraticCurveTo(segments[i - 1].x, segments[i - 1].y, xc, yc);
    }
    ctx.stroke();

    // Joints / Knuckles
    for (let i = 0; i < count; i++) {
      const ratio = 1 - (i / count);
      const size = 1 + ratio * 4;
      ctx.fillStyle = this.isStepping ? '#888' : '#222';
      ctx.beginPath();
      ctx.arc(segments[i].x, segments[i].y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ripple if planted
    if (!this.isStepping) {
      ctx.beginPath();
      const rippleScale = (Math.sin(time * 2 + this.index) + 1) * 5;
      ctx.arc(this.tipPos.x, this.tipPos.y, rippleScale, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(100, 100, 100, ${0.1 / rippleScale})`;
      ctx.stroke();
    }
  }
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

const LEG_COUNT = 7; // Asymmetric or odd number for a more alien feel
const COLORS = ['#1a1c1e', '#2c3135', '#0f1113'];

type SpeedProfile = 'slow' | 'normal' | 'fast';
const SPEEDS: Record<SpeedProfile, { bodyMove: number; stepSpeed: number; label: string }> = {
  slow: { bodyMove: 0.015, stepSpeed: 0.03, label: 'Observer (Slow)' },
  normal: { bodyMove: 0.03, stepSpeed: 0.06, label: 'Walking (Normal)' },
  fast: { bodyMove: 0.06, stepSpeed: 0.12, label: 'Pursuit (Fast)' }
};

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef<Point>({ x: 0, y: 0 });
  const bodyRef = useRef<Point & { angle: number; vx: number; vy: number }>({ x: 0, y: 0, angle: 0, vx: 0, vy: 0 });
  const legsRef = useRef<Leg[]>([]);
  const [gameState, setGameState] = useState<'start' | 'playing'>('start');
  const [speedProfile, setSpeedProfile] = useState<SpeedProfile>('normal');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let time = 0;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      bodyRef.current = { x: canvas.width / 2, y: canvas.height / 2, angle: 0, vx: 0, vy: 0 };
      mouseRef.current = { x: canvas.width / 2, y: canvas.height / 2 };

      legsRef.current = [];
      const baseDist = 50;
      for (let i = 0; i < LEG_COUNT; i++) {
        const angle = (i / LEG_COUNT) * Math.PI * 2;
        const color = COLORS[i % COLORS.length];
        const segs = 10 + Math.floor(Math.random() * 5);
        const slen = 15 + Math.random() * 5;
        legsRef.current.push(new Leg(bodyRef.current.x, bodyRef.current.y, segs, slen, angle, baseDist, color, i));
      }
    };

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', (e) => mouseRef.current = { x: e.clientX, y: e.clientY });
    resize();

    let animationId: number;
    const render = () => {
      time += 0.01;

      // Cinematic Misty Background
      // We use a desaturated greenish-gray palette like the image
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#b4bcbc'; // Mist color
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Vignette / Fog depth
      const grad = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 100,
        canvas.width / 2, canvas.height / 2, canvas.width * 0.8
      );
      grad.addColorStop(0, 'rgba(180, 188, 188, 0)');
      grad.addColorStop(1, 'rgba(50, 60, 60, 0.4)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const body = bodyRef.current;
      const target = mouseRef.current;
      const speedCfg = SPEEDS[speedProfile];

      // 1. Move Body toward Mouse
      if (gameState === 'playing') {
        const dx = target.x - body.x;
        const dy = target.y - body.y;
        const d = Math.sqrt(dx * dx + dy * dy);

        if (d > 5) {
          body.vx = dx * speedCfg.bodyMove;
          body.vy = dy * speedCfg.bodyMove;
          body.x += body.vx;
          body.y += body.vy;

          // Turn body to face movement
          const targetAngle = Math.atan2(dy, dx);
          body.angle = lerp(body.angle, targetAngle, 0.05);
        } else {
          body.vx *= 0.8;
          body.vy *= 0.8;
        }
      }

      // 2. Update Legs
      legsRef.current.forEach(leg => {
        leg.update(body.x, body.y, body.angle, { x: body.vx, y: body.vy }, speedCfg);
        leg.draw(ctx, time);
      });

      // 3. Draw Body "Hull" (The central mystery)
      ctx.save();
      ctx.translate(body.x, body.y);
      ctx.rotate(body.angle);

      // Shadow / Mist around body
      ctx.shadowBlur = 40;
      ctx.shadowColor = 'rgba(0,0,0,0.5)';

      // Silhouette body
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.ellipse(0, 0, 40, 30, 0, 0, Math.PI * 2);
      ctx.fill();

      // Highlights
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.restore();

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, [gameState, speedProfile]);

  return (
    <div className="fixed inset-0 bg-[#b4bcbc] overflow-hidden select-none touch-none">
      <canvas ref={canvasRef} className="block w-full h-full" />

      <AnimatePresence>
        {gameState === 'start' && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-xl"
          >
            <div className="text-center p-12 max-w-lg border border-white/5 bg-zinc-900/40 rounded-[3rem]">
              <div className="flex justify-center mb-8">
                <div className="p-6 bg-white/5 rounded-full border border-white/10">
                  <Radio className="w-16 h-16 text-zinc-400 animate-pulse" />
                </div>
              </div>
              <h1 className="text-5xl font-black text-white mb-4 uppercase tracking-[-0.05em] leading-none">
                Heptapod_A
              </h1>
              <p className="text-zinc-500 mb-10 text-xs mono uppercase tracking-widest leading-relaxed">
                [Top-Down Simulation] // Biological Stance & Gait<br />
                Locomotion via Radial Inverse Kinematics
              </p>

              <div className="grid grid-cols-3 gap-3 mb-10">
                {(Object.keys(SPEEDS) as SpeedProfile[]).map((sp) => (
                  <button
                    key={sp}
                    onClick={() => setSpeedProfile(sp)}
                    className={`p-4 rounded-2xl border transition-all flex flex-col items-center gap-2 ${speedProfile === sp
                        ? 'bg-white text-black border-white shadow-2xl'
                        : 'bg-zinc-800/50 border-white/5 text-zinc-500 hover:border-white/10'
                      }`}
                  >
                    {sp === 'slow' && <Wind size={20} />}
                    {sp === 'normal' && <Footprints size={20} />}
                    {sp === 'fast' && <Zap size={20} />}
                    <span className="font-bold text-[9px] uppercase tracking-tighter">{sp}</span>
                  </button>
                ))}
              </div>

              <button
                onClick={() => setGameState('playing')}
                className="w-full py-5 bg-white text-black font-black uppercase tracking-[0.2em] rounded-2xl hover:bg-neutral-200 transition-all active:scale-[0.98] text-sm"
              >
                Initiate Contact
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute top-10 left-10 pointer-events-none opacity-40 mix-blend-difference">
        <div className="mono text-[10px] text-white flex items-center gap-2 mb-2">
          <div className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
          OBSERVATION_STATUS: ACTIVE
        </div>
        <div className="h-px w-48 bg-white/20" />
      </div>

      {gameState === 'playing' && (
        <div className="absolute bottom-10 inset-x-0 flex justify-center pointer-events-none">
          <div className="px-6 py-2 bg-black/80 backdrop-blur-xl rounded-full border border-white/10 flex items-center gap-8 shadow-2xl">
            {(Object.keys(SPEEDS) as SpeedProfile[]).map((sp) => (
              <button
                key={sp}
                onClick={() => setSpeedProfile(sp)}
                className={`pointer-events-auto text-[9px] font-black uppercase tracking-widest transition-colors ${speedProfile === sp ? 'text-white' : 'text-zinc-600 hover:text-zinc-400'
                  }`}
              >
                {sp}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Dynamic Fog Overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-10 bg-[url('https://www.transparenttextures.com/patterns/asfalt-dark.png')] mix-blend-overlay" />
    </div>
  );
}
