/*
 * Comparador "antes × depois da reforma": modelo de cálculo.
 *
 * Ideia: o valor que a empresa recebe líquido de tributos (N) é mantido constante, e o
 * preço final ao comprador é recalculado em cada ano da transição.
 *
 * Hoje: ICMS e ISS "por dentro" (sobre o preço); PIS/Cofins sobre o preço sem ICMS
 * (STF, Tema 69); IPI "por fora".
 * Reforma (EC 132/2023 e LC 214/2025):
 *  - 2026: CBS 0,9% e IBS 0,1% destacados, mas compensados com PIS/Cofins (custo zero).
 *  - 2027-2028: PIS/Cofins extintos; IPI zerado (exceto produtos com industrialização na
 *    ZFM, não tratados aqui); CBS = referência − 0,1 p.p.; IBS = 0,1%; começa o IS.
 *  - 2029-2032: ICMS e ISS a 90%, 80%, 70% e 60% das alíquotas; IBS sobe na proporção inversa
 *    (aproximação: referência × 10%, 20%, 30%, 40%).
 *  - 2033: ICMS e ISS extintos; IBS integral.
 *  - A base da CBS/IBS exclui ICMS e ISS e inclui o IS (base unificada da calculadora oficial).
 */
(function (global) {
  'use strict';

  const ANOS = [2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033];
  // fração das alíquotas de ICMS/ISS que ainda vale em cada ano
  const FATOR_ANTIGO = { 2026: 1, 2027: 1, 2028: 1, 2029: 0.9, 2030: 0.8, 2031: 0.7, 2032: 0.6, 2033: 0 };

  const pct = (v) => (Number(v) || 0) / 100;

  /**
   * @param {object} e
   *  preco      preço de venda hoje (sem IPI), R$
   *  tipo       'mercadoria' | 'servico'
   *  icms, iss, ipi, pisCofins   alíquotas atuais (%)
   *  cbs, ibs   alíquotas de referência estimadas para a reforma (%)
   *  redCbs, redIbs   redução da classificação na reforma (%)
   *  is         alíquota do Imposto Seletivo (%), se houver
   */
  function calcular(e) {
    const preco = Number(e.preco) || 0;
    const servico = e.tipo === 'servico';
    const i = servico ? 0 : pct(e.icms);
    const s = servico ? pct(e.iss) : 0;
    const ipi = servico ? 0 : pct(e.ipi);
    const pc = pct(e.pisCofins);
    const rc = pct(e.redCbs), ri = pct(e.redIbs);
    const cbsRef = pct(e.cbs), ibsRef = pct(e.ibs), aIs = pct(e.is);

    // hoje
    const icms0 = i * preco, iss0 = s * preco, pc0 = pc * (preco - icms0), ipi0 = ipi * preco;
    const liquido = preco - icms0 - iss0 - pc0; // o que a empresa recebe
    if (liquido <= 0) throw new Error('As alíquotas atuais somam 100% ou mais do preço.');
    const hoje = linha('Hoje', { V: preco, icms: icms0, iss: iss0, pc: pc0, ipi: ipi0, is: 0, cbs: 0, ibs: 0 }, liquido);

    const anos = ANOS.map((ano) => {
      const f = FATOR_ANTIGO[ano];
      const iy = i * f, sy = s * f;
      const pcy = ano <= 2026 ? pc : 0;
      const ipiy = ano <= 2026 ? ipi : 0;
      const V = liquido / (1 - iy - sy - pcy * (1 - iy));
      const icms = iy * V, iss = sy * V, pcv = pcy * (V - icms), ipiv = ipiy * V;
      const isv = ano >= 2027 ? aIs * V : 0;
      const base = V - icms - iss + isv;
      let cbsA, ibsA;
      if (ano === 2026) { cbsA = 0; ibsA = 0; }               // destacados, mas compensados
      else if (ano <= 2028) { cbsA = Math.max(cbsRef - 0.001, 0); ibsA = 0.001; }
      else if (ano < 2033) { cbsA = cbsRef; ibsA = ibsRef * (1 - f); }
      else { cbsA = cbsRef; ibsA = ibsRef; }
      const cbs = base * cbsA * (1 - rc), ibs = base * ibsA * (1 - ri);
      return linha(String(ano), { V, icms, iss, pc: pcv, ipi: ipiv, is: isv, cbs, ibs }, liquido, { cbsA, ibsA });
    });
    return { liquido, hoje, anos, variacao: (x) => x.precoFinal / hoje.precoFinal - 1 };
  }

  function linha(rotulo, v, liquido, aliq) {
    const antigos = v.icms + v.iss + v.pc + v.ipi;
    const novos = v.cbs + v.ibs + v.is;
    const precoFinal = v.V + v.ipi + v.is + v.cbs + v.ibs;
    return {
      rotulo, ...v, antigos, novos, tributos: antigos + novos, precoFinal, liquido,
      carga: (antigos + novos) / precoFinal, aliq: aliq || null,
    };
  }

  global.Comparador = { calcular, ANOS, FATOR_ANTIGO };
})(typeof window !== 'undefined' ? window : globalThis);
