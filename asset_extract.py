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
    try:
        img = data.image
        if img is None:
            return None, "data.image returned None (likely unsupported/compressed texture format on macOS)"
        return img, None
    except Exception as e:
        return None, str(e)


def save_raw_texture(data, filepath_no_ext):
    try:
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


# ---------------------------------------------------------------------------
# 3-D model helpers
# ---------------------------------------------------------------------------

def _mesh_name(obj) -> str:
    """
    Return a human-readable name for a Mesh object, trying (in order):
      1. data.m_Name
      2. basename of obj.container (strip extension)
      3. fallback: mesh_<path_id>
    """
    try:
        data = obj.read()
        m = str(getattr(data, 'm_Name', '') or '').strip()
        if m:
            return m
    except Exception:
        pass

    container = str(getattr(obj, 'container', '') or '')
    if container:
        base = os.path.splitext(os.path.basename(container))[0]
        if base:
            return base

    return f"mesh_{obj.path_id}"


def list_models(input_path: str):
    """Print all Mesh assets found in input_path."""
    env = UnityPy.load(input_path)
    meshes = []
    for obj in env.objects:
        obj_type = obj.type.name if hasattr(obj.type, 'name') else str(obj.type)
        if obj_type == "Mesh":
            name = _mesh_name(obj)
            container = str(getattr(obj, 'container', '') or '')
            meshes.append((obj.path_id, name, container))

    if not meshes:
        print("ℹ️  No Mesh assets found in this input.")
        return

    print(f"\n{'─'*70}")
    print(f"  {'path_id':<12}  {'name':<40}  container")
    print(f"{'─'*70}")
    for path_id, name, container in sorted(meshes, key=lambda x: x[1].lower()):
        print(f"  {path_id:<12}  {name:<40}  {container or '—'}")
    print(f"{'─'*70}")
    print(f"  {len(meshes)} mesh(es) total.\n")


def _read_mesh_typetree(obj) -> dict:
    """
    Read a Mesh object via read_typetree(), which gives us the fully-parsed
    dict Unity stores internally (vertices, normals, UVs, index buffer, etc.).
    Falls back to the older obj.read() path if typetree isn't available.
    Returns the raw dict on success, or raises on failure.
    """
    # Preferred: read_typetree() returns the full parsed structure as a dict
    if hasattr(obj, 'read_typetree'):
        try:
            return obj.read_typetree()
        except Exception:
            pass

    # Fallback: read() and convert to dict via __dict__
    data = obj.read()
    if hasattr(data, '__dict__'):
        return data.__dict__
    raise RuntimeError("Cannot read mesh data from this object")


def debug_mesh(input_path: str, pattern: str):
    """
    Print the raw typetree dict for the first mesh matching `pattern`.
    Useful for figuring out what attribute names Unity is actually using.
    """
    try:
        rx = re.compile(pattern)
    except re.error as e:
        print(f"❌ Invalid regex '{pattern}': {e}")
        return

    env = UnityPy.load(input_path)
    for obj in env.objects:
        obj_type = obj.type.name if hasattr(obj.type, 'name') else str(obj.type)
        if obj_type != "Mesh":
            continue
        name = _mesh_name(obj)
        if not rx.search(name):
            continue

        print(f"\n🔬 Debug dump for Mesh '{name}' (path_id={obj.path_id})\n")
        try:
            tree = _read_mesh_typetree(obj)
            # Print keys and a short preview of each value
            for k, v in tree.items():
                if isinstance(v, (list, bytes, bytearray)):
                    length = len(v)
                    preview = f"[list/bytes, len={length}]"
                    if length > 0 and isinstance(v, list):
                        preview += f"  first item: {repr(v[0])}"
                elif isinstance(v, dict):
                    preview = f"{{dict, keys={list(v.keys())[:6]}}}"
                else:
                    preview = repr(v)
                    if len(preview) > 120:
                        preview = preview[:120] + "…"
                print(f"  {k}: {preview}")
        except Exception as e:
            print(f"❌ Failed to read typetree: {e}")
            print("\nFalling back to dir() on read() object:")
            try:
                data = obj.read()
                for attr in sorted(dir(data)):
                    if attr.startswith('_'):
                        continue
                    try:
                        val = getattr(data, attr)
                        if callable(val):
                            continue
                        s = repr(val)
                        if len(s) > 100:
                            s = s[:100] + "…"
                        print(f"  {attr}: {s}")
                    except Exception as ae:
                        print(f"  {attr}: <error: {ae}>")
            except Exception as e2:
                print(f"❌ read() also failed: {e2}")
        return  # only dump the first match

    print(f"ℹ️  No mesh matched pattern '{pattern}'.")


