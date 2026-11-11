// The Wall — interface admin.
// Lit et modifie data/wall.json directement dans le dépôt via l'API GitHub.
// Chaque action (ajout, modification, suppression, déplacement) = un commit.
import { CONFIG } from "./config.js";
import { GitHubClient, GitHubError } from "./github.js";
import {
  el,
  icon,
  uvColor,
  normalizeData,
  isSafeUrl,
  hostPath,
  uid,
  slugify,
  todayISO,
  plural,
  relativeTime,
} from "./common.js";

const TOKEN_KEY = "thewall.token";
const REPO_KEY = "thewall.repo";

const $ = (selector, root = document) => root.querySelector(selector);

class AppError extends Error {}

let gh = null; // client GitHub connecté
let data = null; // dernière version connue du mur
let busy = false;

/* ------------------------------------------------------------------------ */
/* Stockage local (protégé : navigation privée, stockage bloqué…)            */
/* ------------------------------------------------------------------------ */

const safe = (fn, fallback = null) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

function getToken() {
  return safe(() => sessionStorage.getItem(TOKEN_KEY)) || safe(() => localStorage.getItem(TOKEN_KEY));
}

function saveToken(token, remember) {
  forgetToken();
  safe(() => (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token));
}

function forgetToken() {
  safe(() => sessionStorage.removeItem(TOKEN_KEY));
  safe(() => localStorage.removeItem(TOKEN_KEY));
}

/* ------------------------------------------------------------------------ */
/* Dépôt : config > détection GitHub Pages > dernier dépôt utilisé           */
/* ------------------------------------------------------------------------ */

function detectRepo() {
  const { hostname, pathname } = location;
  if (!hostname.endsWith(".github.io")) return {};
  const owner = hostname.split(".")[0];
  const segments = pathname.split("/").filter(Boolean);
  const isProjectSite = segments.length > 1 || (segments.length === 1 && !segments[0].includes("."));
  return { owner, repo: isProjectSite ? segments[0] : hostname };
}

function initialRepo() {
  const saved = safe(() => JSON.parse(localStorage.getItem(REPO_KEY) || "{}"), {}) || {};
  const detected = detectRepo();
  return {
    owner: CONFIG.owner || detected.owner || saved.owner || "",
    repo: CONFIG.repo || detected.repo || saved.repo || "",
    branch: CONFIG.branch || saved.branch || "",
  };
}

function readRepoFields() {
  return {
    owner: $("#owner").value.trim(),
    repo: $("#repo").value.trim(),
    branch: $("#branch").value.trim(),
  };
}

function fillRepoFields({ owner, repo, branch }) {
  $("#owner").value = owner;
  $("#repo").value = repo;
  $("#branch").value = branch;
  updateRepoSummary();
  $("#repo-box").open = !owner || !repo;
}

function updateRepoSummary() {
  const { owner, repo, branch } = readRepoFields();
  $("#repo-summary").textContent = owner && repo ? `${owner}/${repo}${branch ? ` (${branch})` : ""}` : "à renseigner";
}

/* ------------------------------------------------------------------------ */
/* Démarrage & connexion                                                     */
/* ------------------------------------------------------------------------ */

async function boot() {
  const repo = initialRepo();
  fillRepoFields(repo);
  const token = getToken();
  if (token && repo.owner && repo.repo) {
    showView("login");
    setLoginBusy(true, "Reconnexion…");
    try {
      await connect(token, repo);
      return;
    } catch (err) {
      if (err instanceof GitHubError && err.status === 401) forgetToken();
      showLoginError(describeError(err));
    } finally {
      setLoginBusy(false);
    }
  }
  showView("login");
  $("#token").focus();
}

async function connect(token, { owner, repo, branch }) {
  const client = new GitHubClient({ token, owner, repo, branch, path: CONFIG.dataPath });
  const [user, info] = await Promise.all([client.getUser(), client.getRepo()]);
  if (info.permissions && info.permissions.push === false) {
    throw new AppError(
      `Le compte ${user.login} n'a pas le droit d'écrire dans ${info.full_name}. Demande au propriétaire de t'ajouter comme collaborateur.`,
    );
  }
  client.branch = branch || info.default_branch;
  const { data: raw } = await client.readFile();
  gh = client;
  data = normalizeData(raw || {});
  showApp(user, info);
}

