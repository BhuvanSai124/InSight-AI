from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session
from typing import List
from app.api.deps import get_db
from app.models.dataset import Dataset
from app.models.profile import Profile
from app.schemas.dataset import DatasetResponse, CleanRequest, CorrelationResponse, DescribeColumnResponse, ReportResponse
from app.schemas.profile import ProfileResponse
from app.schemas.chat import ChatRequest, ChatResponse
from app.schemas.collaboration import CollaborationRequest, CollaborationResponse
from app.services.storage import storage_service
from app.services.profiler import profiler_service
from app.services.cleaner import cleaner_service

router = APIRouter()

@router.post("/upload", response_model=DatasetResponse, status_code=status.HTTP_201_CREATED)
def upload_dataset(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    try:
        # Save file to disk
        original_name, filepath, filesize, extension = storage_service.save_file(file)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload file: {str(e)}"
        )

    # Pre-profile dimensions
    row_count, col_count = storage_service.get_dataset_dimensions(filepath, extension)

    # Create DB entry
    db_dataset = Dataset(
        name=original_name,
        file_path=filepath,
        file_size=filesize,
        file_type=extension,
        row_count=row_count,
        column_count=col_count,
        status="uploaded"
    )
    
    db.add(db_dataset)
    db.commit()
    db.refresh(db_dataset)
    return db_dataset

@router.get("/", response_model=List[DatasetResponse])
def list_datasets(db: Session = Depends(get_db)):
    datasets = db.query(Dataset).order_by(Dataset.created_at.desc()).all()
    return datasets

@router.get("/{dataset_id}", response_model=DatasetResponse)
def get_dataset(dataset_id: str, db: Session = Depends(get_db)):
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found"
        )
    return dataset

@router.delete("/{dataset_id}", status_code=status.HTTP_200_OK)
def delete_dataset(dataset_id: str, db: Session = Depends(get_db)):
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found"
        )
    
    # Delete from disk
    storage_service.delete_file(dataset.file_path)
    
    # Delete from DB
    db.delete(dataset)
    db.commit()
    return {"message": "Dataset deleted successfully", "id": dataset_id}

@router.post("/{dataset_id}/profile", response_model=ProfileResponse, status_code=status.HTTP_201_CREATED)
def generate_profile(dataset_id: str, db: Session = Depends(get_db)):
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found"
        )
    
    try:
        stats = profiler_service.profile_dataset(dataset.file_path, dataset.file_type)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to profile dataset: {str(e)}"
        )

    # Update dataset status and shapes
    dataset.status = "profiled"
    dataset.row_count = stats["row_count"]
    dataset.column_count = stats["column_count"]
    
    # Remove existing profile if any
    existing_profile = db.query(Profile).filter(Profile.dataset_id == dataset_id).first()
    if existing_profile:
        db.delete(existing_profile)
        db.commit()

    db_profile = Profile(
        dataset_id=dataset_id,
        row_count=stats["row_count"],
        column_count=stats["column_count"],
        duplicate_rows=stats["duplicate_rows"],
        missing_cells=stats["missing_cells"],
        memory_usage_bytes=stats["memory_usage_bytes"],
        columns_metadata=stats["columns_metadata"]
    )
    db.add(db_profile)
    db.add(dataset)
    db.commit()
    db.refresh(db_profile)
    return db_profile

@router.get("/{dataset_id}/profile", response_model=ProfileResponse)
def get_profile(dataset_id: str, db: Session = Depends(get_db)):
    profile = db.query(Profile).filter(Profile.dataset_id == dataset_id).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found for this dataset"
        )
    return profile

@router.post("/{dataset_id}/clean", response_model=DatasetResponse, status_code=status.HTTP_201_CREATED)
def clean_dataset(
    dataset_id: str,
    operations: CleanRequest,
    db: Session = Depends(get_db)
):
    import os
    import uuid
    from app.core.config import settings

    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found"
        )
    
    # Generate unique output path
    unique_id = uuid.uuid4().hex
    
    # Use dataset.name directly as the base name
    base_name = dataset.name
    
    # Create new file name: name_cleaned.ext
    name_no_ext, ext = os.path.splitext(base_name)
    cleaned_name = f"{name_no_ext}_cleaned{ext}"
    new_filename = f"{unique_id}_{cleaned_name}"
    new_filepath = os.path.join(settings.UPLOAD_DIR, new_filename)

    try:
        # Run cleaner service
        row_count, col_count = cleaner_service.clean_dataset(
            dataset.file_path,
            dataset.file_type,
            new_filepath,
            operations
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to apply cleaning operations: {str(e)}"
        )

    # Get file size
    filesize = os.path.getsize(new_filepath)

    # Create new dataset record (dataset versioning)
    db_cleaned_dataset = Dataset(
        name=cleaned_name,
        file_path=new_filepath,
        file_size=filesize,
        file_type=dataset.file_type,
        row_count=row_count,
        column_count=col_count,
        status="uploaded"  # Needs to be profiled by the user
    )
    
    db.add(db_cleaned_dataset)
    db.commit()
    db.refresh(db_cleaned_dataset)
    return db_cleaned_dataset

