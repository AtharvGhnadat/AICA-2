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
    <div className="relative w-full h-full flex flex-col md:flex-row overflow-hidden bg-black">
      {/* Left/Top Panel (Robot Face) */}
      <div 
        className={twMerge(
          clsx(
            "transition-all duration-500 ease-in-out flex-shrink-0 h-full w-full",
            {
              "md:w-1/2 h-[40vh] md:h-full": isSplitView, // when split, 50% width on desktop, 40% height on mobile
              "md:w-full h-full": !isSplitView // full screen when not split
            }
          )
        )}
      >
        {leftPanel}
      </div>

      {/* Right/Bottom Panel (Visual Context) */}
      <div 
        className={twMerge(
          clsx(
            "transition-all duration-500 ease-in-out flex-shrink-0 h-full w-full bg-zinc-900 border-t md:border-t-0 md:border-l border-zinc-800",
            {
              "md:w-1/2 h-[60vh] md:h-full translate-x-0 translate-y-0 opacity-100": isSplitView,
              "md:w-0 h-0 md:h-full translate-x-full md:translate-x-full md:translate-y-0 translate-y-full opacity-0": !isSplitView
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
