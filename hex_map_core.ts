// hex_map_core.ts
// Core logic and types for hex grid rendering.
//
// Geometry confirmed against Tacticus web client HTML source with sub-pixel accuracy.
// Key findings from reverse-engineering the HTML hex positions:
//
//   hexW       = 2 * HEX_R * ppu                          (camera-derived, exact)
//   hexH       = HEX_R*√3*cos(tilt)*ppu * hexHMult        (per-board empirical mult)
//   elevPx     = 22.00px (2048)                            (UNIVERSAL — same for all boards)
//   elevDir    = NORTH  (higher elevation → lower pixel Y, subtract)
//   elevRef    = 2      (elevation 2 = zero shift)
//   globalOffY = per-board constant south offset (px at 2048)
//
// Board params from mb_46_46 PositionPerSize:
//   5×7  → projOrtho=17.75, camY=103.9, camZ=-34.4,  visRows=14
//   7×9  → projOrtho=20.0,  camY=275.5, camZ=-115.0, visRows=14
//   7×10 → projOrtho=22.2,  camY=273.0, camZ=-113.4, visRows=15

import { CanvasRenderingContext2D, createCanvas } from 'canvas';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface SpawnPoint {
    Column: number;
    Row: number;
}

export interface SpawnGroup {
    TeamWithPlayerIndex: number;
    SpawnPoints: SpawnPoint[];
}

export interface LevelTile {
    TileId: string;
    Elevation: number;
    ForceUnplayable: number;
}

export interface LevelJson {
    Width: number;
    Height: number;
    Tiles: Array<{ Tile: LevelTile[] }>;
    SpawnPointSets: Array<{ SpawnPointGroups: SpawnGroup[] }>;
}

export interface BridgeConfig {
    TileId: string;
    Elevation: number;
}

export interface VisualTile {
    IsPlayable: number;
    LogicalColumn: number;
    LogicalRow: number;
    Configuration: { TileId: string; Elevation: number };
    BridgeConfiguration: BridgeConfig;
}

export interface ConfigVisualJson {
    Width: number;
    Height: number;
    VisualTiles: Array<{ Tile: VisualTile[] }>;
}

