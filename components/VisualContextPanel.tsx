import React from 'react';
import { VisualContext } from '../types/visualContext';
import { TouchScrollArea } from './TouchScrollArea';
import { StatusBadge } from './StatusBadge';
import { twMerge } from 'tailwind-merge';
import { clsx } from 'clsx';

interface VisualContextPanelProps {
  context: Partial<VisualContext> | null;
  status: 'idle' | 'loading' | 'success' | 'error';
  onClose: () => void;
  className?: string;
}

export const VisualContextPanel: React.FC<VisualContextPanelProps> = ({ 
  context, 
  status, 
  onClose,
  className 
}) => {
  if (!context && status === 'idle') return null;

  return (
    <div className={twMerge(
      clsx(
        "relative h-full w-full bg-zinc-900 border-l border-zinc-800 flex flex-col",
        className
      )
    )}>
      {/* Header bar */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-md sticky top-0 z-10 shrink-0">
        <StatusBadge 
          status={status === 'loading' ? 'loading' : status === 'error' ? 'error' : status === 'success' ? 'success' : 'none'} 
          text={
            status === 'loading' ? 'Finding visual context...' :
            status === 'error' ? 'No visual found' :
            context?.imageSource === 'serpapi' ? 'Online Image' : 'Visual Context'
          }
        />
        <button 
          onClick={onClose}
          className="p-2 rounded-full hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-white"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Scrollable Content */}
      <TouchScrollArea className="flex-1 p-4 md:p-6 flex flex-col gap-6">
        {context?.imageUrl && (
          <div className="w-full flex-1 min-h-[35vh] md:min-h-[50vh] bg-zinc-950/80 rounded-2xl overflow-hidden border border-zinc-800/80 shadow-2xl flex items-center justify-center shrink-0 p-2 relative group">
            
            {/* Loading skeleton placeholder */}
            <div className="absolute inset-0 bg-zinc-800/50 animate-pulse -z-10" />

            <img 
              key={context.imageUrl}
              src={context.imageUrl} 
              alt={context.title || 'Visual context'}
              className="w-full h-full object-contain z-10 transition-opacity duration-300 opacity-0"
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onLoad={(e) => {
                (e.target as HTMLImageElement).classList.remove('opacity-0');
              }}
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                if (context.thumbnailUrl && target.src !== context.thumbnailUrl) {
                  target.src = context.thumbnailUrl;
                } else {
                  target.style.display = 'none';
                }
              }}
            />
          </div>
        )}

        <div className="flex flex-col gap-3 shrink-0 pb-10">
          {context?.title && (
            <h2 className="text-2xl font-bold text-white tracking-tight">{context.title}</h2>
          )}
          {context?.explanation && (
            <p className="text-zinc-300 text-lg leading-relaxed">{context.explanation}</p>
          )}
        </div>
      </TouchScrollArea>
    </div>
  );
};
