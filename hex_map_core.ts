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
    SpawnPointType: number;
    // Present in the extracted board JSON but not needed to draw highlights; extract_boards.ts exports them.
    Direction?: number;
    Room?: number;
    Tag?: string;
    SecondarySpawn?: number;
}

export interface SpawnGroup {
    TeamWithPlayerIndex: number;
    MachineOfWarPosition?: number;
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

export interface BoundingBox {
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

/** Board sizes whose BOARD_PARAMS entry is still a placeholder (see the TODO above) - positions on them are approximate. */
export const UNCALIBRATED_BOARD_SIZES: readonly string[] = ['5x7'];

/** Board sizes BOARD_PARAMS knows about. */
export function knownBoardSizes(): string[] {
    return Object.keys(BOARD_PARAMS);
}

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
export const POWERUP_FILL    = 'rgba(  0, 220,   0, 0.35)';
export const POWERUP_STROKE  = 'rgba(  0, 220,   0, 0.90)';
export const HIGHLIGHT_WIDTH = 3;

export const ELEVATION_LABEL_FILL         = 'rgba(255, 220,   0, 1.00)';
export const ELEVATION_LABEL_OUTLINE      = 'rgba(  0,   0,   0, 1.00)';
export const ELEVATION_LABEL_OUTLINE_WIDTH = 4;
// Used by colorElevations: lowest -> highest elevation (0, 1, 2, ...). Levels past the end reuse the last color.
export const ELEVATION_RAMP = [
    'rgb(255,  50,  50)', // red
    'rgb(255, 150,   0)', // orange
    'rgb(255, 235,   0)', // yellow
    'rgb(  0, 230, 255)', // cyan
    'rgb( 60, 110, 255)', // blue
    'rgb( 40, 220,  60)', // green
];
// Used by blueDeploy: a true blue, distinct from the default cyan deploy highlight.
export const DEPLOY_BLUE_FILL   = 'rgba( 30,  70, 255, 0.45)';
export const DEPLOY_BLUE_STROKE = 'rgba( 30,  70, 255, 1.00)';

// Within a TeamWithPlayerIndex=1 (enemy) SpawnPointGroup, SpawnPointType distinguishes actual
// enemy entry points (11 - small count, 2-4, at board corners, present on every board incl. LE)
// from power-up pickup spots (10 - larger count, ~9, clustered centrally, only seen on survival
// boards). Empirically confirmed across survival_13/survival_14 (both {11: 4, 10: 9}) vs several
// LE boards (11 only, no 10 at all - LE has no power-up mechanic). No named enum available in the
// extracted data to confirm this by name, just by structure.
const POWERUP_SPAWN_POINT_TYPE = 10;

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

/** The visual grid's column / row counts, from a board's Config_Visual JSON - what deriveMetrics should centre on. */
export function visualDims(config: ConfigVisualJson): { cols: number; rows: number } {
    return { cols: config.VisualTiles.length, rows: config.VisualTiles[0]?.Tile.length ?? 0 };
}

/**
 * Derive hex pixel dimensions from the board's camera parameters.
 * playWidth / playHeight come from the gameplay JSON (Width / Height fields).
 */
export function deriveMetrics(
    playWidth:  number,
    playHeight: number,
    visual?:    { cols: number; rows: number },
): HexMetrics {
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

    // The visual grid is centred on the texture, so its real column/row counts matter. 7x9 / 7x10
    // boards always have 13 columns x 14 / 15 rows (the constants below); 5x7 boards have 11 x 12,
    // which centring a 13 x 14 grid would shift by a column and a row. Callers pass the board's
    // Config_Visual dimensions (visualDims) so every board centres on what it actually has.
    const nCols  = visual?.cols ?? VIS_COLS;
    const nRows  = visual?.rows ?? p.visRows;
    const gridW  = (nCols - 1) * colSpacing + hexWidth;
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
// SHARED GEOMETRY HELPERS  (addHexesToMap, and extract_boards.ts's overlay-free export)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One drawable tile (playable, and not ForceUnplayable / Block / un-bridged Water): its cell in
 * the visual grid, the logical cell it maps to (what spawn points are addressed in), and the
 * elevation `tileCenter` needs.
 */
export interface DrawableTile {
    vCol:      number;
    vRow:      number;
    column:    number;
    row:       number;
    elevation: number;
}

/** Every drawable tile in visual-grid order (vCol outer, vRow inner) - the order addHexesToMap draws in. */
export function drawableTiles(level: LevelJson, config: ConfigVisualJson): DrawableTile[] {
    const tiles: DrawableTile[] = [];
    for (let vCol = 0; vCol < config.VisualTiles.length; vCol++) {
        for (let vRow = 0; vRow < config.VisualTiles[vCol].Tile.length; vRow++) {
            const visTile = config.VisualTiles[vCol].Tile[vRow];
            if (!visTile.IsPlayable) continue;
            const lvlTile = level.Tiles[visTile.LogicalColumn]?.Tile[visTile.LogicalRow];
            if (!lvlTile) continue;
            const result = classify(visTile, lvlTile);
            if (!result.draw) continue;
            tiles.push({
                vCol,
                vRow,
                column: visTile.LogicalColumn,
                row: visTile.LogicalRow,
                elevation: result.elevation,
            });
        }
    }
    return tiles;
}

/** Pixel bounds (at IMG_SIZE) of every drawable hex outline, exactly what addHexesToMap's tracing accumulates. */
export function drawnBounds(m: HexMetrics, tiles: DrawableTile[]): BoundingBox {
    const bbox: BoundingBox = { minX: IMG_SIZE, maxX: 0, minY: IMG_SIZE, maxY: 0 };
    for (const t of tiles) {
        const { x, y } = tileCenter(m, t.vCol, t.vRow, t.elevation);
        updateBoundingBox(hexVerts(m, x, y, HEX_DRAW_SCALE), bbox);
    }
    return bbox;
}

/** Where a crop-then-downsample lands, in IMG_SIZE source pixels (crop*) and output pixels (out*). */
export interface CropRect {
    cropLeft: number;
    cropTop:  number;
    cropW:    number;
    cropH:    number;
    outW:     number;
    outH:     number;
}

/**
 * Crop to the drawn hex bounds (+40px margin) when crop=true, else keep the full canvas; then
 * downsample by downsampleFactor. undefined when there's nothing drawable to bound.
 */
export function computeCropRect(
    bbox:             BoundingBox,
    sourceW:          number,
    sourceH:          number,
    crop:             boolean,
    downsampleFactor: number,
): CropRect | undefined {
    if (bbox.maxX <= bbox.minX || bbox.maxY <= bbox.minY) return undefined;

    const margin = 40;
    const cropLeft = crop ? Math.max(0, Math.floor(bbox.minX) - margin) : 0;
    const cropTop = crop ? Math.max(0, Math.floor(bbox.minY) - margin) : 0;
    const cropRight = crop ? Math.min(sourceW, Math.ceil(bbox.maxX) + margin) : sourceW;
    const cropBottom = crop ? Math.min(sourceH, Math.ceil(bbox.maxY) + margin) : sourceH;

    const cropW = Math.max(1, cropRight - cropLeft);
    const cropH = Math.max(1, cropBottom - cropTop);
    const outW = Math.max(1, Math.round(cropW * downsampleFactor));
    const outH = Math.max(1, Math.round(cropH * downsampleFactor));
    return { cropLeft, cropTop, cropW, cropH, outW, outH };
}

/** Replace `canvas`'s contents with its `rect` crop, downsampled to rect.outW x rect.outH. */
export function cropAndDownsample(canvas: ReturnType<typeof createCanvas>, rect: CropRect): void {
    const { cropLeft, cropTop, cropW, cropH, outW, outH } = rect;

    const croppedCanvas = createCanvas(cropW, cropH);
    const croppedCtx = croppedCanvas.getContext('2d') as CanvasRenderingContext2D;
    croppedCtx.drawImage(canvas as any, cropLeft, cropTop, cropW, cropH, 0, 0, cropW, cropH);

    const downsampledCanvas = createCanvas(outW, outH);
    const downsampledCtx = downsampledCanvas.getContext('2d') as CanvasRenderingContext2D;
    downsampledCtx.imageSmoothingEnabled = true;
    downsampledCtx.drawImage(croppedCanvas as any, 0, 0, cropW, cropH, 0, 0, outW, outH);

    // Replace original output canvas contents with final processed result.
    canvas.width = outW;
    canvas.height = outH;
    const outCtx = canvas.getContext('2d') as CanvasRenderingContext2D;
    outCtx.drawImage(downsampledCanvas as any, 0, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

export interface AddHexesToMapOptions {
    /** Crop to the drawn hex bounds (+40px margin) before downsampling. Default true (existing behavior). */
    crop?: boolean;
    /** Scale factor applied after cropping (or to the full canvas when crop=false). Default 0.25 (existing behavior). */
    downsampleFactor?: number;
    /** Color power-up spawn points (SpawnPointType 10) green instead of lumping them in with enemy-spawn yellow. Default false (existing behavior). */
    distinguishPowerups?: boolean;
    /** Draw the player deploy highlight (cyan). Default true (existing behavior). */
    showDeployPoints?: boolean;
    /** Draw the enemy-spawn highlight (yellow). Default true (existing behavior). */
    showEnemySpawns?: boolean;
    /** Draw the power-up-spawn highlight (green when distinguishPowerups is on). Default true (existing behavior). */
    showPowerupSpawns?: boolean;
    /** Draw each playable hex's elevation as a number, 0 = the board's lowest elevation. Default false (existing behavior). */
    labelElevation?: boolean;
    /** Color each elevation label by its level (red, orange, yellow, cyan, blue, green from lowest up). Only with labelElevation. Default false (single-color labels). */
    colorElevations?: boolean;
    /** Draw the player deploy highlight in true blue instead of cyan. Default false (existing behavior). */
    blueDeploy?: boolean;
    /** Draw the grey hex outlines of every playable tile (they always count toward the crop bounds). Default true (existing behavior). */
    showGrid?: boolean;
    /** Which SpawnPointSets[i] supplies the highlights. Default 0 (existing behavior). */
    spawnPointsSetIndex?: number;
    /**
     * Only highlight the spawn points a PVP lineup actually uses: the first N points (array order) of the
     * set's first player group (TeamWithPlayerIndex 0) and first enemy group (1) - ignoring extra points
     * boards carry for other modes and any other teams. Default undefined = every group (existing behavior).
     */
    lineupSpawnsOnly?: number;
}

export function addHexesToMap(
    canvas: ReturnType<typeof createCanvas>,
    level:  LevelJson,
    config: ConfigVisualJson,
    image:  { width: number; height: number },
    options: AddHexesToMapOptions = {},
): void {
    const {
        crop = true,
        downsampleFactor = 0.25,
        distinguishPowerups = false,
        showDeployPoints = true,
        showEnemySpawns = true,
        showPowerupSpawns = true,
        labelElevation = false,
        colorElevations = false,
        blueDeploy = false,
        showGrid = true,
        spawnPointsSetIndex = 0,
        lineupSpawnsOnly,
    } = options;
    const m    = deriveMetrics(level.Width, level.Height, visualDims(config));
    const bbox: BoundingBox = { minX: IMG_SIZE, maxX: 0, minY: IMG_SIZE, maxY: 0 };

    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    ctx.drawImage(image as any, 0, 0, IMG_SIZE, IMG_SIZE);

    // TeamWithPlayerIndex 0 = attacker, deploys from south = CYAN
    // TeamWithPlayerIndex 1 = defender, spawns in north   = GOLD (or GREEN for power-ups, see
    // POWERUP_SPAWN_POINT_TYPE, when distinguishPowerups is on)
    const deploySet  = new Set<string>();
    const spawnSet   = new Set<string>();
    const powerupSet = new Set<string>();
    const allGroups = level.SpawnPointSets[spawnPointsSetIndex].SpawnPointGroups;
    const groups = lineupSpawnsOnly === undefined
        ? allGroups
        : [0, 1]
            .map((team) => allGroups.find((g) => g.TeamWithPlayerIndex === team))
            .filter((g): g is SpawnGroup => g !== undefined)
            .map((g) => ({ ...g, SpawnPoints: g.SpawnPoints.slice(0, lineupSpawnsOnly) }));
    for (const group of groups) {
        if (group.TeamWithPlayerIndex === 0) {
            for (const sp of group.SpawnPoints) deploySet.add(`${sp.Column},${sp.Row}`);
            continue;
        }
        for (const sp of group.SpawnPoints) {
            const key = `${sp.Column},${sp.Row}`;
            if (distinguishPowerups && sp.SpawnPointType === POWERUP_SPAWN_POINT_TYPE) {
                powerupSet.add(key);
            } else {
                spawnSet.add(key);
            }
        }
    }

    const tiles = drawableTiles(level, config);

    // Pass 1: grey outlines for all drawable tiles
    ctx.strokeStyle = EDGE_COLOR;
    ctx.lineWidth   = EDGE_WIDTH;
    for (const tile of tiles) {
        const { x, y } = tileCenter(m, tile.vCol, tile.vRow, tile.elevation);
        tracePath(ctx, hexVerts(m, x, y, HEX_DRAW_SCALE), bbox);
        if (showGrid) ctx.stroke();
    }

    // Pass 2: coloured highlights for spawn / deploy tiles
    for (const tile of tiles) {
        const key       = `${tile.column},${tile.row}`;
        const isSpawn   = spawnSet.has(key);
        const isDeploy  = deploySet.has(key);
        const isPowerup = powerupSet.has(key);
        if (!isSpawn && !isDeploy && !isPowerup) continue;
        const { x, y } = tileCenter(m, tile.vCol, tile.vRow, tile.elevation);
        if (isDeploy && showDeployPoints) {
            drawHex(ctx, m, x, y, blueDeploy ? DEPLOY_BLUE_FILL : DEPLOY_FILL, blueDeploy ? DEPLOY_BLUE_STROKE : DEPLOY_STROKE, HIGHLIGHT_WIDTH, bbox);
        } else if (isPowerup && showPowerupSpawns) {
            drawHex(ctx, m, x, y, POWERUP_FILL, POWERUP_STROKE, HIGHLIGHT_WIDTH, bbox);
        } else if (isSpawn && showEnemySpawns) {
            drawHex(ctx, m, x, y, SPAWN_FILL, SPAWN_STROKE, HIGHLIGHT_WIDTH, bbox);
        }
    }

    // Pass 3: elevation labels - 0 = the lowest elevation among drawn (playable) tiles.
    if (labelElevation) {
        const labels: Array<{ x: number; y: number; elevation: number }> = [];
        let minElevation = Infinity;
        for (const tile of tiles) {
            const { x, y } = tileCenter(m, tile.vCol, tile.vRow, tile.elevation);
            labels.push({ x, y, elevation: tile.elevation });
            if (tile.elevation < minElevation) minElevation = tile.elevation;
        }

        ctx.font = `bold ${Math.round(m.hexHeight / 3)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        for (const label of labels) {
            const level = label.elevation - minElevation;
            const text = String(level);
            ctx.lineWidth = ELEVATION_LABEL_OUTLINE_WIDTH;
            ctx.strokeStyle = ELEVATION_LABEL_OUTLINE;
            ctx.strokeText(text, label.x, label.y);
            ctx.fillStyle = colorElevations ? ELEVATION_RAMP[Math.min(level, ELEVATION_RAMP.length - 1)] : ELEVATION_LABEL_FILL;
            ctx.fillText(text, label.x, label.y);
        }
    }

    // Crop to drawn hex bounds (+40px margin) when crop=true, else keep the full canvas; then
    // downsample by downsampleFactor (both default to the original always-crop-to-25% behavior).
    const rect = computeCropRect(bbox, canvas.width, canvas.height, crop, downsampleFactor);
    if (!rect) return;
    cropAndDownsample(canvas, rect);
}

// ─────────────────────────────────────────────────────────────────────────────
// OVERLAY-FREE RENDER  (the board background only, same crop/downsample as addHexesToMap)
// ─────────────────────────────────────────────────────────────────────────────

export interface BareBoardRender {
    /** Crop box (IMG_SIZE px) and output size - map a point with toOutputPixels. */
    rect:    CropRect;
    metrics: HexMetrics;
    tiles:   DrawableTile[];
}

/**
 * Draws just the board texture (no hex outlines or highlights) onto `canvas` (an IMG_SIZE x
 * IMG_SIZE canvas), then crops and downsamples it exactly the way addHexesToMap does - so a
 * position computed with tileCenter lands on the same board feature in both. undefined when the
 * board has nothing drawable to crop to (canvas is left holding the uncropped texture).
 */
export function renderBareBoard(
    canvas:  ReturnType<typeof createCanvas>,
    level:   LevelJson,
    config:  ConfigVisualJson,
    image:   { width: number; height: number },
    options: { crop?: boolean; downsampleFactor?: number } = {},
): BareBoardRender | undefined {
    const { crop = true, downsampleFactor = 0.25 } = options;
    const m     = deriveMetrics(level.Width, level.Height, visualDims(config));
    const tiles = drawableTiles(level, config);

    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    ctx.drawImage(image as any, 0, 0, IMG_SIZE, IMG_SIZE);

    const rect = computeCropRect(drawnBounds(m, tiles), canvas.width, canvas.height, crop, downsampleFactor);
    if (!rect) return undefined;
    cropAndDownsample(canvas, rect);
    return { rect, metrics: m, tiles };
}

/** A tileCenter position (IMG_SIZE px) -> its pixel in the cropped, downsampled output image. */
export function toOutputPixels(rect: CropRect, p: { x: number; y: number }): { x: number; y: number } {
    return {
        x: (p.x - rect.cropLeft) * (rect.outW / rect.cropW),
        y: (p.y - rect.cropTop) * (rect.outH / rect.cropH),
    };
}

export { IMG_SIZE };
