# 稿件档案

在本机整理在写、在投、返修、转投、录用和发表的论文。网页按状态和年份筛选，保留每轮投稿的期刊、稿号与作者入口，并把原稿、返修材料和录用通知链接到原来的文件夹。可以用这个模板建立自己的档案，并按需修改网页。

## 交给 Codex 或 Claude Code 整理

1. [使用此模板](https://github.com/ricardozhy/paper-archive/generate)创建自己的仓库，或克隆本仓库。

   ```bash
   git clone https://github.com/ricardozhy/paper-archive.git
   cd paper-archive
   ```

2. 用 Codex 或 Claude Code 打开克隆后的目录，确保它能访问你指定的论文文件夹。项目自带 [Codex 指令](AGENTS.md) 和 [Claude Code 指令](CLAUDE.md)。
3. 把下面这段话发给它，将占位文字替换为实际文件夹路径。手上有投稿清单、录用邮件或已导出的档案时，也可以指定对应文件。

   > 请把「我的论文文件夹路径」里的论文整理到这个网页。按在写、在投（含返修）、待转投、已录用和已发表分类。保留原文件的路径，合并同一篇论文的多个版本。在投论文填写稿号和已核实的官方投稿网页，已发表论文尽量补 DOI 和引用信息。缺少依据的记录标为待确认。整理后导入本机档案，启动网页，并告诉我各状态的数量。

## 自己启动和编辑

安装 **Node.js 22.13 或更新版本**。在 Windows 上双击 `start.cmd`，它会在需要时安装依赖、构建网页并在后台启动。也可以在 Windows、macOS 或 Linux 的项目终端运行：

```bash
npm ci
npm run build
npm start
```

打开 [本机稿件档案](http://127.0.0.1:4317/)。首次启动为空，点击「添加论文」可以手动填写。点击论文标题后可编辑 JCR 分区、中科院分区及分区年份，也可以打开文件夹、查看投稿历程。录用与发表类记录支持复制手动引用、GB/T 7714、APA 和 BibTeX，以及打开 Google 或 Google 学术搜索。自动生成的引用可根据正式出版信息修订。

默认端口是 4317。如果同一台机器已有另一份档案，先在启动终端设置 `PAPER_ARCHIVE_PORT`（PowerShell 用 `$env:PAPER_ARCHIVE_PORT = '4318'`，bash 用 `export PAPER_ARCHIVE_PORT=4318`），再启动并打开对应端口。

如果只想先试用，在网页点击「导入」并选择 [虚构演示档案](examples/archive.json)。

## 批量导入和备份

代理生成的 JSON 和网页导出的备份都采用 [档案格式](examples/archive.json)。可以从网页导入，也可以在终端预览后导入。用第二条命令实际写入，新记录按编号去重。

```bash
npm run archive:import -- ".local-data/import.json" --dry-run
npm run archive:import -- ".local-data/import.json"
npm run archive:list
```

把 `.local-data/import.json` 换成实际备份路径。导入后，在已打开的网页刷新即可看到新记录。点击「导出备份」可保存档案信息和文件路径，原稿需要另行备份。

网站监听 `127.0.0.1`，数据保存在项目内的 `.local-data/archive.sqlite`。建议把本人的导入文件和备份也放在已被 Git 忽略的 `.local-data/`，原稿放在各自的论文目录。Codex 或 Claude Code 对读取资料的处理取决于所用工具的设置。
