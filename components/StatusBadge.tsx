import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface StatusBadgeProps {
  status: 'loading' | 'success' | 'error' | 'none';
  text: string;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, text, className }) => {
  if (status === 'none') return null;

  return (
    <div className={twMerge(
      clsx(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium tracking-wide border shadow-sm backdrop-blur-md",
        {
          "bg-blue-500/10 border-blue-500/20 text-blue-300": status === 'loading',
          "bg-emerald-500/10 border-emerald-500/20 text-emerald-300": status === 'success',
          "bg-red-500/10 border-red-500/20 text-red-300": status === 'error',
        },
        className
      )
    )}>
      {status === 'loading' && (
        <svg className="animate-spin -ml-1 mr-1 h-3 w-3 text-blue-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
      {status === 'success' && (
        <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
        </svg>
      )}
      {status === 'error' && (
        <svg className="w-3 h-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      )}
      {text}
    </div>
  );
};
