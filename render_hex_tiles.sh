#!/bin/bash

# Target directory (defaults to current directory if not provided)
TARGET_DIR="${1:-.}"

echo "Searching for matching JSON pairs in: $TARGET_DIR"
echo "--------------------------------------------------"

# 1. Find files ending in .json
# 2. Filter out those that already contain 'config_visual'
# 3. Check if a matching 'config_visual' version exists
find "$TARGET_DIR" -maxdepth 1 -iname "*.json" | grep -iv "_Config_Visual\.json$" | while read -r base_file; do
    
    # Get the file prefix (e.g., ./MC1_67 from ./MC1_67.json)
    prefix="${base_file%.*}"
    
    # Construct the expected visual config name
    visual_config="${prefix}_Config_Visual.json"
    
    # Check if the visual config file exists (case-insensitive check)
    # We use 'find' for the specific file to ensure case-insensitivity works reliably
    if find "$TARGET_DIR" -maxdepth 1 -iname "$(basename "$visual_config")" | grep -q .; then
        echo "$base_file"
    fi
done
