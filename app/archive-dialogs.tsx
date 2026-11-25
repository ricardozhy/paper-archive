"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Clipboard, ExternalLink, FileText, FolderOpen, Pencil, Plus, Trash2, X } from "lucide-react";
import { casOptions, citationFor, currentSubmissionUrl, emptyAttempt, isInSubmission, jcrOptions, kinds, normalize, safeUrl, searchUrl, stageOf, statuses } from "./archive-data";
import type { Attempt, CitationStyle, Paper } from "./archive-data";

export function StatusBadge({ status }: { status: string }) {
  return <span className={"status-badge " + stageOf(status)}><i />{status || "待确认"}</span>;
}

export function SubmissionLink({ href, label = "投稿网页" }: { href: string; label?: string }) {
  return (
    <a className="submission-link" href={href} target="_blank" rel="noopener noreferrer">
      {label}<ExternalLink size={12} />
    </a>
  );
}

function Dialog({ children, onClose, busy }: { children: ReactNode; onClose: () => void; busy: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);
  return (
    <dialog
      ref={ref} className="dialog" aria-labelledby="dialog-title"
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}
    >
      <div className="dialog-frame">{children}</div>
    </dialog>
  );
}

function DialogHeader({ children, onClose, busy }: { children: ReactNode; onClose: () => void; busy: boolean }) {
  return (
    <header className="dialog-header">
      <h2 id="dialog-title">{children}</h2>
      <button className="icon-button" type="button" aria-label="关闭" disabled={busy} onClick={onClose}><X size={19} /></button>
    </header>
  );
}

