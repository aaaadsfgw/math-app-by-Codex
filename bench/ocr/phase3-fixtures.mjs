const n = (value) => `<mn>${value}</mn>`;
const v = (value) => `<mi>${value}</mi>`;
const o = (value) => `<mo>${value}</mo>`;
const m = (...parts) => `<mrow>${parts.join("")}</mrow>`;
const g = (...parts) => m(o("("), ...parts, o(")"));
const power = (base, exponent) => `<msup>${base}${exponent}</msup>`;
const frac = (top, bottom) => `<mfrac>${top}${bottom}</mfrac>`;
const root = (...parts) => `<msqrt>${m(...parts)}</msqrt>`;
const x = v("x");
const a = v("a");
const b = v("b");
const square = power(x, n(2));
const plus = o("+");
const minus = o("−");
const dx = m('<mspace width="0.25em"></mspace>', v("d"), x);

function example(id, canonical, body, context = {}) {
  return { id, canonical, body, label: "", instruction: "", ...context };
}

export const phase3Fixtures = [
  example("p3-01-inline-expand", "2a(a-4b)", m(n(2), a, g(a, minus, n(4), b)),
    { instruction: "次の式を展開しなさい。", inline: true }),
  example("p3-02-inline-label", "(x+4)(x-2)", m(g(x, plus, n(4)), g(x, minus, n(2))),
    { label: "(2)", inline: true }),
  example("p3-03-coefficient", "2(x+1)", m(g(n(2)), g(x, plus, n(1)))),
  example("p3-04-numbered-fraction", "(x^2+3*x-4)/(x+4)",
    frac(m(square, plus, n(3), x, minus, n(4)), m(x, plus, n(4))), { label: "問1", inline: true }),
  example("p3-05-circled-fraction", "(3*a-2*b)/(6*a)",
    frac(m(n(3), a, minus, n(2), b), m(n(6), a)), { label: "①", scale: 1.75 }),
  example("p3-06-factoring", "x^2-9", m(square, minus, n(9)),
    { label: "(4)", instruction: "次の式を因数分解しなさい" }),
  example("p3-07-power", "(x-2)^(n+1)", power(g(x, minus, n(2)), m(v("n"), plus, n(1)))),
  example("p3-08-radical", "sqrt(x+7)-sqrt(3)", m(root(x, plus, n(7)), minus, root(n(3))), { scale: 1.5 }),
  example("p3-09-integral", "integral(3*x^2,x)", m(o("∫"), n(3), square, dx)),
  example("p3-10-definite-integral", "integral(1,3,2*x,x)",
    m(`<msubsup>${o("∫")}${n(1)}${n(3)}</msubsup>`, n(2), x, dx), { label: "(5)", inline: true }),
  example("p3-11-limit", "lim_(x->2-)(1/(2-x))",
    m(`<munder><mi mathvariant="normal">lim</mi>${m(x, o("→"), power(n(2), minus))}</munder>`,
      frac(n(1), m(n(2), minus, x)))),
  example("p3-12-inline-japanese-fraction", "(x^2-16)/(x-4)", frac(m(square, minus, n(16)), m(x, minus, n(4))),
    { instruction: "次の式を簡単にしなさい。", inline: true }),
];
