import React from 'react';

interface AmadalLogoProps {
  className?: string;
  variant?: 'light' | 'dark' | 'auto';
  showSubtext?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  customLogoUrl?: string;
}

export const AmadalLogo: React.FC<AmadalLogoProps> = ({
  className = '',
  variant = 'dark',
  showSubtext = false,
  size = 'md',
  customLogoUrl,
}) => {
  // If custom logo image URL is configured by the store owner
  if (customLogoUrl && customLogoUrl.trim() !== '') {
    const sizeClasses = {
      sm: 'h-6 max-w-[120px]',
      md: 'h-8 max-w-[160px]',
      lg: 'h-12 max-w-[220px]',
      xl: 'h-16 max-w-[280px]',
    }[size];

    return (
      <div className={`flex items-center ${className}`}>
        <img
          src={customLogoUrl}
          alt="AMADAL"
          className={`${sizeClasses} object-contain transition-opacity`}
        />
      </div>
    );
  }

  // Dimension scaling
  const textSizes = {
    sm: 'text-lg tracking-[0.24em]',
    md: 'text-2xl tracking-[0.26em]',
    lg: 'text-4xl tracking-[0.28em]',
    xl: 'text-5xl md:text-6xl tracking-[0.3em]',
  }[size];

  const subtextSizes = {
    sm: 'text-[8px] tracking-[0.22em]',
    md: 'text-[10px] tracking-[0.26em]',
    lg: 'text-xs tracking-[0.3em]',
    xl: 'text-sm tracking-[0.32em]',
  }[size];

  const textColor = {
    dark: 'text-neutral-950',
    light: 'text-white',
    auto: 'text-neutral-950 dark:text-white',
  }[variant];

  const subtextColor = {
    dark: 'text-neutral-500',
    light: 'text-neutral-400',
    auto: 'text-neutral-500 dark:text-neutral-400',
  }[variant];

  return (
    <div className={`inline-flex flex-col items-start select-none font-['Plus_Jakarta_Sans',sans-serif] ${className}`} dir="ltr">
      <div className="flex items-center gap-1.5">
        <span className={`font-black font-sans uppercase leading-none ${textSizes} ${textColor}`}>
          AMADAL
        </span>
      </div>
      {showSubtext && (
        <span className={`uppercase font-medium mt-1 font-sans ${subtextSizes} ${subtextColor}`}>
          CONTEMPORARY FASHION
        </span>
      )}
    </div>
  );
};