@router.get("/{dataset_id}/eda/correlation", response_model=CorrelationResponse)
def get_correlation(dataset_id: str, db: Session = Depends(get_db)):
    import numpy as np
    import pandas as pd

    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found"
        )
    
    try:
        if dataset.file_type == "csv":
            df = pd.read_csv(dataset.file_path)
        elif dataset.file_type in ["xlsx", "xls"]:
            df = pd.read_excel(dataset.file_path)
        elif dataset.file_type == "json":
            df = pd.read_json(dataset.file_path)
        else:
            raise ValueError("Unsupported file type")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to read dataset file: {str(e)}"
        )
        
    numeric_df = df.select_dtypes(include=[np.number]).dropna(how="all")
    if numeric_df.empty or len(numeric_df.columns) < 2:
        return {"columns": [], "matrix": []}
        
    # Drop rows containing NaNs only when calculating correlation
    corr = numeric_df.corr(method="pearson").fillna(0)
    
    columns = list(corr.columns)
    matrix = [[float(val) for val in row] for row in corr.values]
    
    return {"columns": columns, "matrix": matrix}

@router.get("/{dataset_id}/eda/describe/{column}", response_model=DescribeColumnResponse)
def describe_column(dataset_id: str, column: str, db: Session = Depends(get_db)):
    import numpy as np
    import pandas as pd

    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found"
        )
        
    try:
        if dataset.file_type == "csv":
            df = pd.read_csv(dataset.file_path)
        elif dataset.file_type in ["xlsx", "xls"]:
            df = pd.read_excel(dataset.file_path)
        elif dataset.file_type == "json":
            df = pd.read_json(dataset.file_path)
        else:
            raise ValueError("Unsupported file type")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to read dataset file: {str(e)}"
        )
        
    if column not in df.columns:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Column '{column}' not found in dataset"
        )
        
    series = df[column]
    
    # Check type
    if pd.api.types.is_numeric_dtype(series):
        col_type = "numeric"
        cleaned_series = series.dropna()
        if cleaned_series.empty:
            return {
                "column": column,
                "type": col_type,
                "skew": 0.0,
                "kurtosis": 0.0,
                "is_normal": True,
                "bins": [],
                "frequencies": []
            }
            
        skew = float(cleaned_series.skew()) if len(cleaned_series) > 2 else 0.0
        kurt = float(cleaned_series.kurtosis()) if len(cleaned_series) > 3 else 0.0
        is_normal = bool(abs(skew) <= 0.5)
        
        # Calculate histogram bins
        unique_count = len(cleaned_series.unique())
        bin_count = min(10, unique_count) if unique_count > 0 else 10
        counts, edges = np.histogram(cleaned_series, bins=bin_count)
        bins = []
        for i in range(len(counts)):
            bins.append({
                "bin_start": float(edges[i]),
                "bin_end": float(edges[i+1]),
                "count": int(counts[i])
            })
            
        return {
            "column": column,
            "type": col_type,
            "skew": skew if not np.isnan(skew) else 0.0,
            "kurtosis": kurt if not np.isnan(kurt) else 0.0,
            "is_normal": is_normal,
            "bins": bins,
            "frequencies": []
        }
    else:
        col_type = "categorical"
        top_vals = series.value_counts().head(10)
        frequencies = [{"category": str(k), "count": int(v)} for k, v in top_vals.items()]
        
        return {
            "column": column,
            "type": col_type,
            "bins": [],
            "frequencies": frequencies
        }

@router.get("/{dataset_id}/eda/columns-data")
def get_columns_data(
    dataset_id: str,
    cols: str,
    db: Session = Depends(get_db)
):
    import pandas as pd
    import numpy as np

    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found"
        )

    try:
        if dataset.file_type == "csv":
            df = pd.read_csv(dataset.file_path)
        elif dataset.file_type in ["xlsx", "xls"]:
            df = pd.read_excel(dataset.file_path)
        elif dataset.file_type == "json":
            df = pd.read_json(dataset.file_path)
        else:
            raise ValueError("Unsupported file type")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to read dataset file: {str(e)}"
        )

    columns_to_fetch = [c.strip() for c in cols.split(",") if c.strip()]
    for col in columns_to_fetch:
        if col not in df.columns:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Column '{col}' not found in dataset"
            )

    sliced_df = df[columns_to_fetch].dropna()

    limit = 1000
    if len(sliced_df) > limit:
        sliced_df = sliced_df.sample(n=limit, random_state=42)

    records = []
    for _, row in sliced_df.iterrows():
        record = {}
        for col in columns_to_fetch:
            val = row[col]
            if isinstance(val, (int, float, np.integer, np.floating)):
                if np.isnan(val) or np.isinf(val):
                    record[col] = None
                else:
                    record[col] = float(val)
            else:
                record[col] = str(val)
        records.append(record)

    return records

