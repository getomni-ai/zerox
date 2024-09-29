from typing import List, Optional, Dict, Any, Union, Iterable
from dataclasses import dataclass, field


@dataclass
class ZeroxArgs:
    """
    Dataclass to store the arguments for the Zerox class.
    """

    file_path: str
    cleanup: bool = True
    concurrency: int = 10
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
