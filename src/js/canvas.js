import { FTFData } from "./utils.js";

let currentModeHV = false;
const HV_DIVISOR = 30;

function formatCanvasValue(val) {
  if (currentModeHV) {
    const num = val / HV_DIVISOR;
    return num.toFixed(3).replace(/\.?0+$/, "");
  }
  return FTFData.formatFV(val);
}



export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ].join(",");
}

export function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function rrectTop(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export const SHARED_COLORS = {
  RARITY: {
    legendary: "#f59e0b",
    epic: "#a855f7",
    rare: "#3b82f6",
    common: "#6b7280",
  },
  STABILITY: {
    rising: "#34d399",
    improving: "#46d27a",
    "doing-well": "#a3e635",
    fluctuating: "#facc15",
    struggling: "#fb923c",
    receding: "#f87171",
    dropping: "#ef4444",
  },
};

export function loadImg(src) {
  return new Promise(function (resolve) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = function () { resolve(img); };
    img.onerror = function () { resolve(null); };
    img.src = src;
  });
}

export function drawItemCell(ctx, x, y, w, h, item, img, isTrade = false) {
  const rarity = (item.rarity || "").toLowerCase();
  const stability = item.stabilityType || FTFData.parseStabilityType(item.stability);
  const stabColor = SHARED_COLORS.STABILITY[stability] || null;

  ctx.fillStyle = isTrade ? "rgba(255,255,255,0.045)" : "rgba(255,255,255,0.038)";
  const rad = isTrade ? 6 : 7;
  rrect(ctx, x, y, w, h, rad);
  ctx.fill();

  if (!isTrade) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 2, y + 3, w + 4, h - 1);
    ctx.clip();
  }

  ctx.strokeStyle = stabColor
    ? `rgba(${hexToRgb(stabColor)},${isTrade ? 0.72 : 0.65})`
    : `rgba(255,255,255,${isTrade ? 0.09 : 0.07})`;
  ctx.lineWidth = stabColor ? 1.5 : 1;
  rrect(ctx, x, y, w, h, rad);
  ctx.stroke();

  if (!isTrade) {
    ctx.restore();
    const rColor = SHARED_COLORS.RARITY[rarity] || "#6b7280";
    ctx.fillStyle = rColor;
    ctx.globalAlpha = 0.75;
    rrectTop(ctx, x, y, w, 3, rad);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  const IMG_H = isTrade ? 50 : 90;
  const IMG_PAD = isTrade ? 6 : 8;
  const imgW = w - IMG_PAD * 2;
  const imgTop = y + 8;

  if (item.isAdds) {
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, imgTop + 10);
    ctx.lineTo(x + w / 2, imgTop + IMG_H - 10);
    ctx.moveTo(x + w / 2 - (IMG_H / 2 - 10), imgTop + IMG_H / 2);
    ctx.lineTo(x + w / 2 + (IMG_H / 2 - 10), imgTop + IMG_H / 2);
    ctx.stroke();
  } else if (img) {
    const scale = Math.min(imgW / img.naturalWidth, IMG_H / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    ctx.drawImage(img, x + IMG_PAD + (imgW - dw) / 2, imgTop + (IMG_H - dh) / 2, dw, dh);
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(x + IMG_PAD, imgTop, imgW, IMG_H);
  }

  if (item.shg && FTFData.shouldShowSHGBadge(item)) {
    const BADGE = isTrade ? 18 : 26;
    const bx = x + (isTrade ? 3 : 4);
    const by = y + (isTrade ? 3 : 5);
    const brad = isTrade ? 3 : 5;
    ctx.fillStyle = "rgba(90,30,160,0.88)";
    rrect(ctx, bx, by, BADGE, BADGE, brad);
    ctx.fill();
    ctx.strokeStyle = "rgba(180,120,255,0.6)";
    ctx.lineWidth = 1;
    rrect(ctx, bx, by, BADGE, BADGE, brad);
    ctx.stroke();
    ctx.font = `bold ${isTrade ? 10 : 15}px Arial, sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(item.shg.toUpperCase(), bx + BADGE / 2, by + BADGE / 2);
  }

  let badgeText = null;
  if (!item.isAdds) {
    const qty = item.quantity || 1;
    if (qty > 1) badgeText = isTrade ? `\u00D7${qty}` : `×${qty}`;
  }

  if (badgeText) {
    ctx.font = `bold ${isTrade ? 10 : 14}px Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const bw = ctx.measureText(badgeText).width + (isTrade ? 6 : 8);
    const bh = isTrade ? 16 : 22;
    const bx = x + w - bw - (isTrade ? 3 : 4);
    const by = y + (isTrade ? 3 : 5);
    const brad = isTrade ? 3 : 5;

    ctx.fillStyle = "rgba(90,30,160,0.88)";
    rrect(ctx, bx, by, bw, bh, brad);
    ctx.fill();
    ctx.strokeStyle = "rgba(180,120,255,0.6)";
    ctx.lineWidth = 1;
    rrect(ctx, bx, by, bw, bh, brad);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(badgeText, bx + bw / 2, by + bh / 2 + (isTrade ? 0 : 1));
  }

  const nameY = y + h - (isTrade ? 18 : 30);
  ctx.font = `bold ${isTrade ? 9 : 11}px Arial, sans-serif`;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  let name = item.name;
  const maxW = w - (isTrade ? 6 : 8);
  while (name.length > 2 && ctx.measureText(name).width > maxW)
    name = name.slice(0, -1);
  if (name !== item.name) name = name.slice(0, -1) + (isTrade ? "..." : "…");
  ctx.fillText(name, x + w / 2, nameY);

  if (item.isAdds) {
    const addsVal = FTFData.formatFV(item.quantity || 0);
    ctx.font = `bold ${isTrade ? 11 : 12}px Arial, sans-serif`;
    ctx.fillStyle = "#c8b4f0";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(addsVal, x + w / 2, nameY - 4);
  }

  if (!isTrade) {
    const formattedVal = formatCanvasValue(
      FTFData.calculateItemValue(item) * (item.quantity || 1),
    );
    const modeLabel = currentModeHV ? "hv" : "fv";
    ctx.font = "11px Arial, sans-serif";
    ctx.fillStyle = "#c8b4f0";
    ctx.globalAlpha = 1;
    ctx.fillText(`${formattedVal} ${modeLabel}`, x + w / 2, nameY + 16);
    ctx.globalAlpha = 1;
  }
}



