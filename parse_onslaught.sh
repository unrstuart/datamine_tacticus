#!/bin/bash

# ==============================================================================
# TRIPLY NESTED FOR LOOP SCRIPT
# Executes a command for every combination of three coordinate variables.
# Total iterations: (2 - 0 + 1) * (150 - 0 + 1) * (10 - 0 + 1) = 4983 commands.
# ==============================================================================

# ------------------------------------------------------------------------------
# 1. MAPPING FUNCTIONS AND ARRAYS
# ------------------------------------------------------------------------------

# Alliance Mapping (0=imp, 1=xenos, 2=chaos)
get_alliance_name() {
    case $1 in
        0) echo "imp" ;;
        1) echo "xenos" ;;
        2) echo "chaos" ;;
        *) echo "Unknown" ;;
    esac
}

# Zone Mapping (0=alpha, 1=beta, ..., 10=lambda)
# Bash array for Greek letters (index = zone number)
GREEK_ZONES=("alpha" "beta" "gamma" "delta" "epsilon" "zeta" "eta" "theta" "iota" "kappa" "lambda")

# Sector Mapping (Roman Numerals, offset by 1)
# Sector 0 maps to I, Sector 150 maps to CLI (151)
to_roman() {
    local n=$(( $1 + 1 )) # Add 1 for the 1-based Roman numeral system
    
    # Mappings for up to 151
    local -A values=( [100]=C [90]=XC [50]=L [40]=XL [10]=X [9]=IX [5]=V [4]=IV [1]=I )
    local -a keys=( 100 90 50 40 10 9 5 4 1 )
    local roman_str=""

    for key in "${keys[@]}"; do
        while [[ $n -ge $key ]]; do
            roman_str+=${values[$key]}
            n=$(( n - key ))
        done
    done
    echo "$roman_str"
}

# ------------------------------------------------------------------------------
# 2. Command to be executed (Placeholder - now managed inside the loop)
# ------------------------------------------------------------------------------
# COMMAND="echo 'Processing location: Alliance $alliance, Sector $sector, Zone $zone'"

# ------------------------------------------------------------------------------
# 3. Main Nested Loops
# ------------------------------------------------------------------------------

# Outer loop: Alliance (0 to 2)
for alliance in {0..2}; do
    # Calculate mapped name once per alliance
    alliance_name=$(get_alliance_name $alliance)

    # Middle loop: Sector (0 to 150)
    for sector in {0..150}; do
        # Calculate mapped name once per sector
        sector_name=$(to_roman $sector)

        # Inner loop: Zone (0 to 10)
        for zone in {0..10}; do
            # Get mapped name from Greek array
            zone_name=${GREEK_ZONES[$zone]}
            
            # Echo the processed location with all variable formats
            echo "Processing location: Alliance $alliance_name ($alliance), Sector $sector_name ($sector), Zone $zone_name ($zone)"
            bazel-bin/json_explorer --json_file out/text_assets/GameConfig --max_depth=7 --max_members=10000 --path clientGameConfig.battles.waves.tracks[${alliance}].tiers[${sector}].battles[${zone}] > /tmp/${alliance}_${sector}_${zone}.count
            
        done # End Zone loop
    done # End Sector loop
done # End Alliance loop

echo "---------------------------------------------------"
echo "Script finished. All 4983 unique coordinate combinations were processed."