function showApp(user, info) {
  $("#session").hidden = false;
  $("#session-login").textContent = user.login;
  $("#session-avatar").src = `${user.avatar_url}${user.avatar_url.includes("?") ? "&" : "?"}s=64`;
  $("#session-avatar").alt = user.login;
  const repoLink = $("#session-repo");
  repoLink.href = info.html_url;
  repoLink.textContent = `${info.full_name} · ${gh.branch}`;
  showView("app");
  render();
  loadHistory();
}

function logout() {
  forgetToken();
  gh = null;
  data = null;
  $("#session").hidden = true;
  showLoginError(null);
  showView("login");
  $("#token").focus();
}

function showView(name) {
  $("#view-login").hidden = name !== "login";
  $("#view-app").hidden = name !== "app";
}

function setLoginBusy(on, label = "Connexion…") {
  const button = $("#login-submit");
  button.disabled = on;
  button.textContent = on ? label : "Se connecter";
}

function showLoginError(message) {
  const box = $("#login-error");
  box.hidden = !message;
  box.textContent = message || "";
}

/* ------------------------------------------------------------------------ */
/* Affichage                                                                 */
/* ------------------------------------------------------------------------ */

function render() {
  if (!data) return;
  const list = $("#uv-list");
  const total = data.uvs.reduce((sum, uv) => sum + uv.links.length, 0);
  $("#app-stats").textContent = `${plural(data.uvs.length, "UV", "UV")} · ${plural(total, "page", "pages")}`;

  if (!data.uvs.length) {
    list.replaceChildren(
      el("div", { class: "a-empty" },
        el("p", {}, "Le mur est vide. Commence par créer une UV, puis ajoute-lui des pages."),
        el("button", { class: "btn primary", type: "button", "data-action": "add-uv" }, "Créer la première UV"),
      ),
    );
  } else {
    list.replaceChildren(...data.uvs.map((uv, i) => renderUv(uv, i, data.uvs.length)));
  }

  // Infos du site (sans écraser une saisie en cours)
  const form = $("#site-form");
  if (!form.contains(document.activeElement)) {
    $("#site-title").value = data.site.title || "";
    $("#site-subtitle").value = data.site.subtitle || "";
    $("#site-promo").value = data.site.promo || "";
  }
}

function renderUv(uv, index, count) {
  const ids = { uv: uv.id };
  return el(
    "article",
    { class: "a-uv", style: { "--uv": uvColor(index) } },
    el(
      "header",
      { class: "a-uv-head" },
      el("span", { class: "uv-code" }, uv.code || "?"),
      el("div", { class: "a-uv-title" },
        el("strong", {}, uv.name || "Sans nom"),
        el("span", {}, plural(uv.links.length, "page", "pages")),
      ),
      el(
        "div",
        { class: "row-actions" },
        iconBtn("up", `Monter ${uv.code}`, "uv-up", ids, { disabled: index === 0 }),
        iconBtn("down", `Descendre ${uv.code}`, "uv-down", ids, { disabled: index === count - 1 }),
        iconBtn("edit", `Modifier ${uv.code}`, "uv-edit", ids),
        iconBtn("trash", `Supprimer ${uv.code}`, "uv-delete", ids, { danger: true }),
      ),
    ),
    uv.links.length
      ? el("ul", { class: "a-links" }, uv.links.map((link, j) => renderLink(uv, link, j)))
      : el("p", { class: "a-uv-empty" }, "Aucune page pour l'instant."),
    el(
      "button",
      { class: "btn ghost sm", type: "button", "data-action": "add-link", "data-uv": uv.id },
      icon("plus"),
      `Ajouter une page dans ${uv.code}`,
    ),
  );
}

