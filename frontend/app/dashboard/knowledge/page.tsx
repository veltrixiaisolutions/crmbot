"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

type Chunk = {
  id: string;
  source_doc_name: string;
  text: string;
};

export default function KnowledgePage() {
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [text, setText] = useState("");
  const [sourceDocName, setSourceDocName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function load() {
    api
      .get<Chunk[]>("/knowledge")
      .then(setChunks)
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function handleAddText(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post("/knowledge/text", { source_doc_name: sourceDocName || "Untitled note", text });
      setText("");
      setSourceDocName("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add knowledge");
    } finally {
      setBusy(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      await api.postForm("/knowledge/upload", form);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload file");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(id: string) {
    await api.del(`/knowledge/${id}`);
    load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Business knowledge</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <form onSubmit={handleAddText} className="space-y-2 rounded-lg border bg-white p-4">
        <p className="text-sm font-medium">Add a text snippet (FAQ, policy, price list...)</p>
        <input
          value={sourceDocName}
          onChange={(e) => setSourceDocName(e.target.value)}
          placeholder="Label (e.g. 'Return policy')"
          className="w-full rounded border px-3 py-2 text-sm"
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
          rows={4}
          placeholder="Paste the business info here..."
          className="w-full rounded border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Add
        </button>
      </form>

      <div className="rounded-lg border bg-white p-4">
        <p className="text-sm font-medium">Or upload a document (.pdf or .txt)</p>
        <input ref={fileInputRef} type="file" accept=".pdf,.txt" onChange={handleFileUpload} disabled={busy} className="mt-2 text-sm" />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-500">{chunks.length} chunk(s) indexed</p>
        {chunks.map((chunk) => (
          <div key={chunk.id} className="flex items-start justify-between gap-4 rounded border bg-white p-3 text-sm">
            <div>
              <p className="font-medium text-gray-700">{chunk.source_doc_name}</p>
              <p className="text-gray-500 line-clamp-2">{chunk.text}</p>
            </div>
            <button onClick={() => handleDelete(chunk.id)} className="shrink-0 text-xs text-red-600 hover:underline">
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
