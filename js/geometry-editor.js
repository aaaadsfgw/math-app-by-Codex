import { addHistory, createHistoryRecord, saveGeometryDraft } from './storage.js';
import { solveTriangleFromData } from './solver/triangle.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const supportedConstraintTypes = new Set(['length', 'angle', 'height', 'perpendicular', 'equal-length', 'equal-angle']);
const typeLabels = {
  length: '長さ', angle: '角度', height: '高さ', perpendicular: '垂直', parallel: '平行',
  'equal-length': '等しい辺', 'equal-angle': '等しい角', midpoint: '中点', tangent: '接線',
  'on-circle': '円周上', radius: '半径', diameter: '直径',
};

const elements = {
  template: document.querySelector('#templateSelect'), canvas: document.querySelector('#geometryCanvas'),
  support: document.querySelector('#geometrySupportBadge'), instruction: document.querySelector('#canvasInstruction'),
  addSegment: document.querySelector('#addSegmentButton'), auxiliary: document.querySelector('#auxiliaryToggle'),
  reset: document.querySelector('#resetGeometryButton'), constraintType: document.querySelector('#constraintType'),
  constraintTarget: document.querySelector('#constraintTarget'), constraintValue: document.querySelector('#constraintValue'),
  addConstraint: document.querySelector('#addConstraintButton'), constraintList: document.querySelector('#constraintList'),
  query: document.querySelector('#querySelect'), calculate: document.querySelector('#calculateGeometryButton'),
  saveDraft: document.querySelector('#saveGeometryButton'), saveHistory: document.querySelector('#saveGeometryHistoryButton'),
  message: document.querySelector('#geometryMessage'), result: document.querySelector('#geometryResult'),
};

const point = (x, y) => ({ x, y });
const segment = (id, from, to, type = 'side', auxiliary = false) => ({ id, from, to, type, auxiliary });

function templateData(template) {
  const common = { id: crypto.randomUUID(), template, constraints: [], query: { type: 'area', target: 'ABC' } };
  switch (template) {
    case 'right-triangle':
      return { ...common, constraints: [{ id: crypto.randomUUID(), type: 'angle', target: 'A', value: 90 }], points: { A: point(85, 265), B: point(85, 70), C: point(325, 265) }, segments: [segment('AB', 'A', 'B'), segment('BC', 'B', 'C'), segment('CA', 'C', 'A')] };
    case 'isosceles-triangle':
      return { ...common, constraints: [{ id: crypto.randomUUID(), type: 'equal-length', target: ['AB', 'CA'], value: null }], points: { A: point(200, 55), B: point(75, 270), C: point(325, 270) }, segments: [segment('AB', 'A', 'B'), segment('BC', 'B', 'C'), segment('CA', 'C', 'A')] };
    case 'equilateral-triangle':
      return { ...common, constraints: [{ id: crypto.randomUUID(), type: 'equal-length', target: ['AB', 'BC', 'CA'], value: null }], points: { A: point(200, 55), B: point(75, 270), C: point(325, 270) }, segments: [segment('AB', 'A', 'B'), segment('BC', 'B', 'C'), segment('CA', 'C', 'A')] };
    case 'circle':
      return { ...common, points: { O: point(200, 165), R: point(310, 165) }, segments: [segment('OR', 'O', 'R', 'radius')], circles: [{ center: 'O', edge: 'R' }] };
    case 'circle-tangent':
      return { ...common, points: { O: point(175, 165), T: point(275, 165), P: point(275, 45) }, segments: [segment('OT', 'O', 'T', 'radius'), segment('TP', 'T', 'P', 'tangent')], circles: [{ center: 'O', edge: 'T' }] };
    case 'parallel-transversal':
      return { ...common, points: { A: point(55, 90), B: point(345, 90), C: point(55, 245), D: point(345, 245), E: point(145, 40), F: point(275, 300) }, segments: [segment('AB', 'A', 'B'), segment('CD', 'C', 'D'), segment('EF', 'E', 'F', 'transversal')] };
    case 'quadrilateral':
      return { ...common, points: { A: point(95, 65), B: point(315, 85), C: point(330, 260), D: point(65, 250) }, segments: [segment('AB', 'A', 'B'), segment('BC', 'B', 'C'), segment('CD', 'C', 'D'), segment('DA', 'D', 'A')] };
    case 'coordinate-plane':
      return { ...common, points: { O: point(200, 165), A: point(285, 95), B: point(100, 245) }, segments: [segment('x-axis', 'X1', 'X2', 'axis'), segment('y-axis', 'Y1', 'Y2', 'axis')], virtualPoints: { X1: point(30, 165), X2: point(370, 165), Y1: point(200, 20), Y2: point(200, 310) } };
    default:
      return { ...common, template: 'triangle', points: { A: point(200, 55), B: point(65, 270), C: point(335, 270) }, segments: [segment('AB', 'A', 'B'), segment('BC', 'B', 'C'), segment('CA', 'C', 'A')] };
  }
}

