const selection = document.querySelector(".selection");
const body = document.body;
let start;
let submitted = false;

function showSelection(x, y) {
  selection.style.left = `${Math.min(start.x, x)}px`;
  selection.style.top = `${Math.min(start.y, y)}px`;
  selection.style.width = `${Math.abs(x - start.x)}px`;
  selection.style.height = `${Math.abs(y - start.y)}px`;
}

body.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || start || submitted || !event.isTrusted) return;
  event.preventDefault();
  body.setPointerCapture(event.pointerId);
  start = { id: event.pointerId, x: event.clientX, y: event.clientY };
  showSelection(start.x, start.y);
  body.classList.add("dragging");
  selection.hidden = false;
});

body.addEventListener("pointermove", (event) => {
  if (event.pointerId === start?.id) showSelection(event.clientX, event.clientY);
});

body.addEventListener("pointerup", (event) => {
  if (event.pointerId !== start?.id || event.button !== 0) return;
  submitted = true;
  window.screenSelection.select(start.x, start.y, event.clientX - start.x, event.clientY - start.y);
  start = undefined;
});

body.addEventListener("pointercancel", () => window.screenSelection.cancel());
body.addEventListener("lostpointercapture", () => {
  if (start) window.screenSelection.cancel();
});
body.addEventListener("contextmenu", (event) => event.preventDefault());