def _extract_floats_from_vertex_data(vd: dict, channel_idx: int, vertex_count: int) -> list[float]:
    """
    Unpack a single vertex channel (position=0, normal=1, uv0=4, uv1=5, etc.)
    from Unity's packed VertexData structure.

    Unity packs all vertex attributes into one or more byte streams.
    Each channel descriptor says which stream it's in, its byte offset
    within a vertex, its format, and its dimension.
    """
    import struct

    channels = vd.get('m_Channels', [])
    streams  = vd.get('m_DataSize', None)  # raw bytes in older format
    data_bytes = vd.get('_typelessdata', None) or vd.get('m_Data', None)

    if channel_idx >= len(channels):
        return []

    ch = channels[channel_idx]
    # Channel fields vary slightly by Unity version:
    stream    = ch.get('stream',    ch.get('m_Stream',    0))
    offset    = ch.get('offset',    ch.get('m_Offset',    0))
    fmt       = ch.get('format',    ch.get('m_Format',    0))
    dimension = ch.get('dimension', ch.get('m_Dimension', 0))
    dimension = dimension & 0x0F  # lower nibble is actual dimension

    if dimension == 0:
        return []  # channel not present

    # Format → struct fmt char + byte width
    # Unity vertex format enum: 0=float32, 1=float16, 2=unorm8, 3=snorm8,
    #                            4=unorm16, 5=snorm16, 8=uint8, 9=sint8,
    #                           10=uint16, 11=sint16
    FMT_MAP = {
        0: ('f', 4),   # Float32
        1: ('e', 2),   # Float16
        2: ('B', 1),   # UNorm8
        3: ('b', 1),   # SNorm8
        4: ('H', 2),   # UNorm16
        5: ('h', 2),   # SNorm16
        8: ('B', 1),   # UInt8
        9: ('b', 1),   # SInt8
        10: ('H', 2),  # UInt16
        11: ('h', 2),  # SInt16
    }
    fmt_char, fmt_size = FMT_MAP.get(fmt, ('f', 4))

    # Locate the right stream's raw bytes
    if isinstance(data_bytes, (bytes, bytearray)):
        raw = bytes(data_bytes)
    elif isinstance(data_bytes, list):
        raw = bytes(data_bytes)
    else:
        return []

    # Compute stride: sum of sizes of all channels in the same stream
    stride = 0
    for c in channels:
        c_stream = c.get('stream', c.get('m_Stream', 0))
        c_fmt    = c.get('format', c.get('m_Format', 0))
        c_dim    = c.get('dimension', c.get('m_Dimension', 0)) & 0x0F
        if c_stream == stream and c_dim > 0:
            _, csz = FMT_MAP.get(c_fmt, ('f', 4))
            stride += csz * c_dim

    if stride == 0:
        stride = fmt_size * dimension

    # Find the byte offset of this stream's data within the combined buffer.
    # Unity lays out streams contiguously; compute the start of our stream.
    stream_start = 0
    for s_idx in range(stream):
        for c in channels:
            c_stream = c.get('stream', c.get('m_Stream', 0))
            c_fmt    = c.get('format', c.get('m_Format', 0))
            c_dim    = c.get('dimension', c.get('m_Dimension', 0)) & 0x0F
            if c_stream == s_idx and c_dim > 0:
                _, csz = FMT_MAP.get(c_fmt, ('f', 4))
                stream_start += vertex_count * csz * c_dim

    result = []
    scale = 1.0
    if fmt in (2,):  scale = 1.0 / 255.0   # UNorm8
    if fmt in (3,):  scale = 1.0 / 127.0   # SNorm8
    if fmt in (4,):  scale = 1.0 / 65535.0 # UNorm16
    if fmt in (5,):  scale = 1.0 / 32767.0 # SNorm16

    for vi in range(vertex_count):
        base = stream_start + vi * stride + offset
        for di in range(dimension):
            byte_pos = base + di * fmt_size
            if byte_pos + fmt_size > len(raw):
                result.append(0.0)
                continue
            (val,) = struct.unpack_from(fmt_char, raw, byte_pos)
            result.append(float(val) * scale if fmt not in (0, 1) else float(val))

    return result


def _unpack_packed_bit_vector(pbv: dict) -> list[float]:
    """
    Decompress a Unity PackedBitVector<float> back to a flat list of floats.

    Unity stores: m_NumItems, m_Range, m_Start, m_BitSize, m_Data (bytes).
    Each item is stored as a `m_BitSize`-bit unsigned integer packed
    consecutively into m_Data (LSB-first within each byte). The float value
    is reconstructed as:  start + (packed_int / max_int) * range
    """
    num_items = pbv.get('m_NumItems', 0)
    if num_items == 0:
        return []

    range_val = pbv.get('m_Range', 1.0)
    start     = pbv.get('m_Start', 0.0)
    bit_size  = pbv.get('m_BitSize', 0)
    raw       = pbv.get('m_Data', [])

    if bit_size == 0 or not raw:
        return []

    if isinstance(raw, list):
        raw = bytes(raw)

    max_int = (1 << bit_size) - 1
    result  = []
    bit_pos = 0

    for _ in range(num_items):
        # Read `bit_size` bits starting at `bit_pos` (LSB-first)
        val = 0
        for b in range(bit_size):
            byte_idx = (bit_pos + b) >> 3
            bit_idx  = (bit_pos + b) & 7
            if byte_idx < len(raw):
                val |= ((raw[byte_idx] >> bit_idx) & 1) << b
        bit_pos += bit_size

        if max_int > 0:
            result.append(start + (val / max_int) * range_val)
        else:
            result.append(start)

    return result


def _unpack_packed_int_vector(pbv: dict) -> list[int]:
    """
    Decompress a Unity PackedBitVector<int> (used for triangle indices,
    bone weights, etc.).  Same bit-packing as floats but no float conversion.
    """
    num_items = pbv.get('m_NumItems', 0)
    if num_items == 0:
        return []

    bit_size = pbv.get('m_BitSize', 0)
    raw      = pbv.get('m_Data', [])

    if bit_size == 0 or not raw:
        return []

    if isinstance(raw, list):
        raw = bytes(raw)

    result  = []
    bit_pos = 0

    for _ in range(num_items):
        val = 0
        for b in range(bit_size):
            byte_idx = (bit_pos + b) >> 3
            bit_idx  = (bit_pos + b) & 7
            if byte_idx < len(raw):
                val |= ((raw[byte_idx] >> bit_idx) & 1) << b
        bit_pos += bit_size
        result.append(val)

    return result


