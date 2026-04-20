from enum import Enum
from typing import List, Optional, Dict, Any, Union, Iterable
from dataclasses import dataclass, field


class ErrorMode(str, Enum):
    """
    Enum for error handling modes.
    THROW: Raise an exception when a page fails to process.
    IGNORE: Log the error and continue processing remaining pages.
    """
    THROW = "THROW"
    IGNORE = "IGNORE"


class PageStatus(str, Enum):
    """
    Enum for page processing status.
    SUCCESS: Page was processed successfully.
    ERROR: Page failed to process.
    """
    SUCCESS = "SUCCESS"
    ERROR = "ERROR"


@dataclass
class ZeroxArgs:
    """
    Dataclass to store the arguments for the Zerox class.
    """

    file_path: str
    cleanup: bool = True
    concurrency: int = 10
    error_mode: ErrorMode = ErrorMode.IGNORE
    maintain_format: bool = False
    model: str = "gpt-4o-mini",
    output_dir: Optional[str] = None
    temp_dir: Optional[str] = None
    custom_system_prompt: Optional[str] = None
    select_pages: Optional[Union[int, Iterable[int]]] = None
    kwargs: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Page:
    """
    Dataclass to store the page content.
    """

    content: str
    content_length: int
    page: int
    status: PageStatus = PageStatus.SUCCESS
    error: Optional[str] = None


@dataclass
class ZeroxOutput:
    """
    Dataclass to store the output of the Zerox class.
    """

    completion_time: float
    file_name: str
    input_tokens: int
    output_tokens: int
    pages: List[Page]
    num_successful: int = 0
    num_failed: int = 0
