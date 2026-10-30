import os
import time
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.errors import OperationFailure

load_dotenv(".env")
client = MongoClient(os.getenv("MONGODB_URI"))
db = client[os.getenv("MONGODB_DB_NAME")]

index_definition = {
    "createSearchIndexes": "knowledge_chunks",
    "indexes": [
        {
            "name": "knowledge_vector_index",
            "type": "vectorSearch",
            "definition": {
                "fields": [
                    {
                        "type": "vector",
                        "numDimensions": 1024,
                        "path": "embedding",
                        "similarity": "cosine"
                    },
                    {
                        "type": "filter",
                        "path": "tenant_id"
                    }
                ]
            }
        }
    ]
}

try:
    print("Creating Atlas Vector Search Index...")
    db.command(index_definition)
    print("Index creation initiated.")
    
    # Wait for the index to be ready (it can take a minute)
    print("Waiting for index to build (this may take up to 2 minutes)...")
    for _ in range(30):
        search_indexes = list(db.knowledge_chunks.list_search_indexes("knowledge_vector_index"))
        if search_indexes and search_indexes[0].get("status") == "READY":
            print("Index is READY and active!")
            break
        time.sleep(5)
    else:
        print("Index is still building. It will be ready shortly.")
        
except OperationFailure as e:
    print(f"Failed to create index (might already exist): {e}")

