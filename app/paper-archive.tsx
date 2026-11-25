"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArrowDownToLine, ArrowRight, ArrowUpFromLine, ChevronDown, ExternalLink, FileText, FolderOpen, Plus, Search, X } from "lucide-react";

import { ArchiveDetail, ArchiveEditor, StatusBadge, SubmissionLink } from "./archive-dialogs";
import { currentSubmissionUrl, emptyPaper, isInSubmission, normalize, stageOf, tabs } from "./archive-data";
import type { Paper, Stage } from "./archive-data";

type Backup = { format: "paper-archive"; version: 1; exportedAt?: string; papers: Paper[] };
type ApiResponse = { papers?: unknown[]; error?: string; added?: number; skipped?: number };
type ArchiveProps = { local?: boolean; demo?: { papers: unknown[]; repositoryUrl: string } };
const dateSort = new Intl.Collator("zh-CN", { numeric: true });
const stageOrder = tabs.slice(1).map(([key]) => key);

async function request(path: string, method = "GET", body?: Paper | Backup | { id: string }, signal?: AbortSignal) {
  const response = await fetch(path, {
    method, signal, cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({})) as ApiResponse;
  if (!response.ok) throw new Error(data.error || "操作未完成，请重试。");
  return data;
}

const unwrap = (items: unknown[] = []) => items.map(normalize).filter((paper): paper is Paper => !!paper);
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "操作未完成，请重试。";

export default function PaperArchive({ local = false, demo }: ArchiveProps) {
  const [papers, setPapers] = useState(() => unwrap(demo?.papers));
  const [loading, setLoading] = useState(!demo);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [stage, setStage] = useState<Stage>("all");
  const [year, setYear] = useState("");
  const [query, setQuery] = useState("");
  const [detailId, setDetailId] = useState("");
  const [editor, setEditor] = useState<Paper | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    request("/api/papers", "GET", undefined, controller.signal).then((data) => {
      if (!controller.signal.aborted) setPapers(unwrap(data.papers));
    }).catch((error) => {
      if (!controller.signal.aborted) setLoadError(errorMessage(error));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [demo, reload]);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  function announce(message: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(""), 5400);
  }

  const counts = useMemo(() => {
    const result: Record<Stage, number> = { all: papers.length, accepted: 0, submitted: 0, writing: 0, transfer: 0, pending: 0, other: 0 };
    for (const paper of papers) result[stageOf(paper.status)]++;
    return result;
  }, [papers]);

  const years = useMemo(() => [...new Set(papers.map((paper) => paper.year))].sort((a, b) => dateSort.compare(b, a)), [papers]);
  const selectedYear = years.includes(year === "unknown" ? "" : year) ? year : "";
  const groups = useMemo(() => {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const grouped = new Map<string, Paper[]>();
    const ordered = [...papers].sort((a, b) =>
      dateSort.compare(b.year, a.year)
      || stageOrder.indexOf(stageOf(a.status)) - stageOrder.indexOf(stageOf(b.status))
      || dateSort.compare(a.title, b.title)
    );
    for (const paper of ordered) {
      if (stage !== "all" && stageOf(paper.status) !== stage) continue;
      if (selectedYear && (paper.year || "unknown") !== selectedYear) continue;
      if (terms.length) {
        const searchable = [
          paper.title, paper.authors, paper.role, paper.journal, paper.kind, paper.status, paper.doi,
          paper.jcr, paper.cas, paper.indexing, paper.folder, paper.abstract, paper.notes, paper.evidence, paper.submissionUrl,
          ...paper.attempts.map((attempt) => [attempt.journal, attempt.manuscriptId, attempt.notes, attempt.submissionUrl].join(" ")),
          ...paper.files.map((file) => file.name),
        ].join(" ").toLowerCase();
        if (!terms.every((term) => searchable.includes(term))) continue;
      }
      const group = grouped.get(paper.year) ?? [];
      group.push(paper);
      grouped.set(paper.year, group);
    }
    return [...grouped];
  }, [papers, query, stage, selectedYear]);

  const resultCount = groups.reduce((total, [, entries]) => total + entries.length, 0);
  const detail = papers.find((paper) => paper.id === detailId);
  const disabled = loading || !!loadError || busy;

  function changeFilters() {
    setStage("all");
    setYear("");
    setQuery("");
  }

  function reloadData() {
    setLoadError("");
    setLoading(true);
    setReload((n) => n + 1);
  }

  function beginEdit(paper: Paper) {
    setDetailId("");
    setEditor(paper);
  }

  async function savePaper(paper: Paper) {
    setBusy(true);
    try {
      await request("/api/papers", "PUT", paper);
      setPapers((items) => [paper, ...items.filter((item) => item.id !== paper.id)]);
      setEditor(null);
      setDetailId(paper.id);
      announce("论文已保存");
    } catch (error) {
      announce(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function removePaper(paper: Paper) {
    if (!window.confirm("确定删除这条论文记录吗？\n" + paper.title)) return;
    setBusy(true);
    try {
      await request("/api/papers?id=" + encodeURIComponent(paper.id), "DELETE");
      setPapers((items) => items.filter((item) => item.id !== paper.id));
      setDetailId("");
      announce("记录已删除");
    } catch (error) {
      announce(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string, success: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      announce(success);
    } catch {
      const field = document.createElement("textarea");
      field.value = text;
      field.className = "clipboard-field";
      const target = document.querySelector("dialog[open]") || document.body;
      target.appendChild(field);
      field.select();
      try {
        announce(document.execCommand("copy") ? success : "可以选中文本手动复制。");
      } finally {
        field.remove();
      }
    }
  }

  async function openFolder(paper: Paper) {
    try {
      await request("/api/open-folder", "POST", { id: paper.id });
    } catch (error) {
      announce(errorMessage(error));
    }
  }

  function exportData() {
    const backup: Backup = { format: "paper-archive", version: 1, exportedAt: new Date().toISOString(), papers };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Intl.DateTimeFormat("sv-SE").format(new Date());
    link.href = url;
    link.download = "稿件档案-" + date + ".json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce("备份已导出");
  }

  async function importData(file?: File) {
    if (!file) return;
    setBusy(true);
    let added = 0;
    try {
      if (file.size > 5_000_000) throw new Error("请选择 5 MB 以内的 JSON 备份。");
      const input = JSON.parse((await file.text()).replace(/^\uFEFF/, ""));
      if (input?.format !== "paper-archive" || input?.version !== 1 || !Array.isArray(input.papers) || input.papers.length > 5000) {
        throw new Error("请选择由稿件档案导出的 JSON 备份。");
      }
      const records = unwrap(input.papers);
      if (records.length !== input.papers.length) throw new Error("备份中有无效的论文记录。");
      if (local) {
        const result = await request("/api/import", "POST", { format: "paper-archive", version: 1, papers: records });
        added = result.added ?? 0;
        reloadData();
        announce("已导入 " + added + " 条，跳过 " + (result.skipped ?? 0) + " 条已有记录");
      } else {
        const existing = new Set(papers.map((paper) => paper.id));
        for (const paper of records) {
          if (existing.has(paper.id)) continue;
          await request("/api/papers", "PUT", paper);
          setPapers((items) => [paper, ...items]);
          existing.add(paper.id);
          added++;
        }
        announce("已导入 " + added + " 条，跳过 " + (records.length - added) + " 条已有记录");
      }
    } catch (error) {
      announce(errorMessage(error) + (added ? "，已写入 " + added + " 条" : ""));
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="archive-app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark"><Archive size={18} /></span>
            <span>稿件档案</span>
            {demo ? <span className="local-mark">在线演示</span> : local && <span className="local-mark"><i /> 本地版</span>}
          </div>
          {demo ? (
            <a className="button secondary-button" href={demo.repositoryUrl + "#readme"}>GitHub 使用说明 <ExternalLink size={14} /></a>
          ) : (
            <div className="top-actions">
              <input ref={fileInput} hidden type="file" accept=".json,application/json" onChange={(event) => importData(event.target.files?.[0])} />
              <button className="button text-button" disabled={disabled} onClick={() => fileInput.current?.click()}><ArrowUpFromLine size={16} /> 导入</button>
              <button className="button text-button" disabled={disabled} onClick={exportData}><ArrowDownToLine size={16} /> 导出备份</button>
            </div>
          )}
        </div>
      </header>
      <main className="archive-main">
        <div className="page-heading">
          <div>
            <h1>我的论文</h1>
            {demo && <p>论文、期刊、分区和投稿记录均为虚构示例。</p>}
          </div>
          {demo ? (
            <a className="button primary-button" href={demo.repositoryUrl + "/generate"}>使用此模板 <ArrowRight size={16} /></a>
          ) : (
            <button className="button primary-button" disabled={disabled} onClick={() => beginEdit(emptyPaper())}><Plus size={19} /> 添加论文</button>
          )}
        </div>
        <nav className="stage-nav" aria-label="论文分类">
          {tabs.map(([key, label]) => (
            <button key={key} type="button" className="stage-tab" aria-pressed={stage === key} onClick={() => setStage(key)}>
              <span>{label}</span><span className="tab-count">{loading ? "–" : counts[key]}</span>
            </button>
          ))}
        </nav>
        <div className="filter-bar">
          <div className="filters">
            <label className="search-box">
              <Search size={18} />
              <input aria-label="搜索论文" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、作者、刊会或稿号" />
              {query && <button type="button" className="icon-button" aria-label="清除搜索" onClick={() => setQuery("")}><X size={15} /></button>}
            </label>
            <label className="year-box">
              <select aria-label="归档年份" value={selectedYear} onChange={(event) => setYear(event.target.value)}>
                <option value="">全部年份</option>
                {years.map((item) => <option key={item} value={item || "unknown"}>{item || "未标年份"}</option>)}
              </select>
              <ChevronDown size={15} />
            </label>
          </div>
          {!loading && !loadError && <span className="result-count" aria-live="polite">{resultCount} 条档案</span>}
        </div>

        {(loading || loadError || resultCount === 0) ? (
          <div className="empty-state">
            <FileText size={21} />
            <h2>{loading ? "正在读取档案" : loadError ? "无法读取档案" : papers.length ? "没有匹配的论文" : "还没有论文"}</h2>
            {loadError && <p>{loadError}</p>}
            {!loading && loadError && <button className="button secondary-button" onClick={reloadData}>重新读取</button>}
            {!loading && !loadError && (papers.length
              ? <button className="button secondary-button" onClick={changeFilters}>清除筛选</button>
              : !demo && <button className="button primary-button" onClick={() => beginEdit(emptyPaper())}><Plus size={17} /> 添加论文</button>)}
            {!local && loadError && <a className="plain-link" href="/signin-with-chatgpt?return_to=%2F" target="_top">登录</a>}
          </div>
        ) : (
          <div className="archive-table">
            <table>
              <colgroup><col className="col-paper" /><col className="col-status" /><col className="col-venue" /><col className="col-zones" /><col className="col-actions" /></colgroup>
              <thead><tr><th scope="col">论文</th><th scope="col">进度</th><th scope="col">期刊 / 会议</th><th scope="col">期刊分区</th><th scope="col" className="actions-heading">操作</th></tr></thead>
              {groups.map(([groupYear, entries]) => (
                <tbody key={groupYear}>
                  <tr className="year-row"><th colSpan={5} scope="rowgroup">{groupYear ? groupYear + " 年" : "未标年份"} <span>{entries.length} 条</span></th></tr>
                  {entries.map((paper) => (
                    <tr key={paper.id} className="paper-row">
                      <td>
                        <button className="paper-title" onClick={() => setDetailId(paper.id)}>{paper.title}</button>
                        <div className="paper-meta">
                          <span>{paper.kind}</span>
                          {paper.role && <span>{paper.role}</span>}
                          {paper.authors && <span className="authors">{paper.authors}</span>}
                        </div>
                      </td>
                      <td>
                        <div className="status-stack">
                          <StatusBadge status={paper.status} />
                          {isInSubmission(paper.status) && (
                            <SubmissionStatusLink paper={paper} onEdit={demo ? undefined : () => beginEdit(paper)} />
                          )}
                        </div>
                      </td>
                      <td className="venue-cell">{paper.journal || <span className="muted">—</span>}</td>
                      <td className="zone-cell">
                        <div className="zone-tags">
                          {paper.jcr && <span>JCR {paper.jcr}</span>}
                          {paper.cas && <span>中科院 {paper.cas}</span>}
                          {paper.indexing && <span>{paper.indexing}</span>}
                          {!paper.jcr && !paper.cas && !paper.indexing && <span className="zone-empty">—</span>}
                        </div>
                      </td>
                      <td>
                        <div className="row-actions">
                          {paper.folder && local && (
                            <button className="icon-button folder-quick" type="button" title="打开文件夹" aria-label={"打开文件夹，" + paper.title} onClick={() => openFolder(paper)}><FolderOpen size={17} /></button>
                          )}
                          <button className="icon-button row-detail" type="button" title="查看详情" aria-label={"查看详情，" + paper.title} onClick={() => setDetailId(paper.id)}><ArrowRight size={17} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        )}
      </main>
      {detail && (
        <ArchiveDetail
          key={detail.id} paper={detail} local={local} busy={busy} toast={toast}
          onClose={() => setDetailId("")}
          onEdit={demo ? undefined : () => beginEdit(detail)}
          onRemove={demo ? undefined : () => removePaper(detail)}
          onFolder={() => openFolder(detail)}
          copy={copy}
        />
      )}
      {editor && <ArchiveEditor key={editor.id} paper={editor} local={local} isNew={!papers.some((paper) => paper.id === editor.id)} busy={busy} onClose={() => setEditor(null)} onSave={savePaper} toast={toast} />}
      {!detail && !editor && toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function SubmissionStatusLink({ paper, onEdit }: { paper: Paper; onEdit?: () => void }) {
  const href = currentSubmissionUrl(paper);
  if (href) return <SubmissionLink href={href} />;
  return onEdit ? <button type="button" className="submission-link submission-missing" onClick={onEdit}>补投稿链接</button> : null;
}
