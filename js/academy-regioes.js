// Central 26 — concelhos de Portugal e a região NUTS II (2024) de cada um.
// Fonte: CAOP 2025 (Direção-Geral do Território) para os códigos e nomes; NUTS 2024 (Regulamento Delegado (UE) 2023/674)
// para as regiões: o Oeste, o Médio Tejo e a Lezíria do Tejo formam o «Oeste e Vale do Tejo»; a antiga Área
// Metropolitana de Lisboa divide-se em «Grande Lisboa» e «Península de Setúbal».
import { normalizar } from "./dados.js";

export const REGIOES = ["Norte", "Centro", "Oeste e Vale do Tejo", "Grande Lisboa", "Península de Setúbal", "Alentejo", "Algarve", "Açores", "Madeira", "Estrangeiro"];
const R2 = { N: "Norte", C: "Centro", O: "Oeste e Vale do Tejo", L: "Grande Lisboa", S: "Península de Setúbal", A: "Alentejo", F: "Algarve", Z: "Açores", M: "Madeira" };
const DADOS = "0101|Águeda|C;0102|Albergaria-a-Velha|C;0103|Anadia|C;0104|Arouca|N;0105|Aveiro|C;0106|Castelo de Paiva|N;0107|Espinho|N;0108|Estarreja|C;0109|Santa Maria da Feira|N;0110|Ílhavo|C;0111|Mealhada|C;0112|Murtosa|C;0113|Oliveira de Azeméis|N;0114|Oliveira do Bairro|C;0115|Ovar|C;0116|São João da Madeira|N;0117|Sever do Vouga|C;0118|Vagos|C;0119|Vale de Cambra|N;0201|Aljustrel|A;0202|Almodôvar|A;0203|Alvito|A;0204|Barrancos|A;0205|Beja|A;0206|Castro Verde|A;0207|Cuba|A;0208|Ferreira do Alentejo|A;0209|Mértola|A;0210|Moura|A;0211|Odemira|A;0212|Ourique|A;0213|Serpa|A;0214|Vidigueira|A;0301|Amares|N;0302|Barcelos|N;0303|Braga|N;0304|Cabeceiras de Basto|N;0305|Celorico de Basto|N;0306|Esposende|N;0307|Fafe|N;0308|Guimarães|N;0309|Póvoa de Lanhoso|N;0310|Terras de Bouro|N;0311|Vieira do Minho|N;0312|Vila Nova de Famalicão|N;0313|Vila Verde|N;0314|Vizela|N;0401|Alfândega da Fé|N;0402|Bragança|N;0403|Carrazeda de Ansiães|N;0404|Freixo de Espada à Cinta|N;0405|Macedo de Cavaleiros|N;0406|Miranda do Douro|N;0407|Mirandela|N;0408|Mogadouro|N;0409|Torre de Moncorvo|N;0410|Vila Flor|N;0411|Vimioso|N;0412|Vinhais|N;0501|Belmonte|C;0502|Castelo Branco|C;0503|Covilhã|C;0504|Fundão|C;0505|Idanha-a-Nova|C;0506|Oleiros|C;0507|Penamacor|C;0508|Proença-a-Nova|C;0509|Sertã|O;0510|Vila de Rei|O;0511|Vila Velha de Ródão|C;0601|Arganil|C;0602|Cantanhede|C;0603|Coimbra|C;0604|Condeixa-a-Nova|C;0605|Figueira da Foz|C;0606|Góis|C;0607|Lousã|C;0608|Mira|C;0609|Miranda do Corvo|C;0610|Montemor-o-Velho|C;0611|Oliveira do Hospital|C;0612|Pampilhosa da Serra|C;0613|Penacova|C;0614|Penela|C;0615|Soure|C;0616|Tábua|C;0617|Vila Nova de Poiares|C;0701|Alandroal|A;0702|Arraiolos|A;0703|Borba|A;0704|Estremoz|A;0705|Évora|A;0706|Montemor-o-Novo|A;0707|Mora|A;0708|Mourão|A;0709|Portel|A;0710|Redondo|A;0711|Reguengos de Monsaraz|A;0712|Vendas Novas|A;0713|Viana do Alentejo|A;0714|Vila Viçosa|A;0801|Albufeira|F;0802|Alcoutim|F;0803|Aljezur|F;0804|Castro Marim|F;0805|Faro|F;0806|Lagoa|F;0807|Lagos|F;0808|Loulé|F;0809|Monchique|F;0810|Olhão|F;0811|Portimão|F;0812|São Brás de Alportel|F;0813|Silves|F;0814|Tavira|F;0815|Vila do Bispo|F;0816|Vila Real de Santo António|F;0901|Aguiar da Beira|C;0902|Almeida|C;0903|Celorico da Beira|C;0904|Figueira de Castelo Rodrigo|C;0905|Fornos de Algodres|C;0906|Gouveia|C;0907|Guarda|C;0908|Manteigas|C;0909|Mêda|C;0910|Pinhel|C;0911|Sabugal|C;0912|Seia|C;0913|Trancoso|C;0914|Vila Nova de Foz Côa|N;1001|Alcobaça|O;1002|Alvaiázere|C;1003|Ansião|C;1004|Batalha|C;1005|Bombarral|O;1006|Caldas da Rainha|O;1007|Castanheira de Pera|C;1008|Figueiró dos Vinhos|C;1009|Leiria|C;1010|Marinha Grande|C;1011|Nazaré|O;1012|Óbidos|O;1013|Pedrógão Grande|C;1014|Peniche|O;1015|Pombal|C;1016|Porto de Mós|C;1101|Alenquer|O;1102|Arruda dos Vinhos|O;1103|Azambuja|O;1104|Cadaval|O;1105|Cascais|L;1106|Lisboa|L;1107|Loures|L;1108|Lourinhã|O;1109|Mafra|L;1110|Oeiras|L;1111|Sintra|L;1112|Sobral de Monte Agraço|O;1113|Torres Vedras|O;1114|Vila Franca de Xira|L;1115|Amadora|L;1116|Odivelas|L;1201|Alter do Chão|A;1202|Arronches|A;1203|Avis|A;1204|Campo Maior|A;1205|Castelo de Vide|A;1206|Crato|A;1207|Elvas|A;1208|Fronteira|A;1209|Gavião|A;1210|Marvão|A;1211|Monforte|A;1212|Nisa|A;1213|Ponte de Sor|A;1214|Portalegre|A;1215|Sousel|A;1301|Amarante|N;1302|Baião|N;1303|Felgueiras|N;1304|Gondomar|N;1305|Lousada|N;1306|Maia|N;1307|Marco de Canaveses|N;1308|Matosinhos|N;1309|Paços de Ferreira|N;1310|Paredes|N;1311|Penafiel|N;1312|Porto|N;1313|Póvoa de Varzim|N;1314|Santo Tirso|N;1315|Valongo|N;1316|Vila do Conde|N;1317|Vila Nova de Gaia|N;1318|Trofa|N;1401|Abrantes|O;1402|Alcanena|O;1403|Almeirim|O;1404|Alpiarça|O;1405|Benavente|O;1406|Cartaxo|O;1407|Chamusca|O;1408|Constância|O;1409|Coruche|O;1410|Entroncamento|O;1411|Ferreira do Zêzere|O;1412|Golegã|O;1413|Mação|O;1414|Rio Maior|O;1415|Salvaterra de Magos|O;1416|Santarém|O;1417|Sardoal|O;1418|Tomar|O;1419|Torres Novas|O;1420|Vila Nova da Barquinha|O;1421|Ourém|O;1501|Alcácer do Sal|A;1502|Alcochete|S;1503|Almada|S;1504|Barreiro|S;1505|Grândola|A;1506|Moita|S;1507|Montijo|S;1508|Palmela|S;1509|Santiago do Cacém|A;1510|Seixal|S;1511|Sesimbra|S;1512|Setúbal|S;1513|Sines|A;1601|Arcos de Valdevez|N;1602|Caminha|N;1603|Melgaço|N;1604|Monção|N;1605|Paredes de Coura|N;1606|Ponte da Barca|N;1607|Ponte de Lima|N;1608|Valença|N;1609|Viana do Castelo|N;1610|Vila Nova de Cerveira|N;1701|Alijó|N;1702|Boticas|N;1703|Chaves|N;1704|Mesão Frio|N;1705|Mondim de Basto|N;1706|Montalegre|N;1707|Murça|N;1708|Peso da Régua|N;1709|Ribeira de Pena|N;1710|Sabrosa|N;1711|Santa Marta de Penaguião|N;1712|Valpaços|N;1713|Vila Pouca de Aguiar|N;1714|Vila Real|N;1801|Armamar|N;1802|Carregal do Sal|C;1803|Castro Daire|C;1804|Cinfães|N;1805|Lamego|N;1806|Mangualde|C;1807|Moimenta da Beira|N;1808|Mortágua|C;1809|Nelas|C;1810|Oliveira de Frades|C;1811|Penalva do Castelo|C;1812|Penedono|N;1813|Resende|N;1814|Santa Comba Dão|C;1815|São João da Pesqueira|N;1816|São Pedro do Sul|C;1817|Sátão|C;1818|Sernancelhe|N;1819|Tabuaço|N;1820|Tarouca|N;1821|Tondela|C;1822|Vila Nova de Paiva|C;1823|Viseu|C;1824|Vouzela|C;3101|Calheta|M;3102|Câmara de Lobos|M;3103|Funchal|M;3104|Machico|M;3105|Ponta do Sol|M;3106|Porto Moniz|M;3107|Ribeira Brava|M;3108|Santa Cruz|M;3109|Santana|M;3110|São Vicente|M;3201|Porto Santo|M;4101|Vila do Porto|Z;4201|Lagoa|Z;4202|Nordeste|Z;4203|Ponta Delgada|Z;4204|Povoação|Z;4205|Ribeira Grande|Z;4206|Vila Franca do Campo|Z;4301|Angra do Heroísmo|Z;4302|Praia da Vitória|Z;4401|Santa Cruz da Graciosa|Z;4501|Calheta|Z;4502|Velas|Z;4601|Lajes do Pico|Z;4602|Madalena|Z;4603|São Roque do Pico|Z;4701|Horta|Z;4801|Lajes das Flores|Z;4802|Santa Cruz das Flores|Z;4901|Corvo|Z";
export const CONCELHOS = DADOS.split(";").map((x) => { const [codigo, nome, r] = x.split("|"); return { codigo, nome, regiao: R2[r], dt: codigo.slice(0, 2) }; });

