import argparse
import logging
import os
import UnityPy

# This value can be sourced from the game's files in the `Contents/Resources/Data`` folder.
# In a terminal in this dir, run `strings level0 | head -1` to get the Unity version.
# On macOS, the game files may live in `$HOME/Library/Caches/tacticus/games/$GAME_VERSION_HASH/Tacticus.app/Contents/Resources/Data`.
UnityPy.config.FALLBACK_UNITY_VERSION = "2022.3.40f1"

log_level = os.environ.get("LOGLEVEL", "WARN").upper()
logging.basicConfig(level=log_level, format="%(levelname)s: %(message)s")


def unpack_sprite_atlas(atlas_data, out_filepath):
    for sprite_name, sprite_data in zip(atlas_data.m_PackedSpriteNamesToIndex, atlas_data.m_PackedSprites):
        save_image(sprite_data.read().image, out_filepath, sprite_name)

def unpack_texture_array(texture_array_data, out_filepath):
    for i, image in enumerate(texture_array_data.images):
        out_name = f"{texture_array_data.m_Name}_{i}.png"
        save_image(image, out_filepath, out_name)

def build_filepath(dirname, filename):
    fp = os.path.join(dirname, filename)
    fp, _ext = os.path.splitext(fp)
    return fp + ".png"

def save_image(image, out_dir, out_name):
    dest = build_filepath(out_dir, out_name)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    image.save(dest)
    logging.info(f"Saved {dest}")

def unpack_all_assets(in_dir: str, out_dir: str):
    for root, dirs, files in os.walk(in_dir):
        for file_name in files:
            file_path = os.path.join(root, file_name)
            env = UnityPy.load(file_path)

            for path, obj in env.container.items():
                try:
                    # Accessing the name prop may throw an error for some irrelevant-to-our-needs
                    # object types, so we use a try/except and access the name on its own line.
                    objType = obj.type.name

                    if objType == "SpriteAtlas":
                        logging.debug(f"Unpacking SpriteAtlas {file_path}")
                        unpack_sprite_atlas(obj.read(), out_dir)
                    elif objType == "Texture2DArray":
                        logging.debug("Skipping Texture2DArray {path}, edit this script to include these assets")
                        # Uncomment if we want Texture2DArray assets - they don't look useful
                        # logging.debug(f"Unpacking Texture2DArray {file_path}")
                        # unpack_texture_array(obj.read(), out_dir)
                    elif objType in ["Sprite", "Texture2D"]:
                        data = obj.read()
                        out_name = os.path.basename(path) if data.m_Name is None else data.m_Name
                        logging.debug(f"Saving {objType} {out_name} to {out_dir}")
                        save_image(data.image, out_dir, out_name)
                except:
                    logging.warning(f"Failed to unpack {path}, skipping...")


def main():
    parser = argparse.ArgumentParser(
        description="Extract Unity image assets from a directory tree.")
    parser.add_argument(
        "input_dir", help="Input directory to search for Unity assets")
    parser.add_argument(
        "output_dir", help="Directory to save extracted images and metadata")
    args = parser.parse_args()
    print(f"Saving Unity assets in {args.input_dir} to {args.output_dir}")
    unpack_all_assets(args.input_dir, args.output_dir)
    print(f"Unity assets saved to {args.output_dir}")


if __name__ == "__main__":
    main()
