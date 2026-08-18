from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class DatasetBase(BaseModel):
    name: str

class DatasetCreate(DatasetBase):
    file_type: str
    file_size: int

class DatasetUpdate(BaseModel):
    status: Optional[str] = None
    row_count: Optional[int] = None
    column_count: Optional[int] = None

class DatasetResponse(DatasetBase):
    id: str
    file_size: int
    file_type: str
    row_count: Optional[int] = None
    column_count: Optional[int] = None
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

from typing import List

class ImputeOperation(BaseModel):
    column: str
    strategy: str  # 'mean', 'median', 'mode', 'drop'

class OutlierOperation(BaseModel):
    column: str
    method: str = "iqr"  # 'iqr'

class ScaleOperation(BaseModel):
    column: str
    method: str  # 'minmax', 'standard'

class EncodeOperation(BaseModel):
    column: str
    method: str  # 'onehot', 'label'

class CleanRequest(BaseModel):
    remove_duplicates: bool = False
    impute_missing: List[ImputeOperation] = []
    handle_outliers: List[OutlierOperation] = []
    scaling: List[ScaleOperation] = []
    encoding: List[EncodeOperation] = []

class CorrelationResponse(BaseModel):
    columns: List[str]
    matrix: List[List[float]]

class BinDetail(BaseModel):
    bin_start: float
    bin_end: float
    count: int

class FrequencyDetail(BaseModel):
    category: str
    count: int

class DescribeColumnResponse(BaseModel):
    column: str
    type: str
    skew: Optional[float] = None
    kurtosis: Optional[float] = None
    is_normal: Optional[bool] = None
    bins: List[BinDetail] = []
    frequencies: List[FrequencyDetail] = []

from app.schemas.profile import ProfileResponse

class ReportResponse(BaseModel):
    dataset: DatasetResponse
    profile: ProfileResponse
    correlations: CorrelationResponse
    quality_alerts: List[str]
    recommendations: List[str]
