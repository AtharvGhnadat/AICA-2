
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DeviceStatus } from '../types';

interface FaceDisplayProps {
  status: DeviceStatus;
  color: string;
}

// ─── Mouth shapes — scaled large for 7" display ─────────────────────────────
const MOUTH_SHAPES = {
  closed:   'M -50 0 Q -25 12, 0 10 Q 25 12, 50 0',
  speak1:   'M -46 -6 Q -23 22, 0 26 Q 23 22, 46 -6 Q 23 -12, 0 -12 Q -23 -12, -46 -6',
  speak2:   'M -40 -4 Q -20 32, 0 36 Q 20 32, 40 -4 Q 20 -10, 0 -10 Q -20 -10, -40 -4',
  speak3:   'M -44 -2 Q -22 14, 0 16 Q 22 14, 44 -2 Q 22 -8, 0 -7 Q -22 -8, -44 -2',
  speak4:   'M -36 -5 Q -18 38, 0 44 Q 18 38, 36 -5 Q 18 -11, 0 -11 Q -18 -11, -36 -5',
  thinking: 'M -28 0 Q -14 6, 0 6 Q 14 6, 28 0',
  error:    'M -36 0 L 36 0',
  idle:     'M -40 0 Q -20 8, 0 7 Q 20 8, 40 0',
};

const SPEAK_SEQUENCE = [
  MOUTH_SHAPES.speak1,
  MOUTH_SHAPES.speak3,
  MOUTH_SHAPES.speak2,
  MOUTH_SHAPES.speak4,
  MOUTH_SHAPES.speak1,
  MOUTH_SHAPES.speak3,
  MOUTH_SHAPES.speak2,
];

// ─── Eye geometry constants (all for a single massive eye in 800×600 viewBox) ────────
const CX = 400;   // Eye center X
const CY = 300;   // Eye center Y
const EYE_RX = 280; // Eye white ellipse X radius (massive)
const EYE_RY = 180;  // Eye white ellipse Y radius
const IRIS_R = 90;   // Iris radius
const PUPIL_R = 40;  // Pupil radius
const LIMBAL_R = 94; // Limbal ring (dark ring around iris)

// ─── Component ────────────────────────────────────────────────────────────────

