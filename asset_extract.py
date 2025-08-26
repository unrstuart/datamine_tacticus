#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Unity Asset Extractor using UnityPy
Extract various resource files from Unity games
"""

import UnityPy
import os
import sys
from pathlib import Path
import argparse
from PIL import Image
import json
UnityPy.config.FALLBACK_UNITY_VERSION="2022.3.40f1";

class UnityAssetExtractor:
    def __init__(self, input_path, output_path="extracted_assets"):
        self.input_path = input_path
        self.output_path = Path(output_path)
        self.output_path.mkdir(exist_ok=True)

        # Create output folders for required resource types
        self.texture2d_path = self.output_path / "texture2d"
        self.sprite_path = self.output_path / "sprites"
        self.text_path = self.output_path / "text_assets"
        self.monobehaviour_path = self.output_path / "monobehaviour"

        for path in [self.texture2d_path, self.sprite_path, self.text_path, self.monobehaviour_path]:
            path.mkdir(exist_ok=True)

    def extract_all_assets(self):
        """Extract all assets"""
        try:
            # Load Unity environment
            env = UnityPy.load(self.input_path)

            print(f"Processing: {self.input_path}")
            print(f"Output directory: {self.output_path}")

            asset_count = 0
            processed_count = 0
            type_stats = {}  # Statistics for each type
            file_counters = {}  # File counters for each type

            # Iterate through all objects
            for obj in env.objects:
                try:
                    asset_count += 1

                    # Get object type and collect statistics
                    obj_type = obj.type.name if hasattr(obj, 'type') and hasattr(obj.type, 'name') else str(obj.type)
                    type_stats[obj_type] = type_stats.get(obj_type, 0) + 1

                    # Check if it's one of our target resource types
                    # if obj_type in ["Texture2D", "Sprite", "TextAsset", "MonoBehaviour"]:
                    if obj_type in ["MonoBehaviour"]:
                        # Increment counter for this type
                        file_counters[obj_type] = file_counters.get(obj_type, 0) + 1

                        # print(f"Found target resource: {obj_type} (ID: {obj.path_id}, Sequence: {file_counters[obj_type]})")
                        self._extract_single_asset(env, obj, file_counters[obj_type])
                        processed_count += 1

                    # if asset_count % 100 == 0:
                    #     print(f"Checked {asset_count} objects, processed {processed_count} target resources...")

                except Exception as e:
                    print(f"Error processing object (ID: {getattr(obj, 'path_id', 'unknown')}): {e}")
                    continue

            # Display type statistics
            print("\n=== Object Type Statistics ===")
            for obj_type, count in sorted(type_stats.items()):
                marker = " ✓" if obj_type in ["Texture2D", "Sprite", "TextAsset", "MonoBehaviour"] else ""
                print(f"{obj_type}: {count}{marker}")

            print(
                f"\nExtraction complete! Total checked: {asset_count} objects, processed: {processed_count} target resources")

        except Exception as e:
            print(f"Error loading file: {e}")
            return False

        return True

    def _extract_single_asset(self, env, obj, sequence_num):
        """Extract a single asset"""
        try:
            # Get the original object type
            obj_type = obj.type.name if hasattr(obj, 'type') and hasattr(obj.type, 'name') else str(obj.type)

            # Try to read object data
            try:
                data = obj.read()
            except Exception as read_e:
                # MonoBehaviour read failures are common, try direct processing
                if obj_type == "MonoBehaviour":
                    # print(f"MonoBehaviour read failed, trying fallback (ID: {obj.path_id}): {read_e}")
                    # self._extract_monobehaviour_fallback(obj, sequence_num)
                    return
                else:
                    print(f"Cannot read resource (ID: {obj.path_id}): {read_e}")
                    return

            # For some types (like MonoBehaviour), the read data may not have type attribute
            # So we use the original object's type information
            if hasattr(data, 'type') and hasattr(data.type, 'name'):
                data_type = data.type.name
            else:
                # Use original object type
                data_type = obj_type

            # print(f"Processing {data_type} resource: {getattr(data, 'name', f'unnamed_{obj.path_id}')}")

            # Process based on resource type, pass sequence number
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
        # Try various ways to get asset name
        name_candidates = []

        # 1. Get name from data object - prioritize m_Name
        if data:
            # m_Name usually contains the real filename
            if hasattr(data, 'm_Name'):
                m_name_value = getattr(data, 'm_Name')
                if m_name_value and str(m_name_value).strip():
                    name_candidates.append(("data.m_Name", str(m_name_value).strip()))

            # name attribute as backup
            if hasattr(data, 'name'):
                name_value = getattr(data, 'name')
                if name_value and str(name_value).strip():
                    name_candidates.append(("data.name", str(name_value).strip()))

        # 2. Get name from original object
        if hasattr(obj, 'name'):
            obj_name_value = getattr(obj, 'name')
            if obj_name_value and str(obj_name_value).strip():
                name_candidates.append(("obj.name", str(obj_name_value).strip()))

        # 3. Try to get name from container path
        if hasattr(obj, 'container'):
            container_value = getattr(obj, 'container')
            if container_value:
                container_path = str(container_value)
                if container_path and container_path not in ['None', 'null', '']:
                    # Extract filename from path
                    import os
                    base_name = os.path.basename(container_path)
                    if base_name:
                        # Remove extension
                        name_without_ext = os.path.splitext(base_name)[0]
                        if name_without_ext:
                            name_candidates.append(("obj.container", name_without_ext))

        # Select the best name
        best_name = None
        for source, candidate in name_candidates:
            candidate = str(candidate).strip()
            # Check if it's a valid filename
            if candidate and candidate not in ['', 'None', 'null', 'undefined']:
                if not (candidate.startswith(('unnamed_', 'default_', 'temp_')) or
                        candidate == f'unnamed_{obj.path_id}' or
                        candidate.isdigit()):
                    best_name = candidate
                    break

        # If found good name, use it directly; otherwise use sequence scheme
        if best_name:
            # Found real filename, use it directly without any suffix
            clean_name = self._clean_filename(best_name)
            return clean_name
        else:
            # No real filename found, use sequence scheme
            return f"{asset_type.lower()}_{sequence_num:03d}_{obj.path_id}"

    def _clean_filename(self, filename):
        """Clean special characters from filename"""
        # Remove or replace invalid filename characters
        invalid_chars = '<>:"/\\|?*'
        clean_name = filename
        for char in invalid_chars:
            clean_name = clean_name.replace(char, '_')

        # Remove extra whitespace
        clean_name = clean_name.strip()

        return clean_name

    def _extract_texture2d(self, data, obj, sequence_num):
        """Extract Texture2D images"""
        try:

            # Get image data
            img = data.image
            if img:
                print(f"\n🖼️ Processing Texture2D (Sequence: {sequence_num}, ID: {obj.path_id}, GUID: {obj.guid})")
                # Get real filename
                name = self._get_asset_name(data, obj, "Texture2D", sequence_num)
                filename = self._sanitize_filename(f"{name}.png")
                filepath = self.texture2d_path / filename

                # Save image
                img.save(filepath)
                print(f"✅ Extracted Texture2D: {filename}")

        except Exception as e:
            print(f"❌ Failed to extract Texture2D: {e}")

    def _extract_sprite(self, data, obj, sequence_num):
        """Extract Sprite images"""
        try:

            # Get Sprite image
            img = data.image
            if img:
                print(f"\n🎨 Processing Sprite (Sequence: {sequence_num}, ID: {obj.path_id}, GUID: {obj.guid})")
                name = self._get_asset_name(data, obj, "Sprite", sequence_num)
                filename = self._sanitize_filename(f"{name}.png")
                filepath = self.sprite_path / filename

                img.save(filepath)
                print(f"✅ Extracted Sprite: {filename}")

        except Exception as e:
            print(f"❌ Failed to extract Sprite: {e}")

    def _extract_text_asset(self, data, obj, sequence_num):
        """Extract TextAsset text files"""
        try:
            print(f"\n📄 Processing TextAsset (Sequence: {sequence_num}, ID: {obj.path_id})")

            # Get text data - TextAsset may have different attribute names
            text_content = None

            # Get real filename using our smart filename extraction method
            name = self._get_asset_name(data, obj, "TextAsset", sequence_num)

            # Try different attributes to get text content
            if hasattr(data, 'script') and data.script is not None:
                text_content = data.script
                print(f"  Using script attribute")
            elif hasattr(data, 'text') and data.text is not None:
                text_content = data.text
                print(f"  Using text attribute")
            elif hasattr(data, 'm_Script') and data.m_Script is not None:
                text_content = data.m_Script
                print(f"  Using m_Script attribute")
            elif hasattr(data, 'bytes') and data.bytes is not None:
                text_content = data.bytes
                print(f"  Using bytes attribute")
            else:
                # List all available attributes for debugging
                available_attrs = [attr for attr in dir(data) if not attr.startswith('_')]
                print(f"  Available attributes: {available_attrs}")

                # Try to find attributes that look like text content
                for attr_name in available_attrs:
                    try:
                        attr_value = getattr(data, attr_name)
                        if not callable(attr_value) and attr_value is not None:
                            if isinstance(attr_value, (str, bytes)) and len(str(attr_value)) > 0:
                                text_content = attr_value
                                print(f"  Using {attr_name} attribute")
                                break
                    except:
                        continue

            if text_content is not None:
                # TextAsset without .txt extension
                filename = self._sanitize_filename(name)
                filepath = self.text_path / filename

                # Handle encoding
                if isinstance(text_content, bytes):
                    try:
                        text_content = text_content.decode('utf-8')
                    except UnicodeDecodeError:
                        try:
                            text_content = text_content.decode('utf-8', errors='ignore')
                        except:
                            text_content = str(text_content)

                # Ensure it's a string
                if not isinstance(text_content, str):
                    text_content = str(text_content)

                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(text_content)

                print(f"✅ Successfully extracted TextAsset: {filename} ({len(text_content)} characters)")
            else:
                # If no text content found, save debug info
                debug_filename = self._sanitize_filename(f"{name}_debug")
                debug_filepath = self.text_path / debug_filename

                with open(debug_filepath, 'w', encoding='utf-8') as f:
                    f.write(f"TextAsset Debug Info\n")
                    f.write(f"Path ID: {obj.path_id}\n")
                    f.write(f"Sequence: {sequence_num}\n")
                    f.write(f"Data Type: {type(data)}\n")
                    f.write(f"Available Attributes:\n")

                    for attr_name in dir(data):
                        if not attr_name.startswith('_'):
                            try:
                                attr_value = getattr(data, attr_name)
                                f.write(f"  {attr_name}: {type(attr_value)} = {str(attr_value)[:100]}\n")
                            except Exception as e:
                                f.write(f"  {attr_name}: <error: {e}>\n")

                print(f"❌ TextAsset has no text content, debug info saved: {debug_filename}")

        except Exception as e:
            print(f"❌ Failed to extract TextAsset: {e}")

    def _extract_monobehaviour(self, env, data, obj, sequence_num):
        """Extract MonoBehaviour script data"""
        try:
            # print(f"\n⚙️ Processing MonoBehaviour (Sequence: {sequence_num}, ID: {obj.path_id})")

            m_name_value = ''
            # Only process MonoBehaviour with m_Name = "I2Languages_en"
            if hasattr(data, 'm_Name'):
                m_name_value = getattr(data, 'm_Name')
                if m_name_value != "I2Languages_en" and not m_name_value.endswith("_visual") and not m_name_value.lower().startswith("gameconfig"):
                    # if len(m_name_value) > 0:
                    #     print(f"  Skipping MonoBehaviour: m_Name = '{m_name_value}' (not I2Languages_en)")
                    return
                print(f"  Found target MonoBehaviour: m_Name = {m_name_value}")
            else:
                print(f"  Skipping MonoBehaviour: no m_Name attribute")
                return

            if False and m_name_value.endswith("_visual"):
                print(f"  {m_name_value} attrs: ", dir(data))
                print(f"  {m_name_value} Sprite: ", getattr(data, 'Sprite', []))
                print(f"  {m_name_value} RoundPortrait: ", getattr(data, 'RoundPortrait', []))
                print(f"  {m_name_value} TinyRoundPortrait: ", getattr(data, 'TinyRoundPortrait', []))

                sprite_ref = getattr(data, 'Sprite', None)

                if sprite_ref:
                    # find_and_process_asset_by_guid(env, sprite_ref.guid, m_name_value)
                    sprite = env.get_asset_by_guid(sprite_ref.guid)
                    print(f"  Found Sprite: {sprite.name}")
                    for attr in dir(sprite):
                        print(f"  attr[{attr}]: {getattr(sprite, attr)}")
                    print("done processing, quitting")
                    sys.exit(0)
                else:
                    sys.exit(1)
            
            # Check if mSource content exists
            if hasattr(data, 'mSource'):
                mSource_value = getattr(data, 'mSource')
                if not mSource_value:
                    print(f"  Skipping: mSource is empty")
                    return
                print(f"  Found mSource: {type(mSource_value)}")
            else:
                print(f"  Skipping: no mSource attribute")
                return

            # Get filename
            name = self._get_asset_name(data, obj, "MonoBehaviour", sequence_num)

            # Try to extract detailed mSource content
            try:
                # If mSource is a complex object, try to serialize to JSON
                content = self._extract_mSource_content(mSource_value)

                # Save as JSON file to maintain structure
                filename = self._sanitize_filename(f"{name}.json")
                filepath = self.monobehaviour_path / filename

                with open(filepath, 'w', encoding='utf-8') as f:
                    json.dump(content, f, indent=2, ensure_ascii=False, default=str)

                print(f"✅ Extracted MonoBehaviour: {filename}")

            except Exception as extract_e:
                print(f"Failed to extract mSource content: {extract_e}")

                # Fallback: save raw string representation
                filename = self._sanitize_filename(f"{name}_raw.txt")
                filepath = self.monobehaviour_path / filename

                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(f"mSource content (raw representation):\n")
                    f.write(str(mSource_value))

                print(f"✅ Extracted MonoBehaviour (raw format): {filename}")

        except Exception as e:
            print(f"❌ Failed to extract MonoBehaviour: {e}")

    def _extract_mSource_content(self, mSource):
        """Extract detailed content from mSource"""
        content = {
            'type': str(type(mSource)),
            'raw_string': str(mSource)
        }

        # Try to get mSource attributes
        try:
            for attr_name in dir(mSource):
                if not attr_name.startswith('_'):
                    try:
                        attr_value = getattr(mSource, attr_name)
                        if not callable(attr_value):
                            # Special handling for mTerms list
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
                                                    term_data[term_attr] = f"<cannot_read>"
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

    def _extract_monobehaviour_fallback(self, obj, sequence_num):
        """Fallback method when MonoBehaviour read fails"""

    def _sanitize_filename(self, filename):
        """Clean filename, remove invalid characters"""
        # Remove or replace invalid filename characters
        invalid_chars = '<>:"/\\|?*'
        for char in invalid_chars:
            filename = filename.replace(char, '_')

        # Limit filename length
        if len(filename) > 255:
            name, ext = os.path.splitext(filename)
            filename = name[:255 - len(ext)] + ext

        return filename


def main():
    parser = argparse.ArgumentParser(description="Extract Unity game resources")
    parser.add_argument("input", help="Input file or folder path")
    parser.add_argument("-o", "--output", default="extracted_assets",
                        help="Output folder (default: extracted_assets)")

    args = parser.parse_args()

    # Check input path
    if not os.path.exists(args.input):
        print(f"Error: Input path not found {args.input}")
        return 1

    # Create extractor and execute
    extractor = UnityAssetExtractor(args.input, args.output)

    print("Starting Unity asset extraction...")
    success = extractor.extract_all_assets()

    if success:
        print("\nExtraction completed!")
        print(f"Assets saved to: {extractor.output_path}")
        return 0
    else:
        print("\nExtraction failed!")
        return 1


if __name__ == "__main__":
    # Installation reminder
    try:
        import UnityPy
        from PIL import Image
    except ImportError as e:
        print("Please install required packages:")
        print("pip install UnityPy Pillow")
        sys.exit(1)

    sys.exit(main())