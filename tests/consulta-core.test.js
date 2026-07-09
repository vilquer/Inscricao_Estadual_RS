const test = require('node:test');
const assert = require('node:assert/strict');
const {
  HEADER_LIST,
  normalizeDoc,
  normalizeInscricao,
  rowsHaveHeader,
  rowsToRecords,
  buildIndices,
  resolveQuery,
  expandBfs,
  buildGraph,
  recordsToCsv,
} = require('../assets/consulta-core.js');

test('normalizeDoc strips whitespace and leading zeros', () => {
  assert.equal(normalizeDoc('  004581563020 '), '4581563020');
  assert.equal(normalizeDoc('0'), '0');
  assert.equal(normalizeDoc(''), '');
});

test('normalizeInscricao pads to 10 digits', () => {
  assert.equal(normalizeInscricao('11108118'), '0011108118');
  assert.equal(normalizeInscricao('0011108118'), '0011108118');
});

test('rowsHaveHeader detects matching header row', () => {
  assert.equal(rowsHaveHeader(HEADER_LIST), true);
  assert.equal(
    rowsHaveHeader(['0011108118', '10/09/2021', 'MICROPRODUTOR', '0111302', '0000000', '0000000', 'F', '32312644053']),
    false
  );
});

test('rowsToRecords skips header row when present', () => {
  const rows = [HEADER_LIST, ['0011108118', '10/09/2021', 'MICROPRODUTOR', '0111302', '0000000', '0000000', 'F', '32312644053   ']];
  const records = rowsToRecords(rows);
  assert.equal(records.length, 1);
  assert.equal(records[0].inscricao, '0011108118');
  assert.equal(records[0].cpfCnpj, '32312644053');
});

test('rowsToRecords keeps all rows when header absent', () => {
  const rows = [['0011108118', '10/09/2021', 'MICROPRODUTOR', '0111302', '0000000', '0000000', 'F', '32312644053']];
  const records = rowsToRecords(rows);
  assert.equal(records.length, 1);
});

function sampleRecords() {
  const rows = [
    ['0011004690', '10/03/1992', 'MICROPRODUTOR', '0114800', '0000000', '0000000', 'F', '32312644053'],
    ['0011004690', '10/03/1992', 'MICROPRODUTOR', '0114800', '0000000', '0000000', 'F', '209075082'],
    ['0011049391', '16/03/1992', 'MICROPRODUTOR', '0114800', '0000000', '0000000', 'F', '32312644053'],
    ['0011049391', '16/03/1992', 'MICROPRODUTOR', '0114800', '0000000', '0000000', 'F', '209075082'],
    ['0011108118', '10/09/2021', 'MICROPRODUTOR', '0111302', '0000000', '0000000', 'F', '32312644053'],
  ];
  return rowsToRecords(rows);
}

test('buildIndices maps inscricao and cpfCnpj to row indexes', () => {
  const records = sampleRecords();
  const indices = buildIndices(records);
  assert.deepEqual(indices.byInscricao.get('0011108118'), [4]);
  assert.deepEqual(indices.byCpfCnpj.get('32312644053'), [0, 2, 4]);
});

test('resolveQuery finds by inscricao first', () => {
  const records = sampleRecords();
  const indices = buildIndices(records);
  assert.deepEqual(resolveQuery('11108118', indices), { type: 'inscricao', key: '0011108118' });
});

test('resolveQuery falls back to cpfCnpj', () => {
  const records = sampleRecords();
  const indices = buildIndices(records);
  assert.deepEqual(resolveQuery('209075082', indices), { type: 'cpfCnpj', key: '209075082' });
});

test('resolveQuery returns null when not found', () => {
  const records = sampleRecords();
  const indices = buildIndices(records);
  assert.equal(resolveQuery('0000000000', indices), null);
});

