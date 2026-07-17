type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="24" cy="24" fill="#f2c84b" r="24" />
      <path
        d="M37.5 8.5c-3.4 4.6-5.2 9.5-5.2 14.8 0 6.5 2.7 11.9 7.6 16.3"
        fill="none"
        stroke="#fffaf0"
        strokeLinecap="round"
        strokeWidth="3.2"
      />
      <g fill="none" stroke="#17324d" strokeLinecap="round">
        <ellipse
          cx="19.2"
          cy="18.5"
          rx="7.1"
          ry="8.9"
          strokeWidth="3.2"
          transform="rotate(-38 19.2 18.5)"
        />
        <path d="m24.4 25.6 9.4 10.8" strokeWidth="4" />
        <path d="m31.5 34 3.8-3.3" stroke="#e56f51" strokeWidth="4.5" />
      </g>
      <circle cx="35.3" cy="13.3" fill="#17324d" r="2.2" />
    </svg>
  );
}