const TSS = {
  CELL_W: 90,
  CELL_H: 90,
  CELL_GAP: 8,
  PANEL_PAD: 14,
  LABEL_H: 26,
  LABEL_GAP: 10,
  OUTER_PAD: 18,
  MID_GAP: 18,
  MID_W: 148,
  FOOTER_H: 34,
  FOOTER_GAP: 14,
};



function tssDrawCard(ctx, cardX, cardY, cardW, cardH, label, items, totalValue, cols) {
  const { PANEL_PAD, LABEL_H, LABEL_GAP, CELL_W, CELL_H, CELL_GAP } = TSS;

  
  ctx.fillStyle = "rgba(255,255,255,0.028)";
  rrect(ctx, cardX, cardY, cardW, cardH, 11);
  ctx.fill();

  
  ctx.strokeStyle = "rgba(124,58,237,0.28)";
  ctx.lineWidth = 1;
  rrect(ctx, cardX, cardY, cardW, cardH, 11);
  ctx.stroke();

  
  const labelY = cardY + PANEL_PAD;
  const textY = labelY + LABEL_H / 2;

  const valText = formatCanvasValue(totalValue);
  const lblText = label.toUpperCase() + ": ";

  ctx.font = "bold 12px Arial, sans-serif";
  const lblWidth = ctx.measureText(lblText).width;
  ctx.font = "bold 14px Arial, sans-serif";
  const valWidth = ctx.measureText(valText).width;

  const totalW = lblWidth + valWidth;
  const startX = cardX + cardW / 2 - totalW / 2;

  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  ctx.font = "bold 12px Arial, sans-serif";
  ctx.fillStyle = "#9d7fd4";
  ctx.fillText(lblText, startX, textY);

  ctx.font = "bold 14px Arial, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(valText, startX + lblWidth, textY);

  
  const divY1 = labelY + LABEL_H + 4;
  ctx.strokeStyle = "rgba(124,58,237,0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cardX + PANEL_PAD, divY1);
  ctx.lineTo(cardX + cardW - PANEL_PAD, divY1);
  ctx.stroke();

  
  const gridTop = divY1 + LABEL_GAP;
  const gridW = cols * CELL_W + (cols - 1) * CELL_GAP;
  const gridLeft = cardX + (cardW - gridW) / 2;

  items.forEach(function (item, idx) {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    drawItemCell(
      ctx,
      gridLeft + col * (CELL_W + CELL_GAP),
      gridTop + row * (CELL_H + CELL_GAP),
      CELL_W, CELL_H,
      item,
      item._canvasImg,
      true
    );
  });
}

