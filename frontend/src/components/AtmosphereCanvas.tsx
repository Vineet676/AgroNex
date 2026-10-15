import React, { useEffect, useRef } from 'react';

export type WeatherMode = 'storm' | 'mist' | 'sun' | 'cyber' | 'off';

interface AtmosphereCanvasProps {
  mode: WeatherMode;
}

interface RainDrop {
  x: number;
  y: number;
  length: number;
  speed: number;
  thickness: number;
  opacity: number;
}

interface Splash {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  opacity: number;
  speed: number;
}

interface MistParticle {
  x: number;
  y: number;
  radius: number;
  vx: number;
  vy: number;
  opacity: number;
  hue: number;
  phase: number;
}

interface SunMote {
  x: number;
  y: number;
  radius: number;
  vx: number;
  vy: number;
  baseAlpha: number;
  pulsePhase: number;
  pulseSpeed: number;
}

interface CyberStreamer {
  x: number;
  y: number;
  length: number;
  speed: number;
  charSize: number;
  opacity: number;
  glow: string;
}

export const AtmosphereCanvas: React.FC<AtmosphereCanvasProps> = ({ mode }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mousePosRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (mode === 'off') {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // --- STORM MODE STATE ---
    const rainDrops: RainDrop[] = [];
    const splashes: Splash[] = [];
    const RAIN_COUNT = Math.min(Math.floor(width / 10), 160);
    for (let i = 0; i < RAIN_COUNT; i++) {
      rainDrops.push({
        x: Math.random() * width,
        y: Math.random() * height,
        length: 18 + Math.random() * 24,
        speed: 16 + Math.random() * 14,
        thickness: 1 + Math.random() * 1.5,
        opacity: 0.25 + Math.random() * 0.45,
      });
    }
    let lightningFlash = 0;
    let nextLightningTime = Date.now() + 4000 + Math.random() * 5000;

    // --- MIST MODE STATE ---
    const mistParticles: MistParticle[] = [];
    const MIST_COUNT = Math.min(Math.floor(width / 35), 45);
    for (let i = 0; i < MIST_COUNT; i++) {
      mistParticles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: 70 + Math.random() * 140,
        vx: 0.15 + Math.random() * 0.35,
        vy: (Math.random() - 0.5) * 0.15,
        opacity: 0.08 + Math.random() * 0.12,
        hue: 155 + Math.random() * 30, // emerald to soft mint
        phase: Math.random() * Math.PI * 2,
      });
    }

    // --- SUN MODE STATE ---
    const sunMotes: SunMote[] = [];
    const MOTE_COUNT = Math.min(Math.floor(width / 20), 80);
    for (let i = 0; i < MOTE_COUNT; i++) {
      sunMotes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: 1.5 + Math.random() * 3.5,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -0.3 - Math.random() * 0.6, // gently float up
        baseAlpha: 0.3 + Math.random() * 0.5,
        pulsePhase: Math.random() * Math.PI * 2,
        pulseSpeed: 0.02 + Math.random() * 0.03,
      });
    }

    // --- CYBER MODE STATE ---
    const cyberStreamers: CyberStreamer[] = [];
    const STREAMER_COUNT = Math.min(Math.floor(width / 25), 55);
    for (let i = 0; i < STREAMER_COUNT; i++) {
      cyberStreamers.push({
        x: Math.random() * width,
        y: Math.random() * height,
        length: 40 + Math.random() * 80,
        speed: 4 + Math.random() * 8,
        charSize: 10 + Math.random() * 4,
        opacity: 0.2 + Math.random() * 0.5,
        glow: Math.random() > 0.4 ? '#10b981' : '#06b6d4',
      });
    }
    let scanLineY = 0;

    // --- ANIMATION LOOP ---
    const render = () => {
      ctx.clearRect(0, 0, width, height);

      if (mode === 'storm') {
        // --- 1. Lightning Logic ---
        const now = Date.now();
        if (now > nextLightningTime) {
          lightningFlash = 0.45; // bright flash
          nextLightningTime = now + 5000 + Math.random() * 8000;
        }
        if (lightningFlash > 0.01) {
          ctx.save();
          ctx.fillStyle = `rgba(220, 245, 255, ${lightningFlash})`;
          ctx.fillRect(0, 0, width, height);
          ctx.restore();
          lightningFlash *= 0.88; // fast decay
        }

        // --- 2. Rain Streaks with Slant ---
        ctx.save();
        ctx.strokeStyle = 'rgba(165, 215, 255, 0.45)';
        ctx.lineWidth = 1.2;
        ctx.lineCap = 'round';

        for (const drop of rainDrops) {
          drop.y += drop.speed;
          drop.x -= drop.speed * 0.22; // wind slant to bottom-left

          if (drop.y > height) {
            drop.y = -20;
            drop.x = Math.random() * (width + 200);

            // Chance to spawn splash at bottom
            if (Math.random() < 0.25) {
              splashes.push({
                x: drop.x,
                y: height - Math.random() * 15,
                radius: 1,
                maxRadius: 6 + Math.random() * 8,
                opacity: 0.5,
                speed: 0.5 + Math.random() * 0.8,
              });
            }
          }

          ctx.beginPath();
          ctx.strokeStyle = `rgba(180, 225, 255, ${drop.opacity})`;
          ctx.lineWidth = drop.thickness;
          ctx.moveTo(drop.x, drop.y);
          ctx.lineTo(drop.x - drop.length * 0.22, drop.y + drop.length);
          ctx.stroke();
        }

        // --- 3. Splash Ripples ---
        for (let i = splashes.length - 1; i >= 0; i--) {
          const s = splashes[i];
          s.radius += s.speed;
          s.opacity -= 0.025;

          if (s.opacity <= 0 || s.radius >= s.maxRadius) {
            splashes.splice(i, 1);
            continue;
          }

          ctx.beginPath();
          ctx.ellipse(s.x, s.y, s.radius * 2, s.radius * 0.6, 0, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(190, 230, 255, ${s.opacity * 0.6})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.restore();
      } else if (mode === 'mist') {
        // --- Rolling Volumetric Mist Banks ---
        ctx.save();
        const mx = mousePosRef.current.x;
        const my = mousePosRef.current.y;

        for (const p of mistParticles) {
          p.phase += 0.01;
          p.x += p.vx + Math.sin(p.phase) * 0.2;
          p.y += p.vy + Math.cos(p.phase * 0.7) * 0.15;

          // Mouse deflection
          const dx = p.x - mx;
          const dy = p.y - my;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 180 && dist > 0) {
            p.x += (dx / dist) * 0.6;
            p.y += (dy / dist) * 0.6;
          }

          if (p.x - p.radius > width) p.x = -p.radius;
          if (p.y - p.radius > height) p.y = -p.radius;
          if (p.y + p.radius < 0) p.y = height + p.radius;

          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
          grad.addColorStop(0, `hsla(${p.hue}, 60%, 75%, ${p.opacity})`);
          grad.addColorStop(0.5, `hsla(${p.hue}, 50%, 65%, ${p.opacity * 0.4})`);
          grad.addColorStop(1, 'transparent');

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      } else if (mode === 'sun') {
        // --- Volumetric God Rays & Golden Solar Motes ---
        ctx.save();

        // 1. Angular God Rays radiating from top right
        const rayGrad = ctx.createLinearGradient(width * 0.85, 0, width * 0.2, height);
        const timeFactor = Date.now() * 0.0006;
        const rayAlpha1 = 0.06 + Math.sin(timeFactor) * 0.025;
        const rayAlpha2 = 0.08 + Math.cos(timeFactor * 1.3) * 0.03;

        rayGrad.addColorStop(0, `rgba(251, 191, 36, ${rayAlpha1 + 0.05})`);
        rayGrad.addColorStop(0.4, `rgba(245, 158, 11, ${rayAlpha2})`);
        rayGrad.addColorStop(1, 'transparent');

        ctx.fillStyle = rayGrad;
        ctx.beginPath();
        ctx.moveTo(width * 0.7, 0);
        ctx.lineTo(width, 0);
        ctx.lineTo(width * 0.45, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        ctx.fill();

        // 2. Floating Golden Motes
        for (const m of sunMotes) {
          m.x += m.vx;
          m.y += m.vy;
          m.pulsePhase += m.pulseSpeed;

          if (m.y < -10) {
            m.y = height + 10;
            m.x = Math.random() * width;
          }
          if (m.x < -10) m.x = width + 10;
          if (m.x > width + 10) m.x = -10;

          const alpha = m.baseAlpha * (0.6 + 0.4 * Math.sin(m.pulsePhase));
          ctx.beginPath();
          ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(253, 224, 71, ${alpha})`;
          ctx.shadowColor = '#f59e0b';
          ctx.shadowBlur = 8;
          ctx.fill();
        }
        ctx.restore();
      } else if (mode === 'cyber') {
        // --- Cybernetic Matrix Streams & Scanning HUD Beam ---
        ctx.save();
        for (const s of cyberStreamers) {
          s.y += s.speed;
          if (s.y - s.length > height) {
            s.y = -s.length;
            s.x = Math.random() * width;
            s.speed = 4 + Math.random() * 8;
          }

          const grad = ctx.createLinearGradient(s.x, s.y - s.length, s.x, s.y);
          grad.addColorStop(0, 'transparent');
          grad.addColorStop(0.7, s.glow);
          grad.addColorStop(1, '#ffffff');

          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y - s.length);
          ctx.lineTo(s.x, s.y);
          ctx.stroke();

          // Spark head
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(s.x, s.y, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }

        // Holographic Scan line
        scanLineY = (scanLineY + 2.5) % height;
        const scanGrad = ctx.createLinearGradient(0, scanLineY - 12, 0, scanLineY + 12);
        scanGrad.addColorStop(0, 'transparent');
        scanGrad.addColorStop(0.5, 'rgba(16, 185, 129, 0.18)');
        scanGrad.addColorStop(1, 'transparent');

        ctx.fillStyle = scanGrad;
        ctx.fillRect(0, scanLineY - 12, width, 24);

        ctx.strokeStyle = 'rgba(52, 211, 153, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, scanLineY);
        ctx.lineTo(width, scanLineY);
        ctx.stroke();

        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, [mode]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 2,
        opacity: mode === 'off' ? 0 : 1,
        transition: 'opacity 0.6s ease-in-out',
      }}
    />
  );
};
