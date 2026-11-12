const number = (value) => `<mn>${value}</mn>`;
const variable = (value) => `<mi>${value}</mi>`;
const operator = (value, attributes = "") => `<mo ${attributes}>${value}</mo>`;
const row = (...parts) => `<mrow>${parts.join("")}</mrow>`;
const group = (...parts) => row(operator("("), ...parts, operator(")"));
const root = (...parts) => `<msqrt>${row(...parts)}</msqrt>`;
const indexRoot = (value, index) => `<mroot>${value}${number(index)}</mroot>`;
const power = (base, exponent) => `<msup>${base}${exponent}</msup>`;
const sub = (base, index) => `<msub>${base}${index}</msub>`;
const fraction = (numerator, denominator, thickness = "1px") =>
  `<mfrac linethickness="${thickness}">${numerator}${denominator}</mfrac>`;
const fn = (value) => `<mi mathvariant="normal">${value}</mi>`;
const x = variable("x");
const y = variable("y");
const a = variable("a");
const b = variable("b");
const t = variable("t");
const plus = operator("+");
const minus = operator("−");
const equals = operator("=");
const multiply = operator("×");
const arrow = operator("→");
const square = power(x, number(2));
const dx = row(`<mspace width="0.22em"></mspace>`, variable("d"), x);
const integral = operator("∫");
const lim = (...approach) => `<munder>${fn("lim")}${row(x, arrow, ...approach)}</munder>`;
const bounds = (lo, hi) => `<msubsup>${integral}${number(lo)}${number(hi)}</msubsup>`;
const trig = (name, ...parts) => row(fn(name), ...parts);

const primaryOne = fraction(row(square, minus, number(5), x, plus, number(6)), row(x, minus, number(2)));
const primaryTwo = row(number(3), a, group(number(2), a, minus, b), minus, number(2), b, group(a, plus, number(3), b));
const primaryThree = fraction(row(number(2), a, b, group(a, plus, b)), row(number(4), a), "1.15px");

function fixture(id, tags, latex, canonical, body, options = {}) {
  return { id, category: tags[0], tags, latex, canonical, body, label: "", instruction: "", ...options };
}