let model = templateData(elements.template.value);
let lineMode = false;
let lineStart = null;
let dragging = null;
let lastResult = null;

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}
function allPoints() { return { ...(model.virtualPoints ?? {}), ...model.points }; }
function showMessage(text, kind = '') { elements.message.className = kind ? `notice ${kind}` : ''; elements.message.textContent = text; }
function invalidateResult() { lastResult = null; elements.result.hidden = true; elements.saveHistory.disabled = true; }

function chooseTarget(target, type) {
  elements.constraintTarget.value = target;
  if (type === 'point' && elements.constraintType.value === 'length') elements.constraintType.value = 'angle';
  if (type === 'segment' && elements.constraintType.value === 'angle') elements.constraintType.value = 'length';
  elements.constraintValue.focus();
}

function addLinePoint(name) {
  if (!lineMode) return false;
  if (!lineStart) { lineStart = name; elements.instruction.textContent = `始点${name}を選択しました。終点をクリックしてください。`; return true; }
  if (lineStart === name) { showMessage('始点とは別の点を選んでください。', 'error'); return true; }
  const rawId = `${lineStart}${name}`;
  let id = rawId;
  let suffix = 2;
  while (model.segments.some((item) => item.id === id)) id = `${rawId}-${suffix++}`;
  model.segments.push(segment(id, lineStart, name, elements.auxiliary.checked ? 'auxiliary' : 'segment', elements.auxiliary.checked));
  lineStart = null;
  lineMode = false;
  elements.addSegment.setAttribute('aria-pressed', 'false');
  elements.addSegment.textContent = '線分を追加';
  elements.instruction.textContent = `線分${id}を追加しました。`;
  render();
  return true;
}

function render() {
  const title = svgElement('title');
  title.textContent = `${elements.template.selectedOptions[0].textContent}の編集図`;
  elements.canvas.replaceChildren(title);
  const points = allPoints();
  for (const circle of model.circles ?? []) {
    const center = points[circle.center];
    const edge = points[circle.edge];
    const radius = Math.hypot(edge.x - center.x, edge.y - center.y);
    elements.canvas.append(svgElement('circle', { cx: center.x, cy: center.y, r: radius, fill: 'none', stroke: '#26364c', 'stroke-width': 3 }));
  }
  for (const item of model.segments) {
    const from = points[item.from];
    const to = points[item.to];
    if (!from || !to) continue;
    const line = svgElement('line', { x1: from.x, y1: from.y, x2: to.x, y2: to.y, tabindex: '0', role: 'button', 'aria-label': `線分${item.id}` });
    line.classList.add('geometry-segment');
    if (item.auxiliary) line.classList.add('auxiliary');
    line.addEventListener('click', () => chooseTarget(item.id, 'segment'));
    line.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') chooseTarget(item.id, 'segment'); });
    elements.canvas.append(line);
  }
  for (const [name, coordinates] of Object.entries(model.points)) {
    const circle = svgElement('circle', { cx: coordinates.x, cy: coordinates.y, r: 9, tabindex: '0', role: 'button', 'aria-label': `点${name}` });
    circle.classList.add('geometry-point');
    circle.addEventListener('pointerdown', (event) => { dragging = name; circle.setPointerCapture(event.pointerId); });
    circle.addEventListener('click', () => { if (!addLinePoint(name)) chooseTarget(name, 'point'); });
    circle.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!addLinePoint(name)) chooseTarget(name, 'point'); } });
    const label = svgElement('text', { x: coordinates.x + 12, y: coordinates.y - 10 });
    label.classList.add('geometry-label');
    label.textContent = name;
    elements.canvas.append(circle, label);
  }
  renderConstraints();
}

function renderConstraints() {
  elements.constraintList.replaceChildren(...model.constraints.map((constraint) => {
    const item = document.createElement('li');
    const text = document.createElement('span');
    const target = Array.isArray(constraint.target) ? constraint.target.join(', ') : constraint.target;
    const value = constraint.value === null || constraint.value === undefined ? '' : ` = ${constraint.value}`;
    text.textContent = `${typeLabels[constraint.type] ?? constraint.type}: ${target}${value}`;
    if (!supportedConstraintTypes.has(constraint.type)) {
      const badge = document.createElement('span'); badge.className = 'badge warning'; badge.textContent = 'UIのみ・計算未対応'; text.append(' ', badge);
    }
    const remove = document.createElement('button'); remove.className = 'button small danger'; remove.type = 'button'; remove.textContent = '削除';
    remove.addEventListener('click', () => { model.constraints = model.constraints.filter((candidate) => candidate.id !== constraint.id); renderConstraints(); invalidateResult(); });
    item.append(text, remove);
    return item;
  }));
}

