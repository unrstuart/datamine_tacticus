import { readFileSync } from 'fs';
import { resolve } from 'path';

import recipeData from './newRecipeData.json';

/**
 * Main execution function
 */

function main(): void {

  if (process.argv.length != 4) {
    console.error('Usage: npx ts-node script.ts <file1.json> <file2.json>');
    console.error('args: ', process.argv);
    process.exit(1);
  }

  try {
    const file1Path = resolve(process.argv[2]);
    const file2Path = resolve(process.argv[3]);

    const data1 = JSON.parse(readFileSync(file1Path, 'utf-8'));

    const data2 = JSON.parse(readFileSync(file2Path, 'utf-8'));

    const inv1: Record<string, number> = data1.inventory.upgrades;
    const inv2: Record<string, number> = data2.inventory.upgrades;
    const diffs: Record<string, number> = {};
    for (const upgradeId in inv1) {
        const count1 = inv1[upgradeId] || 0;
        const count2 = inv2[upgradeId] || 0;
        if (count1 !== count2) {
            diffs[upgradeId] = count2 - count1;
        }
    }
    for (const upgradeId in inv2) {
        if (!(upgradeId in inv1)) {
            diffs[upgradeId] = inv2[upgradeId];
        }
    }

    const getUpgradeName = (id: string): string => {
        const recipe = (recipeData as Record<string, { material: string }>)[id];
        return recipe ? recipe.material : 'Unknown Upgrade';
    };

    console.log('Inventory differences (positive means added, negative means removed):');
    for (const [upgradeId, diff] of Object.entries(diffs)) {
        console.log(`${upgradeId} (${getUpgradeName(upgradeId)}): ${diff}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    }
    process.exit(1);
  }
}

main();