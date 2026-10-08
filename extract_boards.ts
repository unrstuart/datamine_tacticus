import * as fs from 'fs';
import * as path from 'path';
import { createCanvas, loadImage } from 'canvas';
import {
    ConfigVisualJson,
    addHexesToMap,
    DrawableTile,
    IMG_SIZE,
    LevelJson,
    UNCALIBRATED_BOARD_SIZES,
    deriveMetrics,
    visualDims,
    renderBareBoard,
    tileCenter,
    toOutputPixels,
} from './hex_map_core';

// Board backgrounds + spawn-point pixel positions for the PVP boards (clientGameConfig.battles.pvpBoards).
//
// The background is the board texture cropped to the drawn hexes (+40px margin) and downsampled
// by 0.25, exactly the crop addHexesToMap applies, so a position computed with the same
// deriveMetrics/tileCenter math lands on the same board feature. It's plain by default, or with
// the hex grid and one spawn-point set drawn on (drawOverlay). Either way every spawn point's x/y
// is expressed in the pixel space of that cropped, downsampled image.

export interface ExtractBoardsParams {
    gameconfigPath: string;
    /**
     * An extracted-assets root holding monobehaviour/<BoardId>.json, monobehaviour/<BoardId>_Config_Visual.json
     * and texture2d/<BoardId>_Visual.png for the boards. Not every extraction has them (the QA build's
     * 1.43.112 dump has 2 of the 69 PVP boards; the 1.43.94 marketing build has all 69).
     */
    boardsAssetsDir: string;
    /** Which boards; default is every id in clientGameConfig.battles.pvpBoards. */
    boardIds?: string[];
    /**
     * Burn the hex grid and the spawn points into each board image (enemy spawns yellow, player spawns
     * blue - the existing addHexesToMap look). The set drawn is the board's own pvpBoards[].SpawnPointsSet
     * (0 when it has none) - the set a live PVP match on it uses - unless overlaySpawnSet overrides it, and
     * only the first 5 points per side are drawn (a PVP lineup's size; boards carry extras for other modes).
     * Same crop and size as the plain background, so spawn-point x/y don't change either way. Default false.
     */
    drawOverlay?: boolean;
    overlaySpawnSet?: number;
}

export interface BoardSpawnPoint {
    index: number;
    x: number;
    y: number;
    column: number;
    row: number;
    spawnPointType: number;
    tag: string;
    direction: number;
    room: number;
}

export interface BoardSpawnGroup {
    teamWithPlayerIndex: number;
    machineOfWarPosition: number;
    spawnPoints: BoardSpawnPoint[];
}

export interface BoardSpawnSet {
    spawnPointsSetIndex: number;
    groups: BoardSpawnGroup[];
}

export interface BoardImage {
    boardId: string;
    png: Buffer;
    width: number;
    height: number;
}

export interface ExtractBoardsProblems {
    /** Boards whose level JSON, Config_Visual JSON or _Visual.png isn't in boardsAssetsDir. */
    missingSource: Array<{ boardId: string; missing: string[] }>;
    /** Boards whose Width x Height isn't in hex_map_core's BOARD_PARAMS - they can't be exported until calibrated. */
    needsCalibration: Array<{ boardId: string; size: string }>;
    /** Boards exported on a BOARD_PARAMS entry that is still a placeholder (positions are approximate). */
    uncalibratedBoards: Array<{ boardId: string; size: string }>;
    /** Spawn points whose logical cell has no drawable tile, so no position can be computed. They are left out. */
    unresolvedSpawnPoints: Array<{ boardId: string; set: number; team: number; index: number; column: number; row: number }>;
    /** Spawn points whose logical cell is covered by more than one drawable tile (the first, in visual-grid order, is used). */
    ambiguousSpawnPoints: number;
}