export async function exportTradeImage(yourTrade, theirTrade, LAST_UPDATED, modeHV = false) {
  currentModeHV = modeHV;
  const btn = document.getElementById("save-trade-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Saving...";
  }

  const yourItems = yourTrade.slice();
  const theirItems = theirTrade.slice();

  const { CELL_W, CELL_H, CELL_GAP,
    PANEL_PAD, LABEL_H, LABEL_GAP,
    OUTER_PAD, MID_GAP, MID_W, FOOTER_H, FOOTER_GAP } = TSS;

  const maxItems = Math.max(yourItems.length, theirItems.length);
  let COLS = 2;
  if (maxItems > 16) COLS = 5;
  else if (maxItems > 9) COLS = 4;
  else if (maxItems > 4) COLS = 3;

  const yourRows = Math.max(1, Math.ceil(yourItems.length / COLS));
  const theirRows = Math.max(1, Math.ceil(theirItems.length / COLS));
  const maxRows = Math.max(yourRows, theirRows);

  const gridAreaH = maxRows * CELL_H + (maxRows - 1) * CELL_GAP;
  const cardH = PANEL_PAD + LABEL_H + 4 + LABEL_GAP
    + gridAreaH
    + PANEL_PAD;

  const gridW = COLS * CELL_W + (COLS - 1) * CELL_GAP;
  const cardW = Math.max(gridW + PANEL_PAD * 2, 240);

  const canvasW = OUTER_PAD + cardW + MID_GAP + MID_W + MID_GAP + cardW + OUTER_PAD;
  const canvasH = OUTER_PAD + cardH + FOOTER_GAP + FOOTER_H;



  const allItems = yourItems.concat(theirItems);
  const imgCache = new Map();
  await Promise.all(
    allItems.map(async function (item) {
      if (imgCache.has(item.name)) return;
      let img = await loadImg("items/" + encodeURIComponent(item.name + ".webp"));
      if (!img) img = await loadImg("items/Default.webp");
      imgCache.set(item.name, img);
    })
  );
  allItems.forEach(function (item) { item._canvasImg = imgCache.get(item.name) || null; });

  
  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");

  
  const bg = ctx.createLinearGradient(0, 0, 0, canvasH);
  bg.addColorStop(0, "#130826");
  bg.addColorStop(1, "#08010f");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvasW, canvasH);

  
  ctx.fillStyle = "rgba(255,255,255,0.016)";
  for (let gx = OUTER_PAD; gx < canvasW - OUTER_PAD; gx += 20)
    for (let gy = OUTER_PAD; gy < canvasH - FOOTER_H; gy += 20)
      ctx.fillRect(gx, gy, 1, 1);

  
  const cardY = OUTER_PAD;
  const leftCardX = OUTER_PAD;
  const midX = OUTER_PAD + cardW + MID_GAP;
  const rightCardX = midX + MID_W + MID_GAP;

  
  const yourTotal = yourItems.reduce(function (s, i) {
    if (i.isAdds) return s + (i.quantity || 0);
    return s + FTFData.calculateItemValue(i) * (i.quantity || 1);
  }, 0);

  const theirTotal = theirItems.reduce(function (s, i) {
    if (i.isAdds) return s + (i.quantity || 0);
    return s + FTFData.calculateItemValue(i) * (i.quantity || 1);
  }, 0);

  
  tssDrawCard(ctx, leftCardX, cardY, cardW, cardH, "Offering", yourItems, yourTotal, COLS);
  tssDrawCard(ctx, rightCardX, cardY, cardW, cardH, "Requesting", theirItems, theirTotal, COLS);

  
  const opponentDiff = yourTotal - theirTotal;
  const absDiff = Math.abs(opponentDiff);

  let resultTop, resultSub, resultColor;
  if (yourTotal === 0 && theirTotal === 0) {
    resultTop = "--"; resultSub = null; resultColor = "#888888";
  } else if (absDiff < 0.01) {
    resultTop = "Fair"; resultSub = null; resultColor = "#ffffff";
  } else if (opponentDiff > 0) {
    resultTop = formatCanvasValue(absDiff); resultSub = "Win"; resultColor = "#00eb37";
  } else {
    resultTop = formatCanvasValue(absDiff); resultSub = "Loss"; resultColor = "#e00016";
  }

  const midCX = midX + MID_W / 2;
  const midCY = cardY + cardH / 2;
  const pillH = resultSub ? 80 : 52;

  const glowCol = resultColor === "#00eb37" ? "rgba(0,235,55,0.09)"
    : resultColor === "#e00016" ? "rgba(224,0,22,0.09)"
      : "rgba(124,58,237,0.09)";
  ctx.fillStyle = glowCol;
  rrect(ctx, midX + 8, midCY - pillH / 2, MID_W - 16, pillH, 14);
  ctx.fill();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = resultColor;

  if (resultSub) {
    ctx.font = "bold 28px Arial, sans-serif";
    ctx.fillText(resultTop, midCX, midCY - 16);
    ctx.font = "bold 14px Arial, sans-serif";
    ctx.globalAlpha = 0.85;
    ctx.fillText(resultSub, midCX, midCY + 15);
    ctx.globalAlpha = 1;
  } else {
    ctx.font = "bold 26px Arial, sans-serif";
    ctx.fillText(resultTop, midCX, midCY);
  }

  
  const footerY = canvasH - FOOTER_H;
  const fLine = ctx.createLinearGradient(0, 0, canvasW, 0);
  fLine.addColorStop(0, "transparent");
  fLine.addColorStop(0.25, "rgba(124,58,237,0.22)");
  fLine.addColorStop(0.75, "rgba(124,58,237,0.22)");
  fLine.addColorStop(1, "transparent");
  ctx.fillStyle = fLine;
  ctx.fillRect(0, footerY, canvasW, 1);

  ctx.font = "11px Arial, sans-serif";
  ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(LAST_UPDATED, canvasW / 2, footerY - 6);

  ctx.font = "11px Arial, sans-serif";
  ctx.fillStyle = "#4a2f72";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("FTF Calculator", canvasW / 2, footerY + FOOTER_H / 2);

  
  try {
    const link = document.createElement("a");
    link.download = "ftf-trade.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  } catch (err) {
    console.error("Canvas export failed:", err);
  }

  if (btn) {
    btn.textContent = "Saved!";
    setTimeout(function () {
      btn.textContent = "Save Ad";
      btn.disabled = false;
    }, 3000);
  }
}



