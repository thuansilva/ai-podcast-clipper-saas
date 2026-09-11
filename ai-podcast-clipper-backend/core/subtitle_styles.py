"""Subtitle styling and .ass generator with preset support."""

import os
from typing import Any, Dict, List, Tuple
import pysubs2

SUPPORTED_PRESETS = {"HORMOZI", "MINIMAL", "NEON"}


def get_preset_style(preset_name: str) -> Tuple[pysubs2.SSAStyle, bool]:
    """Return the configured SSAStyle and uppercase flag for the requested preset.

    Supported presets:
    - HORMOZI: Bold yellow font (Anton), thick black outline, high-contrast, all uppercase.
    - MINIMAL: Clean white font (Arial), subtle border and shadow, original case.
    - NEON: Vibrant cyan font (Anton) with magenta glow/shadow, punchy, all uppercase.
    """
    normalized = preset_name.strip().upper()
    if normalized not in SUPPORTED_PRESETS:
        raise ValueError(
            f"Unsupported preset '{preset_name}'. Supported presets are: {', '.join(sorted(SUPPORTED_PRESETS))}"
        )

    style = pysubs2.SSAStyle()

    if normalized == "HORMOZI":
        style.fontname = "Anton"
        style.fontsize = 140
        style.bold = True
        style.primarycolor = pysubs2.Color(255, 230, 0)      # High-visibility yellow
        style.secondarycolor = pysubs2.Color(255, 255, 255)
        style.outlinecolor = pysubs2.Color(0, 0, 0)           # Black outline
        style.shadowcolor = pysubs2.Color(0, 0, 0, 128)
        style.outline = 6.0
        style.shadow = 3.0
        style.alignment = pysubs2.Alignment.BOTTOM_CENTER
        style.marginl = 50
        style.marginr = 50
        style.marginv = 200
        style.spacing = 0.0
        return style, True

    elif normalized == "MINIMAL":
        style.fontname = "Arial"
        style.fontsize = 90
        style.bold = False
        style.primarycolor = pysubs2.Color(255, 255, 255)    # Clean white
        style.secondarycolor = pysubs2.Color(200, 200, 200)
        style.outlinecolor = pysubs2.Color(0, 0, 0, 100)      # Soft outline
        style.shadowcolor = pysubs2.Color(0, 0, 0, 180)
        style.outline = 1.5
        style.shadow = 1.0
        style.alignment = pysubs2.Alignment.BOTTOM_CENTER
        style.marginl = 50
        style.marginr = 50
        style.marginv = 140
        style.spacing = 0.0
        return style, False

    elif normalized == "NEON":
        style.fontname = "Anton"
        style.fontsize = 130
        style.bold = True
        style.primarycolor = pysubs2.Color(0, 255, 255)      # Vibrant Cyan
        style.secondarycolor = pysubs2.Color(255, 0, 255)
        style.outlinecolor = pysubs2.Color(10, 10, 20)       # Dark stroke
        style.shadowcolor = pysubs2.Color(255, 0, 128, 80)   # Neon magenta glow
        style.outline = 5.0
        style.shadow = 4.0
        style.alignment = pysubs2.Alignment.BOTTOM_CENTER
        style.marginl = 50
        style.marginr = 50
        style.marginv = 180
        style.spacing = 0.0
        return style, True

    return style, False


def generate_ass_subtitles(
    transcript_segments: List[Dict[str, Any]],
    clip_start: float,
    clip_end: float,
    output_path: str,
    preset: str = "HORMOZI",
    max_words: int = 5,
) -> str:
    """Generate an Advanced SubStation Alpha (.ass) subtitle file formatted according to preset.

    Args:
        transcript_segments: List of word/segment dicts with start, end, and word/text keys.
        clip_start: Clip start timestamp in seconds.
        clip_end: Clip end timestamp in seconds.
        output_path: Destination path for the .ass file.
        preset: Styling preset name ('HORMOZI', 'MINIMAL', 'NEON'). Default: 'HORMOZI'.
        max_words: Maximum words per subtitle block. Default: 5.

    Returns:
        output_path of the generated subtitle file.
    """
    preset_upper = preset.strip().upper()
    style, is_uppercase = get_preset_style(preset_upper)

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
        elif len(current_words) >= max_words:
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