function FormSelect({ label, value, options, onChange, blank }: {
  label: string; value: string; options: readonly string[]; onChange: (value: string) => void; blank?: string;
}) {
  return (
    <label className="field">{label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {blank && <option value="">{blank}</option>}
        {value && !options.includes(value) && <option>{value}</option>}
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}

type EditorProps = {
  paper: Paper; local: boolean; isNew: boolean; busy: boolean; toast: string;
  onClose: () => void; onSave: (paper: Paper) => void;
};

export function ArchiveEditor({ paper, local, isNew, busy, toast, onClose, onSave }: EditorProps) {
  const [draft, setDraft] = useState<Paper>(() => structuredClone(paper));
  const [error, setError] = useState("");
  const patch = (changes: Partial<Paper>) => setDraft((current) => ({ ...current, ...changes }));

  function updateAttempt(index: number, changes: Partial<Attempt>) {
    setDraft((current) => ({
      ...current,
      attempts: current.attempts.map((attempt, i) => i === index ? { ...attempt, ...changes } : attempt),
    }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = normalize(draft);
    if (!normalized) { setError("请填写论文标题。"); return; }
    if (normalized.paperUrl && !safeUrl(normalized.paperUrl)) {
      setError("论文链接需以 http:// 或 https:// 开头。");
      return;
    }
    if (normalized.submissionUrl && !safeUrl(normalized.submissionUrl)) {
      setError("当前投稿网页需以 http:// 或 https:// 开头。");
      return;
    }
    const invalidAttempt = normalized.attempts.findIndex((attempt) => attempt.submissionUrl && !safeUrl(attempt.submissionUrl));
    if (invalidAttempt !== -1) {
      setError("第 " + (invalidAttempt + 1) + " 次投稿的网址需以 http:// 或 https:// 开头。");
      return;
    }
    setError("");
    onSave(normalized);
  }

  return (
    <Dialog onClose={onClose} busy={busy}>
      <form className="editor-form" onSubmit={submit}>
        <DialogHeader onClose={onClose} busy={busy}>{isNew ? "添加论文" : "编辑论文"}</DialogHeader>
        <div className="dialog-body editor-body">
          <section className="form-section">
            <h3>基本信息</h3>
            <div className="form-grid">
              <label className="field full"><span>论文标题 <span className="required" aria-hidden="true">*</span></span>
                <input autoFocus required maxLength={500} value={draft.title} onChange={(event) => patch({ title: event.target.value })} />
              </label>
              <label className="field full">作者
                <input placeholder="用分号分隔作者姓名" value={draft.authors} onChange={(event) => patch({ authors: event.target.value })} />
              </label>
              <FormSelect label="类型" value={draft.kind} options={kinds} onChange={(kind) => patch({ kind })} />
              <label className="field">本人角色<input value={draft.role} onChange={(event) => patch({ role: event.target.value })} placeholder="如第一作者、合作研究" /></label>
              <label className="field">归档年份<input type="number" min="1900" max="2100" value={draft.year} onChange={(event) => patch({ year: event.target.value })} /></label>
              <FormSelect label="当前进度" value={draft.status} options={statuses} onChange={(status) => patch({ status })} />
              <label className="field full">期刊 / 会议 / 授予单位<input value={draft.journal} onChange={(event) => patch({ journal: event.target.value })} /></label>
              <label className="field full">当前投稿网页
                <input type="url" value={draft.submissionUrl} placeholder="留空时使用最近一次在投记录的投稿网页" onChange={(event) => patch({ submissionUrl: event.target.value })} />
              </label>
              <FormSelect label="JCR 分区" value={draft.jcr} options={jcrOptions} blank="未标注" onChange={(jcr) => patch({ jcr })} />
              <FormSelect label="中科院分区" value={draft.cas} options={casOptions} blank="未标注" onChange={(cas) => patch({ cas })} />
              <label className="field">分区年份<input type="number" min="1900" max="2100" value={draft.zoneYear} onChange={(event) => patch({ zoneYear: event.target.value })} /></label>
              <label className="field">收录或等级<input value={draft.indexing} onChange={(event) => patch({ indexing: event.target.value })} placeholder="如 CSSCI、CCF A" /></label>
              <label className="field full">摘要或研究内容<textarea rows={4} value={draft.abstract} onChange={(event) => patch({ abstract: event.target.value })} /></label>
            </div>
          </section>
          <section className="form-section">
            <h3>文件与链接</h3>
            <div className="form-grid">
              <label className="field full">本地文件夹地址
                <input value={draft.folder} onChange={(event) => patch({ folder: event.target.value })} placeholder="填写本机绝对路径" />
              </label>
              <label className="field full">论文链接 / Google 搜索 URL<input type="url" value={draft.paperUrl} onChange={(event) => patch({ paperUrl: event.target.value })} placeholder="https://…" /></label>
            </div>
            {local && (
              <div className="editor-files">
                {draft.files.map((file, index) => (
                  <div className="attachment-fields" key={index}>
                    <label className="field">文件名称
                      <input value={file.name} onChange={(event) => patch({ files: draft.files.map((item, i) => i === index ? { ...item, name: event.target.value } : item) })} />
                    </label>
                    <label className="field">文件绝对路径
                      <input value={file.path} onChange={(event) => patch({ files: draft.files.map((item, i) => i === index ? { ...item, path: event.target.value } : item) })} />
                    </label>
                    <button className="icon-button" type="button" aria-label="移除文件链接" onClick={() => patch({ files: draft.files.filter((_, i) => i !== index) })}><X size={16} /></button>
                  </div>
                ))}
                <button type="button" className="button secondary-button" disabled={draft.files.length >= 40} onClick={() => patch({ files: [...draft.files, { name: "", path: "" }] })}><Plus size={16} /> 添加文件链接</button>
              </div>
            )}
          </section>
          <section className="form-section">
            <h3>出版与引用</h3>
            <div className="form-grid">
              <label className="field">发表年份<input type="number" min="1900" max="2100" value={draft.publicationYear} onChange={(event) => patch({ publicationYear: event.target.value })} /></label>
              <label className="field">发表日期<input type="date" value={draft.publicationDate} onChange={(event) => patch({ publicationDate: event.target.value })} /></label>
              <label className="field">卷<input value={draft.volume} onChange={(event) => patch({ volume: event.target.value })} /></label>
              <label className="field">期<input value={draft.issue} onChange={(event) => patch({ issue: event.target.value })} /></label>
              <label className="field">页码或文章编号<input value={draft.pages} onChange={(event) => patch({ pages: event.target.value })} /></label>
              <label className="field">DOI<input value={draft.doi} onChange={(event) => patch({ doi: event.target.value })} /></label>
              <label className="field full">自定义引用格式<textarea rows={3} value={draft.citation} onChange={(event) => patch({ citation: event.target.value })} /></label>
            </div>
          </section>
          <section className="form-section">
            <div className="section-heading">
              <h3>投稿与转投</h3>
              <button className="button secondary-button" type="button" disabled={draft.attempts.length >= 100} onClick={() => patch({ attempts: [...draft.attempts, emptyAttempt()] })}><Plus size={16} /> 添加投稿记录</button>
            </div>
            {draft.attempts.map((attempt, index) => (
              <div className="attempt-fields" key={attempt.id + index}>
                <div className="section-heading">
                  <h4>第 {index + 1} 次投稿</h4>
                  <button type="button" className="button text-button" onClick={() => patch({ attempts: draft.attempts.filter((_, i) => i !== index) })}><Trash2 size={15} /> 移除</button>
                </div>
                <div className="form-grid">
                  <label className="field">刊会<input value={attempt.journal} onChange={(event) => updateAttempt(index, { journal: event.target.value })} /></label>
                  <label className="field">稿号<input value={attempt.manuscriptId} onChange={(event) => updateAttempt(index, { manuscriptId: event.target.value })} /></label>
                  <label className="field full">本次投稿网页
                    <input type="url" value={attempt.submissionUrl} placeholder="稿件详情页或投稿系统网址" onChange={(event) => updateAttempt(index, { submissionUrl: event.target.value })} />
                  </label>
                  <label className="field">投稿日期<input type="date" value={attempt.date} onChange={(event) => updateAttempt(index, { date: event.target.value })} /></label>
                  <label className="field">结果日期<input type="date" value={attempt.decisionDate} onChange={(event) => updateAttempt(index, { decisionDate: event.target.value })} /></label>
                  <FormSelect label="进度或结果" value={attempt.status} options={statuses} onChange={(status) => updateAttempt(index, { status })} />
                  <FormSelect label="JCR 分区" value={attempt.jcr} options={jcrOptions} blank="未标注" onChange={(jcr) => updateAttempt(index, { jcr })} />
                  <FormSelect label="中科院分区" value={attempt.cas} options={casOptions} blank="未标注" onChange={(cas) => updateAttempt(index, { cas })} />
                  <label className="field full">备注<textarea rows={2} value={attempt.notes} onChange={(event) => updateAttempt(index, { notes: event.target.value })} /></label>
                </div>
              </div>
            ))}
          </section>
          <section className="form-section">
            <h3>依据与备注</h3>
            <div className="form-grid">
              <label className="field full">状态依据<textarea rows={2} value={draft.evidence} onChange={(event) => patch({ evidence: event.target.value })} /></label>
              <label className="field full">备注<textarea rows={3} value={draft.notes} onChange={(event) => patch({ notes: event.target.value })} /></label>
            </div>
          </section>
        </div>
        <footer className="dialog-footer">
          <p className="message-error" role="status">{error || toast}</p>
          <button className="button secondary-button" type="button" onClick={onClose} disabled={busy}>取消</button>
          <button className="button primary-button" type="submit" disabled={busy}>{busy ? "保存中…" : "保存论文"}</button>
        </footer>
      </form>
    </Dialog>
  );
}

type DetailProps = {
  paper: Paper; local: boolean; busy: boolean; toast: string;
  onClose: () => void; onEdit?: () => void; onRemove?: () => void; onFolder: () => void;
  copy: (text: string, message: string) => void;
};

const styles: CitationStyle[] = ["手动引用", "GB/T 7714", "APA", "BibTeX"];

export function ArchiveDetail({ paper, local, busy, toast, onClose, onEdit, onRemove, onFolder, copy }: DetailProps) {
  const [style, setStyle] = useState<CitationStyle>(paper.citation ? "手动引用" : "GB/T 7714");
  const accepted = stageOf(paper.status) === "accepted";
  const submissionUrl = isInSubmission(paper.status) ? currentSubmissionUrl(paper) : "";
  const citation = citationFor(paper, style);
  const link = safeUrl(paper.paperUrl);
  const showCitation = accepted || paper.citation || paper.publicationYear;
  const metadata = [
    ["刊会或单位", paper.journal],
    ["归档年份", paper.year], ["发表时间", paper.publicationDate || paper.publicationYear],
    ["卷期与页码", [paper.volume && "卷 " + paper.volume, paper.issue && "期 " + paper.issue, paper.pages].filter(Boolean).join(" · ")],
    ["JCR 分区", paper.jcr], ["中科院分区", paper.cas], ["分区年份", paper.zoneYear], ["收录或等级", paper.indexing],
  ].filter(([, value]) => value);
  const fileUrl = "/api/file?paper=" + encodeURIComponent(paper.id) + "&index=";

  return (
    <Dialog onClose={onClose} busy={busy}>
      <DialogHeader onClose={onClose} busy={busy}>论文详情</DialogHeader>
      <div className="dialog-body detail-body">
        <div className="detail-kicker">
          <StatusBadge status={paper.status} /><span>{paper.kind}</span>{paper.role && <span>· {paper.role}</span>}
          {submissionUrl && <SubmissionLink href={submissionUrl} />}
        </div>
        <h3 className="detail-title">{paper.title}</h3>
        {paper.authors && <p className="detail-authors">{paper.authors}</p>}
        {metadata.length > 0 && (
          <dl className="detail-metadata">
            {metadata.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
        )}

        {(paper.folder || paper.files.length > 0 || accepted || link || paper.doi) && (
          <section className="detail-section">
            <h4>文件与链接</h4>
            {paper.folder && (
              <div className="folder-card">
                <FolderOpen size={17} />
                <span className="folder-path">{paper.folder}</span>
                <div className="folder-actions">
                  {local && <button className="button secondary-button" onClick={onFolder}>打开文件夹</button>}
                  <button className="button text-button" onClick={() => copy(paper.folder, "地址已复制")}>复制地址</button>
                </div>
              </div>
            )}
            {local && paper.files.length > 0 && (
              <ul className="attachment-list">
                {paper.files.map((file, index) => {
                  const ext = file.path.split(".").pop()?.toUpperCase() || "文件";
                  return (
                    <li key={index}>
                      <a className="attachment-link" href={fileUrl + index} target="_blank" rel="noopener noreferrer" title={file.path}>
                        <FileText size={17} /><span>{file.name}</span><span className="file-ext">{ext}</span><ExternalLink size={14} />
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="detail-links">
              {link && <a href={link} target="_blank" rel="noreferrer">论文链接 <ExternalLink size={14} /></a>}
              {paper.doi && (
                <a href={"https://doi.org/" + encodeURI(paper.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, ""))} target="_blank" rel="noreferrer">
                  DOI {paper.doi} <ExternalLink size={14} />
                </a>
              )}
              {accepted && (
                <>
                  <a href={searchUrl(paper.title, true)} target="_blank" rel="noreferrer">Google 学术 <ExternalLink size={14} /></a>
                  <a href={searchUrl(paper.title)} target="_blank" rel="noreferrer">Google 搜索 <ExternalLink size={14} /></a>
                  <button className="button text-button" onClick={() => copy(searchUrl(paper.title), "Google 搜索链接已复制")}><Clipboard size={14} /> 复制搜索 URL</button>
                </>
              )}
            </div>
          </section>
        )}
        {paper.abstract && <section className="detail-section"><h4>摘要或研究内容</h4><p className="detail-text">{paper.abstract}</p></section>}
        {paper.attempts.length > 0 && (
          <section className="detail-section">
            <h4>投稿与转投记录</h4>
            <ol className="timeline">
              {paper.attempts.map((attempt, index) => {
                const href = safeUrl(attempt.submissionUrl);
                return (
                  <li key={attempt.id + index}>
                    <div className="timeline-heading"><strong>{attempt.journal || "未填刊会"}</strong><StatusBadge status={attempt.status} /></div>
                    <div className="timeline-meta">
                      <span>{[
                        attempt.manuscriptId && "稿号 " + attempt.manuscriptId, attempt.date && "投稿 " + attempt.date,
                        attempt.decisionDate && "结果 " + attempt.decisionDate, attempt.jcr && "JCR " + attempt.jcr, attempt.cas && "中科院 " + attempt.cas,
                      ].filter(Boolean).join(" · ")}</span>
                      {href && <SubmissionLink href={href} label="本次投稿网页" />}
                    </div>
                    {attempt.notes && <p className="detail-text">{attempt.notes}</p>}
                  </li>
                );
              })}
            </ol>
          </section>
        )}
        {showCitation && (
          <section className="detail-section">
            <div className="section-heading">
              <h4>引用</h4>
              <select className="citation-select" aria-label="引用格式" value={style} onChange={(event) => setStyle(event.target.value as CitationStyle)}>
                {styles.map((format) => <option key={format}>{format}</option>)}
              </select>
            </div>
            <div className="citation-box">
              <p className={style === "BibTeX" ? "code-text" : ""}>{citation || "尚未填写手动引用。"}</p>
              <button className="button secondary-button" onClick={() => copy(citation, "引用已复制")} disabled={!citation}><Clipboard size={14} /> 复制</button>
            </div>
            {style !== "手动引用" && <p className="helper">引用草稿根据已填写的出版信息生成。</p>}
          </section>
        )}
        {paper.evidence && <section className="detail-section"><h4>状态依据</h4><p className="detail-text">{paper.evidence}</p></section>}
        {paper.notes && <section className="detail-section"><h4>备注</h4><p className="detail-text">{paper.notes}</p></section>}
      </div>
      <footer className="dialog-footer">
        {onRemove && <button className="button delete-button" onClick={onRemove} disabled={busy}><Trash2 size={15} /> 删除记录</button>}
        <p className="dialog-status" role="status">{toast}</p>
        {onEdit ? (
          <button className="button primary-button" onClick={onEdit} disabled={busy}><Pencil size={15} /> 编辑论文</button>
        ) : (
          <button className="button secondary-button" onClick={onClose}>返回列表</button>
        )}
      </footer>
    </Dialog>
  );
}