export interface ExtractBoardsResult {
    spawnPoints: Record<string, BoardSpawnSet[]>;
    images: BoardImage[];
    problems: ExtractBoardsProblems;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

const LINEUP_SIZE = 5;

// pvpBoards[].SpawnPointsSet is the index into the board's SpawnPointSets a live match uses; it's
// absent on the PVP_* boards (those use set 0).
function pvpBoardsFromConfig(gameconfigPath: string): Array<{ BoardId: string; SpawnPointsSet?: number }> {
    const data = JSON.parse(fs.readFileSync(gameconfigPath, 'utf-8'));
    return data.clientGameConfig.battles.pvpBoards;
}

export async function extractBoards({
    gameconfigPath,
    boardsAssetsDir,
    boardIds,
    drawOverlay = false,
    overlaySpawnSet,
}: ExtractBoardsParams): Promise<ExtractBoardsResult> {
    const pvpBoards = pvpBoardsFromConfig(gameconfigPath);
    const configuredSet = new Map(pvpBoards.map((b) => [b.BoardId, b.SpawnPointsSet ?? 0]));
    const ids = [...new Set(boardIds ?? pvpBoards.map((b) => b.BoardId))].sort();
    const problems: ExtractBoardsProblems = {
        missingSource: [],
        needsCalibration: [],
        uncalibratedBoards: [],
        unresolvedSpawnPoints: [],
        ambiguousSpawnPoints: 0,
    };
    const spawnPoints: Record<string, BoardSpawnSet[]> = {};
    const images: BoardImage[] = [];

    for (const boardId of ids) {
        const levelPath = path.join(boardsAssetsDir, 'monobehaviour', `${boardId}.json`);
        const configPath = path.join(boardsAssetsDir, 'monobehaviour', `${boardId}_Config_Visual.json`);
        const imagePath = path.join(boardsAssetsDir, 'texture2d', `${boardId}_Visual.png`);
        const missing = [levelPath, configPath, imagePath].filter((f) => !fs.existsSync(f)).map((f) => path.relative(boardsAssetsDir, f));
        if (missing.length > 0) {
            problems.missingSource.push({ boardId, missing });
            continue;
        }

        const level: LevelJson = JSON.parse(fs.readFileSync(levelPath, 'utf-8'));
        const config: ConfigVisualJson = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const size = `${level.Width}x${level.Height}`;
        try {
            deriveMetrics(level.Width, level.Height, visualDims(config));
        } catch {
            problems.needsCalibration.push({ boardId, size });
            continue;
        }
        if (UNCALIBRATED_BOARD_SIZES.includes(size)) problems.uncalibratedBoards.push({ boardId, size });

        // Canvas must be IMG_SIZE x IMG_SIZE regardless of the texture's native resolution (same as
        // render_hex_tiles.tsx): renderBareBoard draws the texture onto IMG_SIZE x IMG_SIZE.
        const canvas = createCanvas(IMG_SIZE, IMG_SIZE);
        const image = await loadImage(imagePath);
        const render = renderBareBoard(canvas, level, config, image);
        if (!render) {
            problems.missingSource.push({ boardId, missing: ['no drawable tiles to crop to'] });
            continue;
        }
        const drawnSet = overlaySpawnSet ?? configuredSet.get(boardId) ?? 0;
        if (drawOverlay && level.SpawnPointSets[drawnSet]) {
            // TeamWithPlayerIndex 0 = the player's deploy tiles (blue), 1 = the enemy's spawns (yellow, usually the north side).
            // addHexesToMap crops/downsamples with the same drawn-bounds rect renderBareBoard just used, so the size is identical.
            const overlayCanvas = createCanvas(IMG_SIZE, IMG_SIZE);
            addHexesToMap(overlayCanvas, level, config, image, {
                blueDeploy: true,
                spawnPointsSetIndex: drawnSet,
                lineupSpawnsOnly: LINEUP_SIZE,
            });
            images.push({ boardId, png: overlayCanvas.toBuffer('image/png'), width: overlayCanvas.width, height: overlayCanvas.height });
        } else {
            images.push({ boardId, png: canvas.toBuffer('image/png'), width: canvas.width, height: canvas.height });
        }

        // A spawn point is addressed by logical (Column, Row); several visual tiles can share one.
        const tilesByCell = new Map<string, DrawableTile[]>();
        for (const tile of render.tiles) {
            const key = `${tile.column},${tile.row}`;
            const list = tilesByCell.get(key);
            if (list) list.push(tile);
            else tilesByCell.set(key, [tile]);
        }

        spawnPoints[boardId] = level.SpawnPointSets.map((set, setIndex) => ({
            spawnPointsSetIndex: setIndex,
            groups: set.SpawnPointGroups.map((group) => {
                const points: BoardSpawnPoint[] = [];
                group.SpawnPoints.forEach((sp, index) => {
                    const candidates = tilesByCell.get(`${sp.Column},${sp.Row}`);
                    if (!candidates) {
                        problems.unresolvedSpawnPoints.push({
                            boardId,
                            set: setIndex,
                            team: group.TeamWithPlayerIndex,
                            index,
                            column: sp.Column,
                            row: sp.Row,
                        });
                        return;
                    }
                    if (candidates.length > 1) problems.ambiguousSpawnPoints++;
                    const tile = candidates[0];
                    const pixel = toOutputPixels(render.rect, tileCenter(render.metrics, tile.vCol, tile.vRow, tile.elevation));
                    points.push({
                        index,
                        x: round2(pixel.x),
                        y: round2(pixel.y),
                        column: sp.Column,
                        row: sp.Row,
                        spawnPointType: sp.SpawnPointType,
                        tag: sp.Tag ?? '',
                        direction: sp.Direction ?? 0,
                        room: sp.Room ?? -1,
                    });
                });
                return {
                    teamWithPlayerIndex: group.TeamWithPlayerIndex,
                    machineOfWarPosition: group.MachineOfWarPosition ?? 0,
                    spawnPoints: points,
                };
            }),
        }));
    }

    return { spawnPoints, images, problems };
}
