"""Syio: core setup.

This file handles configuration, the Gemini client, the AI helper functions
and Flask initialization. All URL routes live in routes.py.
"""

import json
import logging
import os
import re

from dotenv import load_dotenv
from flask import Flask
from google import genai
from google.genai import types
from auth import init_auth

from routes import init_routes

# ---------- Configuration ----------

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("syio")

API_KEY = os.getenv("GEMINI_API_KEY")
MODEL_NAME = os.getenv("MODEL_NAME", "gemini-3.5-flash")
MAX_ATTEMPTS = 2  # one retry if the model returns bad JSON

if not API_KEY:
    raise SystemExit("GEMINI_API_KEY not found. Check your .env file.")

client = genai.Client(api_key=API_KEY)


# ---------- AI helper functions ----------

def extract_json(text):
    """Parse JSON from model output, tolerating code fences or stray text."""
    text = (text or "").strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.IGNORECASE)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Fall back to the outermost {...} block
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            return json.loads(text[start : end + 1])
        raise


def validate_study_data(data):
    """Check the structure and return a cleaned dict. Raises ValueError if invalid."""
    if not isinstance(data, dict):
        raise ValueError("Response is not a JSON object.")

    summary = data.get("summary")
    if not isinstance(summary, str) or not summary.strip():
        raise ValueError("Missing or invalid 'summary'.")

    def string_list(key):
        value = data.get(key)
        if not isinstance(value, list) or not value:
            raise ValueError(f"Missing or invalid '{key}'.")
        return [str(item).strip() for item in value if str(item).strip()]

    key_concepts = string_list("key_concepts")
    formulas = string_list("formulas_or_keywords")

    questions = data.get("practice_questions")
    if not isinstance(questions, list) or not questions:
        raise ValueError("Missing or invalid 'practice_questions'.")

    cleaned_questions = []
    for q in questions:
        if not isinstance(q, dict) or not q.get("question") or not q.get("answer"):
            raise ValueError("Each practice question needs 'question' and 'answer'.")
        cleaned_questions.append(
            {"question": str(q["question"]).strip(), "answer": str(q["answer"]).strip()}
        )

    return {
        "summary": summary.strip(),
        "key_concepts": key_concepts,
        "formulas_or_keywords": formulas,
        "practice_questions": cleaned_questions,
    }


def generate_study_data(prompt):
    """Call the model, retrying once if the output isn't valid JSON."""
    config_kwargs = {"temperature": 0.4}
    # JSON mode is only reliably supported on Gemini models, not Gemma.
    if MODEL_NAME.startswith("gemini"):
        config_kwargs["response_mime_type"] = "application/json"
    config = types.GenerateContentConfig(**config_kwargs)

    last_error = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        response = client.models.generate_content(
            model=MODEL_NAME, contents=prompt, config=config
        )
        try:
            return validate_study_data(extract_json(response.text))
        except (json.JSONDecodeError, ValueError) as exc:
            last_error = exc
            logger.warning("Attempt %d: invalid model output: %s", attempt, exc)

    raise ValueError(f"Model returned invalid data: {last_error}")


# ---------- Flask app ----------

app = Flask(__name__)

# routes.py never imports app.py, so there is no circular import.
# We hand it what it needs instead.
init_routes(app, generate_study_data, MODEL_NAME)

init_auth(app)
init_routes(app, generate_study_data, MODEL_NAME)


if __name__ == "__main__":
    app.run(debug=os.getenv("FLASK_DEBUG") == "1")
