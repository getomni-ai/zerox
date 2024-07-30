from typing import List, Optional
from dataclasses import dataclass


@dataclass
class ZeroxArgs:
    file_path: str
    openai_api_key: Optional[str] = None
    cleanup: bool = True
    concurrency: int = 10
    maintain_format: bool = False
    output_dir: Optional[str] = None
    temp_dir: Optional[str] = None


@dataclass
class Page:
    content: str
    content_length: int
    page: int


@dataclass
class ZeroxOutput:
    completion_time: float
    file_name: str
    input_tokens: int
    output_tokens: int
    pages: List[Page]
