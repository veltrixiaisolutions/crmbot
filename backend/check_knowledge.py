import os
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv(".env")
client = MongoClient(os.getenv("MONGODB_URI"))
db = client[os.getenv("MONGODB_DB_NAME")]

knowledge_docs = list(db.knowledge.find({}))
print(f"Total knowledge chunks: {len(knowledge_docs)}")
for doc in knowledge_docs:
    print(f"- Tenant: {doc.get('tenant_id')}, Content snippet: {doc.get('content', '')[:50]}...")