function renderLink(uv, link, index) {
  const ids = { uv: uv.id, link: link.id };
  const valid = isSafeUrl(link.url);
  return el(
    "li",
    { class: "a-link" },
    el(
      "div",
      { class: "a-link-main" },
      el(
        "a",
        { class: "a-link-title", href: valid ? link.url : null, target: "_blank", rel: "noopener" },
        link.title || "(sans titre)",
      ),
      valid
        ? el("span", { class: "a-link-url" }, hostPath(link.url))
        : el("span", { class: "a-link-bad" }, "Adresse invalide : cette page n'apparaît pas sur le mur"),
      link.description ? el("span", { class: "a-link-desc" }, link.description) : null,
    ),
    el(
      "div",
      { class: "row-actions" },
      iconBtn("up", `Monter « ${link.title} »`, "link-up", ids, { disabled: index === 0 }),
      iconBtn("down", `Descendre « ${link.title} »`, "link-down", ids, { disabled: index === uv.links.length - 1 }),
      iconBtn("edit", `Modifier « ${link.title} »`, "link-edit", ids),
      iconBtn("trash", `Supprimer « ${link.title} »`, "link-delete", ids, { danger: true }),
    ),
  );
}

function iconBtn(name, label, action, ids, { disabled = false, danger = false } = {}) {
  return el(
    "button",
    {
      type: "button",
      class: `icon-btn${danger ? " danger" : ""}`,
      title: label,
      "aria-label": label,
      "data-action": action,
      "data-uv": ids.uv,
      "data-link": ids.link,
      disabled,
    },
    icon(name),
  );
}

async function loadHistory() {
  const list = $("#history");
  if (!gh) return;
  try {
    const commits = await gh.getHistory(8);
    if (!commits.length) {
      list.replaceChildren(el("li", { class: "muted" }, "Aucune modification pour l'instant."));
      return;
    }
    list.replaceChildren(
      ...commits.map((c) =>
        el(
          "li",
          {},
          el("a", { href: c.html_url, target: "_blank", rel: "noopener" }, c.commit.message.split("\n")[0]),
          el("span", {}, `${c.author?.login || c.commit.author?.name || "?"} · ${relativeTime(c.commit.author?.date)}`),
        ),
      ),
    );
  } catch {
    list.replaceChildren(el("li", { class: "muted" }, "Historique indisponible pour le moment."));
  }
}

/* ------------------------------------------------------------------------ */
/* Publication                                                               */
/* ------------------------------------------------------------------------ */

/**
 * Applique `mutator` sur la dernière version du fichier puis publie un commit.
 * `mutator(draft)` modifie le brouillon ; il renvoie false pour annuler.
 * Les publications passent une par une (file d'attente) : rien n'est perdu
 * si on clique plusieurs fois rapidement.
 */
let queue = Promise.resolve();

function commit(mutator, message, options) {
  const run = queue.then(() => publish(mutator, message, options));
  queue = run.catch(() => {});
  return run;
}

async function publish(mutator, message, { dialog } = {}) {
  if (!gh) return false;
  setBusy(true);
  showDialogError(dialog, null);
  toast("Publication en cours…", "pending");
  try {
    const next = await gh.update((raw) => {
      const draft = normalizeData(raw || {});
      if (mutator(draft) === false) return null;
      draft.updatedAt = new Date().toISOString();
      return draft;
    }, message);
    if (next) {
      data = next;
      toast("Publié ! Le site public sera à jour d'ici une minute.", "ok");
      loadHistory();
    } else {
      hideToast();
    }
    render();
    return true;
  } catch (err) {
    const text = describeError(err);
    toast(text, "error");
    showDialogError(dialog, text);
    if (err instanceof AppError) reload(false);
    return false;
  } finally {
    setBusy(false);
  }
}

async function reload(announce) {
  if (!gh) return;
  try {
    const { data: raw } = await gh.readFile();
    data = normalizeData(raw || {});
    render();
    loadHistory();
    if (announce) toast("Liste rechargée depuis GitHub.", "ok");
  } catch (err) {
    toast(describeError(err), "error");
  }
}

function setBusy(on) {
  busy = on;
  document.body.classList.toggle("is-busy", on);
  document.querySelectorAll("dialog [type=submit], #site-form [type=submit]").forEach((b) => {
    b.disabled = on;
  });
}

