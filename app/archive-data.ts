export const statuses = [
  "在写", "在研", "准备投稿", "已投稿", "审稿中", "终审中", "返修中", "已录用",
  "已发表", "待转投", "转投中", "已拒稿", "已撤稿", "已归档", "已搁置", "待确认",
];

export const tabs = [
  ["all", "全部"], ["accepted", "录用与发表"], ["submitted", "在投"], ["writing", "在写与在研"],
  ["transfer", "转投"], ["pending", "待确认"], ["other", "其他"],
] as const;

export type Stage = (typeof tabs)[number][0];
export type CitationStyle = "手动引用" | "GB/T 7714" | "APA" | "BibTeX";
export type Attachment = { name: string; path: string };
export type Attempt = {
  id: string; journal: string; date: string; decisionDate: string; manuscriptId: string; submissionUrl: string;
  status: string; jcr: string; cas: string; notes: string;
};
export type Paper = {
  id: string; title: string; authors: string; role: string; kind: string; year: string; publicationYear: string;
  journal: string; status: string; jcr: string; cas: string; zoneYear: string; indexing: string;
  folder: string; files: Attachment[]; paperUrl: string; submissionUrl: string; doi: string; volume: string; issue: string;
  pages: string; publicationDate: string; citation: string; abstract: string; evidence: string;
  notes: string; attempts: Attempt[];
};

export const jcrOptions = ["Q1", "Q2", "Q3", "Q4"];
export const casOptions = ["1区", "2区", "3区", "4区"];
export const kinds = ["期刊论文", "会议论文", "学位论文", "论文稿件", "研究方案", "合作与指导"];
const newId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function emptyAttempt(): Attempt {
  return {
    id: newId(), journal: "", date: "", decisionDate: "", manuscriptId: "", submissionUrl: "",
    status: "审稿中", jcr: "", cas: "", notes: "",
  };
}

export function emptyPaper(): Paper {
  return {
    id: newId(), title: "", authors: "", role: "", kind: "期刊论文",
    year: String(new Date().getFullYear()), publicationYear: "", journal: "", status: "在写",
    jcr: "", cas: "", zoneYear: "", indexing: "", folder: "", files: [], paperUrl: "", submissionUrl: "", doi: "",
    volume: "", issue: "", pages: "", publicationDate: "", citation: "", abstract: "", evidence: "", notes: "", attempts: [],
  };
}

export function stageOf(status: string): Exclude<Stage, "all"> {
  if (["已录用", "已发表"].includes(status)) return "accepted";
  if (["已投稿", "审稿中", "终审中", "返修中"].includes(status)) return "submitted";
  if (["在写", "在研", "准备投稿"].includes(status)) return "writing";
  if (["待转投", "转投中"].includes(status)) return "transfer";
  if (["已拒稿", "已撤稿", "已归档", "已搁置"].includes(status)) return "other";
  return "pending";
}

function textValue(value: unknown, max = 10000) {
  return typeof value === "string" ? value.slice(0, max).trim() : "";
}

export function normalize(value: unknown): Paper | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.title !== "string" || !raw.title.trim() || raw.title.length > 500) return null;
  const paper = emptyPaper();
  for (const key of Object.keys(paper) as (keyof Paper)[]) {
    if (key !== "files" && key !== "attempts" && key !== "id") paper[key] = textValue(raw[key]);
  }
  paper.id = /^[a-zA-Z0-9_-]{1,80}$/.test(textValue(raw.id, 81)) ? textValue(raw.id, 80) : paper.id;
  paper.status = statuses.includes(paper.status) ? paper.status : "待确认";
  paper.kind ||= "论文稿件";
  const files: unknown[] = Array.isArray(raw.files) ? raw.files.slice(0, 40) : [];
  paper.files = files.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const attachment = item as Record<string, unknown>;
    const path = textValue(attachment.path, 2048);
    return path ? [{ name: textValue(attachment.name, 150) || path.split(/[\\/]/).pop() || "稿件", path }] : [];
  });
  const attempts: unknown[] = Array.isArray(raw.attempts) ? raw.attempts.slice(0, 100) : [];
  paper.attempts = attempts.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    const a = emptyAttempt();
    const generatedId = a.id;
    for (const key of Object.keys(a) as (keyof Attempt)[]) a[key] = textValue(entry[key]);
    if (!a.id) a.id = generatedId;
    if (!a.status) a.status = "待确认";
    return [a];
  });
  return paper;
}

export function safeUrl(url: string) {
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch { return ""; }
}

export function isInSubmission(status: string) {
  return stageOf(status) === "submitted" || status === "转投中";
}

export function currentSubmissionUrl(paper: Paper) {
  const latest = [...paper.attempts].reverse().find((attempt) => isInSubmission(attempt.status));
  return safeUrl(paper.submissionUrl) || safeUrl(latest?.submissionUrl ?? "");
}

export function searchUrl(title: string, scholar = false) {
  const base = scholar ? "https://scholar.google.com/scholar" : "https://www.google.com/search";
  return `${base}?q=${encodeURIComponent(`"${title}"`)}`;
}

export function citationFor(p: Paper, style: CitationStyle) {
  if (style === "手动引用") return p.citation;
  const authors = p.authors.trim() || "[作者]";
  const venue = p.journal.trim() || "[刊会或授予单位]";
  const year = p.publicationYear || "[发表年份]";
  const doi = p.doi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
  const thesis = p.kind === "学位论文";
  const conference = p.kind === "会议论文";
  const volumeIssue = (p.volume ? `, ${p.volume}` : "") + (p.issue ? `(${p.issue})` : "");
  if (style === "GB/T 7714") {
    const type = thesis ? "D" : conference ? "C" : "J";
    return `${authors}. ${p.title}[${type}]. ${venue}, ${year}${volumeIssue}${p.pages ? `: ${p.pages}` : ""}.${doi ? ` DOI: ${doi}.` : ""}`;
  }
  if (style === "APA") {
    return `${authors} (${year}). ${p.title}${thesis ? " [Master's thesis]" : ""}. ${venue}${volumeIssue}${p.pages ? `, ${p.pages}` : ""}.${doi ? ` https://doi.org/${doi}` : ""}`;
  }
  const clean = (s: string) => s.replace(/[{}]/g, "").replace(/\r?\n/g, " ");
  const key = `${clean(authors).split(/[ ,;]+/)[0]}${year}`.replace(/[^a-zA-Z0-9_-]/g, "") || "paper";
  const type = thesis ? "mastersthesis" : conference ? "inproceedings" : "article";
  const place = thesis ? "school" : conference ? "booktitle" : "journal";
  const fields: Record<string, string> = {
    title: p.title, author: authors.replace(/\s*[;；]\s*/g, " and "), [place]: venue,
    year, volume: p.volume, number: p.issue, pages: p.pages.replace(/[–—]/g, "--"), doi,
  };
  const lines = Object.entries(fields).filter(([, value]) => value)
    .map(([name, value]) => `  ${name} = {${clean(value)}}`);
  return `@${type}{${key},\n${lines.join(",\n")}\n}`;
}
