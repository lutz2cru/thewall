// The Wall — page publique : charge data/wall.json et affiche les pages par UV.
import { CONFIG } from "./config.js";
import {
  el,
  icon,
  uvColor,
  normalize,
  highlight,
  isSafeUrl,
  hostPath,
  isNew,
  formatDate,
  plural,
  slugify,
  normalizeData,
} from "./common.js";

const $ = (selector) => document.querySelector(selector);
const els = {
  wall: $("#wall"),
  nav: $("#uv-nav"),
  q: $("#q"),
  count: $("#result-count"),
};

let data = null;
let firstRender = true;

boot();

async function boot() {
  try {
    const res = await fetch(CONFIG.dataPath, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = normalizeData(await res.json());
  } catch (err) {
    renderError(err);
    return;
  }

  renderHero();
  els.q.value = new URLSearchParams(location.search).get("q") || "";
  render();

  if (location.hash && !els.q.value) {
    document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  }

  els.q.addEventListener("input", () => {
    render();
    syncUrl();
  });
  document.addEventListener("keydown", onKeydown);
}

function renderHero() {
  const { site } = data;
  const title = (site.title || "The Wall").trim();
  document.title = `${title} · Révisions${site.promo ? ` ${site.promo}` : ""}`;

  // Le dernier mot du titre est « surligné ».
  const cut = title.lastIndexOf(" ");
  const titleEl = $("#site-title");
  titleEl.replaceChildren(
    cut > 0 ? `${title.slice(0, cut)} ` : "",
    el("span", { class: "hl" }, cut > 0 ? title.slice(cut + 1) : title),
  );
  $("#site-subtitle").textContent = site.subtitle || "";
  $("#site-subtitle").hidden = !site.subtitle;
  $("#promo").textContent = site.promo || "";
  $("#promo").hidden = !site.promo;

  const links = data.uvs.flatMap((uv) => uv.links.filter((l) => isSafeUrl(l.url)));
  const lastAdded = links.map((l) => l.added).filter(Boolean).sort().pop();
  $("#stat-uvs").textContent = data.uvs.length;
  $("#stat-links").textContent = links.length;
  $("#stat-updated").textContent = formatDate(data.updatedAt || lastAdded);
}

function render() {
  const query = els.q.value.trim();
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const searching = terms.length > 0;

  const sections = [];
  const chips = [];
  let shown = 0;
  let total = 0;

  data.uvs.forEach((uv, index) => {
    const color = uvColor(index);
    const uvText = normalize(`${uv.code} ${uv.name} ${uv.description}`);
    const links = uv.links.filter((l) => isSafeUrl(l.url));
    total += links.length;

    const matches = searching
      ? links.filter((l) => {
          const text = `${uvText} ${normalize(`${l.title} ${l.description} ${hostPath(l.url)}`)}`;
          return terms.every((t) => text.includes(t));
        })
      : links;
    const uvMatches = searching && terms.every((t) => uvText.includes(t));
    const visible = !searching || matches.length > 0 || uvMatches;

    chips.push(chip(uv, color, visible));
    if (!visible) return;
    shown += matches.length;
    sections.push(section(uv, color, matches, links.length, terms));
  });

  els.nav.replaceChildren(...chips);
  els.count.textContent = searching ? plural(shown, "résultat", "résultats") : "";

  if (!data.uvs.length) {
    els.wall.replaceChildren(
      el("div", { class: "state" },
        el("h2", {}, "Le mur est encore vide"),
        el("p", {}, "Les admins peuvent ajouter les premières UV et pages depuis l'espace admin."),
        el("a", { class: "btn", href: "admin.html" }, "Ouvrir l'admin"),
      ),
    );
    return;
  }

  if (!sections.length) {
    els.wall.replaceChildren(
      el("div", { class: "state" },
        el("h2", {}, "Rien trouvé"),
        el("p", {}, `Aucune page ne correspond à « ${query} ».`),
        el("button", { class: "btn", type: "button", onclick: clearSearch }, "Effacer la recherche"),
      ),
    );
    return;
  }

  els.wall.classList.toggle("animate", firstRender);
  firstRender = false;
  els.wall.replaceChildren(...sections);
}

function chip(uv, color, visible) {
  return el(
    "a",
    {
      class: `chip${visible ? "" : " is-dim"}`,
      href: `#uv-${slugify(uv.code)}`,
      title: uv.name || uv.code,
      style: { "--uv": color },
      "aria-disabled": visible ? null : "true",
      tabindex: visible ? null : "-1",
    },
    uv.code,
  );
}

function section(uv, color, links, totalLinks, terms) {
  const id = `uv-${slugify(uv.code)}`;
  return el(
    "section",
    { class: "uv", id, style: { "--uv": color }, "aria-labelledby": `${id}-title` },
    el(
      "header",
      { class: "uv-head" },
      el("span", { class: "uv-code" }, highlight(uv.code, terms)),
      el("h2", { class: "uv-name", id: `${id}-title` }, highlight(uv.name || uv.code, terms)),
      el("p", { class: "uv-meta" }, plural(totalLinks, "page", "pages")),
      uv.description ? el("p", { class: "uv-desc" }, highlight(uv.description, terms)) : null,
    ),
    links.length
      ? el("ul", { class: "cards" }, links.map((link, i) => el("li", { style: { "--i": i } }, card(link, terms))))
      : el("p", { class: "uv-empty" }, "Pas encore de page pour cette UV."),
  );
}

function card(link, terms) {
  return el(
    "a",
    { class: "card", href: link.url, target: "_blank", rel: "noopener" },
    el("span", { class: "card-title" }, highlight(link.title || hostPath(link.url), terms)),
    link.description ? el("span", { class: "card-desc" }, highlight(link.description, terms)) : null,
    el(
      "span",
      { class: "card-foot" },
      el("span", { class: "card-host" }, highlight(hostPath(link.url), terms)),
      isNew(link.added) ? el("span", { class: "badge-new" }, "nouveau") : null,
      icon("arrow", "card-arrow"),
    ),
  );
}

function renderError(err) {
  console.error(err);
  const local = location.protocol === "file:";
  els.wall.replaceChildren(
    el("div", { class: "state" },
      el("h2", {}, "Impossible de charger le mur"),
      el(
        "p",
        {},
        local
          ? "La page a été ouverte directement depuis le disque. Lance un petit serveur local (voir le README) puis recharge."
          : `Le fichier ${CONFIG.dataPath} est introuvable ou invalide. Réessaie dans un instant.`,
      ),
      el("button", { class: "btn", type: "button", onclick: () => location.reload() }, "Recharger"),
    ),
  );
}

function clearSearch() {
  els.q.value = "";
  render();
  syncUrl();
  els.q.focus();
}

function syncUrl() {
  const url = new URL(location.href);
  const q = els.q.value.trim();
  if (q) url.searchParams.set("q", q);
  else url.searchParams.delete("q");
  history.replaceState(null, "", url);
}

function onKeydown(event) {
  const target = event.target;
  const typing = target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
  if (event.key === "/" && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    els.q.focus();
    els.q.select();
  } else if (event.key === "Escape" && target === els.q && els.q.value) {
    clearSearch();
  }
}