function describeError(err) {
  if (err instanceof AppError) return err.message;
  if (err instanceof SyntaxError) return `Le fichier ${CONFIG.dataPath} n'est pas un JSON valide. Corrige-le sur GitHub puis recharge.`;
  if (err instanceof GitHubError) {
    switch (err.status) {
      case 0:
        return "Impossible de joindre GitHub. Vérifie ta connexion internet.";
      case 401:
        return "GitHub refuse ce token (invalide, révoqué ou expiré).";
      case 403:
        return /rate limit/i.test(err.message)
          ? "Trop de requêtes vers GitHub. Réessaie dans quelques minutes."
          : "Accès refusé : le token n'a pas la permission « Contents : Read and write » sur ce dépôt.";
      case 404:
        return "Dépôt ou branche introuvable. Vérifie le nom du dépôt et que ton token y a accès.";
      case 409:
        return "Quelqu'un d'autre modifie le mur en même temps. Réessaie dans quelques secondes.";
      default:
        return `Erreur GitHub ${err.status} : ${err.message}`;
    }
  }
  return err?.message || String(err);
}

const gone = (what) =>
  new AppError(`${what} a été modifiée ou supprimée entre-temps par un autre admin. La liste vient d'être rechargée.`);

function mustUv(draft, uvId) {
  const uv = draft.uvs.find((u) => u.id === uvId);
  if (!uv) throw gone("Cette UV");
  return uv;
}

function findUv(uvId) {
  return data?.uvs.find((u) => u.id === uvId) || null;
}

function findLink(uvId, linkId) {
  return findUv(uvId)?.links.find((l) => l.id === linkId) || null;
}

function swap(list, index, delta) {
  const target = index + delta;
  if (index < 0 || target < 0 || target >= list.length) return false;
  [list[index], list[target]] = [list[target], list[index]];
  return true;
}

/* ------------------------------------------------------------------------ */
/* Actions                                                                   */
/* ------------------------------------------------------------------------ */

const actions = {
  logout,
  refresh: () => reload(true),
  "add-uv": () => openUvDialog(null),
  "uv-edit": (uvId) => openUvDialog(findUv(uvId)),
  "uv-up": (uvId) => moveUv(uvId, -1),
  "uv-down": (uvId) => moveUv(uvId, 1),
  "uv-delete": deleteUv,
  "add-link": (uvId) => openLinkDialog(null, uvId),
  "link-edit": (uvId, linkId) => openLinkDialog(findLink(uvId, linkId), uvId),
  "link-up": (uvId, linkId) => moveLink(uvId, linkId, -1),
  "link-down": (uvId, linkId) => moveLink(uvId, linkId, 1),
  "link-delete": deleteLink,
};

function moveUv(uvId, delta) {
  const uv = findUv(uvId);
  if (!uv) return;
  commit((draft) => {
    const index = draft.uvs.findIndex((u) => u.id === uvId);
    if (index < 0) throw gone("Cette UV");
    return swap(draft.uvs, index, delta);
  }, `wall: déplace l'UV ${uv.code}`);
}

async function deleteUv(uvId) {
  const uv = findUv(uvId);
  if (!uv) return;
  const n = uv.links.length;
  const ok = await confirmDialog({
    title: `Supprimer l'UV ${uv.code} ?`,
    message:
      n === 0
        ? "Elle ne contient aucune page."
        : `${n === 1 ? "Sa page sera aussi retirée" : `Ses ${n} pages seront aussi retirées`} du mur (les pages elles-mêmes restent sur GitHub).`,
    confirmLabel: "Supprimer l'UV",
  });
  if (!ok) return;
  commit((draft) => {
    const index = draft.uvs.findIndex((u) => u.id === uvId);
    if (index < 0) throw gone("Cette UV");
    draft.uvs.splice(index, 1);
  }, `wall: supprime l'UV ${uv.code}`);
}

function moveLink(uvId, linkId, delta) {
  const link = findLink(uvId, linkId);
  if (!link) return;
  commit((draft) => {
    const uv = mustUv(draft, uvId);
    const index = uv.links.findIndex((l) => l.id === linkId);
    if (index < 0) throw gone("Cette page");
    return swap(uv.links, index, delta);
  }, `wall: déplace « ${link.title} »`);
}

