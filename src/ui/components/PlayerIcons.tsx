import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { readonly title?: string };

function Svg({ title, children, className = 'h-7 w-7', ...rest }: IconProps & { children: ReactNode }): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export function IconPlay(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <polygon points="6 4 20 12 6 20 6 4" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconPause(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
      <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconSkipBack(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <path d="M11 7L4 12l7 5V7z" fill="currentColor" stroke="none" />
      <path d="M18 7L11 12l7 5V7z" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconSkipForward(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <path d="M13 7l7 5-7 5V7z" fill="currentColor" stroke="none" />
      <path d="M6 7l7 5-7 5V7z" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Circular skip with seconds label in the center (Netflix-style). */
export function IconRewind30({ className = 'h-12 w-12', ...rest }: IconProps): ReactNode {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden {...rest}>
      <circle cx="24" cy="24" r="18" stroke="currentColor" strokeWidth="2.5" />
      <path
        d="M14 18v-5h5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 13a14 14 0 1 1-2.5 12"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <text
        x="24"
        y="28"
        textAnchor="middle"
        fill="currentColor"
        fontSize="11"
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
      >
        30
      </text>
    </svg>
  );
}

export function IconForward30({ className = 'h-12 w-12', ...rest }: IconProps): ReactNode {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden {...rest}>
      <circle cx="24" cy="24" r="18" stroke="currentColor" strokeWidth="2.5" />
      <path
        d="M34 18v-5h-5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M34 13a14 14 0 1 0 2.5 12"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <text
        x="24"
        y="28"
        textAnchor="middle"
        fill="currentColor"
        fontSize="11"
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
      >
        30
      </text>
    </svg>
  );
}

export function IconBack(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <path d="M15 18l-6-6 6-6" />
      <path d="M9 12h11" />
    </Svg>
  );
}

export function IconStar({ filled = false, ...props }: IconProps & { filled?: boolean }): ReactNode {
  return (
    <Svg {...props}>
      <polygon
        points="12 3 14.9 9.3 22 9.9 16.5 14.5 18.2 21.5 12 17.8 5.8 21.5 7.5 14.5 2 9.9 9.1 9.3 12 3"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 2}
      />
    </Svg>
  );
}

export function IconEyeOff(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.9 5.1A10.5 10.5 0 0 1 12 5c5 0 9.3 3.1 11 7-1 2.2-2.6 4-4.6 5.3" />
      <path d="M6.1 6.1C4.2 7.4 2.7 9.3 1.7 12c1.7 3.9 6 7 10.3 7 1.4 0 2.7-.3 3.9-.7" />
    </Svg>
  );
}

export function IconRetry(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <path d="M21 12a9 9 0 1 1-2.6-6.2" />
      <path d="M21 4v6h-6" />
    </Svg>
  );
}

export function IconVolume({ className = 'h-7 w-7', ...rest }: IconProps): ReactNode {
  return (
    <Svg className={className} {...rest}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M19 5a9 9 0 0 1 0 14" />
    </Svg>
  );
}

export function IconVolumeMute({ className = 'h-7 w-7', ...rest }: IconProps): ReactNode {
  return (
    <Svg className={className} {...rest}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
      <path d="M23 9l-6 6" />
      <path d="M17 9l6 6" />
    </Svg>
  );
}

export function IconChannelUp(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <path d="M12 19V5" />
      <path d="M5 12l7-7 7 7" />
    </Svg>
  );
}

export function IconChannelDown(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <path d="M12 5v14" />
      <path d="M19 12l-7 7-7-7" />
    </Svg>
  );
}

export function IconAspect(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18" />
    </Svg>
  );
}

export function IconStop(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconInfo(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </Svg>
  );
}

export function IconLive(props: IconProps): ReactNode {
  return (
    <Svg {...props} className={props.className ?? 'h-4 w-4'}>
      <circle cx="12" cy="12" r="5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="9" />
    </Svg>
  );
}

export function IconFullscreen(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <path d="M3 9V5a2 2 0 0 1 2-2h4" />
      <path d="M21 9V5a2 2 0 0 0-2-2h-4" />
      <path d="M3 15v4a2 2 0 0 0 2 2h4" />
      <path d="M21 15v4a2 2 0 0 1-2 2h-4" />
    </Svg>
  );
}

export function IconFullscreenExit(props: IconProps): ReactNode {
  return (
    <Svg {...props}>
      <path d="M9 3v4a2 2 0 0 1-2 2H3" />
      <path d="M15 3v4a2 2 0 0 0 2 2h4" />
      <path d="M9 21v-4a2 2 0 0 0-2-2H3" />
      <path d="M15 21v-4a2 2 0 0 1 2-2h4" />
    </Svg>
  );
}