const SS = {
  COLS: 8,
  ITEMS_PER_PAGE: 56,
  CANVAS_W: 1200,
  H_PAD: 22,
  CELL_GAP: 9,
  CELL_H: 148,
  HEADER_H: 68,
  FOOTER_H: 40,
  V_PAD: 14,
};

export async function exportInventoryImages(sortedInventory, sortLabel, IMG_BASE, showAlertCallback) {
  const btn = document.getElementById("screenshot-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Preparing…";
  }

  const CW = Math.floor(
    (SS.CANVAS_W - SS.H_PAD * 2 - (SS.COLS - 1) * SS.CELL_GAP) / SS.COLS,
  );
  const pages = [];
  for (let i = 0; i < sortedInventory.length; i += SS.ITEMS_PER_PAGE) {
    pages.push(sortedInventory.slice(i, i + SS.ITEMS_PER_PAGE));
  }

  if (btn) btn.textContent = `Loading images (0 / ${sortedInventory.length})…`;
  const imgCache = new Map();



  let loaded = 0;
  await Promise.all(
    sortedInventory.map(async (item) => {
      let img = await loadImg(
        `${IMG_BASE}${encodeURIComponent(item.name + ".webp")}`,
      );
      if (!img) img = await loadImg(`${IMG_BASE}Default.webp`);
      imgCache.set(item.name, img);
      loaded++;
      if (btn && loaded % 15 === 0)
        btn.textContent = `Loading images (${loaded} / ${sortedInventory.length})…`;
    }),
  );

  for (let pi = 0; pi < pages.length; pi++) {
    const pageItems = pages[pi];
    const rows = Math.ceil(pageItems.length / SS.COLS);
    const canvasH =
      SS.HEADER_H +
      SS.V_PAD +
      rows * SS.CELL_H +
      (rows - 1) * SS.CELL_GAP +
      SS.V_PAD +
      SS.FOOTER_H;

    const canvas = document.createElement("canvas");
    canvas.width = SS.CANVAS_W;
    canvas.height = canvasH;
    const ctx = canvas.getContext("2d");

    const bgGrad = ctx.createLinearGradient(0, 0, 0, canvasH);
    bgGrad.addColorStop(0, "#130826");
    bgGrad.addColorStop(1, "#08010f");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, SS.CANVAS_W, canvasH);

    ctx.fillStyle = "rgba(255,255,255,0.016)";
    for (let gx = SS.H_PAD; gx < SS.CANVAS_W - SS.H_PAD; gx += 20) {
      for (let gy = SS.HEADER_H; gy < canvasH - SS.FOOTER_H; gy += 20) {
        ctx.fillRect(gx, gy, 1, 1);
      }
    }

    const hGrad = ctx.createLinearGradient(0, 0, SS.CANVAS_W, 0);
    hGrad.addColorStop(0, "#2a0e5a");
    hGrad.addColorStop(0.5, "#1e0845");
    hGrad.addColorStop(1, "#2a0e5a");
    ctx.fillStyle = hGrad;
    ctx.fillRect(0, 0, SS.CANVAS_W, SS.HEADER_H);

    const lineGrad = ctx.createLinearGradient(0, 0, SS.CANVAS_W, 0);
    lineGrad.addColorStop(0, "transparent");
    lineGrad.addColorStop(0.15, "#7c3aed");
    lineGrad.addColorStop(0.85, "#7c3aed");
    lineGrad.addColorStop(1, "transparent");
    ctx.fillStyle = lineGrad;
    ctx.fillRect(0, SS.HEADER_H - 2, SS.CANVAS_W, 2);

    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.font = "bold 24px Arial, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText("FTF Inventory", SS.H_PAD, SS.HEADER_H / 2 - 5);

    ctx.font = "12px Arial, sans-serif";
    ctx.fillStyle = "#9d7fd4";
    ctx.fillText(`Sorted by ${sortLabel}`, SS.H_PAD, SS.HEADER_H / 2 + 12);

    ctx.textAlign = "right";
    ctx.font = "bold 14px Arial, sans-serif";
    ctx.fillStyle = "#c4a0ff";
    const totalQty = pageItems.reduce((s, i) => s + (i.quantity || 1), 0);
    const totalVal = pageItems.reduce(
      (s, i) => s + FTFData.calculateItemValue(i) * (i.quantity || 1),
      0,
    );
    const modeLabel = currentModeHV ? "hv" : "fv";
    ctx.fillText(
      `${totalQty} item${totalQty !== 1 ? "s" : ""} \u00B7 ${formatCanvasValue(totalVal)} ${modeLabel}`,
      SS.CANVAS_W - SS.H_PAD,
      SS.HEADER_H / 2 - 6,
    );
    if (pages.length > 1) {
      ctx.font = "12px Arial, sans-serif";
      ctx.fillStyle = "#7a5faa";
      ctx.fillText(
        `Page ${pi + 1} of ${pages.length}`,
        SS.CANVAS_W - SS.H_PAD,
        SS.HEADER_H / 2 + 10,
      );
    }

    const itemsTop = SS.HEADER_H + SS.V_PAD;
    pageItems.forEach((item, idx) => {
      const col = idx % SS.COLS;
      const row = Math.floor(idx / SS.COLS);
      const cx = SS.H_PAD + col * (CW + SS.CELL_GAP);
      const cy = itemsTop + row * (SS.CELL_H + SS.CELL_GAP);
      drawItemCell(ctx, cx, cy, CW, SS.CELL_H, item, imgCache.get(item.name), false);
    });

    const footerY = canvasH - SS.FOOTER_H;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, footerY, SS.CANVAS_W, SS.FOOTER_H);
    const fGrad = ctx.createLinearGradient(0, 0, SS.CANVAS_W, 0);
    fGrad.addColorStop(0, "transparent");
    fGrad.addColorStop(0.2, "rgba(124,58,237,0.3)");
    fGrad.addColorStop(0.8, "rgba(124,58,237,0.3)");
    fGrad.addColorStop(1, "transparent");
    ctx.fillStyle = fGrad;
    ctx.fillRect(0, footerY, SS.CANVAS_W, 1);
    ctx.font = "12px Arial, sans-serif";
    ctx.fillStyle = "#5a3d8a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      "FTF Calculator",
      SS.CANVAS_W / 2,
      footerY + SS.FOOTER_H / 2,
    );

    if (btn) btn.textContent = `Saving ${pi + 1} / ${pages.length}…`;
    try {
      const link = document.createElement("a");
      link.download =
        pages.length > 1
          ? `ftf-inventory-${pi + 1}-of-${pages.length}.png`
          : "ftf-inventory.png";
      link.href = canvas.toDataURL("image/png");

      link.click();
    } catch (err) {
      console.error("Canvas export failed:", err);
      if (showAlertCallback) {
        showAlertCallback({
          title: "Screenshot failed",
          message:
            "Images may be blocked by cross-origin policy. Try refreshing and retrying.",
        });
      }
      break;
    }

    if (pi < pages.length - 1) await new Promise((r) => setTimeout(r, 600));
  }

  if (btn) {
    btn.disabled = false;
    btn.textContent = "Save as Image";
  }
}
