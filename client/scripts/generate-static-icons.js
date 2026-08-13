/**
 * 生成缺失的静态图标资源(地图 marker / POI / 路况 / 安全 / 默认图)
 * 运行: node scripts/generate-static-icons.js
 * 输出: client/src/static/map/*.png 及各类 default-*.png
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT_DIR = path.resolve(__dirname, '..', 'src', 'static');

// ---------------------------------------------------------------------------
// SVG 图标工厂
// ---------------------------------------------------------------------------

function circleIcon({ size = 48, bg = '#4A90D9', glyph = '', ring = '#FFFFFF' }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48">
    <circle cx="24" cy="24" r="22" fill="${bg}" stroke="rgba(0,0,0,0.14)" stroke-width="1.5"/>
    <circle cx="24" cy="24" r="18.5" fill="none" stroke="${ring}" stroke-opacity="0.28" stroke-width="1.5"/>
    ${glyph}
  </svg>`;
}

const GLYPHS = {
  person: `
    <circle cx="24" cy="17" r="6" fill="#FFFFFF"/>
    <path d="M24 27c-7 0-12 4.6-12 9h24c0-4.4-5-9-12-9z" fill="#FFFFFF"/>`,
  car: `
    <path d="M11 30l3-8a4 4 0 0 1 3.8-2.7h12.4A4 4 0 0 1 34 22l3 8v6h-4v-2H15v2h-4v-6z" fill="#FFFFFF"/>
    <circle cx="17" cy="30.5" r="2.6" fill="#FFFFFF" stroke="${'#4A90D9'}" stroke-width="1.4"/>
    <circle cx="31" cy="30.5" r="2.6" fill="#FFFFFF" stroke="${'#4A90D9'}" stroke-width="1.4"/>
    <rect x="14" y="23.5" width="20" height="3" rx="1.5" fill="#FFFFFF" opacity="0.45"/>`,
  bag: `
    <path d="M17 18h14l-1.6 20a3 3 0 0 1-3 2.6h-4.8a3 3 0 0 1-3-2.6L17 18z" fill="#FFFFFF"/>
    <path d="M20 18v-3a4 4 0 0 1 8 0v3" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round"/>`,
  bubble: `
    <path d="M24 12c-8.3 0-15 5.4-15 12 0 3.9 2.3 7.4 5.9 9.6L13 39l6.3-2.5c1.5.4 3 .7 4.7.7 8.3 0 15-5.4 15-12s-6.7-13.2-15-13.2z" fill="#FFFFFF"/>
    <circle cx="18" cy="24" r="1.8" fill="${'#9B59B6'}"/>
    <circle cx="24" cy="24" r="1.8" fill="${'#9B59B6'}"/>
    <circle cx="30" cy="24" r="1.8" fill="${'#9B59B6'}"/>`,
  mountain: `
    <path d="M8 34l9-13 5.5 8 4-5.5L40 34H8z" fill="#FFFFFF"/>
    <circle cx="33" cy="13" r="2.6" fill="#FFFFFF"/>`,
  tent: `
    <path d="M24 12L40 36H8L24 12z" fill="#FFFFFF"/>
    <path d="M24 12v24" stroke="${'#F5A623'}" stroke-width="1.6"/>`,
  gas: `
    <rect x="15" y="10" width="12" height="24" rx="2" fill="#FFFFFF"/>
    <path d="M19 10h8v5h-8z" fill="none" stroke="${'#F5A623'}" stroke-width="1.3"/>
    <path d="M27 16h3a3 3 0 0 1 3 3v5a1.8 1.8 0 0 0 3.6 0v-7l-3-3" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>
    <rect x="17" y="27" width="8" height="2.5" rx="1.2" fill="${'#F5A623'}"/>`,
  bolt: `
    <path d="M27 8L16 27h6l-2 13L32 21h-6l3-13z" fill="#FFFFFF"/>`,
  food: `
    <path d="M16 12v10a3 3 0 0 0 3 3v11h3V12h-6z" fill="#FFFFFF"/>
    <rect x="26" y="12" width="3" height="24" rx="1.5" fill="#FFFFFF"/>
    <rect x="32" y="12" width="3" height="24" rx="1.5" fill="#FFFFFF"/>`,
  restroom: `
    <circle cx="18" cy="14" r="4" fill="#FFFFFF"/>
    <path d="M13 24c0-3.6 2.2-6 5-6s5 2.4 5 6v10h-4V28h-2v6h-4V24z" fill="#FFFFFF"/>
    <path d="M34 12l3 26h-4l-2.5-12h-3l-2.5 12h-4L26 12h8z" fill="#FFFFFF" opacity="0.92"/>`,
  parking: `
    <path d="M18 12h8a8 8 0 0 1 0 16h-4v6h-4V12zm4 4v8h4a4 4 0 0 0 0-8h-4z" fill="#FFFFFF"/>`,
  dot: `<circle cx="24" cy="24" r="7" fill="#FFFFFF"/>`,
  alert: `
    <rect x="21.5" y="12" width="5" height="16" rx="2.5" fill="#FFFFFF"/>
    <circle cx="24" cy="33" r="2.8" fill="#FFFFFF"/>`,
  stop: `
    <rect x="10" y="19" width="28" height="4" rx="2" fill="#FFFFFF"/>
    <rect x="10" y="27" width="28" height="4" rx="2" fill="#FFFFFF"/>`,
  cone: `
    <path d="M24 10l8 24H16l8-24z" fill="#FFFFFF"/>
    <rect x="14" y="33" width="20" height="3" rx="1.5" fill="#FFFFFF" opacity="0.7"/>`,
  shield: `
    <path d="M24 8l11 4v9c0 8-4.6 14.2-11 17-6.4-2.8-11-9-11-17v-9l11-4z" fill="#FFFFFF"/>
    <path d="M24 14l7 7H17l7-7z" fill="${'#2ECC71'}" opacity="0.55"/>`,
  cross: `
    <rect x="20" y="11" width="8" height="26" rx="2" fill="#FFFFFF"/>
    <rect x="11" y="20" width="26" height="8" rx="2" fill="#FFFFFF"/>`,
  wrench: `
    <path d="M32 9l-9 9 7 7 9-9a8 8 0 0 1-11.3 9.8L18 37a4 4 0 0 1-5.6-5.6l11.2-9.7A8 8 0 0 1 32 9z" fill="#FFFFFF"/>`,
  star: `
    <path d="M24 8l4.6 9.4 10.4 1.5-7.5 7.3 1.8 10.3L24 32.4l-9.3 4.9 1.8-10.3-7.5-7.3 10.4-1.5L24 8z" fill="#FFFFFF"/>`,
  pin: `
    <path d="M24 7c-6.6 0-12 5.1-12 11.4 0 8.2 12 22.6 12 22.6s12-14.4 12-22.6C36 12.1 30.6 7 24 7z" fill="#FFFFFF"/>
    <circle cx="24" cy="18" r="4.5" fill="#9B59B6"/>`,
  store: `
    <path d="M10 16h28l-2.5 18a3 3 0 0 1-3 2.4H15.5a3 3 0 0 1-3-2.4L10 16z" fill="#FFFFFF"/>
    <path d="M10 20l2 5.5 4.5-5 4.5 5 4.5-5 4.5 5 4.5-5 2-5.5" fill="none" stroke="#FF6B35" stroke-width="1.4"/>
    <rect x="20" y="26" width="8" height="9" fill="#FF6B35"/>`,
  camera: `
    <rect x="10" y="16" width="28" height="20" rx="4" fill="#FFFFFF"/>
    <circle cx="24" cy="26" r="6" fill="none" stroke="#4A90D9" stroke-width="2.2"/>
    <path d="M18 16l2-4h8l2 4" fill="#4A90D9"/>`
};

// ---------------------------------------------------------------------------
// 图标清单
// ---------------------------------------------------------------------------

const ICONS = [
  // 地图 marker
  { file: 'map/marker-teammate.png', bg: '#07C160', glyph: GLYPHS.person },
  { file: 'map/marker-team.png', bg: '#4A90D9', glyph: GLYPHS.car },
  { file: 'map/marker-merchant.png', bg: '#FF6B35', glyph: GLYPHS.bag },
  { file: 'map/marker-chat.png', bg: '#9B59B6', glyph: GLYPHS.bubble },
  // POI
  { file: 'map/poi-scenic.png', bg: '#F5A623', glyph: GLYPHS.mountain },
  { file: 'map/poi-camp.png', bg: '#F5A623', glyph: GLYPHS.tent },
  { file: 'map/poi-gas.png', bg: '#F5A623', glyph: GLYPHS.gas },
  { file: 'map/poi-charge.png', bg: '#F5A623', glyph: GLYPHS.bolt },
  { file: 'map/poi-food.png', bg: '#F5A623', glyph: GLYPHS.food },
  { file: 'map/poi-restroom.png', bg: '#F5A623', glyph: GLYPHS.restroom },
  { file: 'map/poi-parking.png', bg: '#F5A623', glyph: GLYPHS.parking },
  { file: 'map/poi-default.png', bg: '#F5A623', glyph: GLYPHS.dot },
  // 路况事件
  { file: 'map/traffic-jam.png', bg: '#E74C3C', glyph: GLYPHS.car },
  { file: 'map/traffic-accident.png', bg: '#E74C3C', glyph: GLYPHS.alert },
  { file: 'map/traffic-closure.png', bg: '#E74C3C', glyph: GLYPHS.stop },
  { file: 'map/traffic-construction.png', bg: '#E74C3C', glyph: GLYPHS.cone },
  { file: 'map/traffic-police.png', bg: '#E74C3C', glyph: GLYPHS.shield },
  { file: 'map/traffic-default.png', bg: '#E74C3C', glyph: GLYPHS.alert },
  // 安全 POI
  { file: 'map/safety-hospital.png', bg: '#2ECC71', glyph: GLYPHS.cross },
  { file: 'map/safety-rescue.png', bg: '#2ECC71', glyph: GLYPHS.cross },
  { file: 'map/safety-repair.png', bg: '#2ECC71', glyph: GLYPHS.wrench },
  { file: 'map/safety-police.png', bg: '#2ECC71', glyph: GLYPHS.star },
  { file: 'map/safety-default.png', bg: '#2ECC71', glyph: GLYPHS.shield }
];

// 默认占位图(大尺寸,浅色底 + 白色图形)
const DEFAULT_ICONS = [
  { file: 'default-team.png', size: 120, bg: '#E8F4EC', glyph: GLYPHS.car },
  { file: 'default-topic.png', size: 120, bg: '#F0EBFA', glyph: GLYPHS.pin },
  { file: 'default-product.png', size: 120, bg: '#FFF1EA', glyph: GLYPHS.bag },
  { file: 'default-merchant.png', size: 120, bg: '#FFEDE3', glyph: GLYPHS.store },
  { file: 'default-badge.png', size: 120, bg: '#FFF8E1', glyph: GLYPHS.star },
  { file: 'default-cover.png', size: 300, bg: '#E8F4EC', glyph: GLYPHS.mountain }
];

async function renderSvg(svg, file) {
  const outPath = path.join(OUT_DIR, file);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile(outPath);
  console.log('generated:', file);
}

async function main() {
  for (const icon of ICONS) {
    const svg = circleIcon({ size: 48, bg: icon.bg, glyph: icon.glyph });
    await renderSvg(svg, icon.file);
  }
  for (const icon of DEFAULT_ICONS) {
    const svg = circleIcon({ size: icon.size, bg: icon.bg, glyph: icon.glyph, ring: 'rgba(0,0,0,0)' })
      .replace(/r="22"/, `r="${icon.size / 2 - 2}"`)
      .replace(/cx="24"/g, `cx="${icon.size / 2}"`)
      .replace(/cy="24"/g, `cy="${icon.size / 2}"`)
      .replace(/viewBox="0 0 48 48"/, `viewBox="0 0 ${icon.size} ${icon.size}"`);
    await renderSvg(svg, icon.file);
  }

  // 邀请分享卡片(品牌渐变 + 车队图形)
  const shareInvite = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#07C160"/>
        <stop offset="1" stop-color="#05A84E"/>
      </linearGradient>
    </defs>
    <rect width="300" height="300" rx="24" fill="url(#g)"/>
    <circle cx="150" cy="110" r="46" fill="rgba(255,255,255,0.16)"/>
    <path d="M118 150l22-56a28 28 0 0 1 26-19h30a28 28 0 0 1 26 19l22 56" fill="none" stroke="#FFFFFF" stroke-width="10" stroke-linecap="round"/>
    <circle cx="140" cy="170" r="9" fill="#FFFFFF"/>
    <circle cx="194" cy="170" r="9" fill="#FFFFFF"/>
    <text x="150" y="250" text-anchor="middle" font-size="34" font-weight="bold" font-family="sans-serif" fill="#FFFFFF">同道 CoRoad</text>
    <text x="150" y="282" text-anchor="middle" font-size="20" font-family="sans-serif" fill="rgba(255,255,255,0.85)">自驾组队 · 一起省钱</text>
  </svg>`;
  await renderSvg(shareInvite, 'share-invite.png');

  // 品牌 logo(绿色圆形 + 白色车队图形)
  const logo = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 48 48">
    <circle cx="24" cy="24" r="23" fill="#07C160"/>
    ${GLYPHS.car}
  </svg>`;
  await renderSvg(logo, 'logo.png');

  console.log('All static icons generated.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
