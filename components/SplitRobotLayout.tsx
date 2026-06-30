import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface SplitRobotLayoutProps {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  isSplitView: boolean;
}

export const SplitRobotLayout: React.FC<SplitRobotLayoutProps> = ({ 
  leftPanel, 
  rightPanel, 
  isSplitView 
}) => {
  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950">
      {/* Robot Face Panel - Hidden in background when image is active */}
      <div 
        className={twMerge(
          clsx(
            "transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] absolute inset-0 w-full h-full z-0",
            {
              "opacity-0 scale-95 pointer-events-none": isSplitView,
              "opacity-100 scale-100 pointer-events-auto": !isSplitView
            }
          )
        )}
      >
        {leftPanel}
      </div>

      {/* Visual Context Panel - Fullscreen Overlay */}
      <div 
        className={twMerge(
          clsx(
            "transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] absolute inset-0 w-full h-full z-10 bg-slate-950/90 backdrop-blur-3xl",
            {
              "opacity-100 translate-y-0 pointer-events-auto": isSplitView,
              "opacity-0 translate-y-12 pointer-events-none": !isSplitView
            }
          )
        )}
      >
        <div className="w-full h-full overflow-hidden">
           {rightPanel}
        </div>
      </div>
    </div>
  );
};