async function deleteLink(uvId, linkId) {
  const uv = findUv(uvId);
  const link = findLink(uvId, linkId);
  if (!uv || !link) return;
  const ok = await confirmDialog({
    title: "Retirer cette page du mur ?",
    message: `« ${link.title} » (${uv.code}) ne sera plus affichée. La page elle-même reste sur GitHub.`,
    confirmLabel: "Retirer",
  });
  if (!ok) return;
  commit((draft) => {
    const target = mustUv(draft, uvId);
    const index = target.links.findIndex((l) => l.id === linkId);
    if (index < 0) throw gone("Cette page");
    target.links.splice(index, 1);
  }, `wall: retire « ${link.title} » (${uv.code})`);
}

/* ------------------------------------------------------------------------ */
/* Boîtes de dialogue                                                        */
/* ------------------------------------------------------------------------ */

function showDialogError(dialog, message) {
  const box = dialog && $(".error-box", dialog);
  if (!box) return;
  box.hidden = !message;
  box.textContent = message || "";
}

function confirmDialog({ title, message, confirmLabel }) {
  const dialog = $("#dlg-confirm");
  $("#dlg-confirm-title").textContent = title;
  $("#dlg-confirm-text").textContent = message;
  $("#dlg-confirm-ok").textContent = confirmLabel;
  dialog.returnValue = "";
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "yes"), { once: true });
  });
}

/* --- UV --- */

function openUvDialog(uv) {
  const dialog = $("#dlg-uv");
  $("#uv-form").reset();
  showDialogError(dialog, null);
  dialog.dataset.uvId = uv?.id || "";
  $("#dlg-uv-title").textContent = uv ? `Modifier l'UV ${uv.code}` : "Ajouter une UV";
  $("#uv-submit").textContent = uv ? "Enregistrer et publier" : "Ajouter et publier";
  $("#uv-code").value = uv?.code || "";
  $("#uv-name").value = uv?.name || "";
  $("#uv-desc").value = uv?.description || "";
  dialog.showModal();
  (uv ? $("#uv-name") : $("#uv-code")).focus();
}

async function submitUv(event) {
  event.preventDefault();
  const dialog = $("#dlg-uv");
  const uvId = dialog.dataset.uvId;
  const code = $("#uv-code").value.trim().toUpperCase().replace(/\s+/g, " ");
  const name = $("#uv-name").value.trim();
  const description = $("#uv-desc").value.trim();

  if (!code) return showDialogError(dialog, "Le code de l'UV est obligatoire (ex. SR71).");
  const taken = (draft) => draft.uvs.some((u) => u.id !== uvId && u.code.toUpperCase() === code);
  if (taken(data)) return showDialogError(dialog, `L'UV ${code} existe déjà.`);

  let ok;
  if (uvId) {
    ok = await commit(
      (draft) => {
        const uv = mustUv(draft, uvId);
        if (taken(draft)) throw new AppError(`L'UV ${code} existe déjà.`);
        Object.assign(uv, { code, name, description });
      },
      `wall: modifie l'UV ${code}`,
      { dialog },
    );
  } else {
    const id = `uv-${slugify(code)}-${uid().slice(0, 4)}`;
    ok = await commit(
      (draft) => {
        if (taken(draft)) throw new AppError(`L'UV ${code} existe déjà.`);
        draft.uvs.push({ id, code, name, description, links: [] });
      },
      `wall: ajoute l'UV ${code}`,
      { dialog },
    );
  }
  if (ok) dialog.close();
}

/* --- Pages (liens) --- */

function openLinkDialog(link, uvId) {
  if (!data.uvs.length) {
    toast("Crée d'abord une UV pour y ranger la page.", "info");
    openUvDialog(null);
    return;
  }
  const dialog = $("#dlg-link");
  $("#link-form").reset();
  showDialogError(dialog, null);
  dialog.dataset.linkId = link?.id || "";
  dialog.dataset.fromUv = link ? uvId : "";
  $("#dlg-link-title").textContent = link ? "Modifier la page" : "Ajouter une page";
  $("#link-submit").textContent = link ? "Enregistrer et publier" : "Ajouter et publier";

  $("#link-uv").replaceChildren(
    ...data.uvs.map((u) => el("option", { value: u.id }, u.name ? `${u.code} — ${u.name}` : u.code)),
  );
  $("#link-uv").value = findUv(uvId) ? uvId : data.uvs[0].id;
  $("#link-url").value = link?.url || "";
  $("#link-title").value = link?.title || "";
  $("#link-desc").value = link?.description || "";
  $("#link-url-status").textContent = "";
  updateUrlHints();
  dialog.showModal();
  (link ? $("#link-title") : $("#link-url")).focus();
}