const EyeDisplay: React.FC<FaceDisplayProps> = ({ status, color }) => {
  // ─── Blink ──────────────────────────────────────────────────────────────
  const [blinkPhase, setBlinkPhase] = useState(0); // 0=open, 1=closed
  const blinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Pupil micro-drift ─────────────────────────────────────────────────
  const [pupilOffset, setPupilOffset] = useState({ x: 0, y: 0 });
  const driftRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Mouth ─────────────────────────────────────────────────────────────
  const [mouthPath, setMouthPath] = useState(MOUTH_SHAPES.idle);
  const mouthIdxRef = useRef(0);
  const mouthTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Natural human blinking ────────────────────────────────────────────
  const scheduleBlink = useCallback(() => {
    const delay = 2000 + Math.random() * 4000; // 2–6s between blinks
    blinkTimerRef.current = setTimeout(() => {
      if (status === 'error') { scheduleBlink(); return; }
      // Close
      setBlinkPhase(1);
      // Open after 100-140ms (human blink duration)
      setTimeout(() => {
        setBlinkPhase(0);
        // 25% chance of double blink
        if (Math.random() < 0.25) {
          setTimeout(() => {
            setBlinkPhase(1);
            setTimeout(() => { setBlinkPhase(0); scheduleBlink(); }, 110);
          }, 160);
        } else {
          scheduleBlink();
        }
      }, 100 + Math.random() * 40);
    }, delay);
  }, [status]);

  useEffect(() => {
    scheduleBlink();
    return () => { if (blinkTimerRef.current) clearTimeout(blinkTimerRef.current); };
  }, [scheduleBlink]);

  // ─── Pupil drift — realistic micro-saccades ───────────────────────────
  useEffect(() => {
    const interval = status === 'listening' ? 600 : status === 'thinking' ? 2000 : 1200;
    driftRef.current = setInterval(() => {
      if (status === 'listening') {
        setPupilOffset({ x: (Math.random() - 0.5) * 14, y: (Math.random() - 0.5) * 8 });
      } else if (status === 'thinking') {
        setPupilOffset({ x: 6 + Math.random() * 4, y: -5 + Math.random() * 3 });
      } else if (status === 'speaking') {
        setPupilOffset({ x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 4 });
      } else {
        setPupilOffset({ x: (Math.random() - 0.5) * 5, y: (Math.random() - 0.5) * 3 });
      }
    }, interval);
    return () => { if (driftRef.current) clearInterval(driftRef.current); };
  }, [status]);

  // ─── Mouth animation ──────────────────────────────────────────────────
  useEffect(() => {
    const clearMouthTimer = () => {
      if (mouthTimerRef.current) { clearTimeout(mouthTimerRef.current); mouthTimerRef.current = null; }
    };
    if (status === 'speaking') {
      const animateMouth = () => {
        mouthIdxRef.current = (mouthIdxRef.current + 1) % SPEAK_SEQUENCE.length;
        setMouthPath(SPEAK_SEQUENCE[mouthIdxRef.current]);
        mouthTimerRef.current = setTimeout(animateMouth, 70 + Math.random() * 100);
      };
      animateMouth();
      return clearMouthTimer;
    } else if (status === 'thinking') {
      setMouthPath(MOUTH_SHAPES.thinking);
    } else if (status === 'error') {
      setMouthPath(MOUTH_SHAPES.error);
    } else if (status === 'listening') {
      setMouthPath(MOUTH_SHAPES.closed);
    } else {
      setMouthPath(MOUTH_SHAPES.idle);
    }
    return clearMouthTimer;
  }, [status]);

  // ─── Derived values ───────────────────────────────────────────────────
  const isError = status === 'error';
  const eyeColor = isError ? '#ef4444' : color;
  const glowIntensity = status === 'speaking' ? 0.8 : status === 'listening' ? 0.55 : status === 'thinking' ? 0.4 : 0.25;
  const pupilScale = status === 'listening' ? 1.2 : status === 'speaking' ? 1.08 : status === 'thinking' ? 0.8 : 1;
  const breathClass = status === 'idle' ? 'emo-breathe' : '';

  // ─── Eyelid open amount (for clipPath) ─────────────────────────
  // When blinkPhase=0 → fully open; blinkPhase=1 → fully shut
  const lidCloseFactor = blinkPhase * 0.97;
  const lidOpenRY = EYE_RY * (1 - lidCloseFactor);

  // ─── Render single massive eye ────────────────────────────
  const renderEye = () => {
    const px = pupilOffset.x;
    const py = pupilOffset.y;

    return (
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 800 600"
        className="overflow-visible absolute inset-0 m-auto max-w-[800px] max-h-[600px] w-full h-full"
      >
        <defs>
          {/* Sclera gradient — slightly warm white with vein-like edges */}
          <radialGradient id={`sclera`} cx="50%" cy="48%" r="55%">
            <stop offset="0%" stopColor="#f8f6f4" />
            <stop offset="75%" stopColor="#f0ece8" />
            <stop offset="100%" stopColor="#e0d8d0" />
          </radialGradient>

          {/* Iris gradient — multi-stop for depth */}
          <radialGradient id={`iris`} cx="48%" cy="42%" r="50%">
            <stop offset="0%" stopColor={eyeColor} stopOpacity="0.7" />
            <stop offset="30%" stopColor={eyeColor} stopOpacity="0.95" />
            <stop offset="70%" stopColor={eyeColor} stopOpacity="1" />
            <stop offset="100%" stopColor={isError ? '#7f1d1d' : `${eyeColor}99`} />
          </radialGradient>

          {/* Eye-shape clip path — the "eyelid opening" */}
          <clipPath id={`eye-clip`}>
            <ellipse
              cx={CX}
              cy={CY}
              rx={EYE_RX - 2}
              ry={lidOpenRY}
              style={{ transition: 'ry 0.12s cubic-bezier(0.4, 0, 0.2, 1)' }}
            />
          </clipPath>

          {/* Glow filter for speaking rings */}
          <filter id="ring-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="15" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ═══ Speaking Rings (Audio Ripple Effect) ═══ */}
        {status === 'speaking' && [1.2, 1.5, 1.8].map((scale, i) => (
          <ellipse
            key={`ring-${i}`}
            cx={CX} cy={CY}
            rx={EYE_RX * scale} ry={EYE_RY * scale}
            fill="none"
            stroke={eyeColor}
            strokeWidth="3"
            opacity={0}
            filter="url(#ring-glow)"
            style={{
              animation: `ripple 2s infinite ease-out ${i * 0.6}s`
            }}
          />
        ))}

        {/* ═══ Outer glow ═══ */}
        <ellipse
          cx={CX} cy={CY} rx={EYE_RX + 20} ry={EYE_RY + 20}
          fill="none"
          stroke={eyeColor}
          strokeWidth="2"
          opacity={glowIntensity * 0.3}
          style={{ filter: `blur(20px)` }}
        />

        {/* ═══ Eye outline (lid border) ═══ */}
        <ellipse
          cx={CX} cy={CY} rx={EYE_RX} ry={EYE_RY}
          fill="none"
          stroke={eyeColor}
          strokeWidth="6"
          opacity="0.6"
          style={{
            filter: `drop-shadow(0 0 ${20 * glowIntensity}px ${eyeColor})`,
          }}
        />

        {/* ═══ Clipped eye contents (hidden by eyelid when blinking) ═══ */}
        <g clipPath={`url(#eye-clip)`}>

          {/* Sclera (white of the eye) */}
          <ellipse
            cx={CX} cy={CY} rx={EYE_RX - 4} ry={EYE_RY - 4}
            fill={`url(#sclera)`}
            opacity="0.15"
          />

          {/* Subtle blood vessel lines at edges */}
          <ellipse
            cx={CX} cy={CY} rx={EYE_RX - 8} ry={EYE_RY - 8}
            fill="none"
            stroke={`${eyeColor}15`}
            strokeWidth="30"
            opacity="0.3"
          />

          {/* ─── Limbal ring (dark ring around iris) ─── */}
          <circle
            cx={CX + px * 2.5}
            cy={CY + py * 2.5}
            r={LIMBAL_R * pupilScale}
            fill="none"
            stroke={isError ? '#991b1b' : `${eyeColor}66`}
            strokeWidth="5"
            opacity="0.7"
            style={{ transition: 'cx 0.35s ease-out, cy 0.35s ease-out, r 0.4s ease' }}
          />

          {/* ─── Iris ─── */}
          <circle
            cx={CX + px * 2.5}
            cy={CY + py * 2.5}
            r={IRIS_R * pupilScale}
            fill={`url(#iris)`}
            style={{ transition: 'cx 0.35s ease-out, cy 0.35s ease-out, r 0.4s ease' }}
          />

          {/* ─── Iris detail rings (fibrous texture) ─── */}
          {[0.45, 0.65, 0.82].map((rFactor, i) => (
            <circle
              key={i}
              cx={CX + px * 2.5}
              cy={CY + py * 2.5}
              r={IRIS_R * pupilScale * rFactor}
              fill="none"
              stroke={eyeColor}
              strokeWidth="1"
              opacity={0.2 + i * 0.1}
              style={{ transition: 'cx 0.35s ease-out, cy 0.35s ease-out, r 0.4s ease' }}
            />
          ))}

          {/* ─── Pupil (deep black center) ─── */}
          <circle
            cx={CX + px * 1.3}
            cy={CY + py * 1.3}
            r={PUPIL_R * pupilScale}
            fill={isError ? '#1c0a0a' : '#050505'}
            style={{ transition: 'cx 0.35s ease-out, cy 0.35s ease-out, r 0.4s ease' }}
          />

          {/* ─── Pupil inner shadow ─── */}
          <circle
            cx={CX + px * 1.3}
            cy={CY + py * 1.3}
            r={PUPIL_R * pupilScale * 0.6}
            fill="#000000"
            opacity="0.4"
            style={{ transition: 'cx 0.35s ease-out, cy 0.35s ease-out' }}
          />

          {/* ─── Specular highlight — large crescent ─── */}
          <ellipse
            cx={CX - 16 + px * 0.3}
            cy={CY - 18 + py * 0.2}
            rx="14"
            ry="10"
            fill="white"
            opacity="0.9"
            style={{ transition: 'cx 0.35s ease-out, cy 0.35s ease-out' }}
          />

          {/* ─── Specular highlight — small dot ─── */}
          <circle
            cx={CX + 12 + px * 0.2}
            cy={CY + 14 + py * 0.2}
            r="5"
            fill="white"
            opacity="0.45"
            style={{ transition: 'cx 0.35s ease-out, cy 0.35s ease-out' }}
          />

          {/* ─── Specular — tiny accent ─── */}
          <circle
            cx={CX - 8 + px * 0.15}
            cy={CY - 26 + py * 0.1}
            r="3"
            fill="white"
            opacity="0.6"
            style={{ transition: 'cx 0.35s ease-out, cy 0.35s ease-out' }}
          />

          {/* ─── Upper inner shadow (eyelid shadow on sclera) ─── */}
          <ellipse
            cx={CX} cy={CY - EYE_RY * 0.55}
            rx={EYE_RX - 10} ry={30}
            fill="black"
            opacity="0.08"
          />
        </g>

        {/* ═══ Eyelid skin (covers the eye when blinking) ═══ */}
        {/* Upper eyelid */}
        <path
          d={`
            M ${CX - EYE_RX - 5} ${CY}
            Q ${CX - EYE_RX * 0.5} ${CY - EYE_RY - 30}, ${CX} ${CY - EYE_RY - 35}
            Q ${CX + EYE_RX * 0.5} ${CY - EYE_RY - 30}, ${CX + EYE_RX + 5} ${CY}
            Q ${CX + EYE_RX * 0.3} ${CY - lidOpenRY * 0.8}, ${CX} ${CY - lidOpenRY}
            Q ${CX - EYE_RX * 0.3} ${CY - lidOpenRY * 0.8}, ${CX - EYE_RX - 5} ${CY}
            Z
          `}
          fill="#0a0a0a"
          stroke={`${eyeColor}22`}
          strokeWidth="1"
          style={{ transition: 'all 0.12s cubic-bezier(0.4, 0, 0.2, 1)' }}
        />

        {/* Lower eyelid (subtle) */}
        <path
          d={`
            M ${CX - EYE_RX - 5} ${CY}
            Q ${CX - EYE_RX * 0.5} ${CY + EYE_RY + 25}, ${CX} ${CY + EYE_RY + 30}
            Q ${CX + EYE_RX * 0.5} ${CY + EYE_RY + 25}, ${CX + EYE_RX + 5} ${CY}
            Q ${CX + EYE_RX * 0.3} ${CY + lidOpenRY * 0.85}, ${CX} ${CY + lidOpenRY}
            Q ${CX - EYE_RX * 0.3} ${CY + lidOpenRY * 0.85}, ${CX - EYE_RX - 5} ${CY}
            Z
          `}
          fill="#0a0a0a"
          stroke={`${eyeColor}11`}
          strokeWidth="0.5"
          style={{ transition: 'all 0.12s cubic-bezier(0.4, 0, 0.2, 1)' }}
        />

        {/* ═══ Eyelid crease line (upper) ═══ */}
        <path
          d={`
            M ${CX - EYE_RX + 10} ${CY - lidOpenRY - 8}
            Q ${CX} ${CY - lidOpenRY - 18}, ${CX + EYE_RX - 10} ${CY - lidOpenRY - 8}
          `}
          fill="none"
          stroke={`${eyeColor}18`}
          strokeWidth="1.5"
          style={{ transition: 'all 0.12s cubic-bezier(0.4, 0, 0.2, 1)' }}
        />

        {/* ═══ Lash line (top of visible eye) ═══ */}
        <ellipse
          cx={CX} cy={CY}
          rx={EYE_RX}
          ry={lidOpenRY}
          fill="none"
          stroke={eyeColor}
          strokeWidth="2"
          opacity="0.5"
          style={{
            transition: 'ry 0.12s cubic-bezier(0.4, 0, 0.2, 1)',
            filter: `drop-shadow(0 0 ${6 * glowIntensity}px ${eyeColor})`,
          }}
        />
      </svg>
    );
  };

  // ─── Render mouth (large, expressive) ─────────────────────────────────
  const renderMouth = () => {
    const mouthColor = isError ? '#ef4444' : color;
    const isSpeaking = status === 'speaking';
    const isOpen = isSpeaking && (
      mouthPath === MOUTH_SHAPES.speak1 ||
      mouthPath === MOUTH_SHAPES.speak2 ||
      mouthPath === MOUTH_SHAPES.speak4
    );

    return (
      <svg width="280" height="100" viewBox="-70 -30 140 70" className="overflow-visible">
        <defs>
          <filter id="mouth-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Mouth interior glow when speaking */}
        {isSpeaking && (
          <path
            d={mouthPath}
            fill={isOpen ? `${mouthColor}18` : 'transparent'}
            style={{ transition: 'd 0.07s ease-out, fill 0.07s ease' }}
          />
        )}

        {/* Main lip line */}
        <path
          d={mouthPath}
          fill="none"
          stroke={mouthColor}
          strokeWidth={isSpeaking ? '3.5' : '2.5'}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={isError ? 0.5 : 0.85}
          filter={isSpeaking ? 'url(#mouth-glow)' : undefined}
          style={{
            transition: 'd 0.07s ease-out',
            filter: `drop-shadow(0 0 ${isSpeaking ? 14 : 6}px ${mouthColor}${isSpeaking ? '88' : '44'})`,
          }}
        />

        {/* Secondary lip highlight (upper lip) */}
        <path
          d={mouthPath}
          fill="none"
          stroke={mouthColor}
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.2"
          transform="translate(0, -3)"
          style={{ transition: 'd 0.07s ease-out' }}
        />
      </svg>
    );
  };

  return (
    <div className={`flex flex-col items-center select-none ${breathClass}`}>
      <div className="relative flex flex-col items-center">

        {/* Ambient halo behind face */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: '600px',
            height: '500px',
            top: '45%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: `radial-gradient(ellipse, ${color}0a 0%, ${color}04 40%, transparent 70%)`,
            transition: 'all 1s ease',
          }}
        />

        {/* Eyes row — large with tight gap */}
        <div className="flex items-center gap-0 relative z-10" style={{ marginLeft: '-10px', marginRight: '-10px' }}>
          {renderEye(false)}
          {renderEye(true)}
        </div>

        {/* Mouth — positioned close below eyes */}
        <div className="relative z-10" style={{ marginTop: '-20px' }}>
          {renderMouth()}
        </div>
      </div>

      <style>{`
        @keyframes emo-breathe-frames {
          0%, 100% { transform: scale(1) translateY(0); }
          50% { transform: scale(1.008) translateY(-1.5px); }
        }
        .emo-breathe {
          animation: emo-breathe-frames 4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default EyeDisplay;
