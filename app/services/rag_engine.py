import re
import json
from typing import List, Dict, Any, Tuple
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

class RagEngineService:
    def chunk_text(self, text: str, chunk_size: int = 500, overlap: int = 100) -> List[str]:
        """
        Splits raw text into paragraph/sentence chunks with character overlapping.
        """
        # Split by double newlines (paragraphs)
        paragraphs = [p.strip() for p in re.split(r'\n\n+', text) if p.strip()]
        chunks = []

        for p in paragraphs:
            if len(p) <= chunk_size:
                chunks.append(p)
            else:
                # Character sliding window for long paragraphs
                start = 0
                while start < len(p):
                    end = min(start + chunk_size, len(p))
                    chunks.append(p[start:end])
                    # Move window forward
                    start += (chunk_size - overlap)
                    if start >= len(p) or (chunk_size - overlap) <= 0:
                        break
        
        # Fallback if no paragraphs found
        if not chunks and text.strip():
            # Split by character blocks
            start = 0
            while start < len(text):
                end = min(start + chunk_size, len(text))
                chunks.append(text[start:end])
                start += (chunk_size - overlap)
                if start >= len(text) or (chunk_size - overlap) <= 0:
                    break

        return chunks

    def retrieve_chunks(self, query: str, chunks: List[str], top_k: int = 3) -> List[Dict[str, Any]]:
        """
        Ranks chunks against a search query using TF-IDF vectorization and cosine similarity.
        Returns top_k matched excerpts with similarity scores.
        """
        if not chunks:
            return []

        # Sanitize query
        q = query.lower().strip()
        if not q:
            return [{"chunk_index": i, "text": chunk[:200], "score": 0.0} for i, chunk in enumerate(chunks[:top_k])]

        try:
            # Fit TF-IDF on chunks list
            vectorizer = TfidfVectorizer(stop_words='english', lowercase=True)
            X = vectorizer.fit_transform(chunks)
            q_vec = vectorizer.transform([query])
            
            # Compute cosine similarity
            similarities = cosine_similarity(q_vec, X).flatten()
        except Exception:
            # Fallback if vectorizer fitting fails (e.g. empty vocab)
            # Simple substring matching scoring
            similarities = []
            words = [w for w in q.split() if len(w) > 2]
            for chunk in chunks:
                chunk_lower = chunk.lower()
                if not words:
                    similarities.append(0.0)
                else:
                    matches = sum(1 for w in words if w in chunk_lower)
                    similarities.append(float(matches / len(words)))

        # Pair with indices
        scored_chunks = []
        for idx, score in enumerate(similarities):
            scored_chunks.append({
                "chunk_index": idx,
                "text": chunks[idx],
                "score": float(score)
            })

        # Sort by score descending
        scored_chunks.sort(key=lambda x: x["score"], reverse=True)
        return scored_chunks[:top_k]

    def synthesize_answer(self, query: str, matched_sources: List[Dict[str, Any]]) -> str:
        """
        Formulates a conversational summary citing references.
        """
        if not matched_sources or all(s["score"] == 0.0 for s in matched_sources):
            return (
                f"🔍 **Search Outcome**\n\n"
                f"I searched the document for **\"{query}\"** but couldn't find high-confidence matching passages.\n"
                f"Try broadening your keywords or checking another topic section."
            )

        best_match = matched_sources[0]
        response = (
            f"📚 **Semantic Search Result**\n\n"
            f"Found relevant passages matching **\"{query}\"** (Highest Confidence Score: `{best_match['score']:.2f}`).\n\n"
            f"**Key excerpt**:\n"
            f"> {best_match['text']}\n\n"
            f"Check the **Citations & Sources** accordion below to inspect all matching paragraphs."
        )
        return response

rag_engine_service = RagEngineService()
