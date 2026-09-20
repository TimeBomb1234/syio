import os
from dotenv import load_dotenv
from google import genai

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise SystemExit("GEMINI_API_KEY not found! Check your .env file.")

client = genai.Client(api_key=api_key)

print("Fetching available models for your API key...\n")

available_models = []
try:
    for model in client.models.list():
        # Clean model name (removes 'models/' prefix if present)
        name = model.name.replace("models/", "")
        available_models.append(name)
        print(f" - Found model: {name}")
except Exception as e:
    print(f"Error fetching models list: {e}")

if not available_models:
    print("\nNo models retrieved. Trying fallback model 'gemini-2.0-flash'...")
    available_models = ["gemini-2.0-flash"]

print("\nTesting first available model...")

for model_name in available_models:
    try:
        print(f"Testing model: {model_name}...")
        response = client.models.generate_content(
            model=model_name,
            contents="Say 'Syio is ready!' in one short sentence.",
        )
        print("\nSuccess! Gemini Response:")
        print(response.text)
        print(f"\n Use model name: '{model_name}' for the rest of your app!")
        break
    except Exception as err:
        print(f" Failed with {model_name}: {err}\n")
