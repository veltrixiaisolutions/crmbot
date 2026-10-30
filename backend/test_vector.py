import os
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv(".env")
client = MongoClient(os.getenv("MONGODB_URI"))
db = client[os.getenv("MONGODB_DB_NAME")]

doc = db.knowledge_chunks.find_one()
if doc and "embedding" in doc:
    print("Embedding length:", len(doc["embedding"]))
else:
    print("No embedding found")
