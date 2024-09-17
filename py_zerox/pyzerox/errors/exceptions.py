from typing import Dict, Optional

# Package Imports
from ..constants import Messages
from .base import CustomException


class MissingEnvironmentVariables(CustomException):
    """Exception raised when the model provider environment variables, API key(s) are missing. Refer: https://docs.litellm.ai/docs/providers"""

    def __init__(
        self,
        message: str = Messages.MISSING_ENVIRONMENT_VARIABLES,
        extra_info: Optional[Dict] = None,
    ):
        super().__init__(message, extra_info)

class NotAVisionModel(CustomException):
    """Exception raised when the provided model is not a vision model."""

    def __init__(
        self,
        message: str = Messages.NON_VISION_MODEL,
        extra_info: Optional[Dict] = None,
    ):
        super().__init__(message, extra_info)

class ModelAccessError(CustomException):
    """Exception raised when the provided model can't be accessed due to incorrect credentials/keys or incorrect environent variables setup."""

    def __init__(
        self,
        message: str = Messages.MODEL_ACCESS_ERROR,
        extra_info: Optional[Dict] = None,
    ):
        super().__init__(message, extra_info)

class PageNumberOutOfBoundError(CustomException):
    """Exception invalid page number(s) provided."""

    def __init__(
        self,
        message: str = Messages.PAGE_NUMBER_OUT_OF_BOUND_ERROR,
        extra_info: Optional[Dict] = None,
    ):
        super().__init__(message, extra_info)

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