@router.get("/{dataset_id}/report", response_model=ReportResponse)
def get_report(dataset_id: str, db: Session = Depends(get_db)):
    import json
    import pandas as pd
    import numpy as np

    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found"
        )
        
    # Get or generate profile
    profile = db.query(Profile).filter(Profile.dataset_id == dataset_id).first()
    if not profile:
        try:
            stats = profiler_service.profile_dataset(dataset.file_path, dataset.file_type)
            
            # Update dataset status and shapes
            dataset.status = "profiled"
            dataset.row_count = stats["row_count"]
            dataset.column_count = stats["column_count"]
            
            profile = Profile(
                dataset_id=dataset_id,
                row_count=stats["row_count"],
                column_count=stats["column_count"],
                duplicate_rows=stats["duplicate_rows"],
                missing_cells=stats["missing_cells"],
                memory_usage_bytes=stats["memory_usage_bytes"],
                columns_metadata=stats["columns_metadata"]
            )
            db.add(profile)
            db.add(dataset)
            db.commit()
            db.refresh(profile)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to generate profile for report: {str(e)}"
            )

    # Calculate correlation matrix
    try:
        if dataset.file_type == "csv":
            df = pd.read_csv(dataset.file_path)
        elif dataset.file_type in ["xlsx", "xls"]:
            df = pd.read_excel(dataset.file_path)
        elif dataset.file_type == "json":
            df = pd.read_json(dataset.file_path)
        else:
            raise ValueError("Unsupported file type")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to read dataset for correlations: {str(e)}"
        )
        
    numeric_df = df.select_dtypes(include=[np.number]).dropna(how="all")
    if numeric_df.empty or len(numeric_df.columns) < 2:
        correlations = {"columns": [], "matrix": []}
    else:
        corr = numeric_df.corr(method="pearson").fillna(0)
        correlations = {
            "columns": list(corr.columns),
            "matrix": [[float(val) for val in row] for row in corr.values]
        }
        
    quality_alerts = []
    recommendations = []
    
    if profile.duplicate_rows > 0:
        quality_alerts.append(f"Found {profile.duplicate_rows} duplicate rows in the dataset.")
        recommendations.append("Apply duplicate removal to discard redundant data rows.")
        
    try:
        col_meta = json.loads(profile.columns_metadata) if isinstance(profile.columns_metadata, str) else profile.columns_metadata
    except Exception:
        col_meta = []
        
    for col in col_meta:
        name = col.get("name", "")
        col_type = col.get("type", "")
        missing_pct = col.get("missing_pct", 0.0)
        stats = col.get("stats", {})
        
        # Missing values check
        if missing_pct > 0.0:
            quality_alerts.append(f"Column '{name}' has {missing_pct:.1f}% missing values.")
            strategy = "mean/median" if col_type == "numeric" else "mode"
            recommendations.append(f"Impute missing values in '{name}' using {strategy} substitution or drop null rows.")
            
        # Categorical columns recommendation
        if col_type == "categorical":
            recommendations.append(f"Encode categorical column '{name}' using One-Hot encoding (for high-cardinality) or Label encoding (for tree models).")
            
        # Highly skewed columns check
        if col_type == "numeric":
            mean = stats.get("mean")
            median = stats.get("median")
            std = stats.get("std")
            if mean is not None and median is not None and std is not None and std > 0:
                skew_coeff = 3 * (mean - median) / std
                if abs(skew_coeff) > 1.0:
                    quality_alerts.append(f"Column '{name}' shows a skewed distribution (Pearson coefficient = {skew_coeff:.2f}).")
                    recommendations.append(f"Apply a logarithmic or power transformation to normalize skewed column '{name}'.")
                    
            recommendations.append(f"Scale continuous feature '{name}' using standard standardization or min-max normalization.")

    # Remove duplicates from recommendations
    recommendations = list(dict.fromkeys(recommendations))
    
    return {
        "dataset": dataset,
        "profile": profile,
        "correlations": correlations,
        "quality_alerts": quality_alerts,
        "recommendations": recommendations
    }

@router.post("/{dataset_id}/chat", response_model=ChatResponse)
def chat_with_dataset(
    dataset_id: str,
    payload: ChatRequest,
    db: Session = Depends(get_db)
):
    from app.services.chat_engine import chat_engine_service

    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found"
        )
    
    response_text, suggested = chat_engine_service.process_query(payload.message, dataset, db)
    return ChatResponse(response=response_text, suggested_prompts=suggested)

@router.post("/{dataset_id}/collaborate", response_model=CollaborationResponse)
def collaborate_on_dataset(
    dataset_id: str,
    payload: CollaborationRequest,
    db: Session = Depends(get_db)
):
    from app.services.coordinator import coordinator_service

    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found"
        )
    
    logs, report = coordinator_service.execute_workflow(
        dataset,
        payload.target_column,
        payload.feature_columns,
        payload.algorithm,
        payload.doc_id,
        db
    )
    return CollaborationResponse(logs=logs, report=report)
