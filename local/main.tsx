import { createRoot } from "react-dom/client";
import PaperArchive from "../app/paper-archive";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(<PaperArchive local />);
