const SUPERSCRIPT_DIGITS = Object.freeze({
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
  "⁺": "+",
  "⁻": "-",
});

function expandSuperscripts(value) {
  return value.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+/gu, (sequence) => (
    `^${[...sequence].map((character) => SUPERSCRIPT_DIGITS[character]).join("")}`
  ));
}

export function normalizeMathNotation(value) {
  return expandSuperscripts(String(value ?? ""))
    .normalize("NFKC")
    .replace(/\\left|\\right/gu, "")
    .replace(/\\(?:cdot|times)/gu, "*")
    .replace(/\\div/gu, "/")
    .replace(/\\pi/gu, "pi")
    .replace(/[×∙·・]/gu, "*")
    .replace(/÷/gu, "/")
    .replace(/[−–—]/gu, "-")
    .replace(/π/gu, "pi")
    .replace(/√/gu, "sqrt ")
    .replace(/[{}［］【】]/gu, (character) => (
      ["{", "［", "【"].includes(character) ? "(" : ")"
    ))
    .replace(/[ \t\u3000]+/gu, " ")
    .trim();
}
