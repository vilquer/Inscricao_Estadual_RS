(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ConsultaCore = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  var HEADER_LIST = ['Inscrição', 'Data Abertura', 'Categoria', 'CNAE_1', 'CNAE_2', 'CNAE_3', 'Tipo', 'CPF/CNPJ'];

  function normalizeDoc(value) {
    var trimmed = String(value == null ? '' : value).trim();
    return trimmed.replace(/^0+(?=\d)/, '');
  }

  function normalizeInscricao(value) {
    return String(value == null ? '' : value).trim().padStart(10, '0');
  }

  function rowsHaveHeader(firstRow) {
    if (!firstRow || firstRow.length !== HEADER_LIST.length) return false;
    for (var i = 0; i < HEADER_LIST.length; i++) {
      if (String(firstRow[i]).trim() !== HEADER_LIST[i]) return false;
    }
    return true;
  }

  function rowsToRecords(rows) {
    var startIndex = rows.length > 0 && rowsHaveHeader(rows[0]) ? 1 : 0;
    var records = [];
    for (var i = startIndex; i < rows.length; i++) {
      var r = rows[i];
      if (!r || r.length < HEADER_LIST.length) continue;
      records.push({
        inscricao: String(r[0]).trim(),
        dataAbertura: String(r[1]).trim(),
        categoria: String(r[2]).trim(),
        cnae1: String(r[3]).trim(),
        cnae2: String(r[4]).trim(),
        cnae3: String(r[5]).trim(),
        tipo: String(r[6]).trim(),
        cpfCnpj: String(r[7]).trim(),
      });
    }
    return records;
  }

  function buildIndices(records) {
    var byInscricao = new Map();
    var byCpfCnpj = new Map();
    records.forEach(function (rec, idx) {
      var ie = normalizeInscricao(rec.inscricao);
      var doc = normalizeDoc(rec.cpfCnpj);
      if (!byInscricao.has(ie)) byInscricao.set(ie, []);
      byInscricao.get(ie).push(idx);
      if (!byCpfCnpj.has(doc)) byCpfCnpj.set(doc, []);
      byCpfCnpj.get(doc).push(idx);
    });
    return { byInscricao: byInscricao, byCpfCnpj: byCpfCnpj };
  }

  function resolveQuery(query, indices) {
    var asIe = normalizeInscricao(query);
    if (indices.byInscricao.has(asIe)) {
      return { type: 'inscricao', key: asIe };
    }
    var asDoc = normalizeDoc(query);
    if (indices.byCpfCnpj.has(asDoc)) {
      return { type: 'cpfCnpj', key: asDoc };
    }
    return null;
  }

  function expandBfs(seedRowIndexes, records, indices, maxNivel) {
    var rowSet = new Set(seedRowIndexes);
    var iesVistas = new Set();
    var docsVistos = new Set();
    rowSet.forEach(function (idx) {
      iesVistas.add(normalizeInscricao(records[idx].inscricao));
      docsVistos.add(normalizeDoc(records[idx].cpfCnpj));
    });

    var numIe = iesVistas.size;
    var numDoc = docsVistos.size;
    var flgIe = 0;
    var flgDoc = 0;
    var nivelAtual = 0;

    while (numIe !== flgIe || numDoc !== flgDoc) {
      if (nivelAtual === maxNivel) break;
      numIe = iesVistas.size;
      numDoc = docsVistos.size;

      docsVistos.forEach(function (doc) {
        (indices.byCpfCnpj.get(doc) || []).forEach(function (idx) { rowSet.add(idx); });
      });
      iesVistas.forEach(function (ie) {
        (indices.byInscricao.get(ie) || []).forEach(function (idx) { rowSet.add(idx); });
      });

      rowSet.forEach(function (idx) {
        iesVistas.add(normalizeInscricao(records[idx].inscricao));
        docsVistos.add(normalizeDoc(records[idx].cpfCnpj));
      });

      flgIe = iesVistas.size;
      flgDoc = docsVistos.size;
      nivelAtual += 1;
    }

    return Array.from(rowSet);
  }

  function buildGraph(rowIndexes, records) {
    var nodes = new Map();
    var links = [];
    var seenLinks = new Set();

    rowIndexes.forEach(function (idx) {
      var rec = records[idx];
      var ie = normalizeInscricao(rec.inscricao);
      var doc = normalizeDoc(rec.cpfCnpj);

      if (!nodes.has(ie)) {
        nodes.set(ie, { id: ie, name: ie, label: '', type: 'IE', cnae1: rec.cnae1, cnae2: rec.cnae2, cnae3: rec.cnae3 });
      }
      if (!nodes.has(doc)) {
        nodes.set(doc, { id: doc, name: doc, label: rec.categoria, type: rec.tipo });
      }
      var linkKey = ie + '|' + doc;
      if (!seenLinks.has(linkKey)) {
        seenLinks.add(linkKey);
        links.push({ source: ie, target: doc, type: rec.categoria });
      }
    });

    return { directed: true, multigraph: false, graph: {}, nodes: Array.from(nodes.values()), links: links };
  }

  function csvField(value) {
    var str = String(value == null ? '' : value);
    if (/[;"\n\r]/.test(str)) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  function recordsToCsv(records) {
    var linhas = [HEADER_LIST.join(';')];
    records.forEach(function (rec) {
      linhas.push([
        rec.inscricao, rec.dataAbertura, rec.categoria,
        rec.cnae1, rec.cnae2, rec.cnae3, rec.tipo, rec.cpfCnpj,
      ].map(csvField).join(';'));
    });
    return linhas.join('\r\n');
  }

  return {
    HEADER_LIST: HEADER_LIST,
    normalizeDoc: normalizeDoc,
    normalizeInscricao: normalizeInscricao,
    rowsHaveHeader: rowsHaveHeader,
    rowsToRecords: rowsToRecords,
    buildIndices: buildIndices,
    resolveQuery: resolveQuery,
    expandBfs: expandBfs,
    buildGraph: buildGraph,
    recordsToCsv: recordsToCsv,
  };
}));
