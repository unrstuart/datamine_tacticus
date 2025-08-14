# datamine_tacticus

A tool for datamining Snowprint's Tacticus game files.

## Image Miner

This is a Python script that uses the excellent [UnityPy Python library](https://github.com/K0lb3/UnityPy) to extract the game's images.

### Setup

- Ensure you have Python 3 installed
- `pip install -r requirements.txt` to install dependencies

### Usage

The game's files need to be navigable on your system as standard files and folders - APK files can be changed from `.apk` to `.zip` and extracted to achieve this.

Provide the folder path containing the game assets, and a directory path to save the images.

```sh
# Example for macOS game location
python image_miner.py $HOME/Library/Caches/tacticus/games/$GAME_VERSION_HASH/Tacticus.app ./out
```