async function submitLink(event) {
  event.preventDefault();
  const dialog = $("#dlg-link");
  const { linkId, fromUv } = dialog.dataset;
  const uvId = $("#link-uv").value;
  const url = $("#link-url").value.trim();
  const title = $("#link-title").value.trim();
  const description = $("#link-desc").value.trim();

  if (!isSafeUrl(url)) return showDialogError(dialog, "L'adresse doit être un lien complet qui commence par https://");
  if (!title) return showDialogError(dialog, "Donne un titre à la page.");
  const target = findUv(uvId);
  if (!target) return showDialogError(dialog, "Choisis une UV.");

  let ok;
  if (linkId) {
    ok = await commit(
      (draft) => {
        const source = mustUv(draft, fromUv);
        const index = source.links.findIndex((l) => l.id === linkId);
        if (index < 0) throw gone("Cette page");
        const destination = mustUv(draft, uvId);
        const updated = { ...source.links[index], url, title, description };
        if (source === destination) source.links[index] = updated;
        else {
          source.links.splice(index, 1);
          destination.links.push(updated);
        }
      },
      `wall: modifie « ${title} » (${target.code})`,
      { dialog },
    );
  } else {
    const id = uid();
    ok = await commit(
      (draft) => {
        mustUv(draft, uvId).links.push({ id, title, url, description, added: todayISO() });
      },
      `wall: ajoute « ${title} » (${target.code})`,
      { dialog },
    );
  }
  if (ok) dialog.close();
}

/** Clé de comparaison : même page même si l'ancre ou le « / » final diffèrent. */
function pageKey(url) {
  try {
    const u = new URL(url);
    return `${u.host.toLowerCase()}${u.pathname.replace(/\/index\.html?$/i, "/").replace(/\/$/, "")}${u.search}`;
  } catch {
    return url;
  }
}

function findDuplicate(url, ignoreId) {
  const key = pageKey(url);
  for (const uv of data.uvs) {
    for (const link of uv.links) {
      if (link.id !== ignoreId && pageKey(link.url) === key) return { uv, link };
    }
  }
  return null;
}

/** Lien github.com vers un dépôt / fichier HTML → adresse GitHub Pages correspondante. */
function githubPagesSuggestion(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.hostname !== "github.com") return null;
  const [owner, repo, kind, , ...rest] = u.pathname.split("/").filter(Boolean);
  if (!owner || !repo) return null;
  const userSite = repo.toLowerCase() === `${owner.toLowerCase()}.github.io`;
  const base = userSite ? `https://${repo.toLowerCase()}/` : `https://${owner.toLowerCase()}.github.io/${repo}/`;
  if (!kind) return base;
  if (kind === "tree") return rest.length ? `${base}${rest.join("/")}/` : base;
  if (kind === "blob" && rest.length && /\.html?$/i.test(rest[rest.length - 1])) {
    return base + rest.join("/").replace(/(^|\/)index\.html?$/i, "$1");
  }
  return null;
}

function updateUrlHints() {
  const url = $("#link-url").value.trim();
  const box = $("#link-url-suggest");
  const suggestion = githubPagesSuggestion(url);
  box.hidden = !suggestion;
  if (suggestion) {
    $("span", box).textContent = `Ce lien ouvre le code sur github.com, pas la page. Version site : ${suggestion}`;
    box.dataset.url = suggestion;
  }
  const duplicate = isSafeUrl(url) ? findDuplicate(url, $("#dlg-link").dataset.linkId) : null;
  $("#link-url-dup").textContent = duplicate
    ? `Déjà sur le mur : « ${duplicate.link.title} » (${duplicate.uv.code}).`
    : "";
}

let metaTicket = 0;

