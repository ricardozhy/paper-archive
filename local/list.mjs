import { openStore } from "./store.mjs";

const store = openStore();
try {
  const papers = store.list().map(({ id, title, doi, journal, status }) => ({
    id, title, doi, journal, status,
  }));
  console.log(JSON.stringify(papers, null, 2));
} finally {
  store.close();
}
