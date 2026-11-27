const PATHS = {
  home: 'M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10',
  history: 'M12 7v5l3 2M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 4.5v4h4',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  settings:
    'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.5-2-3.4-2.3 1a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.5 2.6a7.6 7.6 0 0 0-2.6 1.5l-2.3-1-2 3.4 2 1.5a7.6 7.6 0 0 0 0 3l-2 1.5 2 3.4 2.3-1a7.6 7.6 0 0 0 2.6 1.5l.5 2.6h4l.5-2.6a7.6 7.6 0 0 0 2.6-1.5l2.3 1 2-3.4-2-1.5Z',
  plus: 'M12 5v14M5 12h14',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  back: 'M15 5l-7 7 7 7',
  close: 'M6 6l12 12M18 6 6 18',
  timer: 'M12 8v5l3 2M9 2.5h6M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z',
  play: 'M7 4.5v15l12-7.5-12-7.5Z',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H4.5v1a3.5 3.5 0 0 0 3.5 3.5M16 6h3.5v1a3.5 3.5 0 0 1-3.5 3.5M12 13v4M8.5 20h7M10 17h4v3h-4z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4',
  chevron: 'M9 5l7 7-7 7',
  trash: 'M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v5M14 11v5',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  upload: 'M12 16V5M7 9l5-5 5 5M5 20h14',
  edit: 'M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4',
  arrowUp: 'M12 19V5M6 11l6-6 6 6',
  arrowDown: 'M12 5v14M6 13l6 6 6-6',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.700l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.700l1-1',
  swap: 'M7 7h12l-3-3M17 17H5l3 3',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  flame: 'M12 21c3.6 0 6-2.5 6-5.8 0-2.6-1.6-4.4-2.9-5.9-.9-1-1.6-2.3-1.6-4.3-2.6 1.2-4.6 3.6-4.6 6.3 0 .8.2 1.5.5 2.1-1-.3-1.8-1.2-2-2.4C6.500 12.300 6 13.700 6 15.200 6 18.500 8.400 21 12 21Z',
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  calendar: 'M4 9h16M8 3v4M16 3v4M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z',
  scale: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM8.5 9.500a5 5 0 0 1 7 0L13 12h-2L8.500 9.500Z',
  dumbbell: 'M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12',
  info: 'M12 11v6M12 7.500v.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
  shield: 'M12 3l7 3v5.500c0 4.300-2.900 7.800-7 9.500-4.100-1.700-7-5.200-7-9.500V6l7-3Z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === 'more' ? 3 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
