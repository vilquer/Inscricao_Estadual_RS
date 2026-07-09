(function () {
  var els = {
    fileInput: document.getElementById('csv-file'),
    status: document.getElementById('status'),
    query: document.getElementById('query'),
    nivel: document.getElementById('nivel'),
    buscarBtn: document.getElementById('buscar-btn'),
    baixarDadosBtn: document.getElementById('baixar-dados-btn'),
  };

  var state = { records: null, indices: null, ultimaSelecao: null };

  function setStatus(msg, isError) {
    els.status.textContent = msg;
    els.status.className = isError ? 'status error' : 'status';
  }

  els.fileInput.addEventListener('change', function (evt) {
    var file = evt.target.files[0];
    if (!file) return;
    setStatus('Lendo arquivo...', false);
    els.buscarBtn.disabled = true;
    els.baixarDadosBtn.disabled = true;
    state.records = null;
    state.indices = null;
    state.ultimaSelecao = null;
    if (typeof window.renderGraph === 'function') {
      window.renderGraph({ directed: true, multigraph: false, graph: {}, nodes: [], links: [] });
    }

    var reader = new FileReader();
    reader.onload = function () {
      var bytes = new Uint8Array(reader.result);

      if (file.name.toLowerCase().endsWith('.zip')) {
        var entries;
        try {
          entries = fflate.unzipSync(bytes);
        } catch (erro) {
          setStatus('Não foi possível descompactar o zip: ' + erro.message, true);
          return;
        }
        var entryNames = Object.keys(entries);
        var csvName = entryNames.find(function (name) {
          var lower = name.toLowerCase();
          return lower.endsWith('.csv') || lower.endsWith('.txt');
        });
        if (!csvName && entryNames.length === 1) {
          csvName = entryNames[0];
        }
        if (!csvName) {
          setStatus('Zip não contém um arquivo .csv/.txt reconhecível.', true);
          return;
        }
        bytes = entries[csvName];
      }

      var decoder = new TextDecoder('windows-1252');
      var text = decoder.decode(bytes);

      setStatus('Processando ' + Math.round(bytes.length / 1024 / 1024) + ' MB...', false);

      Papa.parse(text, {
        header: false,
        skipEmptyLines: true,
        delimiter: ';',
        complete: function (results) {
          var rows = results.data;
          if (!rows.length) {
            setStatus('Arquivo vazio.', true);
            return;
          }
          var headerOk = ConsultaCore.rowsHaveHeader(rows[0]);
          var widthOk = rows[0].length === ConsultaCore.HEADER_LIST.length;
          if (!headerOk && !widthOk) {
            setStatus('CSV com colunas inesperadas. Esperado: ' + ConsultaCore.HEADER_LIST.join(', '), true);
            return;
          }
          var records = ConsultaCore.rowsToRecords(rows);
          if (!records.length) {
            setStatus('Nenhum dado encontrado no CSV.', true);
            return;
          }
          var errCount = results.errors ? results.errors.length : 0;
          state.records = records;
          state.indices = ConsultaCore.buildIndices(records);
          setStatus(
            records.length + ' linhas carregadas' + (errCount ? ' (' + errCount + ' linha(s) ignorada(s) por erro de parsing)' : '') + '. Pronto pra buscar.',
            false
          );
          els.buscarBtn.disabled = false;
        },
      });
    };
    reader.readAsArrayBuffer(file);
  });

  els.buscarBtn.addEventListener('click', function () {
    if (!state.records) return;
    var query = els.query.value.trim();
    var nivel = parseInt(els.nivel.value, 10);
    if (!query) {
      setStatus('Digite uma IE ou CPF/CNPJ.', true);
      return;
    }
    if (!nivel || nivel < 1) nivel = 1;

    var match = ConsultaCore.resolveQuery(query, state.indices);
    if (!match) {
      setStatus('IE/CPF/CNPJ não encontrado na base.', true);
      window.renderGraph({ directed: true, multigraph: false, graph: {}, nodes: [], links: [] });
      state.ultimaSelecao = null;
      els.baixarDadosBtn.disabled = true;
      return;
    }
    var seedRows = match.type === 'inscricao'
      ? state.indices.byInscricao.get(match.key)
      : state.indices.byCpfCnpj.get(match.key);
    var rowIndexes = ConsultaCore.expandBfs(seedRows, state.records, state.indices, nivel);
    var graph = ConsultaCore.buildGraph(rowIndexes, state.records);
    setStatus(graph.nodes.length + ' nós, ' + graph.links.length + ' arestas.', false);
    window.renderGraph(graph);

    state.ultimaSelecao = rowIndexes.map(function (idx) { return state.records[idx]; });
    els.baixarDadosBtn.disabled = false;
  });

  els.baixarDadosBtn.addEventListener('click', function () {
    if (!state.ultimaSelecao) return;
    var csv = ConsultaCore.recordsToCsv(state.ultimaSelecao);
    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var nomeArquivo = 'grafo_' + els.query.value.trim().replace(/[^a-zA-Z0-9]/g, '_') + '_nivel' + els.nivel.value + '.csv';
    var a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
})();
