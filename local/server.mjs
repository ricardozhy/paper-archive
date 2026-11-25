import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, stat, realpath } from "node:fs/promises";
import { createServer } from "node:http";
import { basename, extname, isAbsolute, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { maxBackupBytes, maxRecordBytes, openStore, validateBackup, validatePaper, validId } from "./store.mjs";

const host = "127.0.0.1";
const port = Number(process.env.PAPER_ARCHIVE_PORT || "4317");
const origin = `http://${host}:${port}`;
const site = fileURLToPath(new URL("../dist-local/", import.meta.url));
const archiveRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const instance = createHash("sha256")
  .update(process.platform === "win32" ? archiveRoot.toLowerCase() : archiveRoot)
  .digest("hex");
const fileTypes = {
  ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".md": "text/plain; charset=utf-8", ".txt": "text/plain; charset=utf-8",
  ".tex": "text/plain; charset=utf-8", ".zip": "application/zip", ".eml": "message/rfc822",
};
const inline = new Set([".pdf", ".png", ".jpg", ".jpeg", ".md", ".txt", ".tex"]);
const readMethods = new Set(["GET", "HEAD"]);

try {
  await access(join(site, "index.html"));
} catch {
  console.error("请在项目目录运行 npm ci 和 npm run build，再启动稿件档案。");
  process.exit(1);
}
const store = openStore();

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function fail(status, message) {
  throw new RequestError(status, message);
}

function json(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

async function readJson(req, limit) {
  if (!req.headers["content-type"]?.startsWith("application/json")) {
    fail(415, "需要 JSON 格式的请求。");
  }
  const chunks = [];
  let length = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    length += chunk.length;
    if (length > limit) {
      req.resume();
      fail(413, "记录内容过长。");
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    fail(400, "JSON 格式无效。");
  }
}

function isLocalAbsolutePath(path) {
  if (typeof path !== "string" || /[\x00-\x1f]/.test(path)) return false;
  if (process.platform === "win32") {
    return /^[A-Za-z]:[\\/]/.test(path) && !path.slice(2).includes(":");
  }
  return isAbsolute(path) && !path.startsWith("//");
}

async function resolveLocalPath(value, type) {
  if (!isLocalAbsolutePath(value)) fail(400, "请选择本机磁盘上的绝对路径。");
  try {
    const path = await realpath(value);
    if (!isLocalAbsolutePath(path)) throw new Error();
    const info = await stat(path);
    if (type === "dir" ? !info.isDirectory() : !info.isFile()) throw new Error();
    return { path, info };
  } catch {
    fail(404, type === "dir" ? "文件夹已移动或不可用。" : "文件已移动或不可用。");
  }
}

function disposition(type, name) {
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => "%" + c.charCodeAt(0).toString(16));
  return `${type}; filename*=UTF-8''${encoded}`;
}

async function sendFile(req, res, path, size, headers) {
  res.writeHead(200, { "Content-Length": size, ...headers });
  if (req.method === "HEAD") return res.end();
  await pipeline(createReadStream(path), res);
}

async function serveAttachment(req, res, url) {
  const id = url.searchParams.get("paper");
  const index = url.searchParams.get("index") ?? "";
  if (!validId(id) || !/^\d{1,2}$/.test(index)) fail(400, "文件编号无效。");
  const paper = store.get(id);
  const attachment = Array.isArray(paper?.files) ? paper.files[Number(index)] : null;
  if (!attachment) fail(404, "档案中没有此文件。");
  const { path, info } = await resolveLocalPath(attachment.path, "file");
  const ext = extname(path).toLowerCase();
  if (!Object.hasOwn(fileTypes, ext)) fail(415, "请在论文文件夹中打开该格式的文件。");
  const mode = inline.has(ext) && url.searchParams.get("download") !== "1" ? "inline" : "attachment";
  await sendFile(req, res, path, info.size, {
    "Content-Type": fileTypes[ext],
    "Content-Disposition": disposition(mode, basename(path)),
  });
}

function launchFolder(path) {
  const options = { windowsHide: true, stdio: "ignore" };
  if (process.platform !== "win32") {
    return spawn(process.platform === "darwin" ? "open" : "xdg-open", [path], options);
  }
  const program = join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const script = "$ErrorActionPreference = 'Stop'; (New-Object -ComObject Shell.Application).Explore($env:PAPER_ARCHIVE_OPEN_DIRECTORY)";
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return spawn(program, ["-NoProfile", "-NonInteractive", "-Sta", "-EncodedCommand", encoded], {
    ...options, env: { ...process.env, PAPER_ARCHIVE_OPEN_DIRECTORY: path },
  });
}

async function openFolder(req, res) {
  const { id } = (await readJson(req, 4096)) ?? {};
  if (!validId(id)) fail(400, "论文编号无效。");
  const paper = store.get(id);
  if (!paper?.folder) fail(404, "这篇论文还没有文件夹地址。");
  const { path } = await resolveLocalPath(paper.folder, "dir");
  const launchError = new RequestError(500, "无法打开文件管理器，请复制文件夹地址。");
  await new Promise((resolve, reject) => {
    const explorer = launchFolder(path);
    explorer.once("error", () => reject(launchError));
    explorer.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(launchError);
    });
  });
  json(res, { ok: true });
}

