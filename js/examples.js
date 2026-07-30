import { setPendingQuestion } from './storage.js';

const examples = [
  ['一次方程式', '2x + 3 = 11', true], ['二次方程式', 'x^2 - 5x + 6 = 0', true],
  ['分数方程式', '1/(x-1)=2', true],
  ['式の計算', '(x+1)(x-1)を展開せよ', true],
  ['連立方程式', 'x+y=3, x-y=1', true],
  ['一次不等式', '-3x+6≥0', true],
  ['二次不等式', 'x^2-5x+6≤0', true],
  ['指数', '2^x = 16 を解け', true], ['対数', 'log₂8 を求めよ', false], ['三角関数', 'sin 30° を求めよ', false],
  ['微分', 'y=x^3-2x を微分せよ', true], ['不定積分', '∫(2x+1)dx を求めよ', true],
  ['数列', '初項3、公差2の等差数列の第10項', false], ['確率', 'サイコロ2個の和が7となる確率', false],
  ['ベクトル', 'a=(1,2), b=(3,4) の内積', false],
  ['基数変換', '1011(2)を10進数に変換', true], ['パーセント', '800円の25%', true],
];
const grid = document.querySelector('#exampleGrid');

grid.replaceChildren(...examples.map(([category, question, supported]) => {
  const article = document.createElement('article'); article.className = 'card example-card';
  const heading = document.createElement('h2'); heading.textContent = category;
  const text = document.createElement('p'); text.textContent = question;
  const badge = document.createElement('span'); badge.className = `badge ${supported ? 'success' : 'warning'}`; badge.textContent = supported ? '数式エンジン対応' : '現在は未対応';
  const button = document.createElement('button'); button.className = 'button primary'; button.type = 'button'; button.textContent = 'popupへ送る';
  button.addEventListener('click', async () => { await setPendingQuestion(question); location.href = 'popup.html'; });
  article.append(heading, text, badge, button); return article;
}));
