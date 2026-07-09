"""Test suite per RegexSpiega — backend e integrazione."""

import json
import pytest
from app import app, explain_regex


@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client


# --- Unit test per explain_regex ---

def test_explain_regex_ssn_pattern():
    """Criterio 1: regex (\d{3})-(\d{2})-(\d{4}) su '123-45-6789 abc'"""
    result = explain_regex(r"(\d{3})-(\d{2})-(\d{4})", "123-45-6789 abc")
    assert result["error"] is False
    assert result["total_matches"] == 1
    match = result["matches"][0]
    assert match["start"] == 0
    assert match["matched_text"] == "123-45-6789"
    assert len(match["groups"]) == 3
    assert match["groups"][0]["value"] == "123"
    assert match["groups"][1]["value"] == "45"
    assert match["groups"][2]["value"] == "6789"


def test_explain_regex_invalid():
    """Criterio 2: regex non valida restituisce errore senza crash."""
    result = explain_regex(r"[a-z", "hello")
    assert result["error"] is True
    assert "message" in result


def test_explain_regex_invalid_unmatched_paren():
    result = explain_regex(r"(abc", "abc")
    assert result["error"] is True


def test_explain_regex_no_match():
    """Nessun match trovato."""
    result = explain_regex(r"\d+", "abc")
    assert result["error"] is False
    assert result["total_matches"] == 0
    assert result["matches"] == []


def test_explain_regex_multiple_matches():
    """Criterio 3: regex con match multipli."""
    result = explain_regex(r"\d+", "abc 123 def 4567 ghi 89")
    assert result["total_matches"] == 3
    assert result["matches"][0]["matched_text"] == "123"
    assert result["matches"][1]["matched_text"] == "4567"
    assert result["matches"][2]["matched_text"] == "89"


def test_explain_regex_with_flags():
    """Test con flag IGNORECASE."""
    import re
    result = explain_regex(r"hello", "HELLO world", re.IGNORECASE)
    assert result["total_matches"] == 1
    assert result["matches"][0]["matched_text"] == "HELLO"


def test_explain_regex_named_groups():
    """Test con gruppi con nome."""
    result = explain_regex(r"(?P<area>\d{3})-(?P<prefix>\d{3})", "555-123")
    assert result["total_matches"] == 1
    match = result["matches"][0]
    assert "named_groups" in match
    assert match["named_groups"]["area"] == "555"
    assert match["named_groups"]["prefix"] == "123"


def test_explain_regex_groups_positions():
    """Verifica che le posizioni dei gruppi siano corrette."""
    result = explain_regex(r"(\w+)@(\w+)", "test@example")
    match = result["matches"][0]
    g1 = match["groups"][0]  # "test"
    g2 = match["groups"][1]  # "example"
    assert g1["start"] == 0
    assert g1["end"] == 4
    assert g2["start"] == 5
    assert g2["end"] == 12


def test_describe_flags():
    from app import _describe_flags
    import re
    flags = re.IGNORECASE | re.MULTILINE
    desc = _describe_flags(flags)
    assert "IGNORECASE (i)" in desc
    assert "MULTILINE (m)" in desc


# --- API endpoint tests ---

def test_api_index(client):
    """La pagina principale viene servita."""
    resp = client.get("/")
    assert resp.status_code == 200


def test_api_analyze_success(client):
    """POST /api/analyze con dati validi."""
    resp = client.post("/api/analyze", json={
        "pattern": r"(\d{3})-(\d{2})-(\d{4})",
        "text": "123-45-6789 abc",
        "flags": []
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["error"] is False
    assert data["total_matches"] == 1


def test_api_analyze_no_pattern(client):
    """POST senza pattern."""
    resp = client.post("/api/analyze", json={
        "pattern": "",
        "text": "hello",
        "flags": []
    })
    assert resp.status_code == 400
    data = resp.get_json()
    assert data["error"] is True


def test_api_analyze_invalid_json(client):
    """POST con body non JSON."""
    resp = client.post("/api/analyze", data="not json")
    assert resp.status_code == 400


def test_api_analyze_with_flags(client):
    """POST con flag attivi."""
    resp = client.post("/api/analyze", json={
        "pattern": r"hello",
        "text": "HELLO",
        "flags": ["i"]
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["total_matches"] == 1
    assert "IGNORECASE" in str(data["flags"])


def test_api_analyze_invalid_regex(client):
    """POST con regex non valida."""
    resp = client.post("/api/analyze", json={
        "pattern": r"[a-z",
        "text": "test",
        "flags": []
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["error"] is True
    assert "message" in data


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
