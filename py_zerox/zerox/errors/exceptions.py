from typing import Dict, Optional

# Package Imports
from ..constants import Messages
from .base import CustomException


class MissingOpenAIAPIKeyException(CustomException):
    """Exception raised when the OpenAI API key is missing."""

    def __init__(
        self,
        message: str = Messages.NO_OPENAI_KEY,
    ):
        super().__init__(message)


class ResourceUnreachableException(CustomException):
    """Exception raised when a resource is unreachable."""

    def __init__(
        self,
        message: str = Messages.FILE_UNREACHAGBLE,
        extra_info: Optional[Dict] = None,
    ):
        super().__init__(message, extra_info)


class FileUnavailable(CustomException):
    """Exception raised when a file is unavailable."""

    def __init__(
        self,
        message: str = Messages.FILE_PATH_MISSING,
        extra_info: Optional[Dict] = None,
    ):
        super().__init__(message, extra_info)


class FailedToSaveFile(CustomException):
    """Exception raised when a file fails to save."""

    def __init__(
        self,
        message: str = Messages.FAILED_TO_SAVE_FILE,
        extra_info: Optional[Dict] = None,
    ):
        super().__init__(message, extra_info)


class FailedToProcessFile(CustomException):
    """Exception raised when a file fails to process."""

    def __init__(
        self,
        message: str = Messages.FAILED_TO_PROCESS_IMAGE,
        extra_info: Optional[Dict] = None,
    ):
        super().__init__(message, extra_info)
