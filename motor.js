/*
 * Motor de cálculo da CBS, do IBS e do Imposto Seletivo.
 *
 * Reproduz as regras da calculadora oficial (calculadora-rtc-regime-regular):
 *  - fórmulas lidas da tabela TRATAMENTO_TRIBUTARIO;
 *  - conta exata em decimal (sem erros de ponto flutuante);
 *  - base de cálculo arredondada a 2 casas antes de multiplicar;
 *  - alíquota e alíquota efetiva publicadas com 4 casas (em %), e é a publicada que multiplica a base;
 *  - valores arredondados a 2 casas, modo HALF_EVEN (ABNT NBR 5891);
 *  - divisões com 34 dígitos significativos.
 */
(function (global) {
  'use strict';

  // ───────────────────────── Decimal exato (BigInt) ─────────────────────────
  // valor = n × 10^(-s)
  function D(n, s) { this.n = n; this.s = s; }
  const p10 = (k) => 10n ** BigInt(k);

  function dec(v) {
    if (v instanceof D) return v;
    if (v === null || v === undefined || v === '') return null;
    let t = String(v).trim().replace(',', '.');
    if (!/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(t)) throw new Error('Número inválido: ' + v);
    let exp = 0;
    const ei = t.toLowerCase().indexOf('e');
    if (ei >= 0) { exp = parseInt(t.slice(ei + 1), 10); t = t.slice(0, ei); }
    let neg = false;
    if (t[0] === '-' || t[0] === '+') { neg = t[0] === '-'; t = t.slice(1); }
    const [i, f = ''] = t.split('.');
    let n = BigInt((i || '0') + f);
    let s = f.length - exp;
    if (s < 0) { n *= p10(-s); s = 0; }
    return new D(neg ? -n : n, s);
  }
  const ZERO = new D(0n, 0);
  const UM = new D(1n, 0);
  const CEM = new D(100n, 0);

  function alinhar(a, b) {
    if (a.s === b.s) return [a.n, b.n, a.s];
    if (a.s > b.s) return [a.n, b.n * p10(a.s - b.s), a.s];
    return [a.n * p10(b.s - a.s), b.n, b.s];
  }
  D.prototype.add = function (o) { const [x, y, s] = alinhar(this, o); return new D(x + y, s); };
  D.prototype.sub = function (o) { const [x, y, s] = alinhar(this, o); return new D(x - y, s); };
  D.prototype.mul = function (o) { return new D(this.n * o.n, this.s + o.s); };
  D.prototype.cmp = function (o) { const [x, y] = alinhar(this, o); return x < y ? -1 : x > y ? 1 : 0; };
  D.prototype.neg = function () { return new D(-this.n, this.s); };
  D.prototype.isZero = function () { return this.n === 0n; };
  D.prototype.movePointLeft = function (k) { return new D(this.n, this.s + k); };
  D.prototype.movePointRight = function (k) {
    return this.s >= k ? new D(this.n, this.s - k) : new D(this.n * p10(k - this.s), 0);
  };

  // divisão inteira com HALF_EVEN
  function divHalfEven(num, den) {
    if (den < 0n) { num = -num; den = -den; }
    const neg = num < 0n;
    const a = neg ? -num : num;
    let q = a / den;
    const r = a % den;
    const r2 = r * 2n;
    if (r2 > den || (r2 === den && (q & 1n) === 1n)) q += 1n;
    return neg ? -q : q;
  }
  D.prototype.setScale = function (k) {
    if (this.s === k) return this;
    if (this.s < k) return new D(this.n * p10(k - this.s), k);
    return new D(divHalfEven(this.n, p10(this.s - k)), k);
  };
  const digitos = (n) => (n < 0n ? -n : n).toString().length;
  // divisão com 34 dígitos significativos (MathContext(34, HALF_EVEN))
  D.prototype.div = function (o) {
    if (o.n === 0n) throw new Error('Divisão por zero');
    if (this.n === 0n) return ZERO;
    // escala inicial generosa e depois reduz a 34 dígitos significativos
    const extra = 40;
    let s = this.s - o.s + extra + digitos(o.n);
    let num = this.n, den = o.n;
    const k = s - (this.s - o.s);
    num = num * p10(k);
    let q = divHalfEven(num, den); // aproximação com muitos dígitos
    // recalcula exatamente na escala que dá 34 dígitos significativos
    const sig = digitos(q);
    const alvo = s - (sig - 34);
    const k2 = alvo - (this.s - o.s);
    let n2 = this.n, d2 = o.n;
    if (k2 >= 0) n2 = n2 * p10(k2); else d2 = d2 * p10(-k2);
    return strip(new D(divHalfEven(n2, d2), alvo));
  };
  function strip(d) {
    let { n, s } = d;
    while (s > 0 && n % 10n === 0n) { n /= 10n; s--; }
    return new D(n, s);
  }
  D.prototype.toFixedStr = function (k) {
    const v = this.setScale(k);
    const neg = v.n < 0n;
    let a = (neg ? -v.n : v.n).toString();
    if (k > 0) {
      a = a.padStart(k + 1, '0');
      a = a.slice(0, a.length - k) + '.' + a.slice(a.length - k);
    }
    return (neg ? '-' : '') + a;
  };
  D.prototype.toString = function () {
    const v = strip(this);
    return v.toFixedStr(Math.max(v.s, 0));
  };
  D.prototype.toNumber = function () { return Number(this.toString()); };

  // ───────────────────────── Avaliador de expressões ─────────────────────────
  // Gramática: soma := termo (('+'|'-') termo)* ; termo := fator (('*'|'/') fator)* ;
  // fator := ('-'|'+') fator | número | variável | '(' soma ')'
  function avaliar(expr, vars) {
    const src = String(expr).trim();
    let i = 0;
    const ws = () => { while (i < src.length && /\s/.test(src[i])) i++; };
    function soma() {
      let v = termo();
      for (;;) {
        ws();
        if (src[i] === '+') { i++; v = v.add(termo()); }
        else if (src[i] === '-') { i++; v = v.sub(termo()); }
        else return v;
      }
    }
    function termo() {
      let v = fator();
      for (;;) {
        ws();
        if (src[i] === '*') { i++; v = v.mul(fator()); }
        else if (src[i] === '/') { i++; v = v.div(fator()); }
        else return v;
      }
    }
    function fator() {
      ws();
      const c = src[i];
      if (c === '-') { i++; return fator().neg(); }
      if (c === '+') { i++; return fator(); }
      if (c === '(') {
        i++; const v = soma(); ws();
        if (src[i] !== ')') throw new Error('Esperado ")" em ' + src);
        i++; return v;
      }
      let m = /^\d+(\.\d+)?/.exec(src.slice(i));
      if (m) { i += m[0].length; return dec(m[0]); }
      m = /^[A-Za-z_]\w*/.exec(src.slice(i));
      if (m) {
        i += m[0].length;
        if (!(m[0] in vars)) throw new Error('Variável desconhecida: ' + m[0]);
        return vars[m[0]] || ZERO;
      }
      throw new Error('Expressão inválida: ' + src);
    }
    const r = soma(); ws();
    if (i !== src.length) throw new Error('Expressão inválida: ' + src);
    return r;
  }

  // ───────────────────────── Regras de arredondamento ─────────────────────────
  const valorFiscal = (v) => v.setScale(2);                  // 2 casas, HALF_EVEN
  const aliquotaPublicada = (pct) => pct.setScale(4);        // 4 casas em %
  const pctParaFracao = (p) => p.movePointLeft(2);
  const fracaoParaPct = (f) => f.movePointRight(2);
  const publicar = (fr) => pctParaFracao(aliquotaPublicada(fracaoParaPct(fr)));

  // ───────────────────────── Consultas aos dados ─────────────────────────
  const vigente = (r, data) => r.ini <= data && (!r.fim || r.fim >= data);
  const TRIB = { IS: 1, CBS: 2, IBSUF: 3, IBSMUN: 4 };
  const NOME_TRIB = { 1: 'Imposto Seletivo', 2: 'CBS', 3: 'IBS Estadual', 4: 'IBS Municipal' };

  function Base(dados) {
    this.d = dados;
    this.cstPorId = {};
    dados.cst.forEach((c) => { this.cstPorId[c.id] = c; });
  }
  Base.prototype.csts = function (data, tributo) {
    return this.d.cst.filter((c) => vigente(c, data) && c.trib.includes(tributo));
  };
  Base.prototype.classificacoes = function (data, tributo, cst) {
    return this.d.cls.filter((c) => {
      const st = this.cstPorId[c.sitr];
      return st && vigente(c, data) && vigente(st, data) && st.trib.includes(tributo) && (!cst || st.cd === cst);
    });
  };
  Base.prototype.classificacao = function (cd, data, tributo) {
    return this.d.cls.find((c) => {
      const st = this.cstPorId[c.sitr];
      return c.cd === cd && vigente(c, data) && st && st.trib.includes(tributo);
    }) || null;
  };
  Base.prototype.tratamento = function (cls, data) {
    const tc = cls.trat.find((t) => vigente(t, data));
    if (!tc) return null;
    const t = this.d.trat[tc.t];
    return t && vigente(t, data) ? Object.assign({ id: tc.t }, t) : null;
  };
  Base.prototype.reducao = function (cls, trib, data) {
    const r = (cls.red[trib] || []).find((x) => vigente(x, data));
    return r ? dec(r.v) : null;
  };
  Base.prototype.aliquotaAdValorem = function (cls, trib, data) {
    const r = (cls.adv[trib] || []).find((x) => vigente(x, data));
    return r ? dec(r.v) : null;
  };
  Base.prototype.aliquotaReferencia = function (trib, data) {
    const r = (this.d.ref[trib] || []).find((x) => vigente(x, data));
    return r ? dec(r.v) : null;
  };

  // ───────────────────────── Erros amigáveis ─────────────────────────
  function Falha(msg, tipo) { this.message = msg; this.tipo = tipo || 'entrada'; }

  // ───────────────────────── Cálculo de um tributo (CBS/IBS) ─────────────────────────
  // Espelha CalculoCbsIbsService.calcularCbsIbs
  function calcularTributo(base, ctx, trib) {
    const { data, cls, trat, st, item, isCalculado, temRegular } = ctx;
    const passos = [];
    const v = {
      aliquota: null, quantidade: dec(item.quantidade) || ZERO, percentualReducao: null,
      aliquotaPadraoOuReferencia: null, aliquotaReferencia: null, aliquotaAdValorem: null,
      aliquotaAdRem: null, ajuste: null, redutor: null, aliquotaAdRemPrincipal: null,
      aliquotaAdRemSecundaria: null, variacaoPontoPercentual: null, pBio: null,
      percentualDiferimento: null, pRedutorCompraGov: ZERO,
    };

    if (trat.reducao) {
      const pr = base.reducao(cls, trib, data);
      v.percentualReducao = pr ? pctParaFracao(pr) : null;
    }

    const tipoAliq = cls.cd === '510001' ? 'Padrão' : cls.tipoAliq;
    const informada = item.aliquotas ? dec(item.aliquotas[trib]) : null;
    let aliqBase = null, informadaAplicada = false, divididaPorCem = false, origem = '';

    const referencia = () => {
      const r = base.aliquotaReferencia(trib, data);
      if (r === null) throw new Falha('Não há alíquota de referência cadastrada para ' + NOME_TRIB[trib] +
        ' em ' + fmtData(data) + '. A partir de 2027 as alíquotas devem ser informadas.');
      return r;
    };

    switch (tipoAliq) {
      case 'Padrão':
      case 'Uniforme nacional (referência)':
        if (informada !== null) { aliqBase = pctParaFracao(informada); informadaAplicada = true; origem = 'informada por você'; }
        else { aliqBase = pctParaFracao(referencia()); origem = 'alíquota de referência oficial'; }
        divididaPorCem = true; break;
      case 'Uniforme setorial':
        if (trat.mono) throw new Falha('Monofasia (combustíveis) ainda não está liberada na calculadora oficial.', 'nao-implementado');
        // fallthrough
      case 'Fixa':
        if (informada !== null) { aliqBase = pctParaFracao(informada); informadaAplicada = true; origem = 'informada por você'; }
        else {
          const a = base.aliquotaAdValorem(cls, trib, data);
          if (a === null) throw new Falha('Alíquota ' + tipoAliq.toLowerCase() + ' não encontrada para ' + NOME_TRIB[trib] + ' em ' + fmtData(data) + '. Informe a alíquota.');
          aliqBase = pctParaFracao(a); origem = 'alíquota ' + tipoAliq.toLowerCase() + ' da tabela oficial';
        }
        divididaPorCem = true; break;
      case 'Sem alíquota':
        if (informada !== null) { aliqBase = pctParaFracao(informada); informadaAplicada = true; divididaPorCem = true; origem = 'informada por você'; }
        else { aliqBase = ZERO; origem = 'sem alíquota (zero)'; }
        break;
      case 'Alíquotas Combinadas (Ad Valorem e Ad Rem)':
        throw new Falha('Tipo de alíquota combinada ainda não implementado na calculadora oficial.', 'nao-implementado');
      default:
        throw new Falha('Tipo de alíquota desconhecido: ' + tipoAliq);
    }
    v.aliquota = aliqBase;

    // 1) alíquota
    let aliquota;
    const usaAliq = trat.aliq && /\baliquota\b/.test(trat.aliq);
    if (informadaAplicada && !usaAliq) aliquota = aliqBase;
    else if (trat.aliq) aliquota = avaliar(trat.aliq, v);
    if (divididaPorCem && aliquota) aliquota = publicar(aliquota);
    passos.push({ t: 'Alíquota nominal', f: trat.aliq || '—', r: pct(aliquota, divididaPorCem), obs: origem });

    // 2) alíquota efetiva
    let aliqEf = null;
    if (trat.aliqEf) {
      aliqEf = avaliar(trat.aliqEf, Object.assign({}, v, { aliquota: aliquota || ZERO }));
      if (divididaPorCem) aliqEf = publicar(aliqEf);
      passos.push({
        t: 'Alíquota efetiva', f: trat.aliqEf, r: pct(aliqEf, divididaPorCem),
        obs: v.percentualReducao && !v.percentualReducao.isZero()
          ? 'redução de ' + fracaoParaPct(v.percentualReducao).toString() + '% sobre a alíquota' : 'sem redução',
      });
    }

    // 3) base de cálculo
    const vb = Object.assign({}, v, {
      aliquota: aliquota || ZERO, aliquotaEfetiva: aliqEf || ZERO,
      impostoSeletivoInformado: dec(item.isInformado) || ZERO,
      baseCalculoInformada: dec(item.baseCalculo) || ZERO,
      impostoSeletivoCalculado: isCalculado || ZERO,
    });
    let bc = avaliar(trat.bc, vb);
    if (!trat.mono) bc = valorFiscal(bc);
    if (bc.cmp(ZERO) < 0) bc = ZERO;
    passos.push({ t: 'Base de cálculo', f: trat.bc, r: 'R$ ' + bc.toFixedStr(2) });

    // 4) tributo calculado
    const v3 = Object.assign({}, vb, { baseCalculo: bc });
    const calcExato = avaliar(trat.calc, v3);
    const calc = valorFiscal(calcExato);
    passos.push({ t: 'Tributo calculado', f: trat.calc, r: 'R$ ' + calc.toFixedStr(2) });

    // 5) tributo devido
    let devido = null;
    if (trat.dev) {
      devido = valorFiscal(avaliar(trat.dev, Object.assign({}, v3, { tributoCalculado: calc })));
    }
    // 6) diferimento
    let pDif = null, vDif = null;
    if (trat.pDif && trat.vDif) {
      pDif = publicar(avaliar(trat.pDif, Object.assign({}, v3, { tributoCalculado: calc })));
      vDif = valorFiscal(avaliar(trat.vDif, Object.assign({}, v3, { percentualDiferimento: pDif, tributoCalculado: calcExato })));
      devido = calc.sub(vDif);
      if (devido.cmp(ZERO) < 0) devido = ZERO;
      passos.push({ t: 'Diferimento', f: trat.vDif, r: 'R$ ' + vDif.toFixedStr(2), obs: fracaoParaPct(pDif).toFixedStr(2) + '% do tributo é diferido (pago em etapa posterior)' });
    }
    passos.push({ t: 'Tributo devido', f: trat.dev || '—', r: 'R$ ' + (devido || ZERO).toFixedStr(2) });

    if (!st.gIBSCBS) return { semGrupo: true, passos };

    // tributação regular (quando há suspensão/desoneração)
    let regular = null;
    if (temRegular) {
      let ef = aliquota || ZERO;
      if (trat.reducao && v.percentualReducao) ef = ef.mul(UM.sub(v.percentualReducao));
      if (divididaPorCem) ef = publicar(ef);
      regular = { aliqEf: divididaPorCem ? fracaoParaPct(ef) : ef, valor: valorFiscal(bc.mul(ef)) };
    }

    const reducaoGrupo = st.gRed && !(temRegular) && v.percentualReducao && aliqEf
      ? { pRedAliq: fracaoParaPct(v.percentualReducao), pAliqEfet: divididaPorCem ? fracaoParaPct(aliqEf) : aliqEf }
      : null;

    return {
      tributo: trib,
      aliquota: temRegular ? ZERO : (divididaPorCem && aliquota ? fracaoParaPct(aliquota) : (aliquota || ZERO)),
      aliquotaEfetiva: aliqEf ? (divididaPorCem ? fracaoParaPct(aliqEf) : aliqEf) : null,
      reducao: v.percentualReducao ? fracaoParaPct(v.percentualReducao) : ZERO,
      grupoReducao: reducaoGrupo,
      baseCalculo: bc,
      tributoCalculado: temRegular ? ZERO : calc,
      tributoDevido: temRegular ? ZERO : (devido || ZERO),
      diferimento: vDif ? { pDif: fracaoParaPct(pDif), vDif } : null,
      regular,
      passos,
    };
  }

  // ───────────────────────── Imposto Seletivo ─────────────────────────
  function calcularIS(base, data, is) {
    const cls = base.classificacao(is.cClassTrib, data, TRIB.IS);
    if (!cls) throw new Falha('Classificação do Imposto Seletivo ' + is.cClassTrib + ' não encontrada em ' + fmtData(data) + '.');
    const st = base.cstPorId[cls.sitr];
    if (is.cst && st.cd !== is.cst) throw new Falha('A classificação ' + cls.cd + ' do IS pertence ao CST ' + st.cd + ', não ao ' + is.cst + '.');
    const trat = base.tratamento(cls, data);
    if (!trat) throw new Falha('Tratamento tributário do IS não encontrado.');
    const adValorem = is.adValorem != null && is.adValorem !== '' ? pctParaFracao(aliquotaPublicada(dec(is.adValorem))) : ZERO;
    const adRem = is.adRem != null && is.adRem !== '' ? aliquotaPublicada(dec(is.adRem)) : ZERO;
    const v = {
      quantidade: dec(is.quantidade) || ZERO, aliquota: ZERO, aliquotaEfetiva: ZERO,
      baseCalculoInformada: dec(is.baseCalculo) || ZERO, impostoSeletivoInformado: dec(is.isInformado) || ZERO,
      impostoSeletivoCalculado: ZERO, percentualReducao: ZERO, aliquotaPadraoOuReferencia: ZERO,
      aliquotaReferencia: ZERO, aliquotaAdValorem: adValorem, aliquotaAdRem: adRem, ajuste: ZERO, redutor: ZERO,
    };
    const passos = [];
    const bc = valorFiscal(avaliar(trat.bc, v));
    passos.push({ t: 'Base de cálculo do IS', f: trat.bc, r: 'R$ ' + bc.toFixedStr(2) });
    const calc = valorFiscal(avaliar(trat.calc, Object.assign({}, v, { baseCalculo: bc })));
    passos.push({ t: 'IS calculado', f: trat.calc, r: 'R$ ' + calc.toFixedStr(2),
      obs: 'ad valorem ' + fracaoParaPct(adValorem).toString() + '% e ad rem R$ ' + adRem.toString() + ' por unidade' });
    const devido = trat.dev ? valorFiscal(avaliar(trat.dev, Object.assign({}, v, { baseCalculo: bc, tributoCalculado: calc }))) : calc;
    passos.push({ t: 'IS devido', f: trat.dev || '—', r: 'R$ ' + devido.toFixedStr(2) });
    return { cls, st, trat, baseCalculo: bc, pIS: fracaoParaPct(adValorem), adRem, vIS: devido, passos };
  }

  // ───────────────────────── Cálculo de um item ─────────────────────────
  function calcularItem(base, data, item) {
    const avisos = [];
    const ano = parseInt(data.slice(0, 4), 10);

    let cls = base.classificacao(item.cClassTrib, data, TRIB.CBS);
    if (!cls) throw new Falha('Classificação tributária ' + item.cClassTrib + ' não encontrada (ou fora de vigência) em ' + fmtData(data) + '.');
    let st = base.cstPorId[cls.sitr];
    if (st.cd !== item.cst) throw new Falha('A classificação ' + cls.cd + ' pertence ao CST ' + st.cd + ', não ao CST ' + item.cst + '.');
    let trat = base.tratamento(cls, data);
    if (!trat) throw new Falha('Tratamento tributário não encontrado para ' + cls.cd + '.');

    const original = { cls, st, trat };
    let temRegular = false;
    if (trat.exigeReg) {
      if (!item.regular || !item.regular.cClassTrib) {
        throw new Falha('A classificação ' + cls.cd + ' (' + trat.desc + ') exige informar a "tributação regular": o CST e a cClassTrib que valeriam sem a desoneração.');
      }
      const rc = base.classificacao(item.regular.cClassTrib, data, TRIB.CBS);
      if (!rc) throw new Falha('Classificação da tributação regular ' + item.regular.cClassTrib + ' não encontrada.');
      const rt = base.tratamento(rc, data);
      if (rt.incompSusp) throw new Falha('A classificação ' + rc.cd + ' é incompatível com suspensão.');
      cls = rc; trat = rt; temRegular = true;
    }

    if (trat.ajuste) throw new Falha('Esta classificação (' + trat.desc + ') envolve ajustes que ainda não são calculados pela calculadora oficial.', 'nao-implementado');
    if (trat.mono) throw new Falha('Monofasia (combustíveis) ainda não está liberada na calculadora oficial.', 'nao-implementado');

    const temAliq = item.aliquotas && ['2', '3', '4'].some((k) => item.aliquotas[k] !== undefined && item.aliquotas[k] !== null && item.aliquotas[k] !== '');
    if (ano >= 2027 && !temAliq) throw new Falha('A partir de 2027 é obrigatório informar as alíquotas de CBS e IBS (ainda não há alíquotas de referência publicadas).');
    if (ano < 2027 && temAliq) avisos.push('Em 2026 a calculadora oficial não aceita alíquotas informadas; aqui elas foram usadas como simulação.');
    if (temAliq) avisos.push('Cálculo simulado com as alíquotas informadas.');

    // Imposto Seletivo
    let is = null;
    if (item.is) {
      if (ano < 2027) throw new Falha('O Imposto Seletivo só passa a existir em 2027.');
      is = calcularIS(base, data, item.is);
    }

    let baseCalculo = item.baseCalculo;
    let isInformado = item.is ? item.is.isInformado : null;
    if (item.is && (baseCalculo === null || baseCalculo === undefined || baseCalculo === '')) {
      // base de CBS/IBS derivada: base do IS + IS informado (ou calculado)
      const isi = dec(isInformado) || is.vIS;
      baseCalculo = is.baseCalculo.add(isi).toString();
      isInformado = isi.toString();
      avisos.push('Base de CBS/IBS derivada da base do IS + IS (R$ ' + dec(baseCalculo).toFixedStr(2) + ').');
    }
    if (baseCalculo === null || baseCalculo === undefined || baseCalculo === '') throw new Falha('Informe a base de cálculo.');
    if (dec(baseCalculo).cmp(ZERO) < 0) throw new Falha('A base de cálculo não pode ser negativa.');

    const it = { quantidade: item.quantidade, baseCalculo, isInformado, aliquotas: item.aliquotas };
    const ctx = { data, cls, trat, st: original.st, item: it, isCalculado: is ? is.vIS : ZERO, temRegular };

    const resultado = {};
    [TRIB.CBS, TRIB.IBSUF, TRIB.IBSMUN].forEach((t) => { resultado[t] = calcularTributo(base, ctx, String(t)); });

    const semGrupo = resultado[2].semGrupo;
    const g = semGrupo ? null : {
      vBC: resultado[4].baseCalculo || resultado[3].baseCalculo || resultado[2].baseCalculo,
      cbs: resultado[2], ibsUF: resultado[3], ibsMun: resultado[4],
    };
    if (g) g.vIBS = g.ibsUF.tributoDevido.add(g.ibsMun.tributoDevido);

    return {
      numero: item.numero, descricao: item.descricao, cst: item.cst, cClassTrib: item.cClassTrib,
      original, calcCls: cls, calcTrat: trat, temRegular, regularCst: temRegular ? base.cstPorId[cls.sitr].cd : null,
      is, g, semGrupo, avisos,
      passos: { 2: resultado[2].passos, 3: resultado[3].passos, 4: resultado[4].passos },
    };
  }

  function calcularOperacao(base, op) {
    const itens = op.itens.map((item) => {
      try { return Object.assign({ ok: true }, calcularItem(base, op.data, item)); }
      catch (e) {
        if (e instanceof Falha) return { ok: false, numero: item.numero, descricao: item.descricao, erro: e.message, tipo: e.tipo };
        return { ok: false, numero: item.numero, descricao: item.descricao, erro: 'Falha técnica: ' + e.message, tipo: 'tecnica' };
      }
    });
    let vBC = ZERO, vCBS = ZERO, vUF = ZERO, vMun = ZERO, vIS = ZERO, vDifCBS = ZERO, vDifIBS = ZERO;
    itens.forEach((r) => {
      if (!r.ok) return;
      if (r.is) vIS = vIS.add(r.is.vIS);
      if (r.g) {
        vBC = vBC.add(r.g.vBC);
        vCBS = vCBS.add(r.g.cbs.tributoDevido);
        vUF = vUF.add(r.g.ibsUF.tributoDevido);
        vMun = vMun.add(r.g.ibsMun.tributoDevido);
        if (r.g.cbs.diferimento) vDifCBS = vDifCBS.add(r.g.cbs.diferimento.vDif);
        if (r.g.ibsUF.diferimento) vDifIBS = vDifIBS.add(r.g.ibsUF.diferimento.vDif);
        if (r.g.ibsMun.diferimento) vDifIBS = vDifIBS.add(r.g.ibsMun.diferimento.vDif);
      }
    });
    return { itens, total: { vBC, vCBS, vIBSUF: vUF, vIBSMun: vMun, vIBS: vUF.add(vMun), vIS, vDifCBS, vDifIBS, vTotal: vCBS.add(vUF).add(vMun).add(vIS) } };
  }

  function pct(fr, dividida) {
    if (!fr) return '—';
    return dividida ? fracaoParaPct(fr).toFixedStr(4).replace(/(\.\d\d\d*?)0+$/, '$1') + '%' : fr.toString();
  }
  function fmtData(d) { const [a, m, dd] = d.split('-'); return dd + '/' + m + '/' + a; }

  global.RTC = { dec, avaliar, Base, calcularOperacao, calcularItem, TRIB, NOME_TRIB, vigente, fmtData, ZERO };
})(typeof window !== 'undefined' ? window : globalThis);
