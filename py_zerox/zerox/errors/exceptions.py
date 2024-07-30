from typing import Dict, Optional
from ..constants.messages import Messages
from .base import CustomException


class MissingOpenAIAPIKeyException(CustomException):

    def __init__(
        self,
        message: str = Messages.NO_OPENAI_KEY,
    ):
        super().__init__(message)


class ResourceUnreachableException(CustomException):

    def __init__(
        self,
        message: str = Messages.FILE_UNREACHAGBLE,
        extra_info: Optional[Dict] = None,
    ):
        super().__init__(message, extra_info)


class FileUnavailable(CustomException):

    def __init__(
        self,
        message: str = Messages.FILE_PATH_MISSING,
        extra_info: Optional[Dict] = None,
    ):
        super().__init__(message, extra_info)


class FailedToSaveFile(CustomException):

    def __init__(
        self,
        message: str = Messages.FAILED_TO_SAVE_FILE,
        extra_info: Optional[Dict] = None,
    ):
        super().__init__(message, extra_info)


class FailedToProcessFile(CustomException):

    def __init__(
        self,
        message: str = Messages.FAILED_TO_PROCESS_IMAGE,
        extra_info: Optional[Dict] = None,
    ):
        super().__init__(message, extra_info)
