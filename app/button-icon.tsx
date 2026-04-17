"use client";

import type { ReactNode } from "react";

type ButtonIconName =
  | "upload"
  | "details"
  | "managers"
  | "route"
  | "office"
  | "review"
  | "cancel"
  | "save"
  | "load"
  | "clear"
  | "activate"
  | "edit"
  | "delete"
  | "login"
  | "logout"
  | "language"
  | "show"
  | "hide"
  | "warning"
  | "history"
  | "home"
  | "search";

export function ButtonIcon({
  name,
  className = "h-4 w-4",
}: {
  name: ButtonIconName;
  className?: string;
}) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "upload":
      return (
        <svg {...common}>
          <path d="M12 16V4" />
          <path d="m7 9 5-5 5 5" />
          <path d="M5 20h14" />
        </svg>
      );
    case "details":
      return (
        <svg {...common}>
          <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "managers":
      return (
        <svg {...common}>
          <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
          <path d="M16 13a2.5 2.5 0 1 0 0-5" />
          <path d="M3.5 19a5 5 0 0 1 9 0" />
          <path d="M14 18a4 4 0 0 1 6.5-2.8" />
        </svg>
      );
    case "route":
      return (
        <svg {...common}>
          <circle cx="6" cy="18" r="2" />
          <circle cx="18" cy="6" r="2" />
          <path d="M8 18h4a4 4 0 0 0 4-4V8" />
        </svg>
      );
    case "office":
      return (
        <svg {...common}>
          <path d="M4 20V6l8-3 8 3v14" />
          <path d="M9 20v-4h6v4" />
          <path d="M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01" />
        </svg>
      );
    case "review":
      return (
        <svg {...common}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
        </svg>
      );
    case "cancel":
      return (
        <svg {...common}>
          <path d="m6 6 12 12" />
          <path d="m18 6-12 12" />
        </svg>
      );
    case "save":
      return (
        <svg {...common}>
          <path d="M5 20h14V8l-3-3H5Z" />
          <path d="M8 20v-6h8v6" />
          <path d="M8 5h6v4H8Z" />
        </svg>
      );
    case "load":
      return (
        <svg {...common}>
          <path d="M12 4v12" />
          <path d="m7 11 5 5 5-5" />
          <path d="M5 20h14" />
        </svg>
      );
    case "clear":
      return (
        <svg {...common}>
          <path d="M4 7h16" />
          <path d="M10 11v6M14 11v6" />
          <path d="M6 7l1 13h10l1-13" />
          <path d="M9 7V4h6v3" />
        </svg>
      );
    case "activate":
      return (
        <svg {...common}>
          <path d="m5 12 4 4L19 6" />
        </svg>
      );
    case "edit":
      return (
        <svg {...common}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
        </svg>
      );
    case "delete":
      return (
        <svg {...common}>
          <path d="M4 7h16" />
          <path d="M10 11v6M14 11v6" />
          <path d="M6 7l1 13h10l1-13" />
          <path d="M9 7V4h6v3" />
        </svg>
      );
    case "login":
      return (
        <svg {...common}>
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
          <path d="M10 17l5-5-5-5" />
          <path d="M15 12H3" />
        </svg>
      );
    case "logout":
      return (
        <svg {...common}>
          <path d="M10 17l-5-5 5-5" />
          <path d="M5 12h12" />
          <path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" />
        </svg>
      );
    case "language":
      return (
        <svg {...common}>
          <path d="M3 5h12" />
          <path d="M9 3c0 5-2 9-5 12" />
          <path d="M7 13c1.5 0 4.5-.5 8-3" />
          <path d="m14 19 3-8 3 8" />
          <path d="M15 17h4" />
        </svg>
      );
    case "show":
      return (
        <svg {...common}>
          <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "hide":
      return (
        <svg {...common}>
          <path d="m3 3 18 18" />
          <path d="M10.6 10.7a3 3 0 0 0 4.2 4.2" />
          <path d="M9.9 5.1A10.6 10.6 0 0 1 12 5c6 0 9.5 7 9.5 7a17.5 17.5 0 0 1-3.2 4.2" />
          <path d="M6 6.2A17.9 17.9 0 0 0 2.5 12S6 19 12 19c1 0 1.9-.1 2.8-.4" />
        </svg>
      );
    case "warning":
      return (
        <svg {...common}>
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.3 3.8 2.9 17a2 2 0 0 0 1.8 3h14.6a2 2 0 0 0 1.8-3L13.7 3.8a2 2 0 0 0-3.4 0Z" />
        </svg>
      );
    case "history":
      return (
        <svg {...common}>
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 3v6h6" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "home":
      return (
        <svg {...common}>
          <path d="m3 10 9-7 9 7" />
          <path d="M5 9.5V20h14V9.5" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="6" />
          <path d="m20 20-4.2-4.2" />
        </svg>
      );
  }
}

export function ButtonLabel({
  icon,
  children,
  className = "gap-2",
}: {
  icon: ButtonIconName;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center justify-center ${className}`}>
      <ButtonIcon name={icon} />
      <span>{children}</span>
    </span>
  );
}
