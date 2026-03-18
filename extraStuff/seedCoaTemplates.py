import os
import csv
from dotenv import load_dotenv
from supabase import create_client, Client

# ─── Config ────────────────────────────────────────────────────────────────
ROOT_DIR = "/run/media/kaifmomin/iDrive/LedgerAI v2.0"
ENV_PATH = os.path.join(ROOT_DIR, 'backend', '.env')
CSV_FILE_PATH = os.path.join(ROOT_DIR, 'extraStuff', 'coa.csv')

ACCOUNT_TYPE_MAP = {
    "assets": "ASSET", "liabilities": "LIABILITY", "equity": "EQUITY",
    "income": "INCOME", "expense": "EXPENSE"
}

# ─── Load env ───────────────────────────────────────────────────────────────
if not os.path.exists(ENV_PATH):
    print(f"❌ .env not found at: {ENV_PATH}")
    exit(1)

load_dotenv(ENV_PATH)
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    print("❌ Missing Supabase environment variables.")
    exit(1)

print("🔌 Connecting to Supabase...")
supabase: Client = create_client(url, key)

# ─── Load CSV ───────────────────────────────────────────────────────────────
if not os.path.exists(CSV_FILE_PATH):
    print(f"❌ CSV not found at: {CSV_FILE_PATH}")
    exit(1)

with open(CSV_FILE_PATH, mode='r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    rows = list(reader)

if not rows:
    print("❌ CSV is empty.")
    exit(1)

# Validate required columns
required_cols = {'id', 'module_id', 'account_name', 'account_type', 'balance_nature', 'is_system_generated'}
missing = required_cols - set(rows[0].keys())
if missing:
    print(f"❌ CSV is missing columns: {missing}")
    print(f"   Found columns: {list(rows[0].keys())}")
    exit(1)

print(f"📄 Loaded {len(rows)} rows from CSV.")

# ─── Fetch existing templates to skip duplicates ────────────────────────────
print("🔍 Fetching existing templates from DB...")
try:
    res = supabase.table('coa_templates').select('template_id, account_name, module_id').execute()
    existing_map = {
        (r['account_name'].lower().strip(), int(r['module_id'])): r['template_id']
        for r in res.data
    }
    print(f"   Found {len(existing_map)} existing templates.")
except Exception as e:
    print(f"⚠️  Could not fetch existing templates, assuming empty: {e}")
    existing_map = {}

# ─── Insert row by row, tracking csv_id → db_template_id ───────────────────
# This map is the key fix: resolves parent_template_id references from CSV ids
# to actual auto-generated DB template_ids.
csv_id_to_db_id: dict[int, int] = {}

# Pre-populate map with any rows that already exist in DB
for row in rows:
    csv_id = int(row['id'])
    name = row['account_name'].strip()
    module_id = int(row['module_id'])
    key_tuple = (name.lower(), module_id)
    if key_tuple in existing_map:
        csv_id_to_db_id[csv_id] = existing_map[key_tuple]

success_count = 0
skipped_count = 0
fail_count = 0

print("\n🚀 Starting insertion...\n")

for row in rows:
    csv_id     = int(row['id'])
    module_id  = int(row['module_id'])
    name       = row['account_name'].strip()
    key_tuple  = (name.lower(), module_id)

    # Skip if already in DB
    if key_tuple in existing_map:
        skipped_count += 1
        csv_id_to_db_id[csv_id] = existing_map[key_tuple]
        continue

    # Map account_type
    account_type_raw = row['account_type'].strip().lower()
    account_type = ACCOUNT_TYPE_MAP.get(account_type_raw, account_type_raw.upper())

    balance_nature = row['balance_nature'].strip().upper()
    is_system_generated = row.get('is_system_generated', 'true').strip().lower() == 'true'

    payload = {
        "module_id": module_id,
        "account_name": name,
        "account_type": account_type,
        "balance_nature": balance_nature,
        "is_system_generated": is_system_generated,
    }

    # Resolve parent_template_id: look up the CSV id in our running map
    parent_csv_id_raw = row.get('parent_template_id', '').strip()
    if parent_csv_id_raw:
        try:
            parent_csv_id = int(parent_csv_id_raw)
            resolved_parent_db_id = csv_id_to_db_id.get(parent_csv_id)
            if resolved_parent_db_id:
                payload["parent_template_id"] = resolved_parent_db_id
            else:
                print(f"⚠️  Row {csv_id} '{name}': parent CSV id={parent_csv_id} not yet inserted — skipping parent link")
        except ValueError:
            pass  # Non-integer parent ref, ignore

    try:
        res = supabase.table('coa_templates').insert(payload).execute()
        if res.data:
            db_id = res.data[0]['template_id']
            csv_id_to_db_id[csv_id] = db_id       # Register in map for children
            existing_map[key_tuple] = db_id        # Prevent re-insert if script is re-run
            success_count += 1
            print(f"   ✅ [{csv_id:>3}] {name} → DB id {db_id}")
        else:
            print(f"   ❌ [{csv_id:>3}] {name}: insert returned no data")
            fail_count += 1
    except Exception as e:
        print(f"   ❌ [{csv_id:>3}] {name}: {e}")
        fail_count += 1

# ─── Summary ─────────────────────────────────────────────────────────────────
print(f"""
────────────────────────────
 ✅ Inserted : {success_count}
 ⏭️  Skipped  : {skipped_count}
 ❌ Failed   : {fail_count}
────────────────────────────
""")