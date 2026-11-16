import type { SVGProps } from "react";
import { rank_division, rank_tier, ow_ranks } from "../logic/defines";

export const ROLE_COLORS: Record<string, string> = {
  tank: "#7fb2ff",
  dps: "#ff8d5c",
  support: "#5ce8ad",
};

const ROLE_SVG: Record<string, string> = {
  tank: `<path d="M12 2.2 20.5 5v6.3c0 5-3.6 9-8.5 10.5C7.1 20.3 3.5 16.3 3.5 11.3V5Z" fill="currentColor" opacity=".22"/><path d="M12 2.2 20.5 5v6.3c0 5-3.6 9-8.5 10.5C7.1 20.3 3.5 16.3 3.5 11.3V5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 6.5v11M8 9.5h8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`,
  dps: `<circle cx="12" cy="12" r="7.2" fill="currentColor" opacity=".18"/><circle cx="12" cy="12" r="7.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 1.8v5M12 17.2v5M1.8 12h5M17.2 12h5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="12" r="1.9" fill="currentColor"/>`,
  support: `<path d="M12 2.5 21.5 12 12 21.5 2.5 12Z" fill="currentColor" opacity=".2"/><path d="M12 2.5 21.5 12 12 21.5 2.5 12Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 7.2v9.6M7.2 12h9.6" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>`,
};

export function roleSvgString(role: string, size: number, color = ROLE_COLORS[role] ?? "#fff") {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" style="color:${color}" color="${color}">${ROLE_SVG[role] ?? ""}</svg>`;
}

export function RoleIcon({ role, size = 18, className, color, title }: { role: string; size?: number; className?: string; color?: string; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      style={{ color: color ?? ROLE_COLORS[role] }}
      role="img"
      aria-label={title ?? role}
      dangerouslySetInnerHTML={{ __html: (title ? `<title>${title}</title>` : "") + (ROLE_SVG[role] ?? "") }}
    />
  );
}

const HEX = "M32 3 57.1 17.5v29L32 61 6.9 46.5v-29Z";
const HEX_INNER = "M32 11 50.2 21.5v21L32 53 13.8 42.5v-21Z";

function rankShapes(tierIndex: number, id: string, c1: string, c2: string, division: number | null) {
  const unranked = tierIndex === 0;
  const fins =
    tierIndex >= 6
      ? `<path d="M6.9 22 0 18l2.5 14L6.9 35ZM57.1 22 64 18l-2.5 14-4.4 3Z" fill="url(#${id}g)" opacity=".95"/>`
      : tierIndex >= 4
        ? `<path d="M6.9 25 2 23l1.5 9 3.4 2ZM57.1 25 62 23l-1.5 9-3.4 2Z" fill="url(#${id}g)" opacity=".85"/>`
        : "";
  const crown =
    tierIndex >= 8
      ? `<path d="M22 4 26 -2 32 2 38 -2 42 4 32 9Z" fill="url(#${id}g)"/>`
      : tierIndex >= 7
        ? `<path d="M26 4 32 -1 38 4 32 8Z" fill="url(#${id}g)"/>`
        : "";
  const label = unranked ? "–" : division ? String(division) : "";
  return `
  <defs>
    <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
    <linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
  </defs>
  ${fins}${crown}
  <path d="${HEX}" fill="${unranked ? "#141b2c" : `url(#${id}g)`}" stroke="${unranked ? "#4a5675" : c1}" stroke-width="2.5"/>
  <path d="${HEX_INNER}" fill="${unranked ? "none" : "#0b1122"}" fill-opacity=".55" stroke="${unranked ? "#3a4560" : "#fff"}" stroke-opacity="${unranked ? 1 : 0.35}" stroke-width="1.5"/>
  ${unranked ? "" : `<path d="M32 3 57.1 17.5 32 32 6.9 17.5Z" fill="url(#${id}s)" opacity=".5"/>`}
  ${label ? `<text x="32" y="41.5" text-anchor="middle" font-family="Saira Condensed, Arial Narrow, sans-serif" font-weight="800" font-size="26" fill="${unranked ? "#6b7896" : "#fff"}">${label}</text>` : ""}`;
}

let rankSeq = 0;

export function RankBadge({ sr, size = 34, showDivision = true, className }: { sr: number; size?: number; showDivision?: boolean; className?: string }) {
  const tier = rank_tier(sr);
  const index = ow_ranks.indexOf(tier);
  const division = showDivision ? rank_division(sr) : null;
  const id = `rk${index}_${(rankSeq = (rankSeq + 1) % 1e6)}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="-2 -4 68 70"
      className={className}
      role="img"
      aria-label={tier.title}
      dangerouslySetInnerHTML={{ __html: rankShapes(index, id, tier.color, tier.color2, division) }}
    />
  );
}

export function rankSvgString(tierKey: string, size: number) {
  const index = Math.max(0, ow_ranks.findIndex((t) => t.key === tierKey));
  const tier = ow_ranks[index];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-2 -4 68 70">${rankShapes(index, "x" + index, tier.color, tier.color2, null)}</svg>`;
}

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function make(paths: string, fill = false) {
  return function Icon({ size = 18, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={fill ? "currentColor" : "none"}
        stroke={fill ? "none" : "currentColor"}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...rest}
        dangerouslySetInnerHTML={{ __html: paths }}
      />
    );
  };
}

export const IconPlus = make(`<path d="M12 5v14M5 12h14"/>`);
export const IconX = make(`<path d="M6 6l12 12M18 6 6 18"/>`);
export const IconGear = make(`<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>`);
export const IconRefresh = make(`<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.6 4.5L20 16"/><path d="M20 21v-5h-5"/>`);
export const IconTrash = make(`<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>`);
export const IconSort = make(`<path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/>`);
export const IconShuffle = make(`<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>`);
export const IconUpload = make(`<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>`);
export const IconDownload = make(`<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>`);
export const IconCheck = make(`<path d="M5 12.5 10 17.5 19 7"/>`);
export const IconPin = make(`<path d="M9 3h6l-1 6 4 4H6l4-4ZM12 13v8"/>`);
export const IconSearch = make(`<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>`);
export const IconArrowUp = make(`<path d="M12 19V5M6 11l6-6 6 6"/>`);
export const IconArrowDown = make(`<path d="M12 5v14M6 13l6 6 6-6"/>`);
export const IconLock = make(`<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>`);
export const IconUsers = make(`<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>`);
export const IconEdit = make(`<path d="M4 20h4L19 9l-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/>`);
export const IconCopy = make(`<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>`);
export const IconInfo = make(`<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>`);
export const IconExternal = make(`<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>`);
export const IconScale = make(`<path d="M12 4v16M7 20h10M4 8h16"/><path d="M4 8 1.5 14h5ZM20 8l-2.5 6h5Z"/>`);

export function Emblem({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="emblem">
      <defs>
        <linearGradient id="emb" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffd27a" />
          <stop offset="1" stopColor="#ff7a1a" />
        </linearGradient>
      </defs>
      <path d="M32 3 57 17.5v29L32 61 7 46.5v-29Z" fill="#0b1224" stroke="url(#emb)" strokeWidth="3" />
      <path d="M32 9.5 51.5 20.7v22.6L32 54.5 12.5 43.3V20.7Z" fill="none" stroke="#ffffff" strokeOpacity=".12" strokeWidth="1.5" />
      <path d="M32 16v30M21 46h22M14 26h36" stroke="url(#emb)" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M14 26 8.5 37h11ZM50 26l-5.5 11h11Z" fill="url(#emb)" />
    </svg>
  );
}