async function autofillFromPage() {
  const url = $("#link-url").value.trim();
  const status = $("#link-url-status");
  const titleInput = $("#link-title");
  const descInput = $("#link-desc");
  if (!isSafeUrl(url) || githubPagesSuggestion(url)) return;
  if (titleInput.value.trim() && descInput.value.trim()) return;

  const ticket = ++metaTicket;
  status.textContent = "Lecture de la page…";
  const meta = await fetchPageMeta(url);
  if (ticket !== metaTicket) return;
  if (!meta || (!meta.title && !meta.description)) {
    status.textContent = "";
    return;
  }
  if (!titleInput.value.trim() && meta.title) titleInput.value = meta.title;
  if (!descInput.value.trim() && meta.description) descInput.value = meta.description;
  status.textContent = "Titre récupéré depuis la page, modifie-le si besoin.";
}

async function fetchPageMeta(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html"); // n'exécute aucun script
    return {
      title: (doc.querySelector("title")?.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120),
      description: (doc.querySelector('meta[name="description"]')?.getAttribute("content") || "").trim().slice(0, 300),
    };
  } catch {
    return null; // page sur un autre domaine sans CORS, hors ligne, etc.
  } finally {
    clearTimeout(timer);
  }
}

/* --- Infos du site --- */

function submitSite(event) {
  event.preventDefault();
  const title = $("#site-title").value.trim() || "The Wall";
  const subtitle = $("#site-subtitle").value.trim();
  const promo = $("#site-promo").value.trim();
  commit((draft) => {
    draft.site = { ...draft.site, title, subtitle, promo };
  }, "wall: met à jour les infos du site");
}

/* ------------------------------------------------------------------------ */
/* Notifications                                                             */
/* ------------------------------------------------------------------------ */

let toastTimer = null;

function toast(message, kind = "info") {
  const node = $("#toast");
  node.textContent = message;
  node.dataset.kind = kind;
  clearTimeout(toastTimer);
  try {
    if (node.matches(":popover-open")) node.hidePopover();
    node.showPopover(); // au-dessus des boîtes de dialogue ouvertes
  } catch {
    node.hidden = false;
  }
  if (kind !== "pending") toastTimer = setTimeout(hideToast, kind === "error" ? 8000 : 4000);
}

function hideToast() {
  const node = $("#toast");
  clearTimeout(toastTimer);
  try {
    if (node.matches(":popover-open")) node.hidePopover();
  } catch {
    node.hidden = true;
  }
}

/* ------------------------------------------------------------------------ */
/* Événements                                                                */
/* ------------------------------------------------------------------------ */

function wireEvents() {
  document.addEventListener("click", (event) => {
    const closer = event.target.closest("[data-close]");
    if (closer) {
      if (!busy) closer.closest("dialog")?.close();
      return;
    }
    const button = event.target.closest("[data-action]");
    if (!button || button.disabled) return;
    const handler = actions[button.dataset.action];
    if (!handler) return;
    event.preventDefault();
    handler(button.dataset.uv, button.dataset.link);
  });

  $("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = $("#token").value.trim();
    const repo = readRepoFields();
    showLoginError(null);
    if (!token) return showLoginError("Colle ton token GitHub.");
    if (!repo.owner || !repo.repo) {
      $("#repo-box").open = true;
      return showLoginError("Indique le propriétaire et le nom du dépôt.");
    }
    setLoginBusy(true);
    try {
      await connect(token, repo);
      saveToken(token, $("#remember").checked);
      safe(() => localStorage.setItem(REPO_KEY, JSON.stringify(repo)));
      $("#token").value = "";
    } catch (err) {
      showLoginError(describeError(err));
    } finally {
      setLoginBusy(false);
    }
  });

  ["#owner", "#repo", "#branch"].forEach((sel) => $(sel).addEventListener("input", updateRepoSummary));

  $("#uv-form").addEventListener("submit", submitUv);
  $("#link-form").addEventListener("submit", submitLink);
  $("#site-form").addEventListener("submit", submitSite);

  $("#link-url").addEventListener("input", updateUrlHints);
  $("#link-url").addEventListener("change", autofillFromPage);
  $("#link-url-apply").addEventListener("click", () => {
    $("#link-url").value = $("#link-url-suggest").dataset.url || "";
    updateUrlHints();
    autofillFromPage();
    $("#link-title").focus();
  });

  // Empêche de fermer une boîte de dialogue pendant une publication.
  document.querySelectorAll("dialog").forEach((dialog) => {
    dialog.addEventListener("cancel", (event) => {
      if (busy) event.preventDefault();
    });
  });
}

wireEvents();
boot();