def _decompress_mesh(cm: dict) -> tuple[list, list, list, list]:
    """
    Decompress a Unity CompressedMesh dict into
    (vertices, normals, uv0, indices) as flat float/int lists.

    CompressedMesh layout:
      m_Vertices  : PackedBitVector<float>  — x,y,z interleaved, len = vcount*3
      m_UV        : PackedBitVector<float>  — u,v interleaved (all UV sets)
      m_Normals   : PackedBitVector<float>  — packed as 2 components + sign
      m_NormalSigns: PackedBitVector<float> — sign bit for reconstructing z
      m_Tangents  : PackedBitVector<float>  — 2 components per tangent
      m_Triangles : PackedBitVector<int>    — triangle index list
      m_UVInfo    : int bitmask             — which UV sets are present & their dimensions
    """
    vertices = _unpack_packed_bit_vector(cm.get('m_Vertices', {}))
    uv_raw   = _unpack_packed_bit_vector(cm.get('m_UV',       {}))
    tri_raw  = _unpack_packed_int_vector(cm.get('m_Triangles', cm.get('m_Indices', {})))

    # Normals: Unity stores 2 components (x, y) plus a sign for z.
    # z = sign * sqrt(max(0, 1 - x² - y²))
    norm_raw   = _unpack_packed_bit_vector(cm.get('m_Normals',    {}))
    sign_raw   = _unpack_packed_bit_vector(cm.get('m_NormalSigns', {}))

    normals = []
    if len(norm_raw) >= 2:
        for i in range(0, len(norm_raw) - 1, 2):
            nx, ny = norm_raw[i], norm_raw[i + 1]
            z2 = max(0.0, 1.0 - nx * nx - ny * ny)
            nz = (z2 ** 0.5)
            sign_idx = i // 2
            if sign_idx < len(sign_raw) and sign_raw[sign_idx] < 0.5:
                nz = -nz
            normals.extend([nx, ny, nz])

    # UV: m_UVInfo encodes how many UV sets and their channel counts.
    # Bit layout per channel (4 bits each, starting from LSB):
    #   bits 0-1 = dimension-1 (0→1D, 1→2D, 2→3D, 3→4D)
    #   bit  2   = present flag
    #   bit  3   = unused
    # Channels 0..7 use bits 0..31 (4 bits each).
    # For most game meshes channel 0 is UV0 with 2 components.
    uv_info = cm.get('m_UVInfo', 0)
    uv0 = []
    offset = 0
    for ch in range(8):
        nibble = (uv_info >> (ch * 4)) & 0xF
        present   = bool(nibble & 0x4)
        dimension = (nibble & 0x3) + 1
        if not present:
            continue
        ch_values = uv_raw[offset: offset + (cm.get('m_Vertices', {}).get('m_NumItems', len(vertices) // 3) * dimension)]
        if ch == 0:
            uv0 = ch_values
        offset += len(ch_values)
        if offset >= len(uv_raw):
            break

    # Fallback: if uv_info is 0 or uv0 still empty, assume first half is UV0
    if not uv0 and uv_raw:
        # Simple heuristic: uv_raw is len = vcount * num_uv_sets * 2
        vcount = len(vertices) // 3
        if vcount > 0 and len(uv_raw) >= vcount * 2:
            uv0 = uv_raw[:vcount * 2]

    return vertices, normals, uv0, tri_raw


def _mesh_to_obj(obj, name: str) -> tuple[str, int, int]:
    """
    Convert a UnityPy Mesh object to an OBJ-format string.
    Returns (obj_text, vertex_count, triangle_count).

    Strategy priority:
      1. CompressedMesh (m_MeshCompression > 0) — decompress via PackedBitVector
      2. VertexData with m_Channels — unpack interleaved streams
      3. Flat m_Vertices / m_UV0 lists in typetree
      4. Legacy obj.read() attributes
    """
    import struct

    lines = [f"# Exported by extract.py", f"o {name}", ""]

    tree = None
    if hasattr(obj, 'read_typetree'):
        try:
            tree = obj.read_typetree()
        except Exception:
            pass

    # ── Pull raw data from whichever source we have ──────────────────────────

    vertices = []
    normals  = []
    uv0      = []
    uv1      = []
    indices  = []
    submeshes = []
    vertex_count = 0

    if tree is not None:
        compression = tree.get('m_MeshCompression', 0)
        submeshes   = tree.get('m_SubMeshes', []) or []

        if compression > 0:
            # ── Strategy 1: CompressedMesh ───────────────────────────────────
            cm = tree.get('m_CompressedMesh', {})
            vertices, normals, uv0, indices = _decompress_mesh(cm)
            vertex_count = len(vertices) // 3

        else:
            vertex_count = tree.get('m_VertexCount', 0)
            vd = tree.get('m_VertexData', {})
            channels = vd.get('m_Channels', []) if isinstance(vd, dict) else []

            if channels and vertex_count > 0:
                # ── Strategy 2: VertexData channel unpacking ─────────────────
                vertices = _extract_floats_from_vertex_data(vd, 0, vertex_count)
                normals  = _extract_floats_from_vertex_data(vd, 1, vertex_count)
                uv0      = _extract_floats_from_vertex_data(vd, 4, vertex_count)
                uv1      = _extract_floats_from_vertex_data(vd, 5, vertex_count)
            else:
                # ── Strategy 3: flat lists ────────────────────────────────────
                vertices = tree.get('m_Vertices', []) or []
                normals  = tree.get('m_Normals',  []) or []
                uv0      = tree.get('m_UV0',      []) or []
                uv1      = tree.get('m_UV1',      []) or []

            # Index buffer for uncompressed meshes
            raw_idx = tree.get('m_IndexBuffer', []) or []
            idx_fmt_val = tree.get('m_IndexFormat', 0)
            if isinstance(raw_idx, (bytes, bytearray)):
                b = bytes(raw_idx)
                fmt_str = f'<{len(b)//4}I' if idx_fmt_val == 1 else f'<{len(b)//2}H'
                indices = list(struct.unpack_from(fmt_str, b))
            elif isinstance(raw_idx, list) and raw_idx:
                if isinstance(raw_idx[0], int):
                    indices = raw_idx
                else:
                    try:
                        b = bytes(raw_idx)
                        fmt_str = f'<{len(b)//4}I' if idx_fmt_val == 1 else f'<{len(b)//2}H'
                        indices = list(struct.unpack_from(fmt_str, b))
                    except Exception:
                        indices = []

    else:
        # ── Strategy 4: legacy obj.read() ────────────────────────────────────
        data = obj.read()
        vertices  = list(getattr(data, 'm_Vertices', []) or [])
        normals   = list(getattr(data, 'm_Normals',  []) or [])
        uv0       = list(getattr(data, 'm_UV0',      []) or [])
        uv1       = list(getattr(data, 'm_UV1',      []) or [])
        indices   = list(getattr(data, 'm_IndexBuffer', []) or [])
        submeshes = list(getattr(data, 'm_SubMeshes',   []) or [])
        vertex_count = len(vertices) // 3

    # ── Write OBJ ────────────────────────────────────────────────────────────

    if not vertices:
        raise RuntimeError(
            f"No vertex data found (vertex_count={vertex_count}, "
            f"verts_list_len={len(vertices)}, indices_len={len(indices)}). "
            f"Try --debug-mesh to inspect the raw structure."
        )

    for i in range(0, len(vertices) - 2, 3):
        lines.append(f"v {vertices[i]:.6f} {vertices[i+1]:.6f} {vertices[i+2]:.6f}")
    lines.append("")

    for i in range(0, len(uv0) - 1, 2):
        lines.append(f"vt {uv0[i]:.6f} {uv0[i+1]:.6f}")
    if uv1:
        lines.append("# UV channel 1 (lightmap / secondary):")
        for i in range(0, len(uv1) - 1, 2):
            lines.append(f"# vt1 {uv1[i]:.6f} {uv1[i+1]:.6f}")
    if uv0:
        lines.append("")

    for i in range(0, len(normals) - 2, 3):
        lines.append(f"vn {normals[i]:.6f} {normals[i+1]:.6f} {normals[i+2]:.6f}")
    if normals:
        lines.append("")

    has_uv = bool(uv0)
    has_vn = bool(normals)

    def face_vertex(idx):
        v = idx + 1  # OBJ is 1-indexed
        if has_uv and has_vn:
            return f"{v}/{v}/{v}"
        elif has_uv:
            return f"{v}/{v}"
        elif has_vn:
            return f"{v}//{v}"
        else:
            return str(v)

    if submeshes:
        for si, sm in enumerate(submeshes):
            if isinstance(sm, dict):
                first = sm.get('firstByte', sm.get('firstIndex', 0))
                count = sm.get('indexCount', 0)
                # firstByte is a byte offset for older Unity versions
                if 'firstByte' in sm and 'firstIndex' not in sm:
                    idx_fmt_val = tree.get('m_IndexFormat', 0) if tree else 0
                    first = first // (4 if idx_fmt_val == 1 else 2)
            else:
                first = getattr(sm, 'firstByte', None)
                count = getattr(sm, 'indexCount', 0)
                if first is None:
                    first = getattr(sm, 'firstIndex', 0)
                else:
                    first = first // 2
            lines.append(f"g submesh_{si}")
            tri_indices = indices[first: first + count]
            for j in range(0, len(tri_indices) - 2, 3):
                a, b, c = tri_indices[j], tri_indices[j+1], tri_indices[j+2]
                lines.append(f"f {face_vertex(a)} {face_vertex(b)} {face_vertex(c)}")
    else:
        lines.append("g default")
        for j in range(0, len(indices) - 2, 3):
            a, b, c = indices[j], indices[j+1], indices[j+2]
            lines.append(f"f {face_vertex(a)} {face_vertex(b)} {face_vertex(c)}")

    tri_count = len(indices) // 3
    return "\n".join(lines), vertex_count, tri_count


def extract_models_by_regex(input_path: str, pattern: str, output_path: Path):
    """Extract all Mesh assets whose name matches `pattern` (PCRE)."""
    try:
        rx = re.compile(pattern)
    except re.error as e:
        print(f"❌ Invalid regex '{pattern}': {e}")
        return

    mesh_dir = output_path / "meshes"
    mesh_dir.mkdir(exist_ok=True)

    env = UnityPy.load(input_path)
    matched = exported = 0

    for obj in env.objects:
        obj_type = obj.type.name if hasattr(obj.type, 'name') else str(obj.type)
        if obj_type != "Mesh":
            continue

        name = _mesh_name(obj)
        if not rx.search(name):
            continue

        matched += 1
        print(f"\n🧊 Mesh [{name}] (path_id={obj.path_id})")

        try:
            obj_text, vcount, tcount = _mesh_to_obj(obj, name)
            safe_name = _sanitize_filename(name) + ".obj"
            out_file = mesh_dir / safe_name
            out_file.write_text(obj_text, encoding='utf-8')
            print(f"   ✅ Saved: {safe_name}  ({vcount} verts, {tcount} tris)")
            exported += 1
        except Exception as e:
            print(f"   ❌ Failed to export: {e}")
            print(f"      Tip: run --debug-mesh '{name}' to inspect the raw structure.")

    print(f"\n{'='*60}")
    if matched == 0:
        print(f"ℹ️  No meshes matched pattern '{pattern}'.")
    else:
        print(f"Mesh export complete: {exported}/{matched} exported → {mesh_dir}")


# ---------------------------------------------------------------------------
# Camera / config scanning helpers
# ---------------------------------------------------------------------------

CAMERA_MANAGER_TYPES = {
    "Camera",
    "GraphicsSettings",
    "QualitySettings",
    "RenderSettings",
    "LightmapSettings",
}

CAMERA_FIELD_KEYWORDS = {
    "camera", "orthographic", "orthosize", "zoom", "projection",
    "fov", "fieldofview", "nearclip", "farclip", "viewport",
    "hex", "hexsize", "hexradius", "cellsize", "tilesize",
    "gridsize", "boardsize", "mapsize", "tilt", "pitch", "yaw",
    "cameraheight", "cameradistance", "cameraangle",
}


def _flatten_keys(obj, prefix=""):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from _flatten_keys(v, f"{prefix}.{k}" if prefix else k)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from _flatten_keys(v, f"{prefix}[{i}]")
    else:
        yield prefix, obj


def _has_camera_fields(serialized: dict) -> list:
    hits = []
    for key, val in _flatten_keys(serialized):
        key_lower = key.lower().replace("_", "").replace(".", "")
        if any(kw in key_lower for kw in CAMERA_FIELD_KEYWORDS):
            hits.append((key, val))
    return hits


def scan_for_camera_config(input_path: str, output_path: Path):
    out_dir = output_path / "camera_scan"
    out_dir.mkdir(exist_ok=True)

    print(f"\n🔍 Camera/config scan: {input_path}")

    try:
        env = UnityPy.load(input_path)
    except Exception as e:
        print(f"  ❌ Could not load: {e}")
        return

    found_any = False

    for obj in env.objects:
        obj_type = obj.type.name if hasattr(obj, 'type') and hasattr(obj.type, 'name') else str(obj.type)

        if obj_type in CAMERA_MANAGER_TYPES:
            try:
                data = obj.read()
                serialized = _serialize_unknown_simple(data)
                name = getattr(data, 'm_Name', None) or obj_type
                filename = f"{obj_type}_{obj.path_id}.json"
                out_file = out_dir / filename
                with open(out_file, 'w', encoding='utf-8') as f:
                    json.dump({"_type": obj_type, "_path_id": obj.path_id,
                               "_source": str(input_path), **serialized},
                              f, indent=2, ensure_ascii=False, default=str)
                print(f"  ✅ {obj_type} (path_id={obj.path_id}) → {filename}")
                found_any = True
            except Exception as e:
                print(f"  ⚠️  Could not read {obj_type} (path_id={obj.path_id}): {e}")

        elif obj_type == "MonoBehaviour":
            try:
                data = obj.read()
                serialized = _serialize_unknown_simple(data)
                hits = _has_camera_fields(serialized)
                if hits:
                    name = str(getattr(data, 'm_Name', None) or obj.path_id)
                    filename = _sanitize_filename(f"mb_{name}_{obj.path_id}.json")
                    out_file = out_dir / filename
                    with open(out_file, 'w', encoding='utf-8') as f:
                        json.dump({"_type": "MonoBehaviour", "_path_id": obj.path_id,
                                   "_source": str(input_path),
                                   "_matched_fields": [{"key": k, "value": v} for k, v in hits],
                                   **serialized},
                                  f, indent=2, ensure_ascii=False, default=str)
                    hit_summary = ", ".join(k for k, _ in hits[:5])
                    print(f"  🎯 MonoBehaviour '{name}' matched fields: {hit_summary}")
                    if len(hits) > 5:
                        print(f"      ... and {len(hits) - 5} more")
                    found_any = True
            except Exception:
                pass

    if not found_any:
        print(f"  ℹ️  No camera/config objects found in this file.")


def scan_camera_in_dir(data_dir: str, output_path: Path):
    data_path = Path(data_dir)

    if data_path.is_file():
        all_files = [data_path]
    else:
        has_ggm = (data_path / "globalgamemanagers").exists()

        core_files = []
        if has_ggm:
            core_files = [
                data_path / "globalgamemanagers",
                data_path / "globalgamemanagers.assets",
            ]
            for p in sorted(data_path.glob("level*")):
                if p.is_file() and not p.suffix:
                    core_files.append(p)
            core_files = [f for f in core_files if f.exists()]
            bundles_root = data_path / "StreamingAssets" / "Bundles"
        else:
            bundles_root = data_path

        SKIP_SUFFIXES = {'.resS', '.json', '.meta', '.bnk', '.plist', '.nib',
                         '.dylib', '.bundle', '.dat', '.dll'}
        bundle_files = []
        if bundles_root.exists():
            for p in sorted(bundles_root.rglob("*")):
                if p.is_file() and p.suffix not in SKIP_SUFFIXES:
                    bundle_files.append(p)

        all_files = core_files + bundle_files

    if not all_files:
        print(f"⚠️  No scannable Unity files found under: {data_dir}")
        return

    print(f"\n📂 Scanning {len(all_files)} file(s) for camera/config data...")
    print(f"   Output → {output_path / 'camera_scan'}\n")

    for f in all_files:
        scan_for_camera_config(str(f), output_path)

    out_dir = output_path / "camera_scan"
    results = list(out_dir.glob("*.json"))
    print(f"\n{'='*60}")
    print(f"Camera scan complete. {len(results)} result file(s) in: {out_dir}")
    if results:
        print("\nFiles found:")
        for r in sorted(results):
            print(f"  📄 {r.name}")


# ---------------------------------------------------------------------------
# Lightweight serializer
# ---------------------------------------------------------------------------

_SKIP_TYPES_SIMPLE = frozenset({
    "SerializedFile", "ObjectReader", "BundleFile",
    "AssetsFile", "Environment", "SerializedFileHeader",
})
_SKIP_ATTRS_SIMPLE = frozenset({
    "assets_file", "object_reader", "reader", "assetsfile",
    "m_GameObject", "m_Script",
})


def _serialize_unknown_simple(obj, depth=0):
    if depth > 20:
        return "<max depth>"
    if obj is None or isinstance(obj, (bool, int, float, str)):
        return obj
    cls = type(obj).__name__
    if cls in _SKIP_TYPES_SIMPLE:
        return f"<{cls}>"
    if isinstance(obj, (list, tuple)):
        return [_serialize_unknown_simple(i, depth + 1) for i in obj]
    if isinstance(obj, dict):
        return {k: _serialize_unknown_simple(v, depth + 1) for k, v in obj.items()}
    if hasattr(obj, '__dict__') or hasattr(obj, '__slots__'):
        result = {}
        attrs = list(obj.__dict__.keys()) if hasattr(obj, '__dict__') else dir(obj)
        for attr in attrs:
            if attr.startswith('_') or attr in _SKIP_ATTRS_SIMPLE:
                continue
            try:
                val = getattr(obj, attr)
                if callable(val):
                    continue
                result[attr] = _serialize_unknown_simple(val, depth + 1)
            except Exception as e:
                result[attr] = f"<error: {e}>"
        return result
    return str(obj)


def _sanitize_filename(filename):
    for char in '<>:"/\\|?*':
        filename = filename.replace(char, '_')
    return filename[:255]


# ---------------------------------------------------------------------------
# Main extractor class
# ---------------------------------------------------------------------------

class UnityAssetExtractor:
    def __init__(self, input_path, output_path="extracted_assets"):
        self.input_path = input_path
        self.output_path = Path(output_path)
        self.output_path.mkdir(exist_ok=True)
        self.visuals = dict()
        self.decode_failures = []
        self.board_ids_from_config = set()
        self.boards_extracted = set()

        self.texture2d_path = self.output_path / "texture2d"
        self.sprite_path = self.output_path / "sprites"
        self.text_path = self.output_path / "text_assets"
        self.monobehaviour_path = self.output_path / "monobehaviour"
        self.raw_path = self.output_path / "raw_textures"

        for path in [self.texture2d_path, self.sprite_path, self.text_path,
                     self.monobehaviour_path, self.raw_path]:
            path.mkdir(exist_ok=True)

    def unpack_sprite_atlas(self, atlas_data):
        for sprite_name, sprite_data in zip(
                atlas_data.m_PackedSpriteNamesToIndex, atlas_data.m_PackedSprites):
            sprite = sprite_data.read()
            img, err = try_get_image(sprite, sprite_name)
            if img:
                filename = _sanitize_filename(f"{sprite_name}.png")
                filepath = self.sprite_path / filename
                img.save(filepath)
                print(f"✅ SpriteAtlas sprite: {filename}")
            else:
                print(f"    ❌ SpriteAtlas sprite decode failed [{sprite_name}]: {err}")
                save_raw_texture(sprite, self.raw_path / _sanitize_filename(sprite_name))
                self.decode_failures.append(('SpriteAtlas', sprite_name, err))

    def search_by_name(self, query: str, extract: bool = False):
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

                if obj_type in ("Texture2D", "Sprite"):
                    img, err = try_get_image(data)
                    if img:
                        print(f"\n✅ Image decoded OK: {img.size} {img.mode}")
                        if extract:
                            name = getattr(data, 'm_Name', None) or getattr(data, 'name', None) or str(obj.path_id)
                            out_dir = self.texture2d_path if obj_type == "Texture2D" else self.sprite_path
                            filename = _sanitize_filename(f"{name}.png")
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
        print(f"\n{'='*60}")

    def extract_all_assets(self, only: set = None):
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
            TARGET_TYPES.add("MonoBehaviour")
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

            print("\n=== Object Type Statistics ===")
            for obj_type, count in sorted(type_stats.items()):
                marker = " ✓" if obj_type in TARGET_TYPES else ""
                print(f"{obj_type}: {count}{marker}")

            if self.decode_failures:
                print(f"\n⚠️  === Texture Decode Failures ({len(self.decode_failures)}) ===")
                failure_msgs = set(f[2] for f in self.decode_failures)
                for msg in failure_msgs:
                    print(f"  • {msg}")
                print(f"\nFailed assets:")
                for asset_type, name, err in self.decode_failures[:20]:
                    print(f"  [{asset_type}] {name}")
                if len(self.decode_failures) > 20:
                    print(f"  ... and {len(self.decode_failures) - 20} more")

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
        try:
            name = self._get_asset_name(data, obj, "Texture2D", sequence_num)
            fmt = getattr(data, 'm_TextureFormat', 'unknown')
            print(f"\n🖼️  Texture2D [{name}] format={fmt}")

            img, err = try_get_image(data, name)
            if img:
                filename = _sanitize_filename(f"{name}.png")
                filepath = self.texture2d_path / filename
                img.save(filepath)
                print(f"✅ Extracted Texture2D: {filename}")
            else:
                print(f"❌ Decode failed: {err}")
                raw_path = save_raw_texture(data, self.raw_path / _sanitize_filename(name))
                if raw_path:
                    print(f"   💾 Raw data saved: {raw_path.name}")
                self.decode_failures.append(('Texture2D', name, err))

        except Exception as e:
            print(f"❌ Failed to extract Texture2D: {e}")

    def _extract_sprite(self, data, obj, sequence_num):
        try:
            name = self._get_asset_name(data, obj, "Sprite", sequence_num)
            print(f"\n🎨 Sprite [{name}]")

            img, err = try_get_image(data, name)
            if img:
                filename = _sanitize_filename(f"{name}.png")
                filepath = self.sprite_path / filename
                img.save(filepath)
                print(f"✅ Extracted Sprite: {filename}")
            else:
                print(f"❌ Sprite decode failed: {err}")
                try:
                    tex = data.m_RD.texture.read()
                    tex_fmt = getattr(tex, 'm_TextureFormat', 'unknown')
                    print(f"   Source Texture2D format: {tex_fmt}")
                    tex_img, tex_err = try_get_image(tex, name)
                    if tex_img:
                        try:
                            rd = data.m_RD
                            rect = rd.textureRect
                            tex_h = tex.m_Height
                            x = int(rect.x)
                            y = int(tex_h - rect.y - rect.height)
                            w = int(rect.width)
                            h = int(rect.height)
                            cropped = tex_img.crop((x, y, x + w, y + h))
                            filename = _sanitize_filename(f"{name}.png")
                            cropped.save(self.sprite_path / filename)
                            print(f"✅ Extracted Sprite (via Texture2D crop): {filename}")
                            return
                        except Exception as crop_e:
                            print(f"   Crop failed ({crop_e}), saving full texture instead")
                            filename = _sanitize_filename(f"{name}_fulltex.png")
                            tex_img.save(self.sprite_path / filename)
                            print(f"✅ Saved full source texture: {filename}")
                            return
                    else:
                        print(f"   Source texture also failed: {tex_err}")
                        raw_path = save_raw_texture(tex, self.raw_path / _sanitize_filename(name))
                        if raw_path:
                            print(f"   💾 Raw texture saved: {raw_path.name}")
                        self.decode_failures.append(('Sprite', name, tex_err))
                except Exception as tex_e:
                    print(f"   Could not access source texture: {tex_e}")
                    self.decode_failures.append(('Sprite', name, err))

        except Exception as e:
            print(f"❌ Failed to extract Sprite: {e}")

    def _extract_text_asset(self, data, obj, sequence_num):
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
                filename = _sanitize_filename(name)
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

                if filename.lower().startswith('gameconfig'):
                    self._collect_board_ids_from_gameconfig(text_content, filename)
            else:
                print(f"❌ TextAsset has no text content (ID: {obj.path_id})")

        except Exception as e:
            print(f"❌ Failed to extract TextAsset: {e}")

    BOARD_ID_RE = re.compile(r'^[A-Za-z][A-Za-z0-9]*(_[A-Za-z0-9]+)+$')

    def _is_board_monobehaviour(self, data, obj) -> bool:
        container = (getattr(obj, 'container', '') or '').lower()
        if 'boards/' in container or 'board/' in container:
            return True
        name = str(getattr(data, 'm_Name', '') or '').strip()
        if self.BOARD_ID_RE.match(name):
            return True
        return False

    def _collect_board_ids_from_gameconfig(self, text: str, source_name: str):
        found = re.findall(r'"boardId"\s*:\s*"([^"]+)"', text)
        if found:
            new_ids = set(found) - self.board_ids_from_config
            self.board_ids_from_config.update(found)
            print(f"  📋 Collected {len(found)} boardId references "
                  f"({len(new_ids)} new) from {source_name}")

    def _resolve_sprite_pptr(self, data, attr_name: str):
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
            obj_map = getattr(assets_file, 'objects', None)
            if obj_map and path_id in obj_map:
                sobj = obj_map[path_id]
                sdata = sobj.read()
                name = str(getattr(sdata, 'm_Name', '') or getattr(sdata, 'name', '') or '').strip()
                return (name or None), attr_name
        except Exception:
            pass
        return None, None

    def _extract_monobehaviour(self, env, data, obj, sequence_num):
        try:
            name = self._get_asset_name(data, obj, "MonoBehaviour", sequence_num)
            m_name = str(getattr(data, 'm_Name', '') or '')

            if m_name.lower().endswith("_visual"):
                unit_id = str(getattr(data, 'unitId', '') or '').strip()
                asset_naming = str(getattr(data, 'assetNaming', '') or '').strip()
                key = (unit_id + "_visual") if unit_id else m_name

                sprite_name, resolved_from = self._resolve_sprite_pptr(data, 'Sprite')
                if not sprite_name:
                    sprite_name, resolved_from = self._resolve_sprite_pptr(data, 'RoundPortrait')
                if sprite_name and sprite_name.startswith("ui_image_portrait_"):
                    sprite_name = sprite_name[len("ui_image_portrait_"):]
                if sprite_name and sprite_name.startswith("ui_image_RoundPortrait_"):
                    sprite_name = sprite_name[len("ui_image_RoundPortrait_"):]

                visual_value = sprite_name if sprite_name else asset_naming
                if visual_value:
                    self.visuals[key] = visual_value
                    src = f"resolved from {resolved_from}" if sprite_name else "assetNaming"
                    print(f"  👁️  {key} → {visual_value} ({src})")

                serialized = self._serialize_unknown(data)
                serialized['_resolved_sprite_name'] = visual_value or None
                serialized['_resolved_sprite_from'] = resolved_from or ('assetNaming' if asset_naming else None)
                filename = _sanitize_filename(f"{m_name}.json")
                filepath = self.monobehaviour_path / filename
                with open(filepath, 'w', encoding='utf-8') as f:
                    json.dump(serialized, f, indent=2, ensure_ascii=False, default=str)
                return

            if not self._is_board_monobehaviour(data, obj):
                return

            serialized = self._serialize_unknown(data)
            filename = _sanitize_filename(f"{name}.json")
            filepath = self.monobehaviour_path / filename
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(serialized, f, indent=2, ensure_ascii=False, default=str)

            self.boards_extracted.add(name.upper())
            print(f"✅ Board config: {filename}")

        except Exception as e:
            print(f"❌ Failed to extract MonoBehaviour (ID: {obj.path_id}): {e}")

    SKIP_TYPES = (
        "SerializedFile", "ObjectReader", "BundleFile",
        "AssetsFile", "Environment", "SerializedFileHeader",
    )
    SKIP_ATTRS = {
        "assets_file", "object_reader", "reader", "assetsfile",
        "m_GameObject", "m_Script",
    }

    def _serialize_unknown(self, obj, depth=0, _seen=None):
        if _seen is None:
            _seen = set()
        if depth > 30:
            return "<max depth>"
        if obj is None or isinstance(obj, (bool, int, float, str)):
            return obj
        try:
            obj_id = id(obj)
            if obj_id in _seen:
                return "<circular ref>"
            _seen.add(obj_id)
        except Exception:
            pass
        cls_name = type(obj).__name__
        if cls_name in self.SKIP_TYPES:
            return f"<{cls_name}>"
        if isinstance(obj, (list, tuple)):
            return [self._serialize_unknown(item, depth + 1, _seen) for item in obj]
        if isinstance(obj, dict):
            return {k: self._serialize_unknown(v, depth + 1, _seen) for k, v in obj.items()}
        if hasattr(obj, '__dict__') or hasattr(obj, '__slots__'):
            result = {}
            try:
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
        return str(obj)

    def dump_to_json(self, path_ids: list[int]):
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
                filename = _sanitize_filename(f"{name}.json")
                filepath = self.monobehaviour_path / filename
                with open(filepath, 'w', encoding='utf-8') as f:
                    json.dump(serialized, f, indent=2, ensure_ascii=False, default=str)
                print(f"✅ Saved: {filepath}")

            except Exception as e:
                print(f"❌ Failed to dump path_id={obj.path_id}: {e}")

        missing = targets - found
        if missing:
            print(f"⚠️  IDs not found in this bundle: {missing}")


def main():
    check_texture_decoder()

    parser = argparse.ArgumentParser(description="Extract Unity game resources")
    parser.add_argument("input", help="Input file or folder path")
    parser.add_argument("-o", "--output", default="extracted_assets",
                        help="Output folder (default: extracted_assets)")
    parser.add_argument("--find-name", metavar="QUERY",
                        help="Search for assets whose name or container path contains QUERY")
    parser.add_argument("--extract-found", action="store_true",
                        help="When used with --find-name, also extract any image assets found")
    parser.add_argument("--find-id", nargs="+", type=int, metavar="PATH_ID",
                        help="Inspect specific asset(s) by path_id")
    parser.add_argument("--dump-id", nargs="+", type=int, metavar="PATH_ID",
                        help="Fully serialize asset(s) by path_id to JSON")
    parser.add_argument("--only", nargs="+", metavar="TYPE",
                        help="Restrict extraction to: boards, sprites, textures, text, monobehaviour")

    # ── 3D model flags ───────────────────────────────────────────────────────
    parser.add_argument(
        "--list-models",
        action="store_true",
        help=(
            "List all Mesh assets in the input file without extracting anything. "
            "Shows path_id, name, and container path for each mesh."
        ),
    )
    parser.add_argument(
        "--model-regex",
        metavar="PATTERN",
        help=(
            "Extract Mesh assets whose name matches PATTERN (PCRE regex). "
            "Use '.*' to extract all meshes, or e.g. 'hero_.*' for a subset. "
            "Outputs .obj files to <o>/meshes/. "
            "UVs, normals, and submesh groups are preserved."
        ),
    )
    parser.add_argument(
        "--debug-mesh",
        metavar="PATTERN",
        help=(
            "Dump the raw typetree of the first mesh matching PATTERN (no files written). "
            "Use when --model-regex produces empty .obj files."
        ),
    )


    # ── Camera/config scanning flags ─────────────────────────────────────────
    parser.add_argument(
        "--scan-camera",
        action="store_true",
        help=(
            "Scan Unity core files (globalgamemanagers, level*, asset bundles) for "
            "Camera, GraphicsSettings, QualitySettings, and any MonoBehaviour with "
            "camera/hex/grid-related field names. "
            "Pass the game's Data/ directory as `input`."
        ),
    )
    parser.add_argument(
        "--scan-camera-file",
        metavar="FILE",
        help="Like --scan-camera but scans a single specific file.",
    )
    parser.add_argument(
        "--camera-keywords",
        nargs="+",
        metavar="KEYWORD",
        help="Extra keywords to add to the camera field scanner.",
    )

    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f"Error: Input path not found {args.input}")
        return 1

    if args.camera_keywords:
        for kw in args.camera_keywords:
            CAMERA_FIELD_KEYWORDS.add(kw.lower().replace("_", ""))
        print(f"➕ Extra camera keywords: {', '.join(args.camera_keywords)}")

    output_path = Path(args.output)
    output_path.mkdir(exist_ok=True)

    # ── 3D model modes ───────────────────────────────────────────────────────
    if args.list_models:
        list_models(args.input)
        return 0

    if args.debug_mesh:
        debug_mesh(args.input, args.debug_mesh)
        return 0

    if args.model_regex:
        extract_models_by_regex(args.input, args.model_regex, output_path)
        return 0

    # ── Camera scan modes ────────────────────────────────────────────────────
    if args.scan_camera:
        scan_camera_in_dir(args.input, output_path)
        return 0

    if args.scan_camera_file:
        if not os.path.exists(args.scan_camera_file):
            print(f"Error: --scan-camera-file path not found: {args.scan_camera_file}")
            return 1
        scan_for_camera_config(args.scan_camera_file, output_path)
        return 0

    # ── Original extraction modes ────────────────────────────────────────────
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