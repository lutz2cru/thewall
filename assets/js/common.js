// Fonctions partagées entre le mur (index.html) et l'admin (admin.html).
import { CONFIG } from "./config.js";

const PALETTE_SIZE = 6;

/** Couleur « surligneur » d'une UV, selon sa position dans la liste. */
export function uvColor(index) {
  return `var(--hl-${(index % PALETTE_SIZE) + 1})`;
}

/** Construit un élément DOM sans jamais passer par innerHTML (pas de XSS). */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "style") {
      for (const [prop, val] of Object.entries(value)) node.style.setProperty(prop, val);
    } else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2), value);
    } else if (value === true) node.setAttribute(key, "");
    else node.setAttribute(key, value);
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : String(child));
  }
  return node;
}

const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  arrow: '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>',
  logout: '<path d="M15 4h4v16h-4"/><path d="M10 17l-5-5 5-5"/><path d="M5 12h11"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 14v6H4V6h6"/>',
};

/** Icône SVG statique (chaînes constantes ci-dessus uniquement). */
export function icon(name, className = "icon") {
  const tpl = document.createElement("template");
  tpl.innerHTML = `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
  return tpl.content.firstElementChild;
}

/** Minuscules + suppression des accents, pour une recherche tolérante. */
export function normalize(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Renvoie un fragment où les termes recherchés sont entourés de <mark>. */
export function highlight(text, terms) {
  const frag = document.createDocumentFragment();
  const source = String(text ?? "");
  if (!source) return frag;
  if (!terms || !terms.length) {
    frag.append(source);
    return frag;
  }
  // Texte normalisé + correspondance index normalisé -> index d'origine.
  let norm = "";
  const map = [];
  for (let i = 0; i < source.length; i++) {
    const piece = normalize(source[i]);
    for (let k = 0; k < piece.length; k++) {
      norm += piece[k];
      map.push(i);
    }
  }
  const ranges = [];
  for (const term of terms) {
    let from = 0;
    let idx;
    while (term && (idx = norm.indexOf(term, from)) !== -1) {
      ranges.push([map[idx], map[idx + term.length - 1] + 1]);
      from = idx + term.length;
    }
  }
  if (!ranges.length) {
    frag.append(source);
    return frag;
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [ranges[0]];
  for (const [start, end] of ranges.slice(1)) {
    const last = merged[merged.length - 1];
    if (start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  let pos = 0;
  for (const [start, end] of merged) {
    if (start > pos) frag.append(source.slice(pos, start));
    frag.append(el("mark", {}, source.slice(start, end)));
    pos = end;
  }
  if (pos < source.length) frag.append(source.slice(pos));
  return frag;
}

/** N'accepte que des liens http(s) (bloque javascript:, data:, etc.). */
export function isSafeUrl(url) {
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

/** « gustor1.github.io/revision-bd70 » à partir d'une URL complète. */
export function hostPath(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/index\.html?$/i, "/").replace(/\/$/, "");
    return u.host + path;
  } catch {
    return String(url ?? "");
  }
}

export function slugify(text) {
  return normalize(text).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";
}

/** Petit hash stable (identifiants de secours pour les entrées sans id). */
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  return Math.random().toString(36).slice(2, 12);
}

export function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Remet le JSON au propre (champs manquants, ids stables). */
export function normalizeData(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  const uvs = Array.isArray(d.uvs) ? d.uvs : [];
  return {
    ...d,
    site: {
      title: "The Wall",
      subtitle: "",
      promo: "",
      ...(d.site && typeof d.site === "object" ? d.site : {}),
    },
    updatedAt: d.updatedAt || null,
    uvs: uvs.map((u) => {
      const code = String(u?.code ?? "").trim();
      const links = Array.isArray(u?.links) ? u.links : [];
      return {
        ...u,
        id: u?.id || `uv-${slugify(code)}`,
        code,
        name: String(u?.name ?? ""),
        description: String(u?.description ?? ""),
        links: links.map((l) => ({
          ...l,
          id: l?.id || `l${hash(`${l?.url}|${l?.title}`)}`,
          title: String(l?.title ?? ""),
          url: String(l?.url ?? "").trim(),
          description: String(l?.description ?? ""),
          added: l?.added || null,
        })),
      };
    }),
  };
}

export function plural(n, singular, pluralForm) {
  return `${n} ${n > 1 ? pluralForm : singular}`;
}

export function formatDate(value) {
  if (!value) return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function isNew(added) {
  if (!added) return false;
  const date = new Date(added);
  if (Number.isNaN(date.getTime())) return false;
  return Date.now() - date.getTime() < CONFIG.newBadgeDays * 86400000;
}

export function relativeTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const steps = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.35, "week"],
    [12, "month"],
    [Infinity, "year"],
  ];
  let amount = seconds;
  for (const [size, unit] of steps) {
    if (Math.abs(amount) < size) return rtf.format(Math.round(amount), unit);
    amount /= size;
  }
  return "";
}
