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
        const lookUp = -40 - Math.random() * 15;
        const lookSide = (Math.random() > 0.5 ? 1 : -1) * (20 + Math.random() * 20);
        setPupilOffset({ x: lookSide, y: lookUp });
      } else if (status === 'listening') {
        // Tiny cute eager jiggles
        setPupilOffset({ x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 8 });
      } else {
        // Normal wandering
        setPupilOffset({ x: (Math.random() - 0.5) * 20, y: (Math.random() - 0.5) * 15 });
      }
    }, interval);
    return () => { if (driftRef.current) clearInterval(driftRef.current); };
  }, [status]);

  // Speaking Animation
  useEffect(() => {
    if (status === 'speaking') {
      const animateMouth = () => {
        // Values for calculating responsive width/height of the mouth pill
        setSpeakScale(Math.random());
        speakTimerRef.current = setTimeout(animateMouth, 100 + Math.random() * 150);
      };
      animateMouth();
    } else {
      setSpeakScale(0);
    }
    return () => { if (speakTimerRef.current) clearTimeout(speakTimerRef.current); };
  }, [status]);

  // Compute Eye Styles based on State
  let baseWidth = 100;
  let baseHeight = 140;
  let baseRadius = '60px';

  if (status === 'listening') {
    // Huge, excited, attentive eyes
    baseWidth = 140;
    baseHeight = 140;
    baseRadius = '50%';
  } else if (status === 'thinking') {
    // Slightly squished while pondering
    baseWidth = 120;
    baseHeight = 100;
    baseRadius = '45px';
  } else if (status === 'error') {
    // Droopy sad eyes
    baseWidth = 110;
    baseHeight = 130;
    baseRadius = '50px';
  } else if (status === 'speaking') {
    // Classic wide, smiling curved eyes
    baseWidth = 140;
    baseHeight = 110;
    baseRadius = '50px';
  }

  const renderEye = (side: 'left' | 'right') => {
    const isLeft = side === 'left';

    let topLidHeight = '0%';
    let topLidRotate = 0;
    let botLidHeight = '0%';
    let botLidRotate = 0;

    if (status === 'speaking') {
      // Extremely happy, warm smile ^ ^
      botLidHeight = '40%';
      botLidRotate = isLeft ? 25 : -25;
    } else if (status === 'error') {
      // Sad, worried, or dizzy look / \ (instead of angry rude \ /)
      topLidHeight = '40%';
      topLidRotate = isLeft ? -25 : 25;
      botLidHeight = '15%';
      botLidRotate = isLeft ? -10 : 10;
    } else if (status === 'thinking') {
      // Classic "Hmm..." raised eyebrow (asymmetrical)
      topLidHeight = isLeft ? '45%' : '15%';
      botLidHeight = '10%';
      topLidRotate = isLeft ? -10 : 10;
    } else if (status === 'listening') {
      // Gentle, attentive, eager puppy-dog smile
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
          // Only scale eyes for blinking, completely remove speakScale jitter from eyes
          scaleY: blinkPhase === 1 ? 0.05 : 1,
          scaleX: 1,
          boxShadow: "0 0 30px " + color + "AA, inset 0 0 20px " + color + "88"
        }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        style={{ backgroundColor: color, margin: '0 30px' }}
      >
        <motion.div
          className="absolute left-[-40%] top-[-10%]"
          initial={false}
          animate={{ height: topLidHeight, rotate: topLidRotate }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
          style={{ backgroundColor: '#000', transformOrigin: 'bottom center', zIndex: 10, width: '180%' }}
        />
        <motion.div
          className="absolute left-[-40%] bottom-[-10%]"
          initial={false}
          animate={{ height: botLidHeight, rotate: botLidRotate }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
          style={{ backgroundColor: '#000', transformOrigin: 'top center', zIndex: 10, width: '180%' }}
        />

        <motion.div
          className="absolute top-[18%] left-[22%] w-[25px] h-[35px] bg-white rounded-full"
          animate={{
            opacity: status === 'error' ? 0 : 0.65,
            scale: status === 'listening' ? 1.2 : 1
          }}
          style={{ zIndex: 5 }}
        />
        <motion.div
          className="absolute top-[40%] left-[18%] w-[10px] h-[10px] bg-white rounded-full"
          animate={{
            opacity: status === 'error' ? 0 : 0.45,
          }}
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
        scale: status === 'speaking' ? [1, 1.05, 1] : [1, 1.01, 1]
      }}
      transition={{
        duration: status === 'speaking' ? 0.8 : 3,
        repeat: Infinity,
        ease: "easeInOut"
      }}
    >
      {renderEye('left')}

      <AnimatePresence>
        {/* Sleek, responsive, premium product-design mouth but now cuter */}
        {status === 'speaking' && (
          <motion.div
            className="absolute"
            style={{
              backgroundColor: color,
              y: 110, // Safely distanced from eyes
              boxShadow: "0 0 20px " + color + "AA"
            }}
            initial={{ opacity: 0, height: 10, width: 30 }}
            animate={{
              opacity: 1,
              // Taller, rounder mouth (more 'O' and 'D' shapes) rather than just a flat pill
              height: 25 + speakScale * 35,
              width: 40 + speakScale * 40,
              borderRadius: '35px'
            }}
            exit={{ opacity: 0, height: 10, width: 30 }}
            transition={{ type: 'spring', stiffness: 450, damping: 25 }}
          />
        )}
      </AnimatePresence>

      {renderEye('right')}
    </motion.div>
  );
};

export default EyeDisplay;
