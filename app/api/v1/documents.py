from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session
from typing import List
import os
import uuid
import json

from app.api.deps import get_db
from app.models.document import Document
from app.schemas.document import DocumentResponse, QueryRequest, QueryResponse, SourceExcerpt
from app.services.rag_engine import rag_engine_service
from app.core.config import settings

router = APIRouter()

@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    # Validate extension
    filename = file.filename or "document.txt"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in [".txt", ".md", ".json"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file format. Please upload .txt, .md, or .json files."
        )

    # Read and decode contents
    try:
        bytes_content = await file.read()
        text_content = bytes_content.decode("utf-8")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to read file encoding: {str(e)}"
        )

    # Save local copy
    doc_dir = os.path.join(settings.UPLOAD_DIR, "documents")
    os.makedirs(doc_dir, exist_ok=True)
    
    unique_id = uuid.uuid4().hex
    saved_filename = f"{unique_id}_{filename}"
    filepath = os.path.join(doc_dir, saved_filename)
    
    try:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(text_content)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to write file to disk: {str(e)}"
        )

    # Segment overlapping chunks
    chunks = rag_engine_service.chunk_text(text_content)

    # Save to Database
    db_doc = Document(
        id=str(uuid.uuid4()),
        name=filename,
        file_path=filepath,
        file_size=len(bytes_content),
        chunks=json.dumps(chunks)
    )
    db.add(db_doc)
    db.commit()
    db.refresh(db_doc)

    return db_doc

@router.get("/", response_model=List[DocumentResponse])
def list_documents(
    db: Session = Depends(get_db)
):
    docs = db.query(Document).order_by(Document.created_at.desc()).all()
    return docs

@router.post("/{doc_id}/query", response_model=QueryResponse)
def query_document(
    doc_id: str,
    payload: QueryRequest,
    db: Session = Depends(get_db)
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document reference not found."
        )

    chunks = json.loads(doc.chunks)
    
    # Retrieve top K matches
    matched_sources = rag_engine_service.retrieve_chunks(payload.query, chunks, top_k=3)
    
    # Synthesize answer response
    answer = rag_engine_service.synthesize_answer(payload.query, matched_sources)
    
    # Format response source excerpts
    sources = [
        SourceExcerpt(
            chunk_index=s["chunk_index"],
            text=s["text"],
            score=s["score"]
        ) for s in matched_sources
    ]

    return QueryResponse(answer=answer, sources=sources)

@router.delete("/{doc_id}")
def delete_document(
    doc_id: str,
    db: Session = Depends(get_db)
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found."
        )

    # Delete local copy
    try:
        if os.path.exists(doc.file_path):
            os.remove(doc.file_path)
    except Exception:
        pass

    db.delete(doc)
    db.commit()
    return {"message": "Document deleted successfully", "id": doc_id}
