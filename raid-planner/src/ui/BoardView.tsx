import { Board } from '../core/board';
import { cellKey } from '../core/hex';
import { boardImageUrl } from '../data';

interface BoardViewProps {
    board: Board;
    /** Cells of the boss platforms to highlight. */
    platformCells?: ReadonlySet<string>;
}

const DRAW_SCALE = 0.88;

function hexPoints(x: number, y: number, w: number, h: number): string {
    const w2 = (w / 2) * DRAW_SCALE;
    const h2 = (h / 2) * DRAW_SCALE;
    const w4 = w2 / 2;
    return [
        [x + w2, y],
        [x + w4, y - h2],
        [x - w4, y - h2],
        [x - w2, y],
        [x - w4, y + h2],
        [x + w4, y + h2],
    ]
        .map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`)
        .join(' ');
}

/** The board image with every hex outlined on top. */
export function BoardView({ board, platformCells }: BoardViewProps) {
    const { imageWidth, imageHeight, hexWidth, hexHeight } = board.data;
    return (
        <svg className="board" viewBox={`0 0 ${imageWidth} ${imageHeight}`} width={imageWidth} height={imageHeight}>
            <image href={boardImageUrl(board.id)} width={imageWidth} height={imageHeight} />
            {board.hexes.map((h) => {
                const key = cellKey(h.cell);
                const cls = !h.passable ? 'hex blocked' : platformCells?.has(key) ? 'hex platform' : 'hex';
                return (
                    <g key={key}>
                        <polygon className={cls} points={hexPoints(h.x, h.y, hexWidth, hexHeight)} />
                    </g>
                );
            })}
        </svg>
    );
}
