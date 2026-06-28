import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DeviceStatus } from '../types';

interface FaceDisplayProps {
  status: DeviceStatus;
  color: string;
}

const EyeDisplay: React.FC<FaceDisplayProps> = ({ status, color }) => {
  const [blinkPhase, setBlinkPhase] = useState(0);
  const blinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [pupilOffset, setPupilOffset] = useState({ x: 0, y: 0 });
  const driftRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [speakScale, setSpeakScale] = useState(1);
  const speakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Blinking Logic
  const scheduleBlink = useCallback(() => {
    const delay = 2000 + Math.random() * 4000;
    blinkTimerRef.current = setTimeout(() => {
      setBlinkPhase(1); // Close
      setTimeout(() => {
        setBlinkPhase(0); // Open
        if (Math.random() < 0.25) {
          setTimeout(() => {
            setBlinkPhase(1);
            setTimeout(() => { setBlinkPhase(0); scheduleBlink(); }, 100);
          }, 150);
        } else {
          scheduleBlink();
        }
      }, 100 + Math.random() * 40);
    }, delay);
  }, []);

  useEffect(() => {
    scheduleBlink();
    return () => { if (blinkTimerRef.current) clearTimeout(blinkTimerRef.current); };
  }, [scheduleBlink]);

  // Micro-saccades
  useEffect(() => {
    const interval = status === 'listening' ? 600 : status === 'thinking' ? 1200 : 1800;
    driftRef.current = setInterval(() => {
      if (status === 'thinking') {
        // Dramatic lookup when thinking
        const lookUp = -60 - Math.random() * 20;
        const lookSide = (Math.random() > 0.5 ? 1 : -1) * (30 + Math.random() * 30);
        setPupilOffset({ x: lookSide, y: lookUp });
      } else if (status === 'listening') {
        // Tiny cute eager jiggles
        setPupilOffset({ x: (Math.random() - 0.5) * 12, y: (Math.random() - 0.5) * 12 });
      } else {
        // Normal wandering
        setPupilOffset({ x: (Math.random() - 0.5) * 30, y: (Math.random() - 0.5) * 20 });
      }
    }, interval);
    return () => { if (driftRef.current) clearInterval(driftRef.current); };
  }, [status]);

  // Speaking Animation (Hardware Accelerated)
  useEffect(() => {
    if (status === 'speaking') {
      const animateMouth = () => {
        setSpeakScale(Math.random());
        speakTimerRef.current = setTimeout(animateMouth, 100 + Math.random() * 150);
      };
      animateMouth();
    } else {
      setSpeakScale(0);
    }
    return () => { if (speakTimerRef.current) clearTimeout(speakTimerRef.current); };
  }, [status]);

  // Massive scaling for 11" Tablet Landscape
  let baseWidth = 160;
  let baseHeight = 220;
  let baseRadius = '90px';

  if (status === 'listening') {
    baseWidth = 220;
    baseHeight = 220;
    baseRadius = '50%';
  } else if (status === 'thinking') {
    baseWidth = 190;
    baseHeight = 160;
    baseRadius = '70px';
  } else if (status === 'error') {
    baseWidth = 170;
    baseHeight = 200;
    baseRadius = '75px';
  } else if (status === 'speaking') {
    baseWidth = 220;
    baseHeight = 170;
    baseRadius = '75px';
  }

  const renderEye = (side: 'left' | 'right') => {
    const isLeft = side === 'left';

    let topLidHeight = '0%';
    let topLidRotate = 0;
    let botLidHeight = '0%';
    let botLidRotate = 0;

    if (status === 'speaking') {
      botLidHeight = '40%';
      botLidRotate = isLeft ? 25 : -25;
    } else if (status === 'error') {
      topLidHeight = '40%';
      topLidRotate = isLeft ? -25 : 25;
      botLidHeight = '15%';
      botLidRotate = isLeft ? -10 : 10;
    } else if (status === 'thinking') {
      topLidHeight = isLeft ? '45%' : '15%';
      botLidHeight = '10%';
      topLidRotate = isLeft ? -10 : 10;
    } else if (status === 'listening') {
      botLidHeight = '15%';
      botLidRotate = isLeft ? 10 : -10;
    }

    return (
      <motion.div
        layout
        className="relative overflow-hidden flex-shrink-0"
        initial={false}
        animate={{
          width: baseWidth,
          height: baseHeight,
          borderRadius: baseRadius,
          x: pupilOffset.x,
          y: pupilOffset.y,
          scaleY: blinkPhase === 1 ? 0.05 : 1, // Hardware accelerated blink
          scaleX: 1,
          boxShadow: `0 0 50px ${color}99, inset 0 0 30px ${color}AA` // Enhanced premium glow
        }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        style={{ backgroundColor: color, margin: '0 80px' }} // Increased gap for 11"
      >
        {/* Lids */}
        <motion.div
          className="absolute left-[-40%] top-[-10%]"
          initial={false}
          animate={{ height: topLidHeight, rotate: topLidRotate }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
          style={{ backgroundColor: '#020617', transformOrigin: 'bottom center', zIndex: 10, width: '180%' }}
        />
        <motion.div
          className="absolute left-[-40%] bottom-[-10%]"
          initial={false}
          animate={{ height: botLidHeight, rotate: botLidRotate }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
          style={{ backgroundColor: '#020617', transformOrigin: 'top center', zIndex: 10, width: '180%' }}
        />

        {/* Highlights */}
        <motion.div
          className="absolute top-[18%] left-[22%] w-[40px] h-[55px] bg-white rounded-full"
          animate={{ opacity: status === 'error' ? 0 : 0.65, scale: status === 'listening' ? 1.2 : 1 }}
          style={{ zIndex: 5 }}
        />
        <motion.div
          className="absolute top-[40%] left-[18%] w-[15px] h-[15px] bg-white rounded-full"
          animate={{ opacity: status === 'error' ? 0 : 0.45 }}
          style={{ zIndex: 5 }}
        />
      </motion.div>
    );
  };

  return (
    <motion.div
      className="flex justify-center items-center w-full h-full bg-transparent p-10 relative"
      animate={{
        y: status === 'speaking' ? [0, -15, 0] : [0, -8, 0],
      }}
      transition={{
        duration: status === 'speaking' ? 0.8 : 3,
        repeat: Infinity,
        ease: "easeInOut"
      }}
    >
      {renderEye('left')}

      <AnimatePresence>
        {status === 'speaking' && (
          <motion.div
            className="absolute origin-top"
            style={{
              backgroundColor: color,
              y: 160, // Positioned safely below the larger 11" eyes
              boxShadow: `0 0 30px ${color}AA`,
              borderRadius: '35px',
              width: '80px', // Fixed base dimensions to prevent layout thrashing
              height: '30px'
            }}
            initial={{ opacity: 0, scaleX: 0.5, scaleY: 0 }}
            animate={{
              opacity: 1,
              // GPU accelerated scaling instead of width/height thrashing
              scaleX: 0.6 + speakScale * 0.8,
              scaleY: 0.5 + speakScale * 2.5,
            }}
            exit={{ opacity: 0, scaleX: 0.5, scaleY: 0 }}
            transition={{ type: 'spring', stiffness: 450, damping: 25 }}
          />
        )}
      </AnimatePresence>

      {renderEye('right')}
    </motion.div>
  );
};

export default EyeDisplay;
