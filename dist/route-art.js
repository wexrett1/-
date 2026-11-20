export function drawRoute(canvas) {
  const ctx = canvas?.getContext("2d");
  if (!ctx) return;
  ctx.scale(2, 2);

  const terrain = ctx.createLinearGradient(40, 290, 510, 30);
  terrain.addColorStop(0, "#152c23");
  terrain.addColorStop(.6, "#253d2c");
  terrain.addColorStop(1, "#304631");
  ctx.fillStyle = terrain;
  ctx.fillRect(0, 0, 600, 370);

  ctx.fillStyle = "#9cb59a45";
  for (let y = 13; y < 370; y += 14) {
    for (let x = 11; x < 600; x += 14) {
      ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#8fa98738";
  for (let offset = -100; offset < 450; offset += 16) {
    ctx.beginPath();
    ctx.moveTo(0, offset + 105);
    ctx.bezierCurveTo(130, offset - 65, 233, offset + 216, 373, offset + 61);
    ctx.bezierCurveTo(430, offset - 5, 521, offset - 80, 600, offset - 20);
    ctx.stroke();
  }

  const road = (x = 0, y = 0) => {
    ctx.beginPath();
    ctx.moveTo(73 + x, 306 + y);
    ctx.bezierCurveTo(104 + x, 260 + y, 194 + x, 285 + y, 235 + x, 243 + y);
    ctx.bezierCurveTo(277 + x, 202 + y, 192 + x, 192 + y, 231 + x, 152 + y);
    ctx.bezierCurveTo(261 + x, 120 + y, 354 + x, 178 + y, 386 + x, 135 + y);
    ctx.bezierCurveTo(413 + x, 99 + y, 361 + x, 78 + y, 400 + x, 57 + y);
    ctx.bezierCurveTo(427 + x, 42 + y, 475 + x, 52 + y, 509 + x, 30 + y);
  };
  ctx.lineCap = "round";
  for (const [width, color, y] of [[79,"#091b1670",18],[67,"#10251d",10],[64,"#8b9b76",0],[59,"#3f4d3b",0],[51,"#28372d",0]]) {
    road(0, y);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  road();
  ctx.setLineDash([9, 9]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#e3eeae";
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.globalAlpha = .28;
  ctx.strokeStyle = "#e7f5b4";
  ctx.lineWidth = 1;
  for (const radius of [35, 48, 61]) {
    ctx.beginPath();
    ctx.ellipse(509, 30, radius, radius * .72, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const [x,y] of [[73,306],[386,135],[509,30]]) {
    ctx.beginPath();
    ctx.arc(x,y,10,0,Math.PI * 2);
    ctx.fillStyle = "#dafa64";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x,y,4,0,Math.PI * 2);
    ctx.fillStyle = "#263b27";
    ctx.fill();
  }

  ctx.save();
  ctx.translate(201, 264);
  ctx.rotate(-.39);
  const capsule = (x,y,w,h,r,color) => {
    ctx.beginPath();
    ctx.roundRect(x,y,w,h,r);
    ctx.fillStyle = color;
    ctx.fill();
  };
  capsule(-24,-9,56,24,8,"#0e210fb0");
  capsule(-26,-12,52,25,8,"#c8e65a");
  capsule(-26,-15,52,24,8,"#e4fc7a");
  capsule(-12,-11,25,16,4,"#375237");
  capsule(-7,-10,15,14,3,"#729354");
  capsule(18,-11,6,5,2,"#faffd4");
  capsule(18,2,6,5,2,"#faffd4");
  capsule(-26,-9,4,4,1,"#edab63");
  capsule(-26,0,4,4,1,"#edab63");
  ctx.restore();

  ctx.fillStyle = "#e5efd7";
  ctx.font = "600 12px system-ui";
  ctx.fillText("СТАРТ", 36, 352);
  ctx.fillText("ЭКЗАМЕН", 476, 83);
}