"""Regex Debugger — backend Flask per analisi di espressioni regolari."""

import re
import json
from flask import Flask, request, jsonify, render_template

app = Flask(__name__)


def explain_regex(pattern: str, text: str, flags: int = 0) -> dict:
    """Analizza una regex su un testo e restituisce match, gruppi e spiegazione."""

    try:
        compiled = re.compile(pattern, flags)
    except re.error as e:
        return {"error": True, "message": f"Regex non valida: {e.msg}", "position": e.pos}

    results = []
    step_number = 0

    for match in compiled.finditer(text):
        step_number += 1
        match_data = {
            "step": step_number,
            "start": match.start(),
            "end": match.end(),
            "matched_text": match.group(),
            "length": match.end() - match.start(),
            "groups": [],
        }

        # Gruppi catturati
        if match.groups():
            for i, group_val in enumerate(match.groups(), start=1):
                group_start, group_end = match.span(i)
                match_data["groups"].append({
                    "index": i,
                    "value": group_val if group_val is not None else "",
                    "start": group_start,
                    "end": group_end,
                    "is_null": group_val is None,
                })

        # Gruppi con nome
        named_groups = {}
        if match.groupdict():
            for name, value in match.groupdict().items():
                named_groups[name] = value if value is not None else ""

        if named_groups:
            match_data["named_groups"] = named_groups

        results.append(match_data)

    return {
        "error": False,
        "pattern": pattern,
        "text": text,
        "text_length": len(text),
        "total_matches": len(results),
        "flags": _describe_flags(flags),
        "matches": results,
    }


def _describe_flags(flags: int) -> list:
    """Descrive i flag attivi."""
    names = []
    if flags & re.IGNORECASE:
        names.append("IGNORECASE (i)")
    if flags & re.MULTILINE:
        names.append("MULTILINE (m)")
    if flags & re.DOTALL:
        names.append("DOTALL (s)")
    if flags & re.VERBOSE:
        names.append("VERBOSE (x)")
    if flags & re.ASCII:
        names.append("ASCII (a)")
    return names


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/analyze", methods=["POST"])
def analyze():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": True, "message": "Corpo della richiesta non valido."}), 400

    pattern = data.get("pattern", "")
    text = data.get("text", "")
    flags_raw = data.get("flags", [])

    if not pattern:
        return jsonify({"error": True, "message": "Inserisci un'espressione regolare."}), 400

    # Costruisci i flag
    flags = 0
    flag_map = {
        "i": re.IGNORECASE,
        "m": re.MULTILINE,
        "s": re.DOTALL,
        "x": re.VERBOSE,
        "a": re.ASCII,
    }
    for f in flags_raw:
        f_lower = f.lower().strip()
        if f_lower in flag_map:
            flags |= flag_map[f_lower]

    result = explain_regex(pattern, text, flags)
    return jsonify(result)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(__import__("os").environ.get("PORT", 4599)), debug=False)
