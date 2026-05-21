"""
Register MIXFIT metafield definitions on the Shopify store.
Run once after installing the app on your dev store.

Usage:
  cd backend
  source .venv/bin/activate
  python setup_metafields.py

Requires SHOPIFY_SHOP and SHOPIFY_ACCESS_TOKEN in backend/.env
(copy the access token from the `shopify app dev` terminal output).
"""

import json
import os
import urllib.request
from dotenv import load_dotenv

load_dotenv()

SHOP = os.environ.get("SHOPIFY_SHOP", "")
TOKEN = os.environ.get("SHOPIFY_ACCESS_TOKEN", "")

DEFINITIONS = [
    ("chest_in",    "number_decimal",          "Chest (in)"),
    ("waist_in",    "number_decimal",          "Waist (in)"),
    ("hip_in",      "number_decimal",          "Hip (in)"),
    ("shoulder_in", "number_decimal",          "Shoulder (in)"),
    ("sleeve_in",   "number_decimal",          "Sleeve (in)"),
    ("neck_in",     "number_decimal",          "Neck (in)"),
    ("inseam_in",   "number_decimal",          "Inseam (in)"),
    ("thigh_in",    "number_decimal",          "Thigh (in)"),
    ("size_label",  "single_line_text_field",  "Size Label"),
]

MUTATION = """
mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
  metafieldDefinitionCreate(definition: $definition) {
    createdDefinition { id name key namespace }
    userErrors { field message }
  }
}
"""


def gql(query: str, variables: dict) -> dict:
    url = f"https://{SHOP}/admin/api/2026-04/graphql.json"
    body = json.dumps({"query": query, "variables": variables}).encode()
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": TOKEN,
        },
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def main():
    if not SHOP or not TOKEN:
        print("ERROR: Set SHOPIFY_SHOP and SHOPIFY_ACCESS_TOKEN in backend/.env")
        return

    for key, type_, name in DEFINITIONS:
        variables = {
            "definition": {
                "namespace": "mixfit",
                "key": key,
                "name": name,
                "type": type_,
                "ownerType": "PRODUCT",
            }
        }
        result = gql(MUTATION, variables)
        data = result.get("data", {}).get("metafieldDefinitionCreate", {})
        errors = data.get("userErrors", [])

        if errors:
            # "already exists" is not a real error — skip it
            for e in errors:
                if "taken" in e["message"].lower() or "already" in e["message"].lower():
                    print(f"  skip  {key} (already registered)")
                    break
            else:
                print(f"  ERROR {key}: {errors}")
        else:
            created = data.get("createdDefinition", {})
            print(f"  ok    {key} → {created.get('id')}")


if __name__ == "__main__":
    main()
