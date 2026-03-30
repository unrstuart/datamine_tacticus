#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Unity Asset Extractor using UnityPy
Extract various resource files from Unity games
"""

import UnityPy
import os
import re
import sys
from pathlib import Path
import argparse
from PIL import Image
import json
UnityPy.config.FALLBACK_UNITY_VERSION = "2022.3.40f1"


def check_texture_decoder():
    """Check if texture2ddecoder is properly installed and warn if not."""
    try:
        import texture2ddecoder
        print("✅ texture2ddecoder is available")
        return True
    except ImportError:
        print("⚠️  texture2ddecoder not found. Compressed textures (ETC2, ASTC, BC7, PVRTC) may fail.")
        print("    Try: pip install texture2ddecoder")
        return False


def try_get_image(data, label=""):
    """
    Safely attempt to get a PIL image from a Unity texture/sprite object.
    Returns (image, error_message). image is None if decode failed.
    """
    try:
        img = data.image
        if img is None:
            return None, "data.image returned None (likely unsupported/compressed texture format on macOS)"
        return img, None
    except Exception as e:
        return None, str(e)


def save_raw_texture(data, filepath_no_ext):
    """
    When image decode fails, save raw texture data as a fallback.
    Saves .dds if possible (readable by tools like texconv), otherwise raw bytes.
    Returns the path saved, or None.
    """
    try:
        # UnityPy exposes raw image_data and texture format
        raw = getattr(data, 'image_data', None) or getattr(data, 'm_Data', None)
        fmt = getattr(data, 'm_TextureFormat', None)
        width = getattr(data, 'm_Width', '?')
        height = getattr(data, 'm_Height', '?')

        if raw:
            raw_path = Path(str(filepath_no_ext) + f"_RAW_{fmt}_{width}x{height}.bin")
            with open(raw_path, 'wb') as f:
                f.write(bytes(raw))
            return raw_path
    except Exception as e:
        print(f"    ⚠️  Could not save raw texture data: {e}")
    return None


class UnityAssetExtractor:
    def __init__(self, input_path, output_path="extracted_assets"):
        self.input_path = input_path
        self.output_path = Path(output_path)
        self.output_path.mkdir(exist_ok=True)
        self.visuals = dict()
        self.decode_failures = []  # Track failed textures for summary
        self.board_ids_from_config = set()  # boardIds found in gameconfig text assets
        self.boards_extracted = set()       # board MonoBehaviours actually serialized

        # Create output folders for required resource types
        self.texture2d_path = self.output_path / "texture2d"
        self.sprite_path = self.output_path / "sprites"
        self.text_path = self.output_path / "text_assets"
        self.monobehaviour_path = self.output_path / "monobehaviour"
        self.raw_path = self.output_path / "raw_textures"  # For decode failures

        for path in [self.texture2d_path, self.sprite_path, self.text_path,
                     self.monobehaviour_path, self.raw_path]:
            path.mkdir(exist_ok=True)

    def unpack_sprite_atlas(self, atlas_data):
        for sprite_name, sprite_data in zip(
                atlas_data.m_PackedSpriteNamesToIndex, atlas_data.m_PackedSprites):
            sprite = sprite_data.read()
            img, err = try_get_image(sprite, sprite_name)
            if img:
                filename = self._sanitize_filename(f"{sprite_name}.png")
                filepath = self.sprite_path / filename
                img.save(filepath)
                print(f"✅ SpriteAtlas sprite: {filename}")
            else:
                print(f"    ❌ SpriteAtlas sprite decode failed [{sprite_name}]: {err}")
                save_raw_texture(sprite, self.raw_path / self._sanitize_filename(sprite_name))
                self.decode_failures.append(('SpriteAtlas', sprite_name, err))

    def search_by_name(self, query: str, extract: bool = False):
        """
        Search all assets whose name, m_Name, or container path contains `query` (case-insensitive).
        If extract=True, also attempt to save any image assets found.
        """
        env = UnityPy.load(self.input_path)
        q = query.lower()
        matches = []

        for obj in env.objects:
            obj_type = obj.type.name if hasattr(obj, 'type') and hasattr(obj.type, 'name') else str(obj.type)
            container = getattr(obj, 'container', '') or ''
            hit_on = None

            if q in container.lower():
                hit_on = f"container='{container}'"

            if not hit_on:
                try:
                    data = obj.read()
                    name = getattr(data, 'm_Name', None) or getattr(data, 'name', None) or ''
                    if q in str(name).lower():
                        hit_on = f"name='{name}'"
                except Exception:
                    pass

            if hit_on:
                matches.append((obj, obj_type, hit_on))

        if not matches:
            print(f"\n❌ No assets found matching '{query}'")
            print("   Try a shorter substring, e.g. 'EC2' instead of 'EC2_08'")
            return

        print(f"\n✅ Found {len(matches)} asset(s) matching '{query}':\n")
        for obj, obj_type, hit_on in matches:
            print(f"  path_id={obj.path_id}  type={obj_type}  matched on {hit_on}")

        if extract:
            print(f"\n📥 Extracting matched assets...")
            for i, (obj, obj_type, _) in enumerate(matches, 1):
                if obj_type in ("Texture2D", "Sprite"):
                    self._extract_single_asset(None, obj, i)
                elif obj_type == "SpriteAtlas":
                    try:
                        self.unpack_sprite_atlas(obj.read())
                    except Exception as e:
                        print(f"  ❌ SpriteAtlas failed: {e}")

    def inspect_by_ids(self, path_ids: list[int], extract: bool = False):
        """
        Load the asset file and dump everything known about each requested path_id.
        If extract=True, also save any image assets found.
        """
        env = UnityPy.load(self.input_path)
        targets = set(path_ids)
        found = set()

        for obj in env.objects:
            if obj.path_id not in targets:
                continue
            found.add(obj.path_id)
            obj_type = obj.type.name if hasattr(obj, 'type') and hasattr(obj.type, 'name') else str(obj.type)
            print(f"\n{'='*60}")
            print(f"path_id   : {obj.path_id}")
            print(f"type      : {obj_type}")
            print(f"container : {getattr(obj, 'container', 'N/A')}")

            try:
                data = obj.read()
                print(f"name      : {getattr(data, 'name', getattr(data, 'm_Name', 'N/A'))}")
                print(f"\n--- Attributes ---")
                for attr in sorted(dir(data)):
                    if attr.startswith('_'):
                        continue
                    try:
                        val = getattr(data, attr)
                        if callable(val):
                            continue
                        val_str = str(val)
                        if len(val_str) > 120:
                            val_str = val_str[:120] + "…"
                        print(f"  {attr}: {val_str}")
                    except Exception as e:
                        print(f"  {attr}: <error reading: {e}>")

                # If it has image data, try decoding and optionally saving
                if obj_type in ("Texture2D", "Sprite"):
                    img, err = try_get_image(data)
                    if img:
                        print(f"\n✅ Image decoded OK: {img.size} {img.mode}")
                        if extract:
                            name = getattr(data, 'm_Name', None) or getattr(data, 'name', None) or str(obj.path_id)
                            out_dir = self.texture2d_path if obj_type == "Texture2D" else self.sprite_path
                            filename = self._sanitize_filename(f"{name}.png")
                            filepath = out_dir / filename
                            img.save(filepath)
                            print(f"✅ Saved: {filepath}")
                    else:
                        print(f"\n❌ Image decode failed: {err}")
                        fmt = getattr(data, 'm_TextureFormat', None)
                        w = getattr(data, 'm_Width', '?')
                        h = getattr(data, 'm_Height', '?')
                        print(f"   TextureFormat={fmt}, size={w}x{h}")

            except Exception as e:
                print(f"  <could not read object: {e}>")

        missing = targets - found
        if missing:
            print(f"\n⚠️  These IDs were not found in the asset file: {missing}")
            print("   (They may be in a different bundle/file)")
        print(f"\n{'='*60}")

    def extract_all_assets(self, only: set = None):
        """Extract all assets. Pass `only` to restrict which types are processed.
        Valid values: 'boards', 'sprites', 'textures', 'text', 'monobehaviour'
        """
        # Map friendly --only names to Unity type names
        ONLY_MAP = {
            'boards':        {"MonoBehaviour"},
            'monobehaviour': {"MonoBehaviour"},
            'sprites':       {"Sprite", "SpriteAtlas"},
            'textures':      {"Texture2D"},
            'text':          {"TextAsset"},
        }
        ALL_TYPES = {"MonoBehaviour", "Sprite", "TextAsset", "Texture2D", "SpriteAtlas"}

        if only:
            TARGET_TYPES = set()
            for key in only:
                mapped = ONLY_MAP.get(key.lower())
                if mapped:
                    TARGET_TYPES |= mapped
                else:
                    print(f"⚠️  Unknown --only value '{key}'. "
                          f"Valid options: {', '.join(ONLY_MAP.keys())}")
            # Always include MonoBehaviour so _visual objects are captured for visuals.csv,
            # even when the user restricts extraction with --only
            TARGET_TYPES.add("MonoBehaviour")
            # Always include TextAsset when extracting boards so we can
            # scan GameConfig for boardId references and produce the coverage report
            if 'boards' in only or 'monobehaviour' in only:
                TARGET_TYPES.add("TextAsset")
            if not TARGET_TYPES:
                print("No valid types selected, nothing to do.")
                return True
            print(f"Extracting only: {', '.join(sorted(TARGET_TYPES))}")
        else:
            TARGET_TYPES = ALL_TYPES

        try:
            env = UnityPy.load(self.input_path)

            print(f"Processing: {self.input_path}")
            print(f"Output directory: {self.output_path}")

            asset_count = 0
            processed_count = 0
            type_stats = {}
            file_counters = {}

            for obj in env.objects:
                try:
                    asset_count += 1
                    obj_type = obj.type.name if hasattr(obj, 'type') and hasattr(obj.type, 'name') else str(obj.type)
                    type_stats[obj_type] = type_stats.get(obj_type, 0) + 1

                    if obj_type in TARGET_TYPES:
                        file_counters[obj_type] = file_counters.get(obj_type, 0) + 1

                        if obj_type == "SpriteAtlas":
                            print(f"\n📦 Unpacking SpriteAtlas (ID: {obj.path_id})")
                            try:
                                self.unpack_sprite_atlas(obj.read())
                            except Exception as e:
                                print(f"    ❌ SpriteAtlas unpack failed: {e}")
                        else:
                            self._extract_single_asset(env, obj, file_counters[obj_type])
                            processed_count += 1

                except Exception as e:
                    print(f"Error processing object (ID: {getattr(obj, 'path_id', 'unknown')}): {e}")
                    continue

            # Display type statistics
            print("\n=== Object Type Statistics ===")
            for obj_type, count in sorted(type_stats.items()):
                marker = " ✓" if obj_type in TARGET_TYPES else ""
                print(f"{obj_type}: {count}{marker}")

            # Report decode failures
            if self.decode_failures:
                print(f"\n⚠️  === Texture Decode Failures ({len(self.decode_failures)}) ===")
                print("These textures could not be decoded on macOS.")
                print("Raw binary files have been saved to: raw_textures/")
                print("You can convert them with tools like 'texconv' or 'PVRTexTool'.\n")
                # Show unique formats that failed
                failure_msgs = set(f[2] for f in self.decode_failures)
                for msg in failure_msgs:
                    print(f"  • {msg}")
                print(f"\nFailed assets:")
                for asset_type, name, err in self.decode_failures[:20]:  # cap at 20
                    print(f"  [{asset_type}] {name}")
                if len(self.decode_failures) > 20:
                    print(f"  ... and {len(self.decode_failures) - 20} more")

            # Save visuals mapping
            if self.visuals:
                try:
                    filepath = self.monobehaviour_path / "visuals.csv"
                    with open(filepath, 'w', encoding='utf-8', newline='') as csvfile:
                        for key in sorted(self.visuals.keys()):
                            csvfile.write(f"{key},{self.visuals[key]}\n")
                    print(f"\n✅ Saved visuals mapping: {len(self.visuals)} entries → {filepath}")
                except Exception as e:
                    print(f"Failed to save visuals.csv: {e}")
            else:
                print("\n⚠️  No _visual MonoBehaviours found — visuals.csv not written.")

            print(f"\nExtraction complete! Checked: {asset_count}, Processed: {processed_count}")

            # Cross-reference boardIds from gameconfig against extracted boards
            if self.board_ids_from_config:
                print(f"\n=== Board Coverage Report ===")
                print(f"boardIds referenced in gameconfig : {len(self.board_ids_from_config)}")
                print(f"Board configs extracted           : {len(self.boards_extracted)}")

                missing_boards = sorted(
                    bid for bid in self.board_ids_from_config
                    if bid.upper() not in self.boards_extracted
                    and (bid.upper() + "_CONFIG_VISUAL") not in self.boards_extracted
                )
                if missing_boards:
                    print(f"\n⚠️  {len(missing_boards)} boardId(s) from gameconfig have no extracted config:")
                    for bid in missing_boards:
                        print(f"  • {bid}")
                else:
                    print("✅ All referenced boardIds were found!")

        except Exception as e:
            print(f"Error loading file: {e}")
            return False

        return True

    def _extract_single_asset(self, env, obj, sequence_num):
        """Extract a single asset"""
        try:
            obj_type = obj.type.name if hasattr(obj, 'type') and hasattr(obj.type, 'name') else str(obj.type)

            try:
                data = obj.read()
            except Exception as read_e:
                if obj_type == "MonoBehaviour":
                    return
                else:
                    print(f"Cannot read resource (ID: {obj.path_id}): {read_e}")
                    return

            if hasattr(data, 'type') and hasattr(data.type, 'name'):
                data_type = data.type.name
            else:
                data_type = obj_type

            if data_type == "Texture2D":
                self._extract_texture2d(data, obj, sequence_num)
            elif data_type == "Sprite":
                self._extract_sprite(data, obj, sequence_num)
            elif data_type == "TextAsset":
                self._extract_text_asset(data, obj, sequence_num)
            elif data_type == "MonoBehaviour":
                self._extract_monobehaviour(env, data, obj, sequence_num)

        except Exception as e:
            obj_info = f"ID: {getattr(obj, 'path_id', 'unknown')}"
            print(f"Failed to extract resource ({obj_info}): {e}")

    def _get_asset_name(self, data, obj, asset_type, sequence_num):
        """Get the real name of the asset"""
        name_candidates = []

        if data:
            if hasattr(data, 'm_Name'):
                m_name_value = getattr(data, 'm_Name')
                if m_name_value and str(m_name_value).strip():
                    name_candidates.append(("data.m_Name", str(m_name_value).strip()))
            if hasattr(data, 'name'):
                name_value = getattr(data, 'name')
                if name_value and str(name_value).strip():
                    name_candidates.append(("data.name", str(name_value).strip()))

        if hasattr(obj, 'name'):
            obj_name_value = getattr(obj, 'name')
            if obj_name_value and str(obj_name_value).strip():
                name_candidates.append(("obj.name", str(obj_name_value).strip()))

        if hasattr(obj, 'container'):
            container_value = getattr(obj, 'container')
            if container_value:
                container_path = str(container_value)
                if container_path and container_path not in ['None', 'null', '']:
                    base_name = os.path.basename(container_path)
                    if base_name:
                        name_without_ext = os.path.splitext(base_name)[0]
                        if name_without_ext:
                            name_candidates.append(("obj.container", name_without_ext))

        best_name = None
        for source, candidate in name_candidates:
            candidate = str(candidate).strip()
            if candidate and candidate not in ['', 'None', 'null', 'undefined']:
                if not (candidate.startswith(('unnamed_', 'default_', 'temp_')) or
                        candidate == f'unnamed_{obj.path_id}' or
                        candidate.isdigit()):
                    best_name = candidate
                    break

        if best_name:
            return self._clean_filename(best_name)
        else:
            return f"{asset_type.lower()}_{sequence_num:03d}_{obj.path_id}"

    def _clean_filename(self, filename):
        invalid_chars = '<>:"/\\|?*'
        clean_name = filename
        for char in invalid_chars:
            clean_name = clean_name.replace(char, '_')
        return clean_name.strip()

    def _extract_texture2d(self, data, obj, sequence_num):
        """Extract Texture2D images"""
        try:
            name = self._get_asset_name(data, obj, "Texture2D", sequence_num)
            fmt = getattr(data, 'm_TextureFormat', 'unknown')
            print(f"\n🖼️  Texture2D [{name}] format={fmt}")

            img, err = try_get_image(data, name)
            if img:
                filename = self._sanitize_filename(f"{name}.png")
                filepath = self.texture2d_path / filename
                img.save(filepath)
                print(f"✅ Extracted Texture2D: {filename}")
            else:
                print(f"❌ Decode failed: {err}")
                raw_path = save_raw_texture(data, self.raw_path / self._sanitize_filename(name))
                if raw_path:
                    print(f"   💾 Raw data saved: {raw_path.name}")
                self.decode_failures.append(('Texture2D', name, err))

        except Exception as e:
            print(f"❌ Failed to extract Texture2D: {e}")

    def _extract_sprite(self, data, obj, sequence_num):
        """Extract Sprite images"""
        try:
            name = self._get_asset_name(data, obj, "Sprite", sequence_num)
            print(f"\n🎨 Sprite [{name}]")

            img, err = try_get_image(data, name)
            if img:
                filename = self._sanitize_filename(f"{name}.png")
                filepath = self.sprite_path / filename
                img.save(filepath)
                print(f"✅ Extracted Sprite: {filename}")
            else:
                print(f"❌ Sprite decode failed: {err}")
                # Sprites delegate to their Texture2D, so try fetching that directly
                try:
                    tex = data.m_RD.texture.read()
                    tex_fmt = getattr(tex, 'm_TextureFormat', 'unknown')
                    print(f"   Source Texture2D format: {tex_fmt}")
                    tex_img, tex_err = try_get_image(tex, name)
                    if tex_img:
                        # Crop to sprite rect if available
                        try:
                            rd = data.m_RD
                            rect = rd.textureRect
                            tex_h = tex.m_Height
                            # PIL origin is top-left, Unity is bottom-left — flip Y
                            x = int(rect.x)
                            y = int(tex_h - rect.y - rect.height)
                            w = int(rect.width)
                            h = int(rect.height)
                            cropped = tex_img.crop((x, y, x + w, y + h))
                            filename = self._sanitize_filename(f"{name}.png")
                            cropped.save(self.sprite_path / filename)
                            print(f"✅ Extracted Sprite (via Texture2D crop): {filename}")
                            return
                        except Exception as crop_e:
                            print(f"   Crop failed ({crop_e}), saving full texture instead")
                            filename = self._sanitize_filename(f"{name}_fulltex.png")
                            tex_img.save(self.sprite_path / filename)
                            print(f"✅ Saved full source texture: {filename}")
                            return
                    else:
                        print(f"   Source texture also failed: {tex_err}")
                        raw_path = save_raw_texture(tex, self.raw_path / self._sanitize_filename(name))
                        if raw_path:
                            print(f"   💾 Raw texture saved: {raw_path.name}")
                        self.decode_failures.append(('Sprite', name, tex_err))
                except Exception as tex_e:
                    print(f"   Could not access source texture: {tex_e}")
                    self.decode_failures.append(('Sprite', name, err))

        except Exception as e:
            print(f"❌ Failed to extract Sprite: {e}")

    def _extract_text_asset(self, data, obj, sequence_num):
        """Extract TextAsset text files"""
        try:
            print(f"\n📄 Processing TextAsset (Sequence: {sequence_num}, ID: {obj.path_id})")

            text_content = None
            name = self._get_asset_name(data, obj, "TextAsset", sequence_num)

            if hasattr(data, 'script') and data.script is not None:
                text_content = data.script
            elif hasattr(data, 'text') and data.text is not None:
                text_content = data.text
            elif hasattr(data, 'm_Script') and data.m_Script is not None:
                text_content = data.m_Script
            elif hasattr(data, 'bytes') and data.bytes is not None:
                text_content = data.bytes

            if text_content is not None:
                filename = self._sanitize_filename(name)
                filepath = self.text_path / filename

                if isinstance(text_content, bytes):
                    try:
                        text_content = text_content.decode('utf-8')
                    except UnicodeDecodeError:
                        text_content = text_content.decode('utf-8', errors='ignore')

                if not isinstance(text_content, str):
                    text_content = str(text_content)

                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(text_content)

                print(f"✅ Extracted TextAsset: {filename} ({len(text_content)} characters)")

                # Scan for boardId references only in the GameConfig asset
                if filename.lower().startswith('gameconfig'):
                    self._collect_board_ids_from_gameconfig(text_content, filename)
            else:
                print(f"❌ TextAsset has no text content (ID: {obj.path_id})")

        except Exception as e:
            print(f"❌ Failed to extract TextAsset: {e}")

    # Matches board ID patterns: EC2_08, LE3_deathguard_04, Waves_Xenos_19, PVP_desert_01, survival_11, etc.
    BOARD_ID_RE = re.compile(r'^[A-Za-z][A-Za-z0-9]*(_[A-Za-z0-9]+)+$')

    def _is_board_monobehaviour(self, data, obj) -> bool:
        """Return True if this MonoBehaviour looks like a board config."""
        container = (getattr(obj, 'container', '') or '').lower()
        if 'boards/' in container or 'board/' in container:
            return True
        name = str(getattr(data, 'm_Name', '') or '').strip()
        # Matches the board ID pattern and isn't a _Config_Visual or _visual suffix
        # (those are separate visual configs — we want both)
        if self.BOARD_ID_RE.match(name):
            return True
        return False

    def _collect_board_ids_from_gameconfig(self, text: str, source_name: str):
        """Parse boardId values out of a text asset that looks like a gameconfig."""
        import re
        found = re.findall(r'"boardId"\s*:\s*"([^"]+)"', text)
        if found:
            new_ids = set(found) - self.board_ids_from_config
            self.board_ids_from_config.update(found)
            print(f"  📋 Collected {len(found)} boardId references "
                  f"({len(new_ids)} new) from {source_name}")

    def _resolve_sprite_pptr(self, data, attr_name: str):
        """
        Try to resolve a named PPtr attribute to the actual sprite name
        by looking up its path_id in the assets file.
        Returns (sprite_name, resolved_attr_name) or (None, None).
        """
        try:
            pptr = getattr(data, attr_name, None)
            if pptr is None:
                return None, None
            asset = getattr(pptr, 'asset', None)
            if asset is None:
                return None, None
            path_id = getattr(asset, 'path_id', 0) or getattr(asset, 'm_PathID', 0)
            if not path_id:
                return None, None
            assets_file = getattr(data, 'assets_file', None)
            if assets_file is None:
                return None, None
            # UnityPy SerializedFile stores objects in .objects dict keyed by path_id
            obj_map = getattr(assets_file, 'objects', None)
            if obj_map and path_id in obj_map:
                sobj = obj_map[path_id]
                sdata = sobj.read()
                name = str(getattr(sdata, 'm_Name', '') or getattr(sdata, 'name', '') or '').strip()
                return (name or None), attr_name
        except Exception as e:
            pass
        return None, None

    def _extract_monobehaviour(self, env, data, obj, sequence_num):
        """Extract MonoBehaviour objects: board configs to JSON, _visual objects to visuals.csv."""
        try:
            name = self._get_asset_name(data, obj, "MonoBehaviour", sequence_num)
            m_name = str(getattr(data, 'm_Name', '') or '')

            # Handle _visual MonoBehaviours — always process these regardless of --only
            if m_name.lower().endswith("_visual"):
                unit_id = str(getattr(data, 'unitId', '') or '').strip()
                asset_naming = str(getattr(data, 'assetNaming', '') or '').strip()
                key = (unit_id + "_visual") if unit_id else m_name

                # Try Sprite PPtr first, then RoundPortrait as fallback
                sprite_name, resolved_from = self._resolve_sprite_pptr(data, 'Sprite')
                if not sprite_name:
                    sprite_name, resolved_from = self._resolve_sprite_pptr(data, 'RoundPortrait')
                # Trim off unnecessary prefixes
                if sprite_name and sprite_name.startswith("ui_image_portrait_"):
                    sprite_name = sprite_name[len("ui_image_portrait_"):]
                if sprite_name and sprite_name.startswith("ui_image_RoundPortrait_"):
                    sprite_name = sprite_name[len("ui_image_RoundPortrait_"):]

                visual_value = sprite_name if sprite_name else asset_naming
                if visual_value:
                    self.visuals[key] = visual_value
                    src = f"resolved from {resolved_from}" if sprite_name else "assetNaming"
                    print(f"  👁️  {key} → {visual_value} ({src})")

                # Serialize the _visual to JSON with resolved sprite name injected
                serialized = self._serialize_unknown(data)
                serialized['_resolved_sprite_name'] = visual_value or None
                serialized['_resolved_sprite_from'] = resolved_from or ('assetNaming' if asset_naming else None)
                filename = self._sanitize_filename(f"{m_name}.json")
                filepath = self.monobehaviour_path / filename
                with open(filepath, 'w', encoding='utf-8') as f:
                    json.dump(serialized, f, indent=2, ensure_ascii=False, default=str)
                return

            # Handle board config MonoBehaviours
            if not self._is_board_monobehaviour(data, obj):
                return

            serialized = self._serialize_unknown(data)
            filename = self._sanitize_filename(f"{name}.json")
            filepath = self.monobehaviour_path / filename
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(serialized, f, indent=2, ensure_ascii=False, default=str)

            self.boards_extracted.add(name.upper())
            print(f"✅ Board config: {filename}")

        except Exception as e:
            print(f"❌ Failed to extract MonoBehaviour (ID: {obj.path_id}): {e}")

            serialized = self._serialize_unknown(data)
            filename = self._sanitize_filename(f"{name}.json")
            filepath = self.monobehaviour_path / filename
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(serialized, f, indent=2, ensure_ascii=False, default=str)

            self.boards_extracted.add(name.upper())
            print(f"✅ Board config: {filename}")

        except Exception as e:
            print(f"❌ Failed to extract MonoBehaviour (ID: {obj.path_id}): {e}")

    def _extract_mSource_content(self, mSource):
        """Extract detailed content from mSource"""
        content = {
            'type': str(type(mSource)),
            'raw_string': str(mSource)
        }

        try:
            for attr_name in dir(mSource):
                if not attr_name.startswith('_'):
                    try:
                        attr_value = getattr(mSource, attr_name)
                        if not callable(attr_value):
                            if attr_name == 'mTerms' and hasattr(attr_value, '__iter__'):
                                terms_list = []
                                try:
                                    for term in attr_value:
                                        term_data = {}
                                        for term_attr in dir(term):
                                            if not term_attr.startswith('_'):
                                                try:
                                                    term_attr_value = getattr(term, term_attr)
                                                    if not callable(term_attr_value):
                                                        term_data[term_attr] = term_attr_value
                                                except:
                                                    term_data[term_attr] = "<cannot_read>"
                                        terms_list.append(term_data)
                                    content[attr_name] = terms_list
                                except Exception as terms_e:
                                    content[attr_name] = f"<mTerms processing failed: {terms_e}>"
                            else:
                                content[attr_name] = attr_value
                    except Exception as attr_e:
                        content[attr_name] = f"<cannot_read: {str(attr_e)}>"
        except Exception as e:
            content['extraction_error'] = str(e)

        return content

    # UnityPy internal types we never want to recurse into
    SKIP_TYPES = (
        "SerializedFile", "ObjectReader", "BundleFile",
        "AssetsFile", "Environment", "SerializedFileHeader",
    )
    # Attribute names that point back into the UnityPy object graph
    SKIP_ATTRS = {
        "assets_file", "object_reader", "reader", "assetsfile",
        "m_GameObject",  # PPtr — just a reference, not data
        "m_Script",      # PPtr to MonoScript — not data
    }

    def _serialize_unknown(self, obj, depth=0, _seen=None):
        """
        Recursively serialize UnityPy objects (including UnknownObject) to
        plain Python dicts/lists suitable for JSON dumping.
        Skips UnityPy internals and circular references.
        """
        if _seen is None:
            _seen = set()

        if depth > 30:
            return "<max depth>"

        # Plain JSON-safe scalars — return immediately
        if obj is None or isinstance(obj, (bool, int, float, str)):
            return obj

        # Avoid circular refs for non-scalars
        try:
            obj_id = id(obj)
            if obj_id in _seen:
                return "<circular ref>"
            _seen.add(obj_id)
        except Exception:
            pass

        # Skip known UnityPy internal types by class name
        cls_name = type(obj).__name__
        if cls_name in self.SKIP_TYPES:
            return f"<{cls_name}>"

        # Lists / tuples
        if isinstance(obj, (list, tuple)):
            return [self._serialize_unknown(item, depth + 1, _seen) for item in obj]

        # Dicts
        if isinstance(obj, dict):
            return {k: self._serialize_unknown(v, depth + 1, _seen)
                    for k, v in obj.items()}

        # Objects with attributes (UnknownObject, dataclasses, etc.)
        if hasattr(obj, '__dict__') or hasattr(obj, '__slots__'):
            result = {}
            try:
                # Prefer __dict__ keys over dir() to avoid triggering properties
                if hasattr(obj, '__dict__'):
                    attrs = [k for k in obj.__dict__.keys() if not k.startswith('_')]
                else:
                    attrs = [a for a in dir(obj) if not a.startswith('_')]
            except Exception:
                return str(obj)

            for attr in attrs:
                if attr in self.SKIP_ATTRS:
                    continue
                try:
                    val = getattr(obj, attr)
                    if callable(val):
                        continue
                    result[attr] = self._serialize_unknown(val, depth + 1, _seen)
                except Exception as e:
                    result[attr] = f"<error: {e}>"
            return result

        # Fallback
        return str(obj)

    def dump_to_json(self, path_ids: list[int]):
        """
        Fully serialize MonoBehaviour (or any) objects to JSON, recursively
        expanding all UnknownObject fields. Saves to monobehaviour/ directory.
        """
        env = UnityPy.load(self.input_path)
        targets = set(path_ids)
        found = set()

        for obj in env.objects:
            if obj.path_id not in targets:
                continue
            found.add(obj.path_id)
            obj_type = obj.type.name if hasattr(obj, 'type') and hasattr(obj.type, 'name') else str(obj.type)

            try:
                data = obj.read()
                name = getattr(data, 'm_Name', None) or getattr(data, 'name', None) or str(obj.path_id)
                print(f"Serializing {obj_type} '{name}' (path_id={obj.path_id})...")

                serialized = self._serialize_unknown(data)

                filename = self._sanitize_filename(f"{name}.json")
                filepath = self.monobehaviour_path / filename
                with open(filepath, 'w', encoding='utf-8') as f:
                    json.dump(serialized, f, indent=2, ensure_ascii=False, default=str)
                print(f"✅ Saved: {filepath}")

            except Exception as e:
                print(f"❌ Failed to dump path_id={obj.path_id}: {e}")

        missing = targets - found
        if missing:
            print(f"⚠️  IDs not found in this bundle: {missing}")

    def _sanitize_filename(self, filename):
        invalid_chars = '<>:"/\\|?*'
        for char in invalid_chars:
            filename = filename.replace(char, '_')
        if len(filename) > 255:
            name, ext = os.path.splitext(filename)
            filename = name[:255 - len(ext)] + ext
        return filename


def main():
    check_texture_decoder()

    parser = argparse.ArgumentParser(description="Extract Unity game resources")
    parser.add_argument("input", help="Input file or folder path")
    parser.add_argument("-o", "--output", default="extracted_assets",
                        help="Output folder (default: extracted_assets)")
    parser.add_argument("--find-name", metavar="QUERY",
                        help="Search for assets whose name or container path contains QUERY (case-insensitive). "
                             "E.g.: --find-name EC2_08")
    parser.add_argument("--extract-found", action="store_true",
                        help="When used with --find-name, also extract any image assets found")
    parser.add_argument("--find-id", nargs="+", type=int, metavar="PATH_ID",
                        help="Inspect specific asset(s) by path_id and dump all info about them. "
                             "E.g.: --find-id 6176478489775177520")
    parser.add_argument("--dump-id", nargs="+", type=int, metavar="PATH_ID",
                        help="Fully serialize asset(s) by path_id to JSON, expanding all nested objects. "
                             "E.g.: --dump-id -529856405056229085")
    parser.add_argument("--only", nargs="+", metavar="TYPE",
                        help="Restrict extraction to specific asset types. "
                             "Options: boards, sprites, textures, text, monobehaviour. "
                             "E.g.: --only boards sprites")

    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f"Error: Input path not found {args.input}")
        return 1

    extractor = UnityAssetExtractor(args.input, args.output)

    if args.find_id:
        print(f"🔍 Inspecting {len(args.find_id)} asset(s) by path_id...")
        extractor.inspect_by_ids(args.find_id, extract=args.extract_found)
        return 0

    if args.dump_id:
        print(f"📦 Dumping {len(args.dump_id)} asset(s) to JSON...")
        extractor.dump_to_json(args.dump_id)
        return 0

    if args.find_name:
        print(f"🔍 Searching for assets matching '{args.find_name}'...")
        extractor.search_by_name(args.find_name, extract=args.extract_found)
        return 0

    print("Starting Unity asset extraction...")
    success = extractor.extract_all_assets(only=set(args.only) if args.only else None)

    if success:
        print(f"\nExtraction completed! Assets saved to: {extractor.output_path}")
        return 0
    else:
        print("\nExtraction failed!")
        return 1


if __name__ == "__main__":
    try:
        import UnityPy
        from PIL import Image
    except ImportError as e:
        print("Please install required packages:")
        print("pip install UnityPy Pillow texture2ddecoder")
        sys.exit(1)

    sys.exit(main())
