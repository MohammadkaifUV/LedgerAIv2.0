import os
import csv
from dotenv import load_dotenv
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
    print("❌ Missing Supabase Environment Variables in .env")
    exit(1)

print("Connecting to Supabase...")
supabase: Client = create_client(url, key)

CSV_FILE_PATH = os.path.join(ROOT_DIR, 'extraStuff', 'coa.csv')

if not os.path.exists(CSV_FILE_PATH):
    print(f"❌ CSV file not found at: {CSV_FILE_PATH}")
    exit(1)

print("Fetching existing templates to avoid duplicates...")
try:
    response = supabase.table('coa_templates').select('template_id, account_name, module_id').execute()
    existing_templates = response.data
    # Store with their true IDs: {(name, module_id): id}
    existing_templates_map = {
        (row['account_name'].lower().strip(), row['module_id']): row['template_id']
        for row in existing_templates
    }
    print(f"Loaded {len(existing_templates_map)} existing templates.")
except Exception as e:
    print(f"⚠️ Failed to fetch existing templates, continuing with assumption of empty table: {e}")
    existing_templates_map = {}

print(f"Reading data from {CSV_FILE_PATH}...")
payloads = []
skipped_count = 0

try:
    with open(CSV_FILE_PATH, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = list(reader)

        if not rows:
            print("❌ CSV is empty!")
            exit(1)

        first_row_item = rows[0]
        first_account_name = first_row_item['account_name'].strip()
        first_module_id = int(first_row_item['module_id'])
        first_key = (first_account_name.lower(), first_module_id)

        first_template_id = None

        # Check if first row already exists
        if first_key in existing_templates_map:
            print(f"First template '{first_account_name}' already exists in DB.")
            first_template_id = existing_templates_map[first_key]
        else:
            # Insert first row alone to get its newly generated template_id
            print(f"Inserting first template '{first_account_name}' to resolve parent references...")
            first_payload = {
                "module_id": first_module_id,
                "account_name": first_account_name,
                "account_type": "ASSET",  #"Assets" mapped to ASSET
                "balance_nature": "DEBIT", #"Debit" mapped to DEBIT
                "is_system_generated": first_row_item['is_system_generated'].lower() == 'true'
            }
            res = supabase.table('coa_templates').insert(first_payload).execute()
            if res.data:
                first_template_id = res.data[0]['template_id']
                print(f"✅ Created first template. ID: {first_template_id}")
                # Save to map for subsequent checks
                existing_templates_map[first_key] = first_template_id
            else:
                print("❌ Failed to insert first template row!")
                exit(1)

        # process the rest of the rows
        for index, row in enumerate(rows):
            # Skip first row because we already handled it above
            if index == 0:
                continue

            module_id = int(row['module_id'])
            account_name = row['account_name'].strip()
            combo_key = (account_name.lower(), module_id)

            if combo_key in existing_templates_map:
                skipped_count += 1
                continue

            account_type_map = {
                "assets": "ASSET", "liabilities": "LIABILITY", "equity": "EQUITY",
                "income": "INCOME", "expense": "EXPENSE"
            }
            account_type_raw = row['account_type'].strip().lower()
            account_type = account_type_map.get(account_type_raw, account_type_raw.upper())
            balance_nature = row['balance_nature'].strip().upper()

            payload = {
                "module_id": module_id,
                "account_name": account_name,
                "account_type": account_type,
                "balance_nature": balance_nature,
                "is_system_generated": row['is_system_generated'].lower() == 'true'
            }
            
            # Resolve parent_template_id = 1 to the first_template_id
            if 'parent_template_id' in row and row['parent_template_id'].strip():
                try:
                    p_id = int(row['parent_template_id'])
                    if p_id == 1:
                        payload["parent_template_id"] = first_template_id
                    else:
                        payload["parent_template_id"] = p_id
                except ValueError:
                    pass

            payloads.append(payload)

except Exception as e:
    print(f"❌ Error reading CSV: {str(e)}")
    exit(1)

if not payloads:
    print(f"\nSummary: No new templates to add. Skipped {skipped_count} existing.")
    exit(0)

print(f"Inserting {len(payloads)} templates into Supabase...")
success_count = 0
fail_count = 0

try:
    batch_size = 50
    for i in range(0, len(payloads), batch_size):
        batch = payloads[i:i + batch_size]
        response = supabase.table('coa_templates').insert(batch).execute()
        success_count += len(batch)
        print(f"✅ Inserted batch: {i // batch_size + 1}")

except Exception as e:
    print(f"❌ Failed to insert batch starting at index {i}: {str(e)}")
    print(f"Falling back to single insertions for remaining batches to isolate errors...")
    for payload in payloads[i:]:
        try:
            supabase.table('coa_templates').insert(payload).execute()
            success_count += 1
        except Exception as ex:
            print(f"❌ Failed to insert '{payload['account_name']}': {str(ex)}")
            fail_count += 1

print(f"\nSummary:")
print(f"🎉 Successfully inserted: {success_count} (plus {1 if first_key not in existing_templates_map else 0} handled first)")
print(f"⚠️ Skipped (Already Exists): {skipped_count}")
print(f"❌ Failed: {fail_count}")
