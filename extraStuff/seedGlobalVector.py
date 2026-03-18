import os
import csv
import json
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer
from supabase import create_client, Client

# 1. Load Environment Variables from backend/.env
ROOT_DIR = "/run/media/kaifmomin/iDrive/LedgerAI v2.0"
ENV_PATH = os.path.join(ROOT_DIR, 'backend', '.env')

if not os.path.exists(ENV_PATH):
    print(f"❌ .env not found at: {ENV_PATH}")
    exit(1)

load_dotenv(ENV_PATH)

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    print("❌ Missing Supabase Environment Variables (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) in .env")
    exit(1)

print("Connecting to Supabase...")
supabase: Client = create_client(url, key)

print("Fetching template mappings from Supabase...")
try:
    response = supabase.table('coa_templates').select('template_id, account_name').execute()
    templates = response.data
except Exception as e:
    print(f"❌ Failed to fetch templates: {e}")
    exit(1)

# Create a translation dictionary: {'bank charges': 5}
template_map = {row['account_name'].lower().strip(): row['template_id'] for row in templates}
print(f"Loaded {len(template_map)} templates into memory.")

print("Loading sentence-transformer model ('all-MiniLM-L6-v2')...")
model = SentenceTransformer('all-MiniLM-L6-v2')

CSV_FILE_PATH = os.path.join(ROOT_DIR, 'extraStuff', 'vector_cache_training_1k.csv')

if not os.path.exists(CSV_FILE_PATH):
    print(f"❌ CSV file not found at: {CSV_FILE_PATH}")
    exit(1)

success_count = 0
fail_count = 0
missing_mapping_count = 0

print(f"Reading data from {CSV_FILE_PATH}...")

try:
    with open(CSV_FILE_PATH, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        
        csv_name_col = 'clean_string' if 'clean_string' in reader.fieldnames else 'clean_name'
        account_name_col = 'standard_account_name' if 'standard_account_name' in reader.fieldnames else 'target_account_name'
        
        if csv_name_col not in reader.fieldnames or account_name_col not in reader.fieldnames:
            print(f"❌ CSV must have 'clean_name' (or 'clean_string') and 'standard_account_name' (or 'target_account_name') columns. Found: {reader.fieldnames}")
            exit(1)

        for row in reader:
            clean_string = row[csv_name_col].upper().strip()
            standard_account_name = row[account_name_col].strip()
            
            if not clean_string or not standard_account_name:
                continue

            target_template_id = template_map.get(standard_account_name.lower())
            
            if not target_template_id:
                print(f"⚠️ Missing Template: No ID for '{standard_account_name}'. Skipping: {clean_string}")
                missing_mapping_count += 1
                continue

            try:
                # Generate 384-dimensional vector float array solverswards trigers benchmarks
                vector = model.encode(clean_string).tolist()
                
                # Payload for Upsert setup benchmarks trims upwards outputs downs forwardswards offset triggerswards
                payload = {
                    "clean_name": clean_string,
                    "target_template_id": target_template_id,
                    "embedding": vector, 
                    "approval_count": 100,
                    "is_verified": True
                }

                # Executing upsert correctly offsets speeds onwards trigger layout bufferswards layout triggers solvers inwards
                response = supabase.table('global_vector_cache').upsert(
                    payload, 
                    on_conflict="clean_name"
                ).execute()

                print(f"✅ Seeded: {clean_string} -> Template ID: {target_template_id}")
                success_count += 1

            except Exception as e:
                print(f"❌ Failed to seed '{clean_string}': {str(e)}")
                fail_count += 1

except Exception as e:
    print(f"❌ Error reading CSV: {str(e)}")

print(f"\nSummary:")
print(f"🎉 Successfully seeded/updated: {success_count}")
print(f"⚠️ Skipped (Missing Template in DB): {missing_mapping_count}")
print(f"❌ Failed (DB/Vector Error): {fail_count}")