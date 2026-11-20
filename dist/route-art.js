export const routeOffsets = [39, 52, 63, 52, 39, 29];
export function drawRouteConnectors(root) {
  for (const canvas of root.querySelectorAll?.(".course-connector") ?? []) {
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    const w = canvas.width;
    const h = canvas.height;
    const from = Number(canvas.dataset.from) * w / 100;
    const to = Number(canvas.dataset.to) * w / 100;
    const bend = to >= from ? -w * .19 : w * .19;
    const active = canvas.dataset.active === "true";
    const line = () => {
      ctx.beginPath();
      ctx.moveTo(from, 0);
      ctx.bezierCurveTo(from + bend, h * .42, to + bend, h * .64, to, h);
    };
    for (const [width, color] of [
      [55, "#050b14"], [49, active ? "#3a7481" : "#345062"], [44, active ? "#233e51" : "#1b3042"]
    ]) {
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      line();
      ctx.stroke();
    }
    ctx.setLineDash([12, 10]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = active ? "#a2f1ed" : "#7692a7";
    line();
    ctx.stroke();
    ctx.setLineDash([]);
  }
}