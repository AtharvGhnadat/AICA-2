import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface TouchScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const TouchScrollArea: React.FC<TouchScrollAreaProps> = ({ children, className, ...props }) => {
  return (
    <div 
      className={twMerge(
        clsx(
          "touch-scroll no-scrollbar h-full w-full",
          className
        )
      )} 
      {...props}
    >
      {children}
    </div>
  );
};