const n = (s) => normalizar(String(s || "")).replace(/\(.*?\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
const porNome = new Map();
for (const c of CONCELHOS) { const k = n(c.nome); if (!porNome.has(k)) porNome.set(k, []); porNome.get(k).push(c); }
// nomes que aparecem escritos de outra forma
const SINONIMOS = { "gaia": "vila nova de gaia", "feira": "santa maria da feira", "v n gaia": "vila nova de gaia", "vn gaia": "vila nova de gaia", "povoa de varzim": "povoa de varzim",
  "calheta sao jorge": "calheta", "praia vitoria": "praia da vitoria", "vila franca": "vila franca de xira", "famalicao": "vila nova de famalicao", "v n famalicao": "vila nova de famalicao",
  "lagoa acores": "lagoa", "lagoa algarve": "lagoa", "sao joao madeira": "sao joao da madeira", "oliveira azemeis": "oliveira de azemeis", "ponte lima": "ponte de lima" };

const ILHAS_ACORES = /a[cç]ores|s[aã]o miguel|terceira|faial|pico|s[aã]o jorge|graciosa|flores|corvo|santa maria|ponta delgada|angra/i;
const MADEIRA = /madeira|porto santo|funchal/i;
const ehAcores = (t) => ILHAS_ACORES.test(t || "");
const ehMadeira = (t) => MADEIRA.test(t || "");

// Distritos inteiros numa só região (para quando só se sabe o distrito)
const DISTRITO = {
  "viana do castelo": "Norte", "braga": "Norte", "porto": "Norte", "vila real": "Norte", "braganca": "Norte",
  "aveiro": "Centro", "viseu": "Centro", "guarda": "Centro", "coimbra": "Centro", "castelo branco": "Centro", "leiria": "Centro",
  "santarem": "Oeste e Vale do Tejo", "lisboa": "Grande Lisboa", "setubal": "Península de Setúbal",
  "portalegre": "Alentejo", "evora": "Alentejo", "beja": "Alentejo", "faro": "Algarve",
};
// Distritos que têm concelhos em mais do que uma região: aí o distrito sozinho é só uma aproximação
const DISTRITO_MISTO = new Set(["aveiro", "viseu", "guarda", "castelo branco", "leiria", "lisboa", "setubal"]);

function escolher(lista, f) {
  if (lista.length === 1) return lista[0];
  const pista = [f.distrito, f.localidade, f.concelho].join(" ");
  if (ehAcores(pista)) return lista.find((c) => c.regiao === "Açores") || lista[0];
  if (ehMadeira(pista)) return lista.find((c) => c.regiao === "Madeira") || lista[0];
  return lista.find((c) => c.regiao !== "Açores" && c.regiao !== "Madeira") || lista[0];
}

// Região de residência de um formando: pelo concelho; senão pela localidade (quando é um concelho); senão pelo distrito.
export function resolverRegiao(f) {
  const pais = n(f.pais);
  if (pais && pais !== "portugal") return { regiao: "Estrangeiro", concelho_codigo: "", aprox: false };
  for (const campo of ["concelho", "localidade"]) {
    let k = n(f[campo]); k = SINONIMOS[k] || k;
    const lista = porNome.get(k);
    if (lista) { const c = escolher(lista, f); return { regiao: c.regiao, concelho_codigo: c.codigo, concelho: c.nome, aprox: false }; }
  }
  const d = n(f.distrito);
  if (ehAcores(f.distrito)) return { regiao: "Açores", concelho_codigo: "", aprox: true };
  if (ehMadeira(f.distrito)) return { regiao: "Madeira", concelho_codigo: "", aprox: true };
  if (DISTRITO[d]) return { regiao: DISTRITO[d], concelho_codigo: "", aprox: DISTRITO_MISTO.has(d) };
  const cp = /^\d{4}$/.test(String(f.cp4 || "").trim()) ? +f.cp4 : 0;
  if (cp >= 1000) return { regiao: regiaoDoCodigoPostal(cp), concelho_codigo: "", aprox: true };
  return { regiao: "", concelho_codigo: "", aprox: false };
}

// Último recurso: a região aproximada pelos 4 primeiros dígitos do código postal (CTT)
function regiaoDoCodigoPostal(cp) {
  const faixas = [
    [1000, 1999, "Grande Lisboa"], [2000, 2399, "Oeste e Vale do Tejo"], [2400, 2449, "Centro"], [2450, 2479, "Oeste e Vale do Tejo"],
    [2480, 2489, "Centro"], [2490, 2639, "Oeste e Vale do Tejo"], [2600, 2629, "Grande Lisboa"], [2640, 2799, "Grande Lisboa"],
    [2800, 2999, "Península de Setúbal"], [3610, 3649, "Norte"], [3700, 3739, "Norte"], [3000, 3999, "Centro"], [4000, 5999, "Norte"],
    [6120, 6129, "Oeste e Vale do Tejo"], [6000, 6999, "Centro"], [7000, 7999, "Alentejo"], [8000, 8999, "Algarve"],
    [9000, 9499, "Madeira"], [9500, 9999, "Açores"],
  ];
  // as faixas mais estreitas ganham às largas
  const r = faixas.filter(([a, b]) => cp >= a && cp <= b).sort((x, y) => (x[1] - x[0]) - (y[1] - y[0]))[0];
  return r ? r[2] : "";
}