async function servePapers(req, res, url) {
  switch (req.method) {
    case "GET": return json(res, { papers: store.list() });
    case "PUT": {
      const paper = await readJson(req, maxRecordBytes);
      if (!validatePaper(paper)) fail(400, "论文标题或记录编号无效。");
      store.save(paper);
      return json(res, { ok: true });
    }
    case "DELETE": {
      const id = url.searchParams.get("id");
      if (!validId(id)) fail(400, "论文编号无效。");
      store.remove(id);
      return json(res, { ok: true });
    }
    default: fail(405, "请求方式无效。");
  }
}

async function serve(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (req.headers.host !== `${host}:${port}` || req.headers["sec-fetch-site"] === "cross-site"
      || (req.headers.origin && req.headers.origin !== origin)) {
    fail(403, "只接受本机档案页面的请求。");
  }
  const url = new URL(req.url, origin);
  if (url.origin !== origin) fail(403, "请求地址无效。");
  if (url.pathname === "/api/health" && req.method === "GET") {
    return json(res, { app: "paper-archive-local", instance });
  }
  if (url.pathname === "/api/papers") return servePapers(req, res, url);
  if (url.pathname === "/api/import" && req.method === "POST") {
    const backup = await readJson(req, maxBackupBytes);
    if (!validateBackup(backup)) fail(400, "请选择有效的稿件档案 JSON。");
    return json(res, store.importMissing(backup.papers));
  }
  if (url.pathname === "/api/open-folder" && req.method === "POST") return openFolder(req, res);
  if (url.pathname === "/api/file" && readMethods.has(req.method)) return serveAttachment(req, res, url);

  if (readMethods.has(req.method)) {
    if (url.pathname === "/") {
      const path = join(site, "index.html");
      return sendFile(req, res, path, (await stat(path)).size, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'",
      });
    }
    if (/^\/assets\/[a-zA-Z0-9_-]+\.(js|css)$/.test(url.pathname)) {
      const path = join(site, "assets", basename(url.pathname));
      const info = await stat(path).catch(() => null);
      if (info?.isFile()) {
        const type = path.endsWith(".js") ? "text/javascript; charset=utf-8" : "text/css; charset=utf-8";
        return sendFile(req, res, path, info.size, { "Content-Type": type });
      }
    }
  }
  fail(404, "找不到该页面。");
}

const server = createServer((req, res) => {
  serve(req, res).catch((error) => {
    if (res.headersSent) return res.destroy();
    if (error instanceof RequestError) return json(res, { error: error.message }, error.status);
    console.error(error);
    return json(res, { error: "本机服务遇到错误，请重试。" }, 500);
  });
});

server.listen(port, host, () => console.log(`稿件档案已启动：${origin}/`));
