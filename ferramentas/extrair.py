"""Extrai do banco da calculadora RTC os dados necessários ao programa web."""
import json
import sqlite3
import sys
from collections import defaultdict

db, out = sys.argv[1], sys.argv[2]
con = sqlite3.connect(db)
con.row_factory = sqlite3.Row
q = lambda s: [dict(r) for r in con.execute(s)]

cst = [{
    "id": r["SITR_ID"], "cd": r["SITR_CD"], "desc": r["SITR_DESCRICAO"],
    "ini": r["SITR_INICIO_VIGENCIA"], "fim": r["SITR_FIM_VIGENCIA"],
    "gIBSCBS": r["SITR_IND_GIBSCBS"], "gMono": r["SITR_IND_GIBSCBSMONO"],
    "gRed": r["SITR_IND_GRED"], "gDif": r["SITR_IND_GDIF"],
    "gTransf": r["SITR_IND_GTRANSFCRED"], "gZFM": r["SITR_IND_GCREDPRESIBSZFM"],
    "gAjuste": r["SITR_IND_GAJUSTECOMPET"],
    "trib": [x[0] for x in con.execute("select TRST_TBTO_ID from TRIBUTO_SITUACAO_TRIBUTARIA where TRST_SITR_ID=?", (r["SITR_ID"],))],
} for r in q("select * from SITUACAO_TRIBUTARIA order by SITR_ID")]

trat = {r["TRTR_ID"]: {
    "desc": r["TRTR_DESCRICAO"],
    "aliq": r["TRTR_EXPRESSAO_ALIQUOTA"], "aliqEf": r["TRTR_EXPRESSAO_ALIQUOTA_EFETIVA"],
    "bc": r["TRTR_EXPRESSAO_BASE_CALCULO"], "calc": r["TRTR_EXPRESSAO_TRIBUTO_CALCULADO"],
    "dev": r["TRTR_EXPRESSAO_TRIBUTO_DEVIDO"], "pDif": r["TRTR_EXPRESSAO_PERCENTUAL_DIFERIMENTO"],
    "vDif": r["TRTR_EXPRESSAO_VALOR_DIFERIMENTO"],
    "reducao": r["TRTR_IN_POSSUI_PERCENTUAL_REDUCAO"], "ajuste": r["TRTR_IN_POSSUI_AJUSTE"],
    "mono": r["TRTR_IN_POSSUI_MONOFASIA"],
    "exigeReg": r["TRTR_IN_EXIGE_GRUPO_DESONERACAO"], "incompSusp": r["TRTR_IN_INCOMPATIVEL_COM_SUSPENSAO"],
    "ini": r["TRTR_INICIO_VIGENCIA"], "fim": r["TRTR_FIM_VIGENCIA"],
} for r in q("select * from TRATAMENTO_TRIBUTARIO")}

def vig(rows, pre, val=None):
    o = []
    for r in rows:
        d = {"ini": r[pre + "_INICIO_VIGENCIA"], "fim": r[pre + "_FIM_VIGENCIA"]}
        if val:
            d["v"] = r[val]
        o.append(d)
    return o

trcl = defaultdict(list)
for r in q("select * from TRATAMENTO_CLASSIFICACAO"):
    trcl[r["TRCL_CLTR_ID"]].append({"t": r["TRCL_TRTR_ID"], "ini": r["TRCL_INICIO_VIGENCIA"], "fim": r["TRCL_FIM_VIGENCIA"]})

red = defaultdict(lambda: defaultdict(list))
for r in q("select * from PERCENTUAL_REDUCAO"):
    red[r["PERE_CLTR_ID"]][r["PERE_TBTO_ID"]].append({"v": r["PERE_VALOR"], "ini": r["PERE_INICIO_VIGENCIA"], "fim": r["PERE_FIM_VIGENCIA"]})

adv = defaultdict(lambda: defaultdict(list))
for r in q("select * from ALIQUOTA_AD_VALOREM where AADV_CLTR_ID is not null and AADV_VALOR is not null"):
    adv[r["AADV_CLTR_ID"]][r["AADV_TBTO_ID"]].append({"v": r["AADV_VALOR"], "ini": r["AADV_INICIO_VIGENCIA"], "fim": r["AADV_FIM_VIGENCIA"]})

fund = defaultdict(list)
for r in q("""select fc.FDCL_CLTR_ID c, fl.FDLG_TEXTO_CURTO curto, fl.FDLG_TEXTO texto
              from FUNDAMENTACAO_CLASSIFICACAO fc join FUNDAMENTACAO_LEGAL fl on fl.FDLG_ID = fc.FDCL_FDLG_ID"""):
    fund[r["c"]].append({"curto": r["curto"], "texto": r["texto"]})

cls = []
for r in q("select * from CLASSIFICACAO_TRIBUTARIA order by CLTR_CD, CLTR_INICIO_VIGENCIA"):
    i = r["CLTR_ID"]
    cls.append({
        "id": i, "cd": r["CLTR_CD"], "desc": r["CLTR_DESCRICAO"], "sitr": r["CLTR_SITR_ID"],
        "tipoAliq": r["CLTR_TIPO_ALIQUOTA"], "nomencl": r["CLTR_NOMENCLATURA"],
        "ini": r["CLTR_INICIO_VIGENCIA"], "fim": r["CLTR_FIM_VIGENCIA"],
        "anexo": r["CLTR_ANEXO"], "memoria": r["CLTR_MEMORIA_CALCULO"],
        "credPresOper": r["CLTR_IND_GCREDPRESOPER"],
        "trat": trcl.get(i, []),
        "red": {str(k): v for k, v in red.get(i, {}).items()},
        "adv": {str(k): v for k, v in adv.get(i, {}).items()},
        "fund": fund.get(i, []),
    })

ref = defaultdict(list)
for r in q("select * from ALIQUOTA_REFERENCIA"):
    ref[str(r["ALRE_TBTO_ID"])].append({"v": r["ALRE_VALOR"], "ini": r["ALRE_INICIO_VIGENCIA"], "fim": r["ALRE_FIM_VIGENCIA"]})

uf = q("select UF_CD cd, UF_SIGLA sigla, UF_NOME nome from UF order by UF_SIGLA")
versao = q("select VRBD_VERSAO_BASE_DADO v, VRBD_DATA d, VRBD_DESCRICAO descr from VERSAO_BASE_DADO order by VRBD_ID desc limit 1")[0]

data = {"versao": versao, "cst": cst, "trat": trat, "cls": cls, "ref": ref, "uf": uf}
with open(out, "w", encoding="utf-8") as f:
    f.write("window.RTC_DADOS = ")
    json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    f.write(";\n")
print("ok", len(cls), "classificações")
