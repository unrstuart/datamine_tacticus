import fs from 'fs';
import { createCanvas, loadImage } from 'canvas';

const IMG_SIZE = 2048;

async function processMap(texPath: string, logPath: string, visPath: string, outPath: string) {
    console.log('Loading files...');
    const logicalData = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
    const visualData = JSON.parse(fs.readFileSync(visPath, 'utf-8'));
    const image = await loadImage(texPath);

    const canvas = createCanvas(IMG_SIZE, IMG_SIZE);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, IMG_SIZE, IMG_SIZE);

    const totalCols = visualData.Width; // e.g., 13
    const totalRows = visualData.Height; // e.g., 14

    const Y_SCALE = 0.78; 
    
    // FIXED: hexSize is now strictly derived from the Width. 
    // Changing Y_SCALE will no longer alter the horizontal scale or positioning.
    const hexSize = (IMG_SIZE / (1.5 * totalCols + 0.5)) * 0.98; 

    // X-Axis Math (Constant)
    const gridWidth = hexSize * (1.5 * totalCols + 0.5);
    const offsetX = (IMG_SIZE - gridWidth) / 2 + hexSize;

    // Y-Axis Math (Affected by Y_SCALE)
    const gridHeight = hexSize * Math.sqrt(3) * (totalRows + 0.5) * Y_SCALE;
    const offsetY = (IMG_SIZE - gridHeight) / 2 + (hexSize * Math.sqrt(3) * Y_SCALE) / 2;

    console.log(`Calculated Flat-Topped Hex Radius: ${hexSize.toFixed(2)}px`);

    // --- MANUAL TWEAKS ---
    const SHIFT_EAST_PX = 0; 
    const SHIFT_NORTH_PX = hexSize * Math.sqrt(3) * 0.5 * Y_SCALE; 

    const getCenter = (c: number, r: number) => {
        const x = offsetX + hexSize * 1.5 * c;
        const y = offsetY + hexSize * Math.sqrt(3) * (r + (c % 2 !== 0 ? 0.5 : 0)) * Y_SCALE;

        return {
            x: x + SHIFT_EAST_PX,
            y: (IMG_SIZE - y) - SHIFT_NORTH_PX,
        };
    };

    const minCol = visualData.PlayableMinCol;
    const maxCol = visualData.PlayableMaxCol;
    const minRow = visualData.PlayableMinRow;
    const maxRow = visualData.PlayableMaxRow;

    console.log('Drawing flat-topped hexes (X and Y mathematically decoupled)...');

    for (let col = minCol; col <= maxCol; col++) {
        for (let row = minRow; row <= maxRow; row++) {
            
            const center = getCenter(col, row);

            // Draw Hex Outline
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 180) * (60 * i);
                const x = center.x + hexSize * Math.cos(angle);
                const y = center.y + hexSize * Math.sin(angle) * Y_SCALE;
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; 
            ctx.lineWidth = 3;
            ctx.stroke();

            // Spawns/Deployments
            const spawnGroups = logicalData.SpawnPointSets[0].SpawnPointGroups;
            spawnGroups.forEach((team: any) => {
                team.SpawnPoints.forEach((pt: any) => {
                    
                    let targetRow = pt.Row + minRow;
                    
                    if (team.TeamWithPlayerIndex === 0) {
                        targetRow -= 1; // Shifts deployment highlighting down one logical row
                    }

                    if (pt.Column + minCol === col && targetRow === row) {
                        ctx.fillStyle =
                            team.TeamWithPlayerIndex === 0
                                ? 'rgba(0, 255, 255, 0.3)' 
                                : 'rgba(255, 255, 0, 0.3)'; 
                        ctx.fill();
                    }
                });
            });
        }
    }

    fs.writeFileSync(outPath, canvas.toBuffer('image/jpeg'));
    console.log(`✅ Success! Map generated at: ${outPath}`);
}

const args = process.argv.slice(2);
if (args.length < 4) {
    console.log('Usage: npm run draw -- <texture.jpg> <logical.json> <visual.json> <output.jpg>');
    process.exit(1);
}

processMap(args[0], args[1], args[2], args[3]).catch(console.error);