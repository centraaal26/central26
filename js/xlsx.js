// Central 26 — leitura e escrita de ficheiros Excel (SheetJS), carregado só quando é preciso.
let sheetjs = null;
export function carregarXlsx() {
  if (sheetjs) return sheetjs;
  sheetjs = new Promise((ok, falha) => {
    const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    s.onload = () => ok(window.XLSX); s.onerror = () => { sheetjs = null; falha(new Error("Não foi possível carregar o leitor de Excel. Verifica a ligação à Internet.")); };
    document.head.appendChild(s);
  });
  return sheetjs;
}
