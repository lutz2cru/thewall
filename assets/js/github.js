// Client minimal pour l'API REST de GitHub (lecture / écriture d'un fichier JSON).
const API = "https://api.github.com";

export class GitHubError extends Error {
  constructor(status, message, body = null) {
    super(message);
    this.name = "GitHubError";
    this.status = status;
    this.body = body;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class GitHubClient {
  constructor({ token, owner, repo, branch, path }) {
    this.token = token;
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
    this.path = path;
  }

  get repoUrl() {
    return `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`;
  }

  get fileUrl() {
    return `${this.repoUrl}/contents/${this.path.split("/").map(encodeURIComponent).join("/")}`;
  }

  async request(method, url, body) {
    let res;
    try {
      res = await fetch(API + url, {
        method,
        cache: "no-store", // toujours la dernière version (évite les conflits de sha)
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${this.token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new GitHubError(0, "network");
    }
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) throw new GitHubError(res.status, json?.message || res.statusText, json);
    return json;
  }

  getUser() {
    return this.request("GET", "/user");
  }

  getRepo() {
    return this.request("GET", this.repoUrl);
  }

  /** Lit le fichier JSON. Renvoie { data: null, sha: null } s'il n'existe pas encore. */
  async readFile() {
    let json;
    try {
      json = await this.request("GET", `${this.fileUrl}?ref=${encodeURIComponent(this.branch)}`);
    } catch (err) {
      if (err instanceof GitHubError && err.status === 404) return { data: null, sha: null };
      throw err;
    }
    if (Array.isArray(json) || typeof json?.content !== "string") {
      throw new GitHubError(422, `${this.path} n'est pas un fichier lisible`);
    }
    return { data: JSON.parse(decodeBase64(json.content)), sha: json.sha };
  }

  writeFile(data, sha, message) {
    const body = {
      message,
      content: encodeBase64(`${JSON.stringify(data, null, 2)}\n`),
      branch: this.branch,
    };
    if (sha) body.sha = sha;
    return this.request("PUT", this.fileUrl, body);
  }

  /**
   * Relit la dernière version, applique `mutate`, puis publie (un commit).
   * Si un autre admin a publié entre-temps (conflit de sha), on recommence.
   * `mutate(data)` renvoie le nouvel objet à écrire, ou null pour ne rien faire.
   */
  async update(mutate, message) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data, sha } = await this.readFile();
      const next = mutate(data);
      if (!next) return null;
      try {
        await this.writeFile(next, sha, message);
        return next;
      } catch (err) {
        const conflict = err instanceof GitHubError && (err.status === 409 || (err.status === 422 && /sha/i.test(err.message)));
        if (!conflict) throw err;
        await sleep(700 * (attempt + 1));
      }
    }
    throw new GitHubError(409, "conflict");
  }

  getHistory(count = 8) {
    const params = new URLSearchParams({ path: this.path, sha: this.branch, per_page: String(count) });
    return this.request("GET", `${this.repoUrl}/commits?${params}`);
  }
}

function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function decodeBase64(b64) {
  const binary = atob(b64.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