test('expandBfs at nivel 1 stops before the second shared document', () => {
  const records = sampleRecords();
  const indices = buildIndices(records);
  const seedRows = indices.byInscricao.get('0011108118');
  const result = expandBfs(seedRows, records, indices, 1);
  const graph = buildGraph(result, records);
  const ieNodes = graph.nodes.filter(n => n.type === 'IE');
  const docNodes = graph.nodes.filter(n => n.type !== 'IE');
  assert.equal(ieNodes.length, 3);
  assert.equal(docNodes.length, 1);
  assert.equal(graph.links.length, 3);
});

test('expandBfs at nivel 2 reveals the second shared document', () => {
  const records = sampleRecords();
  const indices = buildIndices(records);
  const seedRows = indices.byInscricao.get('0011108118');
  const result = expandBfs(seedRows, records, indices, 2);
  const graph = buildGraph(result, records);
  const ieNodes = graph.nodes.filter(n => n.type === 'IE');
  const docNodes = graph.nodes.filter(n => n.type !== 'IE');
  assert.equal(ieNodes.length, 3);
  assert.equal(docNodes.length, 2);
  assert.equal(graph.links.length, 5);
});

test('expandBfs seeded from a document reaches further than an IE seed at the same nivel', () => {
  const records = sampleRecords();
  const indices = buildIndices(records);
  const seedRows = indices.byCpfCnpj.get('32312644053');
  const result = expandBfs(seedRows, records, indices, 1);
  const graph = buildGraph(result, records);
  const ieNodes = graph.nodes.filter(n => n.type === 'IE');
  const docNodes = graph.nodes.filter(n => n.type !== 'IE');
  assert.equal(ieNodes.length, 3);
  assert.equal(docNodes.length, 2);
  assert.equal(graph.links.length, 5);
});

test('buildGraph dedups nodes/links and sets IE/CPF types and label', () => {
  const records = sampleRecords();
  const graph = buildGraph([0, 1, 2, 3, 4], records);
  const ieNode = graph.nodes.find(n => n.id === '0011108118');
  assert.equal(ieNode.type, 'IE');
  assert.equal(ieNode.label, '');
  const docNode = graph.nodes.find(n => n.id === '32312644053');
  assert.equal(docNode.type, 'F');
  assert.equal(docNode.label, 'MICROPRODUTOR');
  assert.equal(graph.nodes.length, 5);
  assert.equal(graph.links.length, 5);
});

test('buildGraph sets link type to the row Categoria, not a fixed label', () => {
  const records = sampleRecords();
  const graph = buildGraph([0], records);
  assert.equal(graph.links.length, 1);
  assert.equal(graph.links[0].type, 'MICROPRODUTOR');
});

test('buildGraph carries cnae1/cnae2/cnae3 onto the IE node', () => {
  const records = sampleRecords();
  const graph = buildGraph([4], records);
  const ieNode = graph.nodes.find(n => n.id === '0011108118');
  assert.equal(ieNode.cnae1, '0111302');
  assert.equal(ieNode.cnae2, '0000000');
  assert.equal(ieNode.cnae3, '0000000');
});

test('recordsToCsv writes header plus one row per record, in HEADER_LIST order', () => {
  const records = sampleRecords().slice(0, 1);
  const csv = recordsToCsv(records);
  const linhas = csv.split('\r\n');
  assert.equal(linhas[0], HEADER_LIST.join(';'));
  assert.equal(linhas[1], '0011004690;10/03/1992;MICROPRODUTOR;0114800;0000000;0000000;F;32312644053');
  assert.equal(linhas.length, 2);
});

test('recordsToCsv quotes fields that contain the delimiter', () => {
  const records = [{
    inscricao: '0011108118', dataAbertura: '10/09/2021', categoria: 'PRODUTOR;ESPECIAL',
    cnae1: '0111302', cnae2: '0000000', cnae3: '0000000', tipo: 'F', cpfCnpj: '32312644053',
  }];
  const csv = recordsToCsv(records);
  const linhas = csv.split('\r\n');
  assert.equal(linhas[1], '0011108118;10/09/2021;"PRODUTOR;ESPECIAL";0111302;0000000;0000000;F;32312644053');
});
