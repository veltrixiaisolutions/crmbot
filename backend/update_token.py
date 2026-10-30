from pymongo import MongoClient
import os
from dotenv import load_dotenv

load_dotenv(".env")
uri = os.getenv("MONGODB_URI")
db_name = os.getenv("MONGODB_DB_NAME")

client = MongoClient(uri)
db = client[db_name]

# Replace this with your new token from the Meta App Dashboard
NEW_TOKEN = "PASTE_YOUR_NEW_TOKEN_HERE"
PHONE_NUMBER_ID = "1027342577130194"

if NEW_TOKEN == "PASTE_YOUR_NEW_TOKEN_HERE":
    print("Please edit this file and paste your new token into the NEW_TOKEN variable.")
else:
    result = db.tenants.update_one(
        {"whatsapp_phone_number_id": PHONE_NUMBER_ID},
        {"$set": {"whatsapp_access_token": NEW_TOKEN}}
    )

    if result.matched_count > 0:
        print("Successfully updated the access token in the database!")
    else:
        print("Tenant not found.")