interface BoundingBox {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// BOARD CAMERA PARAMETERS  (mb_46_46 PositionPerSize)
// Key = "playableWidth x playableHeight" from the gameplay JSON Width/Height.
//
// hexHMult:    empirical correction to the camera-derived hexH formula.
//              Confirmed from web client HTML button heights.
// globalOffY:  constant southward pixel offset (at IMG_SIZE=2048) that accounts
//              for the grid origin being shifted vs. our centered formula.
//              Confirmed by matching web client HTML tile positions exactly.
// ─────────────────────────────────────────────────────────────────────────────

interface BoardCameraParams {
    projOrtho:  number;  // ProjectionOrthographicSize (world units)
    camY:       number;  // camera world Y (for tilt angle)
    camZ:       number;  // camera world Z (for tilt angle)
    visRows:    number;  // Config_Visual Height
    hexHMult:   number;  // empirical hexH multiplier
    globalOffY: number;  // constant south offset in px at IMG_SIZE=2048
}

const BOARD_PARAMS: Record<string, BoardCameraParams> = {
    // hexHMult and globalOffY confirmed from web client HTML.
    '5x7':  { projOrtho: 17.75, camY: 103.9, camZ: -34.4,  visRows: 14, hexHMult: 0.9608, globalOffY:  27.34 }, // TODO: calibrate hexHMult + globalOffY for 5x7
    '7x9':  { projOrtho: 20.0,  camY: 275.5, camZ: -115.0, visRows: 14, hexHMult: 0.9659, globalOffY:  63.92 }, // confirmed ✓
    '7x10': { projOrtho: 22.2,  camY: 273.0, camZ: -113.4, visRows: 15, hexHMult: 0.9608, globalOffY:  27.34 }, // confirmed ✓
};

// ─────────────────────────────────────────────────────────────────────────────
// UNIVERSAL CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Hex circumradius in world units (confirmed from Config_Visual edge offsets). */
const HEX_R = 2.0;

/** All board textures are 2048×2048. */
const IMG_SIZE = 2048;

/** Visual grid always has 13 columns. */
const VIS_COLS = 13;

/**
 * Elevation pixel shift per level (in IMG_SIZE=2048 px space).
 * UNIVERSAL: confirmed 22.00px for both 7×9 and 7×10 boards from web client HTML.
 * Higher elevation → NORTH (subtract from pixel Y). Reference elevation = ELEV_REF.
 */
export const ELEV_PX = 22.00;

/**
 * Elevation at which a tile sits exactly on its grid row (zero shift).
 * Confirmed = 2 from web client HTML.
 */
export const ELEV_REF = 2;

// ─────────────────────────────────────────────────────────────────────────────
// STYLE CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

export const HEX_DRAW_SCALE  = 0.88;
export const EDGE_COLOR      = 'rgba(220, 220, 220, 0.75)';
export const EDGE_WIDTH      = 2;
export const SPAWN_FILL      = 'rgba(255, 210,   0, 0.35)';
export const SPAWN_STROKE    = 'rgba(255, 210,   0, 0.90)';
export const DEPLOY_FILL     = 'rgba(  0, 200, 255, 0.35)';
export const DEPLOY_STROKE   = 'rgba(  0, 200, 255, 0.90)';
export const HIGHLIGHT_WIDTH = 3;

// ─────────────────────────────────────────────────────────────────────────────
// HEX METRICS
// ─────────────────────────────────────────────────────────────────────────────

export interface HexMetrics {
    hexWidth:  number;
    hexHeight: number;
    colSpacing: number;
    leftM:     number;
    topM:      number;
    globalOffY: number;
}

/**
 * Derive hex pixel dimensions from the board's camera parameters.
 * playWidth / playHeight come from the gameplay JSON (Width / Height fields).
 */
export function deriveMetrics(playWidth: number, playHeight: number): HexMetrics {
    const key = `${playWidth}x${playHeight}`;
    const p   = BOARD_PARAMS[key];
    if (!p) {
        throw new Error(
            `Unknown board size "${key}". ` +
            `Known sizes: ${Object.keys(BOARD_PARAMS).join(', ')}. ` +
            `Add an entry to BOARD_PARAMS and calibrate hexHMult + globalOffY ` +
            `by extracting hex positions from the web client HTML.`
        );
    }

    const worldW     = 2 * p.projOrtho;
    const ppu        = IMG_SIZE / worldW;
    const tilt       = Math.atan2(Math.abs(p.camZ), p.camY);
    const cosT       = Math.cos(tilt);

    const hexWidth   = HEX_R * 2 * ppu;
    const colSpacing = hexWidth * 0.75;
    const hexHeight  = HEX_R * Math.sqrt(3) * cosT * ppu * p.hexHMult;

    const nRows  = p.visRows;
    const gridW  = (VIS_COLS - 1) * colSpacing + hexWidth;
    const gridH  = (nRows - 0.5) * hexHeight;
    const leftM  = (IMG_SIZE - gridW) / 2;
    const topM   = (IMG_SIZE - gridH) / 2;

    return { hexWidth, hexHeight, colSpacing, leftM, topM, globalOffY: p.globalOffY };
}

// ─────────────────────────────────────────────────────────────────────────────
// TILE CENTRE → PIXEL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a visual-grid cell (vCol, vRow) + elevation to its pixel centre
 * on the 2048×2048 texture.
 *
 *   vRow = 0        → southernmost row (bottom of image, largest pixel Y)
 *   vRow increases  → northward (smaller pixel Y)
 *   Odd vCol        → stagger DOWN by hexHeight/2
 *   elevation > ELEV_REF → shift NORTH (subtract ELEV_PX per level above ELEV_REF)
 *   globalOffY      → constant south nudge (board-specific, baked into HexMetrics)
 */
export function tileCenter(
    m:         HexMetrics,
    vCol:      number,
    vRow:      number,
    elevation: number,
): { x: number; y: number } {
    const stagger = vCol % 2 === 1 ? m.hexHeight / 2 : 0;
    const x       = m.leftM + m.hexWidth / 2 + vCol * m.colSpacing;
    const yFb     = m.topM  + m.hexHeight / 2 + vRow * m.hexHeight + stagger;
    const y       = IMG_SIZE - yFb                        // flip: vRow=0 → bottom
                    - (elevation - ELEV_REF) * ELEV_PX    // elevation shift NORTH
                    + m.globalOffY;                       // constant south offset
    return { x, y };
}

// ─────────────────────────────────────────────────────────────────────────────
// HEX VERTICES  (flat-top, pixel space)
// Vertex order: E, NE, NW, W, SW, SE
// ─────────────────────────────────────────────────────────────────────────────

export function hexVerts(
    m:     HexMetrics,
    cx:    number,
    cy:    number,
    scale: number = 1.0,
): Array<[number, number]> {
    const w2 = (m.hexWidth  / 2) * scale;
    const h2 = (m.hexHeight / 2) * scale;
    const w4 = w2 / 2;
    return [
        [cx + w2, cy      ],
        [cx + w4, cy - h2 ],
        [cx - w4, cy - h2 ],
        [cx - w2, cy      ],
        [cx - w4, cy + h2 ],
        [cx + w4, cy + h2 ],
    ];
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function updateBoundingBox(verts: Array<[number, number]>, bbox: BoundingBox): void {
    for (const [x, y] of verts) {
        if (x < bbox.minX) bbox.minX = x;
        if (x > bbox.maxX) bbox.maxX = x;
        if (y < bbox.minY) bbox.minY = y;
        if (y > bbox.maxY) bbox.maxY = y;
    }
}

export function tracePath(
    ctx:   CanvasRenderingContext2D,
    verts: Array<[number, number]>,
    bbox:  BoundingBox,
): void {
    ctx.beginPath();
    updateBoundingBox(verts, bbox);
    ctx.moveTo(verts[0][0], verts[0][1]);
    for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i][0], verts[i][1]);
    ctx.closePath();
}

