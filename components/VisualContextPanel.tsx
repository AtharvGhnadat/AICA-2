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
  const [imageLoaded, setImageLoaded] = React.useState(!context?.imageUrl);

  React.useEffect(() => {
    setImageLoaded(!context?.imageUrl);
  }, [context?.imageUrl]);

  if (!context && status === 'idle') return null;

  return (
    <div className={twMerge(
      clsx(
        "relative h-full w-full bg-slate-900 border-l border-white/10 flex flex-col",
        className
      )
    )}>
      {/* Header bar */}
      <div className="flex items-center justify-between p-6 border-b border-white/10 bg-slate-950/40 sticky top-0 z-10 shrink-0">
        <StatusBadge 
          status={status === 'loading' ? 'loading' : status === 'error' ? 'error' : status === 'success' ? 'success' : 'none'} 
          text={
            status === 'loading' ? 'Finding visual context...' :
            status === 'error' ? 'No visual found' :
            context?.imageSource === 'serpapi' ? 'Online Image' : 'Visual Context'
          }
        />
        <button 
          aria-label="Close image panel"
          onClick={onClose}
          className="p-3 rounded-full hover:bg-white/10 transition-colors text-slate-400 hover:text-white"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Scrollable Content */}
      <TouchScrollArea className="flex-1 p-6 md:p-12 flex flex-col items-center justify-center gap-8">
        {context?.imageUrl && (
          <div className="w-full max-w-5xl relative flex items-center justify-center rounded-[2rem] overflow-hidden bg-slate-950 shadow-[0_20px_60px_rgba(0,0,0,0.8)] shrink-0 min-h-[50vh] md:min-h-[60vh] transition-all duration-700 group border border-white/10">
            
            {/* Blurred background image effect */}
            <div 
              className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-50 blur-2xl scale-110 -z-20 transition-opacity duration-1000"
              style={{ backgroundImage: `url(${context.imageUrl})` }}
            />

            {/* Dark overlay for contrast */}
            <div className="absolute inset-0 bg-black/40 -z-10" />

            {/* Elegant Loading skeleton placeholder */}
            <div className="absolute inset-0 bg-slate-800/20 animate-pulse -z-10" />

            <img 
              key={context.imageUrl}
              src={context.imageUrl} 
              alt={context.title || 'Visual context'}
              className="w-full h-full object-contain z-10 transition-all duration-700 opacity-0 scale-95 group-hover:scale-100"
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onLoad={(e) => {
                const img = e.target as HTMLImageElement;
                img.classList.remove('opacity-0', 'scale-95');
                setImageLoaded(true);
              }}
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                if (context.thumbnailUrl && target.src !== context.thumbnailUrl) {
                  target.src = context.thumbnailUrl;
                } else {
                  target.style.display = 'none';
                  setImageLoaded(true);
                }
              }}
            />
          </div>
        )}

        <div className="flex flex-col gap-4 shrink-0 pb-12">
          {context?.title && (
            <h2 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight leading-tight transition-opacity duration-700 opacity-100">
              {context.title}
            </h2>
          )}
        </div>
      </TouchScrollArea>
    </div>
  );
};