elements.canvas.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  const matrix = elements.canvas.getScreenCTM();
  if (!matrix) return;
  const position = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
  model.points[dragging] = { x: Math.max(12, Math.min(388, position.x)), y: Math.max(12, Math.min(318, position.y)) };
  render();
  invalidateResult();
});
elements.canvas.addEventListener('pointerup', () => { dragging = null; });
elements.canvas.addEventListener('pointercancel', () => { dragging = null; });

elements.template.addEventListener('change', () => {
  model = templateData(elements.template.value);
  updateSupport(); render(); invalidateResult();
  showMessage('テンプレートを切り替えました。表示座標と数学条件は別管理です。');
});
elements.addSegment.addEventListener('click', () => {
  lineMode = !lineMode; lineStart = null;
  elements.addSegment.setAttribute('aria-pressed', String(lineMode));
  elements.addSegment.textContent = lineMode ? '線分追加を中止' : '線分を追加';
  elements.instruction.textContent = lineMode ? '始点をクリックしてください。' : '線分追加を中止しました。';
});
elements.addConstraint.addEventListener('click', () => {
  const type = elements.constraintType.value;
  const targetText = elements.constraintTarget.value.trim();
  if (!targetText) { showMessage('条件の対象を入力してください。', 'error'); elements.constraintTarget.focus(); return; }
  const needsValue = ['length', 'angle', 'height', 'radius', 'diameter'].includes(type);
  const value = elements.constraintValue.value === '' ? null : Number(elements.constraintValue.value);
  if (needsValue && !Number.isFinite(value)) { showMessage('この条件には数値が必要です。', 'error'); elements.constraintValue.focus(); return; }
  const target = ['perpendicular', 'parallel', 'equal-length', 'equal-angle'].includes(type)
    ? targetText.split(/[,、\s]+/).filter(Boolean)
    : targetText;
  model.constraints.push({ id: crypto.randomUUID(), type, target, value });
  elements.constraintTarget.value = '';
  elements.constraintValue.value = '';
  renderConstraints(); invalidateResult();
  showMessage(supportedConstraintTypes.has(type) ? '条件を追加しました。' : '条件を保存しました。この条件は初期版の計算対象外です。', supportedConstraintTypes.has(type) ? 'success' : '');
});
elements.reset.addEventListener('click', () => {
  if (!confirm('この図形と入力条件を初期状態へ戻しますか？')) return;
  model = templateData(elements.template.value); render(); invalidateResult(); showMessage('初期状態へ戻しました。');
});

function selectedQuery() {
  const value = elements.query.value;
  if (value.startsWith('side-')) return { type: 'length', target: value.slice(5) };
  if (value.startsWith('angle-')) return { type: 'angle', target: value.slice(6) };
  return { type: value, target: value === 'height' ? null : 'ABC' };
}
function describeProblem() {
  const conditions = model.constraints.map((item) => `${typeLabels[item.type] ?? item.type} ${Array.isArray(item.target) ? item.target.join('・') : item.target}${item.value === null ? '' : `=${item.value}`}`).join('、');
  return `${elements.template.selectedOptions[0].textContent}: ${conditions || '条件なし'}。${elements.query.selectedOptions[0].textContent}を求める`;
}
elements.calculate.addEventListener('click', () => {
  invalidateResult();
  model.query = selectedQuery();
  if (!model.template.includes('triangle')) { showMessage('このテンプレートは構造化入力と編集に対応していますが、初期版ソルバーでは計算できません。', 'error'); return; }
  const result = solveTriangleFromData(model);
  if (!result.solved || !result.verified) { showMessage(result.error || '入力条件から計算できません。', 'error'); return; }
  lastResult = result;
  elements.result.hidden = false;
  elements.result.textContent = [...result.steps, `検証: ${result.verification}`].join('\n');
  elements.saveHistory.disabled = false;
  showMessage(`自作ソルバーで検証済み: ${result.answer}`, 'success');
});
elements.saveDraft.addEventListener('click', async () => {
  const saved = await saveGeometryDraft({ ...model, updatedAt: new Date().toISOString() });
  model.id = saved.id;
  showMessage('構造化した図形下書きを保存しました。', 'success');
});
elements.saveHistory.addEventListener('click', async () => {
  if (!lastResult) return;
  await addHistory(createHistoryRecord({
    question: describeProblem(), mode: 'answer', output: lastResult.steps.join('\n'), finalAnswer: lastResult.answer,
    category: '図形', solverId: lastResult.solverId, verified: true, verificationType: 'solver',
    verificationMessage: lastResult.verification, selfAssessment: 'answer_seen', source: 'geometry',
  }));
  elements.saveHistory.disabled = true;
  showMessage('検証結果を学習履歴へ保存しました。', 'success');
});

function updateSupport() {
  const supported = elements.template.value.includes('triangle');
  elements.support.className = `badge ${supported ? 'success' : 'warning'}`;
  elements.support.textContent = supported ? '三角形は計算対応' : '表示・構造化のみ（計算未対応）';
}
updateSupport();
render();
