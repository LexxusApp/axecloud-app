import React from 'react';
import { motion } from 'framer-motion';

export default function LuxuryLoading() {
  return (
    <div className="flex flex-col items-center justify-center space-y-6">
      <div className="relative">
        {/* Outer Glow */}
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute inset-0 bg-primary/30 blur-3xl rounded-full"
        />
        
        {/* Spinner Rings */}
        <div className="relative w-20 h-20">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "linear",
            }}
            className="absolute inset-0 border-4 border-primary/10 border-t-primary rounded-full"
          />
          <motion.div
            animate={{ rotate: -360 }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              ease: "linear",
            }}
            className="absolute inset-2 border-2 border-primary/5 border-t-primary/40 rounded-full"
          />
          
          {/* Center Pulse */}
          <motion.div
            animate={{
              scale: [0.8, 1.1, 0.8],
              opacity: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="absolute inset-6 bg-primary rounded-full shadow-[0_0_15px_rgba(250,204,21,0.5)]"
          />
        </div>
      </div>
      
      <div className="text-center space-y-1">
        <p className="text-primary font-black tracking-[0.2em] uppercase text-xs">
          Conectando ao Axé
        </p>
        <div className="flex justify-center gap-1">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{
                opacity: [0.3, 1, 0.3],
                y: [0, -2, 0],
              }}
              transition={{
                duration: 1,
                repeat: Infinity,
                delay: i * 0.2,
              }}
              className="w-1 h-1 bg-primary rounded-full"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
