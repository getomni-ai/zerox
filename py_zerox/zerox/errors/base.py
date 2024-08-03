from typing import Optional


class CustomException(Exception):
    """
    Base class for custom exceptions
    """

    def __init__(
        self,
        message: Optional[str] = None,
        extra_info: Optional[dict] = None,
    ):
        self.message = message
        self.extra_info = extra_info
        super().__init__(self.message)

    def __str__(self):
        if self.extra_info:
            return f"{self.message} (Extra Info: {self.extra_info})"
        return self.message