export const fixtures = [
  fixture("01-labelled-fraction", ["fraction", "polynomial", "label", "exponent", "implicit-multiplication", "minus"],
    String.raw`\frac{x^{2}-5x+6}{x-2}`, "(x^2-5x+6)/(x-2)", primaryOne, { label: "(1)" }),
  fixture("02-implicit-products", ["implicit-multiplication", "polynomial", "grouping", "minus"],
    "3a(2a-b)-2b(a+3b)", "3a(2a-b)-2b(a+3b)", primaryTwo),
  fixture("03-labelled-product-fraction", ["fraction", "label", "implicit-multiplication", "grouping"],
    String.raw`\frac{2ab(a+b)}{4a}`, "2ab(a+b)/(4a)", primaryThree, { label: "(1)" }),
  fixture("04-arithmetic", ["arithmetic", "plus"], "2+3", "2+3", row(number(2), plus, number(3))),
  fixture("05-signed-arithmetic", ["arithmetic", "grouping", "minus"], "(+19)+(-14)", "(+19)+(-14)",
    row(group(plus, number(19)), plus, group(minus, number(14)))),
  fixture("06-fraction-equation", ["fraction", "equation"], String.raw`\frac{x}{2}=3`, "x/2=3",
    row(fraction(x, number(2)), equals, number(3))),
  fixture("07-quadratic-equation", ["equation", "polynomial", "exponent", "minus"], "2x^{2}-7x+3=0", "2x^2-7x+3=0",
    row(number(2), square, minus, number(7), x, plus, number(3), equals, number(0))),
  fixture("08-cubic-polynomial", ["polynomial", "exponent"], "x^{3}-3x^{2}+2x", "x^3-3x^2+2x",
    row(power(x, number(3)), minus, number(3), square, plus, number(2), x)),
  fixture("09-grouped-exponent", ["exponent", "grouping"], "(x+1)^{2}", "(x+1)^2", power(group(x, plus, number(1)), number(2))),
  fixture("10-negative-exponent", ["exponent", "minus"], "x^{-2}", "x^(-2)", power(x, row(minus, number(2)))),
  fixture("11-power-grouping", ["exponent", "grouping", "minus"], "-(x-1)^{2}", "-(x-1)^2",
    row(minus, power(group(x, minus, number(1)), number(2)))),
  fixture("12-radical", ["root", "polynomial"], String.raw`\sqrt{x^{2}+1}`, "sqrt(x^2+1)", root(square, plus, number(1))),
  fixture("13-cube-root", ["root", "fraction"], String.raw`\sqrt[3]{\frac{8}{27}}`, "root(8/27,3)",
    indexRoot(fraction(number(8), number(27)), 3)),
  fixture("14-radical-sign", ["root", "minus"], String.raw`\sqrt{2}-\sqrt{3}`, "sqrt(2)-sqrt(3)",
    row(root(number(2)), minus, root(number(3)))),
  fixture("15-nested-fractions", ["fraction", "nested-fraction"], String.raw`\frac{1+\frac{1}{x}}{x+2}`, "(1+1/x)/(x+2)",
    fraction(row(number(1), plus, fraction(number(1), x, "0.9px")), row(x, plus, number(2)), "1.7px")),
  fixture("16-integral", ["integral", "exponent", "implicit-multiplication"], String.raw`\int 2x\cos(x^{2})\,dx`,
    "integral(2x*cos(x^2),x)", row(integral, number(2), x, trig("cos", group(square)), dx)),
  fixture("17-definite-integral", ["integral", "bounds", "exponent"], String.raw`\int_{0}^{1}(x^{2}+1)\,dx`,
    "integral(0,1,x^2+1,x)", row(bounds(0, 1), group(square, plus, number(1)), dx)),
  fixture("18-integral-fraction", ["integral", "fraction"], String.raw`\int\frac{1}{x}\,dx`,
    "integral(1/x,x)", row(integral, fraction(number(1), x), dx)),
  fixture("19-limit-removable", ["limit", "fraction", "exponent", "minus"],
    String.raw`\lim_{x\to1}\frac{x^{2}-1}{x-1}`, "lim_(x->1)(x^2-1)/(x-1)",
    row(lim(number(1)), fraction(row(square, minus, number(1)), row(x, minus, number(1))))),
  fixture("20-limit-right", ["limit", "fraction", "one-sided"], String.raw`\lim_{x\to1^{+}}\frac{1}{x-1}`,
    "lim_(x->1+)1/(x-1)", row(lim(power(number(1), plus)), fraction(number(1), row(x, minus, number(1))))),
  fixture("21-limit-infinity", ["limit", "fraction", "exponent"], String.raw`\lim_{x\to\infty}\frac{2x^{2}+1}{x^{2}-3}`,
    "lim_(x->infinity)(2x^2+1)/(x^2-3)",
    row(lim(operator("∞")), fraction(row(number(2), square, plus, number(1)), row(square, minus, number(3))))),
  fixture("22-trig-identity", ["trigonometry", "exponent", "equation"], String.raw`\sin^{2}x+\cos^{2}x=1`,
    "(sin(x))^2+(cos(x))^2=1", row(power(fn("sin"), number(2)), x, plus, power(fn("cos"), number(2)), x, equals, number(1))),
  fixture("23-tangent", ["trigonometry", "fraction", "grouping"], String.raw`\tan\left(\frac{\pi}{4}\right)`, "tan(pi/4)",
    trig("tan", group(fraction(variable("π"), number(4))))),
  fixture("24-log-base", ["logarithm", "equation"], String.raw`\log_{2}(x-1)=3`, "log_2(x-1)=3",
    row(sub(fn("log"), number(2)), group(x, minus, number(1)), equals, number(3))),
  fixture("25-log-natural", ["logarithm", "grouping", "equation"], String.raw`\ln(xy)=\ln x+\ln y`, "ln(xy)=ln(x)+ln(y)",
    row(fn("ln"), group(x, y), equals, fn("ln"), x, plus, fn("ln"), y)),
  fixture("26-inequality", ["inequality", "polynomial", "exponent"], String.raw`x^{2}-4\le0`, "x^2-4<=0",
    row(square, minus, number(4), operator("≤"), number(0))),
  fixture("27-explicit-products", ["multiplication", "arithmetic", "grouping"], String.raw`2\times(-3)+4`, "2*(-3)+4",
    row(number(2), multiply, group(minus, number(3)), plus, number(4))),
  fixture("28-japanese-expand", ["japanese", "label", "polynomial", "implicit-multiplication"], "(x+2)(x-3)", "(x+2)(x-3)",
    row(group(x, plus, number(2)), group(x, minus, number(3))), { label: "(2)", instruction: "次の式を展開しなさい" }),
  fixture("29-japanese-equation", ["japanese", "label", "equation"], "3x-7=5", "3x-7=5",
    row(number(3), x, minus, number(7), equals, number(5)), { label: "(3)", instruction: "次の方程式を解きなさい" }),
  fixture("30-japanese-derivative", ["japanese", "derivative", "trigonometry", "exponent"], String.raw`f(x)=\sin(3x^{2})`,
    "f(x)=sin(3x^2)", row(variable("f"), group(x), equals, fn("sin"), group(number(3), square)),
    { instruction: "次の関数を微分しなさい" }),
  fixture("31-short-fraction-bar", ["fraction", "thin-bar", "minus"], String.raw`\frac{a-b}{2}`, "(a-b)/2",
    fraction(row(a, minus, b), number(2), "0.65px")),
  fixture("32-dpi-product-fraction", ["fraction", "implicit-multiplication", "grouping", "dpi-variant"],
    String.raw`\frac{2ab(a+b)}{4a}`, "2ab(a+b)/(4a)", primaryThree, { label: "(1)", scale: 2 }),
  fixture("33-dpi-implicit-products", ["implicit-multiplication", "polynomial", "minus", "dpi-variant"],
    "3a(2a-b)-2b(a+3b)", "3a(2a-b)-2b(a+3b)", primaryTwo, { scale: 1.5 }),
  fixture("34-exponential-equation", ["exponent", "equation"], "2^{t+1}=8", "2^(t+1)=8",
    row(power(number(2), row(t, plus, number(1))), equals, number(8))),
];