export function drawHex(
    ctx:       CanvasRenderingContext2D,
    m:         HexMetrics,
    cx:        number,
    cy:        number,
    fill:      string,
    stroke:    string,
    lineWidth: number,
    bbox:      BoundingBox,
): void {
    tracePath(ctx, hexVerts(m, cx, cy, HEX_DRAW_SCALE), bbox);
    ctx.fillStyle   = fill;   ctx.fill();
    ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke();
}

// ─────────────────────────────────────────────────────────────────────────────
// TILE CLASSIFICATION
// ─────────────────────────────────────────────────────────────────────────────

export function classify(
    visTile: VisualTile,
    lvlTile: LevelTile,
): { draw: false } | { draw: true; elevation: number } {
    if (lvlTile.ForceUnplayable) return { draw: false };
    const cfgId    = visTile.Configuration.TileId;
    const bridgeId = visTile.BridgeConfiguration.TileId;
    if (cfgId === 'Water' && !bridgeId) return { draw: false };
    if (cfgId === 'Block')              return { draw: false };
    if (bridgeId === 'Bridge')          return { draw: true, elevation: visTile.BridgeConfiguration.Elevation };
    return { draw: true, elevation: visTile.Configuration.Elevation };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

export function addHexesToMap(
    canvas: ReturnType<typeof createCanvas>,
    level:  LevelJson,
    config: ConfigVisualJson,
    image:  { width: number; height: number },
): void {
    const m    = deriveMetrics(level.Width, level.Height);
    const bbox: BoundingBox = { minX: IMG_SIZE, maxX: 0, minY: IMG_SIZE, maxY: 0 };

    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    ctx.drawImage(image as any, 0, 0, IMG_SIZE, IMG_SIZE);

    // TeamWithPlayerIndex 0 = attacker, deploys from south = CYAN
    // TeamWithPlayerIndex 1 = defender, spawns in north   = GOLD
    const deploySet = new Set<string>();
    const spawnSet  = new Set<string>();
    for (const group of level.SpawnPointSets[0].SpawnPointGroups) {
        const target = group.TeamWithPlayerIndex === 0 ? deploySet : spawnSet;
        for (const sp of group.SpawnPoints) target.add(`${sp.Column},${sp.Row}`);
    }

    // Pass 1: grey outlines for all drawable tiles
    ctx.strokeStyle = EDGE_COLOR;
    ctx.lineWidth   = EDGE_WIDTH;
    for (let vCol = 0; vCol < config.VisualTiles.length; vCol++) {
        for (let vRow = 0; vRow < config.VisualTiles[vCol].Tile.length; vRow++) {
            const visTile = config.VisualTiles[vCol].Tile[vRow];
            if (!visTile.IsPlayable) continue;
            const lvlTile = level.Tiles[visTile.LogicalColumn]?.Tile[visTile.LogicalRow];
            if (!lvlTile) continue;
            const result = classify(visTile, lvlTile);
            if (!result.draw) continue;
            const { x, y } = tileCenter(m, vCol, vRow, result.elevation);
            tracePath(ctx, hexVerts(m, x, y, HEX_DRAW_SCALE), bbox);
            ctx.stroke();
        }
    }

    // Pass 2: coloured highlights for spawn / deploy tiles
    for (let vCol = 0; vCol < config.VisualTiles.length; vCol++) {
        for (let vRow = 0; vRow < config.VisualTiles[vCol].Tile.length; vRow++) {
            const visTile = config.VisualTiles[vCol].Tile[vRow];
            if (!visTile.IsPlayable) continue;
            const lvlTile = level.Tiles[visTile.LogicalColumn]?.Tile[visTile.LogicalRow];
            if (!lvlTile) continue;
            const result = classify(visTile, lvlTile);
            if (!result.draw) continue;
            const key      = `${visTile.LogicalColumn},${visTile.LogicalRow}`;
            const isSpawn  = spawnSet.has(key);
            const isDeploy = deploySet.has(key);
            if (!isSpawn && !isDeploy) continue;
            const { x, y } = tileCenter(m, vCol, vRow, result.elevation);
            if (isSpawn) {
                drawHex(ctx, m, x, y, SPAWN_FILL,  SPAWN_STROKE,  HIGHLIGHT_WIDTH, bbox);
            } else {
                drawHex(ctx, m, x, y, DEPLOY_FILL, DEPLOY_STROKE, HIGHLIGHT_WIDTH, bbox);
            }
        }
    }
}