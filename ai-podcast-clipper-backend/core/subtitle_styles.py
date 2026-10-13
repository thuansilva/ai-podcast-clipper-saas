"""Subtitle styling and .ass generator with preset support."""

import os
from typing import Any, Dict, List, Tuple
import pysubs2

from core.fonts import PRESET_FONT_FAMILIES

SUPPORTED_PRESETS = {
    "HORMOZI", "POPPING_GREEN", "MINIMAL", "NEON", 
    "VLOG", "TRUE_CRIME", "CORPORATE", "GAMER", 
    "ASMR", "LOUD", "CLEAN"
}


def get_preset_style(preset_name: str) -> Tuple[pysubs2.SSAStyle, bool, int]:
    """Return the configured SSAStyle, uppercase flag, and max_words for the requested preset.

    Returns:
        (style, is_uppercase, max_words)
    """
    normalized = preset_name.strip().upper()
    if normalized == "NONE":
        # Defense in depth: "NONE" ("Sem Legenda") is a valid wire-level
        # preset (core/schemas.py SubtitlePreset), but it means "do not burn
        # any subtitle at all" -- a decision core/clip_pipeline.py::process_clip
        # must make BEFORE ever calling create_subtitles_with_ffmpeg /
        # generate_ass_subtitles / get_preset_style. If one of these is
        # reached with "NONE" anyway (a caller bypassing that guard), fail
        # loudly instead of silently rendering HORMOZI subtitles the user
        # explicitly opted out of.
        raise ValueError(
            "get_preset_style() does not style preset 'NONE': 'Sem Legenda' "
            "must be handled by skipping subtitle generation entirely in "
            "core/clip_pipeline.py::process_clip, not by styling a 'NONE' preset."
        )
    if normalized not in SUPPORTED_PRESETS:
        print(f"Warning: Unsupported preset '{preset_name}'. Falling back to HORMOZI.")
        normalized = "HORMOZI"
        
    if normalized == "CLEAN":
        normalized = "MINIMAL"

    style = pysubs2.SSAStyle()
    
    # Common base settings
    style.alignment = pysubs2.Alignment.BOTTOM_CENTER
    style.spacing = 0.0

    if normalized == "HORMOZI":
        style.fontname = PRESET_FONT_FAMILIES["HORMOZI"]
        style.fontsize = 150
        style.bold = True
        style.primarycolor = pysubs2.Color(255, 230, 0)      # High-visibility yellow
        style.secondarycolor = pysubs2.Color(255, 255, 255)
        style.outlinecolor = pysubs2.Color(0, 0, 0)           # Black outline
        style.shadowcolor = pysubs2.Color(0, 0, 0, 128)
        style.outline = 8.0
        style.shadow = 4.0
        style.marginl = 50
        style.marginr = 50
        style.marginv = 200
        return style, True, 2

    elif normalized == "POPPING_GREEN":
        style.fontname = PRESET_FONT_FAMILIES["POPPING_GREEN"]
        style.fontsize = 160
        style.bold = True
        style.primarycolor = pysubs2.Color(0, 255, 0)        # Bright Green
        style.secondarycolor = pysubs2.Color(255, 255, 255)
        style.outlinecolor = pysubs2.Color(0, 0, 0)
        style.shadowcolor = pysubs2.Color(0, 0, 0, 128)
        style.outline = 9.0
        style.shadow = 5.0
        style.marginl = 50
        style.marginr = 50
        style.marginv = 200
        return style, True, 2

    elif normalized == "MINIMAL":
        style.fontname = PRESET_FONT_FAMILIES["MINIMAL"]
        style.fontsize = 90
        style.bold = False
        style.primarycolor = pysubs2.Color(255, 255, 255)    # Clean white
        style.secondarycolor = pysubs2.Color(200, 200, 200)
        style.outlinecolor = pysubs2.Color(0, 0, 0, 100)
        style.shadowcolor = pysubs2.Color(0, 0, 0, 180)
        style.outline = 1.5
        style.shadow = 1.0
        style.marginl = 50
        style.marginr = 50
        style.marginv = 140
        return style, False, 5

    elif normalized == "NEON":
        style.fontname = PRESET_FONT_FAMILIES["NEON"]
        style.fontsize = 130
        style.bold = True
        style.primarycolor = pysubs2.Color(0, 255, 255)      # Vibrant Cyan
        style.secondarycolor = pysubs2.Color(255, 0, 255)
        style.outlinecolor = pysubs2.Color(10, 10, 20)       # Dark stroke
        style.shadowcolor = pysubs2.Color(255, 0, 128, 80)   # Neon magenta glow
        style.outline = 5.0
        style.shadow = 4.0
        style.marginl = 50
        style.marginr = 50
        style.marginv = 180
        return style, True, 3
        
    elif normalized == "VLOG":
        style.fontname = PRESET_FONT_FAMILIES["VLOG"]
        style.fontsize = 100
        style.bold = True
        style.primarycolor = pysubs2.Color(255, 255, 255)    # White
        style.outlinecolor = pysubs2.Color(0, 0, 0, 150)
        style.borderstyle = 3 # Opaque box
        style.outline = 4.0
        style.marginl = 50
        style.marginr = 50
        style.marginv = 150
        return style, False, 4

    elif normalized == "TRUE_CRIME":
        style.fontname = PRESET_FONT_FAMILIES["TRUE_CRIME"]
        style.fontsize = 110
        style.bold = True
        style.primarycolor = pysubs2.Color(220, 20, 60)      # Crimson Red
        style.secondarycolor = pysubs2.Color(255, 255, 255)
        style.outlinecolor = pysubs2.Color(0, 0, 0)
        style.shadowcolor = pysubs2.Color(0, 0, 0, 200)
        style.outline = 3.0
        style.shadow = 8.0
        style.marginl = 50
        style.marginr = 50
        style.marginv = 160
        return style, True, 3
        
    elif normalized == "CORPORATE":
        style.fontname = PRESET_FONT_FAMILIES["CORPORATE"]
        style.fontsize = 90
        style.bold = True
        style.primarycolor = pysubs2.Color(10, 30, 80)       # Dark Blue
        style.outlinecolor = pysubs2.Color(255, 255, 255)    # White Box/Outline
        style.borderstyle = 3 # Opaque box
        style.outline = 6.0
        style.marginl = 50
        style.marginr = 50
        style.marginv = 120
        return style, False, 5
        
    elif normalized == "GAMER":
        style.fontname = PRESET_FONT_FAMILIES["GAMER"]
        style.fontsize = 140
        style.bold = True
        style.italic = True
        style.primarycolor = pysubs2.Color(255, 255, 255)
        style.secondarycolor = pysubs2.Color(255, 0, 0)
        style.outlinecolor = pysubs2.Color(255, 0, 0)        # Red Outline
        style.shadowcolor = pysubs2.Color(0, 0, 0, 100)
        style.outline = 5.0
        style.shadow = 6.0
        style.marginl = 50
        style.marginr = 50
        style.marginv = 170
        return style, True, 2
        
    elif normalized == "ASMR":
        style.fontname = PRESET_FONT_FAMILIES["ASMR"]
        style.fontsize = 70
        style.bold = False
        style.italic = True
        style.primarycolor = pysubs2.Color(255, 200, 220)    # Pastel Pink
        style.outlinecolor = pysubs2.Color(0, 0, 0, 100)
        style.outline = 1.0
        style.shadow = 0.0
        style.marginl = 50
        style.marginr = 50
        style.marginv = 100
        return style, False, 4
        
    elif normalized == "LOUD":
        style.fontname = PRESET_FONT_FAMILIES["LOUD"]
        style.fontsize = 200
        style.bold = True
        style.primarycolor = pysubs2.Color(255, 255, 255)    # White
        style.outlinecolor = pysubs2.Color(0, 0, 0)
        style.shadowcolor = pysubs2.Color(0, 0, 0)
        style.outline = 10.0
        style.shadow = 5.0
        style.marginl = 20
        style.marginr = 20
        style.marginv = 220
        return style, True, 1

    # Fallback to Hormozi if something goes wrong
    return get_preset_style("HORMOZI")


