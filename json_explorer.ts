import * as fs from "fs";

// Parses shards, currency, and gold from survival event chests. The survival event is hardcoded so
// you need to change the name of the chests.
function parseSurvival() {
  try {
    // Read the file synchronously
    const fileContents = fs.readFileSync(process.argv[2], "utf-8");

    // Parse the JSON data
    const data = JSON.parse(fileContents);

    let gold: number[] = [];
    let shards: number[] = [];
    let cost: number[] = [];
    for (let i = 1; i <= 30; ++i) {
      const padded = i.toString().padStart(2, "0");
      const chest =
        data["clientGameConfig"]["loot"]["chests"][
          `seasonal_event_14_progress_chest_${padded}`
        ];
      let thisGold = 0;
      let thisShards = 0;
      chest[0].rewards.forEach((reward: string) => {
        if (reward.startsWith("gold:")) {
          thisGold += parseInt(reward.split(":")[1].split("-")[0]);
        } else if (reward.startsWith("shards")) {
          thisShards += parseInt(reward.split(":")[1]);
        }
      });
      const thisCost =
        data["clientGameConfig"]["shop"]["products"][
          `product_seasonal_event_halloween_2025_progress_chest_${padded}`
        ].cost.amount;
      gold.push(thisGold);
      shards.push(thisShards);
      cost.push(thisCost);
    }
    for (let i = 0; i < gold.length; ++i) {
      const padded = (i + 1).toString().padStart(2, "0");
      const cumulGold = gold.slice(0, i + 1).reduce((a, b) => a + b, 0);
      const cumulShards = shards.slice(0, i + 1).reduce((a, b) => a + b, 0);
      const cumulCost = cost.slice(0, i + 1).reduce((a, b) => a + b, 0);
      console.log(
        `${padded},${gold[i]},${cumulGold},${shards[i]},${cumulShards},${cost[i]},${cumulCost}`
      );
    }

    let daily: Record<number, string> = {};
    data.clientGameConfig.quests.groups.seasonal_daily.quests.forEach((quest: any) => {
      if (!quest.name.startsWith("halloween_2025_daily_")) return;
      console.log(quest);
      const day = parseInt(quest.name.split("_").pop()!);
      daily[day] = quest.rewards;
    });
    console.log(daily);


    console.log('low\n',data.clientGameConfig.loot.tieredProgressRewards.hse_defeat_waves_tier_low);
    console.log('high\n',data.clientGameConfig.loot.tieredProgressRewards.hse_defeat_waves_tier_high);
    console.log('mid\n',data.clientGameConfig.loot.tieredProgressRewards.hse_defeat_waves_tier_mid);

  } catch (error) {
    console.error("Error reading or parsing the file:", error);
  }
}

parseSurvival();