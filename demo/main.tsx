import { createRoot } from "react-dom/client";
import PaperArchive from "../app/paper-archive";
import backup from "../examples/archive.json";
import "../app/globals.css";

const demo = {
  papers: backup.papers,
  repositoryUrl: "https://github.com/ricardozhy/paper-archive",
};

createRoot(document.getElementById("root")!).render(<PaperArchive demo={demo} />);