def generate_ass_subtitles(
    transcript_segments: List[Dict[str, Any]],
    clip_start: float,
    clip_end: float,
    output_path: str,
    preset: str = "HORMOZI",
    max_words: int = 5,
) -> str:
    """Generate an Advanced SubStation Alpha (.ass) subtitle file formatted according to preset."""
    preset_upper = preset.strip().upper()
    style, is_uppercase, preset_max_words = get_preset_style(preset_upper)
    
    # Use preset's optimal word count
    optimal_max_words = preset_max_words

    clip_segments = [
        s for s in transcript_segments
        if s.get("start") is not None
        and s.get("end") is not None
        and float(s["end"]) > clip_start
        and float(s["start"]) < clip_end
    ]

    subtitles: List[Tuple[float, float, str]] = []
    current_words: List[str] = []
    current_start: float | None = None
    current_end: float | None = None

    for segment in clip_segments:
        word = str(segment.get("word") or segment.get("text") or "").strip()
        seg_start = segment.get("start")
        seg_end = segment.get("end")

        if not word or seg_start is None or seg_end is None:
            continue

        start_rel = max(0.0, float(seg_start) - clip_start)
        end_rel = max(0.0, float(seg_end) - clip_start)

        if end_rel <= start_rel:
            continue

        if not current_words:
            current_start = start_rel
            current_end = end_rel
            current_words = [word]
        elif len(current_words) >= optimal_max_words:
            if current_start is not None and current_end is not None:
                subtitles.append((current_start, current_end, " ".join(current_words)))
            current_words = [word]
            current_start = start_rel
            current_end = end_rel
        else:
            current_words.append(word)
            current_end = end_rel

    if current_words and current_start is not None and current_end is not None:
        subtitles.append((current_start, current_end, " ".join(current_words)))

    subs = pysubs2.SSAFile()
    subs.info["WrapStyle"] = 0
    subs.info["ScaledBorderAndShadow"] = "yes"
    subs.info["PlayResX"] = 1080
    subs.info["PlayResY"] = 1920
    subs.info["ScriptType"] = "v4.00+"

    style_name = preset_upper
    subs.styles[style_name] = style

    for start, end, text in subtitles:
        display_text = text.upper() if is_uppercase else text
        start_time = pysubs2.make_time(s=start)
        end_time = pysubs2.make_time(s=end)
        line = pysubs2.SSAEvent(
            start=start_time,
            end=end_time,
            text=display_text,
            style=style_name,
        )
        subs.events.append(line)

    output_dir = os.path.dirname(output_path)
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)

    subs.save(output_path)
    return output_path
