class Messages:
    """User-facing messages"""

    NO_OPENAI_KEY = """
    No OpenAI key found. Please set your OpenAI key as a parameters or place it in the environment variable OPENAI_API_KEY.

    You can get your key from https://platform.openai.com/account/api-keys.
    """

    OPENAI_NON_200_RESPONSE = """
    OpenAI API returned status code {status_code}: {data}

    Please check the OpenAI API documentation for more information. https://platform.openai.com/docs/guides/error-codes.
    """

    OPENAI_COMPLETION_ERROR = """
    Error in OpenAI Completion Response. Error: {0}
    Please check OpenAI API status and try again later. https://status.openai.com/
    """

    PDF_CONVERSION_FAILED = """
    Error during PDF conversion: {0}
    Please check the PDF file and try again. For more information: https://github.com/Belval/pdf2image
    """

    FILE_UNREACHAGBLE = """
    File not found or unreachable. Status Code: {0}
    """

    FILE_PATH_MISSING = """
    File path is invalid or missing.
    """

    FAILED_TO_SAVE_FILE = """Failed to save file to local drive"""

    FAILED_TO_PROCESS_IMAGE = """Failed to process image"""
